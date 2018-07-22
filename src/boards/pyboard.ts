import * as nls from "vscode-nls";
import * as delay from "delay";
import * as dedent from "dedent";
import { Board, BoardStorageInfo, BoardInformation } from "./board";
import { SerialBoard } from "./serialBoard";
import { ProgressReporter } from "../extension";
import { FileTransferError } from "../util/errors";
import * as python3 from "../util/python3";
import * as util from "util";

const localize = nls.loadMessageBundle(__filename);

const RAW_REPL_PROMPT = "raw REPL; CTRL-B to exit\r\n";
const REPL_SWITCH_TIMEOUT = 1000;
const SOFT_REBOOT_TIMEOUT = 500;
const DELAY_AFTER_SOFTRESET1 = 500;
const DELAY_AFTER_SOFTRESET2 = 100;
const RDWR_BUFFER_SIZE = 32;
const CMD_BUFFER_SIZE = 256;
const DELAY_CMD_CHUNK = 10;
const FILE_OPENW_TIMEOUT = 500;
const FILE_WRITE_TIMEOUT = 500;
const FILE_CLOSE_TIMEOUT = 500;

// const ST_IFREG = 32768;
const S_IFDIR = 16384;

interface PyboardCommandResult {
    stdout: string;
    stderr: string;
}

/**
 * pyboard
 */
export class Pyboard extends SerialBoard {
    private _replLock: boolean = false;
    private _info: BoardInformation | null = null;

    /**
     * A list of USB serial VendorID / ProductID list
     */
    protected static usbSerialIdList = [
        { vendorId: 0xf055, productId: 0x9800 },
    ];

    /**
     * Get localized board name
     * @return Board name
     */
    public static getBoardName(): string {
        return "pyboard";
    }

    /**
     * Construct board instance
     */
    public constructor() {
        super();
    }

    /**
     * Get board information
     * @return A thenable that resolves to board information
     */
    async getInfo(): Promise<BoardInformation> {
        if (this._info != null) {
            return this._info;
        }
        return this._inRawReplMode(async () => {
            let { stdout, stderr } = await this._issueCommand(dedent`
                import sys
                impl = sys.implementation
                print("%s-%s-" % (sys.platform, impl.name) + "%d.%d.%d" % impl.version)
            `);
            if (stderr !== "") {
                throw new Error("Cannot get board information");
            }
            this._info = {
                firmwareId: stdout.split("\r\n")[0]
            };
            return this._info;
        });
    }

    /**
     * Get storage information
     * @return A thenable that resolves to array of storage information
     */
    getStorageInfo(): Thenable<BoardStorageInfo[]> {
        return Promise.resolve([
            { 
                localizedName: localize("internal-flash", "Internal flash"),
                mountPoint: "/flash",
            }
        ]);
    }

    /**
     * Write file
     * @param filePath Full path of the file to be written
     * @param data Data to write
     * @param progress Object for progress reporting
     */
    writeFile(filePath: string, data: Buffer, progress?: ProgressReporter): Thenable<void> {
        return this._inRawReplMode(async () => {
            const issue = async (command: string, timeout?: number) => {
                let { stderr } = await this._issueCommand(command, timeout);
                if (stderr !== "") {
                    this._raiseFileError(stderr, filePath);
                }
            };
            await issue(`f = open(${python3.repr(filePath)}, 'wb')`, FILE_OPENW_TIMEOUT);
            for (let offset = 0; offset < data.byteLength; offset += RDWR_BUFFER_SIZE) {
                let chunk = data.slice(offset, offset + RDWR_BUFFER_SIZE);
                await issue(`f.write(${python3.repr(chunk)})`, FILE_WRITE_TIMEOUT);
            }
            await issue("f.close()", FILE_CLOSE_TIMEOUT);
        });
    }

    /**
     * Read file
     * @param filePath Full path of the file to be read
     * @param progress Object for progress reporting
     * @return A promise object which is resolved to read data
     */
    readFile(filePath: string, progress?: ProgressReporter): Thenable<Buffer> {
        return this._inRawReplMode<Buffer>(async () => {
            const { stdout, stderr } = await this._issueCommand(dedent`
                with open(${python3.repr(filePath)}, 'rb') as infile:
                    while True:
                        result = infile.read(${RDWR_BUFFER_SIZE})
                        if result == b'':
                            break
                        print(result)
            `);
            if (stderr !== "") {
                this._raiseFileError(stderr, filePath);
            }
            const chunks = stdout.split("\r\n");
            const buffers: Buffer[] = [];
            for (let chunk of chunks) {
                if (chunk.startsWith("b")) {
                    buffers.push(python3.eval_<Buffer>(chunk));
                }
            }
            return Buffer.concat(buffers);
        });
    }

    /**
     * Enumerate files
     * @param dirPath Full path of directory (Wildcards not accepted)
     * @param recursive Set true to search recursively
     * @return A thenable that resolves to an array of full path of files found
     */
    enumerateFiles(dirPath: string, recursive?: boolean): Thenable<string[]> {
        if (!dirPath.endsWith("/")) {
            dirPath = dirPath + "/";
        }
        return this._inRawReplMode(async () => {
            if (recursive) {
                return this._enumerateFileRecursive(dirPath);
            }

            const { stdout, stderr } = await this._issueCommand(dedent`
                try:
                    import os
                except ImportError:
                    import uos as os
                print(os.listdir(${python3.repr(dirPath)}))
            `);
            if (stderr !== "") {
                this._raiseFileError(stderr, dirPath);
            }
            return python3.eval_<string[]>(stdout.split("\r\n")[0]);
        });
    }

    /**
     * Enumerate files recursively (for internal use in raw REPL mode)
     * @param dirPath Full path of directory that ends with slash(/)
     * @return A thenable that resolves to an array of full path of files found
     */
    private async _enumerateFileRecursive(dirPath: string): Promise<string[]> {
        const { stdout, stderr } = await this._issueCommand(dedent`
            try:
                import os
            except ImportError:
                import uos as os
            d = ${python3.repr(dirPath)}
            for f in os.listdir(d):
                try:
                    mode = (os.stat(d + f))[0]
                except FileNotFoundError:
                    stat = -1
                print([f, mode])
        `);
        if (stderr !== "") {
            this._raiseFileError(stderr, dirPath);
        }
        const files: string[] = [];
        for (const file of stdout.split("\r\n")) {
            if (file.startsWith("[")) {
                const [ name, mode ] = python3.eval_<any[]>(file);
                if (mode & S_IFDIR) {
                    const baseDir = name + "/";
                    (await this._enumerateFileRecursive(dirPath + baseDir).catch(() => <any>[""])).forEach((subFile) => {
                        files.push(baseDir + subFile);
                    });
                } else {
                    files.push(name);
                }
            }
        }
        return files;
    }

    /**
     * Remove file
     * @param filePath Full path of the file to be read
     */
    removeFile(filePath: string): Thenable<void> {
        return this._inRawReplMode(async () => {
            const { stdout, stderr } = await this._issueCommand(dedent`
                try:
                    import os
                except ImportError:
                    import uos as os
                os.remove(${python3.repr(filePath)})
            `);
            if (stderr !== "") {
                this._raiseFileError(stderr, filePath);
            }
        });
    }

    /**
     * Authenticate board (Check if the board is Wakayama.rb board)
     */
    protected async serialAuth(): Promise<void> {
        this._info = null;
        await this.getInfo();
    }

    /**
     * Raise file error
     * @param stderr A string printed to stderr
     * @param path A target path
     */
    private _raiseFileError(stderr: string, path: string): never {
        if (stderr.lastIndexOf("\r\nOSError: [Errno 2] ENOENT\r\n") >= 0) {
            throw new FileTransferError(`No such file or directory: ${path}`);
        } else {
            throw new FileTransferError(`Unknown error: ${path}`);
        }
    }

    /**
     * Execute actions in raw REPL mode
     * @param callback Callback function to do actions
     */
    private async _inRawReplMode<T>(callback: () => Promise<T> | T): Promise<T> {
        if (this._replLock) {
            throw new Error("Cannot change REPL mode switch (busy)");
        }
        this._replLock = true;
        let entered = false;
        try {
            await this._enterRawReplMode();
            entered = true;
            const result = await Promise.resolve(callback());
            return result;
        } finally {
            if (entered) {
                await this._leaveRawReplMode();
            }
            this._replLock = false;
        }
    }

    /**
     * Enter raw REPL mode
     */
    private async _enterRawReplMode(): Promise<void> {
        if (this.serialDebugLevel > 0) {
            console.log(`[${this.constructor.name}.prototype._enterRawReplMode]`, "Enter raw REPL");
        }
        await this.serialSend("\r\x03\x03");    // Ctrl-C twice
        // await this.serialFlush();
        await this.serialSend("\r\x01");        // Ctrl-A: Enter raw REPL
        await this.serialRecv(RAW_REPL_PROMPT, REPL_SWITCH_TIMEOUT);
        await this.serialSend("\x04");          // Ctrl-D: Do a soft reset
        await this.serialRecv("soft reboot\r\n", SOFT_REBOOT_TIMEOUT);
        await delay(DELAY_AFTER_SOFTRESET1);
        await this.serialSend("\x03");
        await delay(DELAY_AFTER_SOFTRESET2);
        await this.serialSend("\x03");
        await this.serialRecv(RAW_REPL_PROMPT, REPL_SWITCH_TIMEOUT);
    }

    /**
     * Issue command in raw REPL mode
     */
    private async _issueCommand(command: string, timeout?: number): Promise<PyboardCommandResult> {
        await this.serialRecv(">", timeout);
        const data = Buffer.from(command);
        for (let offset = 0; offset < data.byteLength; offset += CMD_BUFFER_SIZE) {
            const chunk = data.slice(offset, offset + CMD_BUFFER_SIZE);
            await this.serialSend(chunk);
            await delay(DELAY_CMD_CHUNK);
        }
        await this.serialSend("\x04");
        const response = await this.serialRecv(2, timeout);
        if (response.toString() !== "OK") {
            throw new Error("Invalid response");
        }
        const stdout = (await this.serialRecv("\x04", timeout)).slice(0, -1);
        const stderr = (await this.serialRecv("\x04", timeout)).slice(0, -1);
        if (this.serialDebugLevel > 0) {
            console.log(
                `[${this.constructor.name}.prototype._issueCommand]`,
                "stdout:", util.inspect(stdout),
                "stderr:", util.inspect(stderr)
            );
        }
        return { stdout, stderr };
    }

    /**
     * Leave raw REPL mode
     */
    private async _leaveRawReplMode(): Promise<void> {
        if (this.serialDebugLevel > 0) {
            console.log(`[${this.constructor.name}.prototype._leaveRawReplMode]`, "Leave raw REPL");
        }
        await this.serialSend("\r\x02");        // Ctrl-B: Exit raw REPL
    }
}

Board.addConstructor(Pyboard);
