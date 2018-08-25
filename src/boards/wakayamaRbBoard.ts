import * as stream from "stream";
import * as nls from "vscode-nls";
import * as fse from "fs-extra";
import * as path from "path";
import * as tmp from "tmp";
import * as delay from "delay";
import { exec } from "child_process";
import { EventEmitter } from "vscode";
import { Board, BoardCandidate, BoardStdioStream, BoardInformation, BoardConstructor, BoardResult, BoardStorageInfo } from "./board";
import { enumerateRemovableDisks } from "../util/diskEnumerator";
import { ProgressReporter, vscode } from "../extension";
import { FileTransferError, NotSupportedError } from "../util/errors";
import { SerialBoard } from "./serialBoard";
import { promisify } from "util";

const localize = nls.loadMessageBundle(__filename);

const WRBB_RESET_DELAY_MS = 2000;
const WRBB_RESET_MAX_RETRIES = 5;
const WRBB_MSD_MAX_CAPACITY = 4 * 1024 * 1024;
const WRBB_PROG_DELAY_MS = 2000;
const CITRUS_MSD_FILE = "Gadget Renesas Project Home.html";
const SAKURA_MSD_FILE = "SAKURA BOARD for Gadget Renesas Project Home.html";
const CHAR_CODE_PROMPT = ">".charCodeAt(0);
const CHAR_CODE_PROGRESS = ".".charCodeAt(0);
const FOOTER_PREFIX = "WAKAYAMA";

enum WrbbStorageType {
    WRBB_STORAGE_INTERNAL = "/internal",
}

interface WrbbStoragePath {
    type: WrbbStorageType;
    path: string;
}

/**
 * Wakayama.rb board by Wakayama.rb community
 */
export class WakayamaRbBoard extends SerialBoard {
    private _info: BoardInformation | null = null;
    private _stdio: BoardStdioStream | null = null;
    private _abortCode?: number;
    private _onDidFinish: EventEmitter<BoardResult>;

    protected autoDrainInterval = 250;

    /**
     * A list of USB serial VendorID / ProductID list
     */
    protected static usbSerialIdList = [
        { vendorId: 0x2129, productId: 0x0531 },    // TOKUDEN
        { vendorId: 0x045b, productId: 0x0234 },    // Renesas
    ];

    /**
     * Get localized board name
     * @return Board name
     */
    public static getBoardName(): string {
        return localize("board-name", "Wakayama.rb board");
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
        await this._requestBreak();
        await this._tryGetInfo().catch(() => this._tryGetInfo());
        return this._info!;
    }

    /**
     * Get storage information
     * @return A thenable that resolves to array of storage information
     */
    getStorageInfo(): Thenable<BoardStorageInfo[]> {
        return Promise.resolve([
            { 
                localizedName: localize("internal-flash", "Internal flash"),
                mountPoint: WrbbStorageType.WRBB_STORAGE_INTERNAL,
            }
        ]);
    }

    /**
     * Write file
     * @param filePath Full path of the file to be written
     * @param data Data to write
     * @param progress Object for progress reporting
     */
    async writeFile(filePath: string, data: Buffer, progress?: ProgressReporter): Promise<void> {
        let cmd: string;

        // Parse file path
        const storagePath = this._parsePath(filePath);
        switch (storagePath.type) {
        case WrbbStorageType.WRBB_STORAGE_INTERNAL:
            if ((this.boardData || {}).useHexForWriting) {
                cmd = "U";
                data = Buffer.from(data.toString("hex"));
            } else {
                cmd = "W";
            }
            break;
        default:
            throw new FileTransferError(`Unsupported path for writing: ${filePath}`);
        }

        // Issue command
        await this._requestBreak();
        await this.serialSend(`${cmd} ${storagePath.path} ${data.byteLength}\r`);
        if (data.byteLength === 0) {
            return;
        }
        await this.serialRecv("Waiting");
        await this.serialSend(data);
        await this.serialRecv("Saving");
        for (;;) {
            let byte = (await this.serialRecv(1))[0];
            if (byte === CHAR_CODE_PROMPT) {
                break;
            }
            if (byte === CHAR_CODE_PROGRESS) {
                if ((progress != null) && (progress.advance != null)) {
                    progress.advance();
                }
            }
        }
    }

    /**
     * Read file
     * @param filePath Full path of the file to be read
     * @param progress Object for progress reporting
     * @return A thenable that resolves to read data
     */
    async readFile(filePath: string, progress?: ProgressReporter): Promise<Buffer> {
        // Parse file path
        const storagePath = this._parsePath(filePath);
        switch (storagePath.type) {
        case WrbbStorageType.WRBB_STORAGE_INTERNAL:
            break;
        default:
            throw new FileTransferError(`Unsupported path for reading: ${filePath}`);
        }
    
        // Issue command
        await this._requestBreak();
        await this.serialSend(`F ${storagePath.path}\r`);
        await this.serialRecv("Waiting");
        await this.serialSend("\r");
        let lines = (await this.serialRecv("Waiting")).split("\r\n");
        let waiting = lines.findIndex((line) => line.startsWith("Waiting"));
        let length = parseInt(lines[waiting - 1]);
        if (isNaN(length)) {
            throw new FileTransferError("Invalid length field");
        }
        await this.serialSend("\r");
        lines = (await this.serialRecv("\r\n>")).split("\r\n");
        let footer = lines.findIndex((line) => line.startsWith(FOOTER_PREFIX));
        if ((lines[footer - 2] || "").startsWith("..Read Error!")) {
            throw new FileTransferError("File not found");
        }
        let ascii = lines[footer - 1];
        ascii = ascii && ascii.substr(-(length * 2));
        if ((ascii == null) || (ascii.length !== (length * 2))) {
            throw new FileTransferError("Invalid data length");
        }
        let buffer = Buffer.from(ascii, "hex");
        if (buffer.byteLength !== length) {
            throw new FileTransferError("Junk data in hex");
        }
        return buffer;
    }

    /**
     * Enumerate files
     * @param dirPath Full path of directory (Wildcards not accepted)
     * @param recursive Set true to search recursively
     * @return A thenable that resolves to an array of full path of files found
     */
    async enumerateFiles(dirPath: string, recursive?: boolean): Promise<string[]> {
        // Parse file path
        const storagePath = this._parsePath(dirPath);
        switch (storagePath.type) {
        case WrbbStorageType.WRBB_STORAGE_INTERNAL:
            break;
        default:
            throw new FileTransferError(`Unsupported path for enumeration: ${dirPath}`);
        }

        // Issue command
        await this._requestBreak();
        await this.serialSend("L\r");
        const lines = (await this.serialRecv("\r\n>")).split("\r\n");
        const files: string[] = [];
        lines.forEach((line) => {
            const match = line.match(/^ ([^ ]+) (\d+) byte$/);
            if (match && match[1].startsWith(storagePath.path)) {
                files.push(match[1].substr(storagePath.path.length));
            }
        });
        return files;
    }

    /**
     * Remove file
     * @param filePath Full path of the file to be read
     */
    async removeFile(filePath: string): Promise<void> {
        // Parse file path
        const storagePath = this._parsePath(filePath);
        switch (storagePath.type) {
        case WrbbStorageType.WRBB_STORAGE_INTERNAL:
            break;
        default:
            throw new FileTransferError(`Unsupported path for remove: ${filePath}`);
        }

        // Issue command
        await this._requestBreak();
        await this.serialSend(`D ${storagePath.path}\r`);
        await this.serialRecv("\r\n>");
    }

    /**
     * Format storage
     * @param mountPoint Full path of mount point (directory) to be formatted
     */
    async formatStorage(mountPoint: string): Promise<void> {
        switch (mountPoint) {
        case WrbbStorageType.WRBB_STORAGE_INTERNAL:
            break;
        default:
            throw new FileTransferError(`Unsupported path for format: ${mountPoint}`);
        }
        await this._requestBreak();
        await this.serialSend("Z\r");
        await this.serialRecv("\r\n>");
    }

    /**
     * Program firmware
     * @param buffer Firmware data
     * @param reporter Object for progress reporting
     * @return A thenable that resolves to boolean value
     *         (true: succeeded, false: aborted by user)
     */
    async writeFirmware(buffer: Buffer, progress?: ProgressReporter): Promise<boolean> {
        let boardName = (<BoardConstructor>this.constructor).getBoardName();
        const warning = ` $(stop)${localize(
            "warn-x",
            "Please wait! Do not disconnect {0}",
            boardName
        )} `;
        const report = (progress != null) ? progress.report.bind(progress) : (() => {});
        try {
            await this._mountDrive();
        } catch {
            let select = await vscode.window.showInformationMessage(
                localize("push-reset-button-x", "Push reset button on {0}", boardName),
                { title: localize("push-done", "OK, pushed") }
            );
            if (select == null) {
                // Aborted by user
                return false;
            }
        }
        report(localize("searching-x", "Searching {0}...", boardName));
        let msdPath = await this._searchUsbMassStorage();
        report(localize("sending-data", "Sending data") + warning);
        let temp = tmp.fileSync();
        try {
            // Create temporary file with firmware content
            await promisify(fse.write)(temp.fd, buffer);
            await promisify(fse.close)(temp.fd);

            let destPath = path.join(msdPath, "fwup_by_rubic.bin");
            let copy_cmd = (process.platform === "win32") ? "copy" : "cp";
            report(localize("updating-flash", "Updating flash") + warning);
            await promisify(exec)(`${copy_cmd} "${temp.name}" "${destPath}"`);
        } finally {
            temp.removeCallback();
        }
        await delay(WRBB_PROG_DELAY_MS);
        await vscode.window.showInformationMessage(localize(
            "wait-led-nonblink-x",
            "Wait until LED on {0} stops blinking",
            boardName
        ), {
            title: localize("confirm-done", "OK, confirmed"),
            isCloseAffordance: true
        });
        return true;
    }

    /**
     * Start program
     * @param filePath A full path of the file to be executed
     */
    async startProgram(filePath: string): Promise<void> {
        if (this.isRunning) {
            throw new Error("Already running");
        }

        // Parse file path
        const storagePath = this._parsePath(filePath);
        switch (storagePath.type) {
        case WrbbStorageType.WRBB_STORAGE_INTERNAL:
            break;
        default:
            throw new FileTransferError(`Unsupported path for execution: ${filePath}`);
        }

        const stdout = new stream.Readable({
            encoding: "utf8",
            read: () => {}
        });
        this._stdio = { stdout };
        this._abortCode = undefined;
        try {
            await this._requestBreak();
            await this.serialSend(`R ${storagePath.path}\r`);
            await this.serialRecv("\n");
            let stdoutReader = () => {
                return this.serialRecv("\n").then((response: string) => {
                    if (response.match(/^WAKAYAMA\.RB .*H \[ENTER\]\)\r\n$/)) {
                        // Close stream
                        stdout.push(null);
                        this._stdio = null;
                        this._onDidFinish.fire({ code: this._abortCode });
                    } else {
                        stdout.push(response);
                        return stdoutReader();
                    }
                }, (reason) => {
                    // Close stream (by receive error)
                    stdout.push(null);
                    this._stdio = null;
                    this._onDidFinish.fire({ error: reason });
                });
            };
            stdoutReader();
        } catch (reason) {
            this._stdio = null;
            throw reason;
        }
    }

    /**
     * Check if a program is running or not
     */
    get isRunning(): boolean {
        return this._stdio != null;
    }

    /**
     * An event to signal a viewer has benn closed.
     */
    get onDidFinish() { return this._onDidFinish.event; }

    /**
     * Abort program
     * @param code A code passed to onDidFinished event
     */
    async abortProgram(code?: number): Promise<void> {
        if (!this.isRunning) {
            throw new Error("Not running");
        }
        this._abortCode = code;
        await this._requestBreak();
    }

    /**
     * Get standard I/O streams
     */
    getStdioStream(): Thenable<BoardStdioStream> {
        if (this.isRunning) {
            return Promise.resolve(this._stdio);
        }
        return Promise.reject(new Error("Not running"));
    }

    /**
     * Reset board
     */
    async reset(): Promise<void> {
        await this._requestBreak();
        await this.serialSend("E\r");
    }

    /**
     * Authenticate board (Check if the board is Wakayama.rb board)
     */
    protected async serialAuth(): Promise<void> {
        this._info = null;
        await this.getInfo();
    }

    /**
     * Try to receive board information
     */
    private async _tryGetInfo(): Promise<void> {
        await this.serialSend("H\r");
        let lines = (await this.serialRecv("H [ENTER])\r\n>", 1000)).split("\r\n");
        let versionLine = lines[lines.length - 2];
        let match = (versionLine || "").match(/^WAKAYAMA\.RB Board Ver\.([^,]+),/);
        if (match == null) {
            throw new Error("Invalid response");
        }
        this._info = {
            firmwareId: match[1],
        };
    }

    /**
     * Parse path to mount point and relative path
     * @param path A full path
     */
    private _parsePath(path: string): WrbbStoragePath {
        if (path.match(/[ \r\n\t]/)) {
            throw new FileTransferError(`Unsupported character is used in file name: "${path}"`);
        }
        let type = [
            WrbbStorageType.WRBB_STORAGE_INTERNAL,
        ].find((storage) => {
            return path.startsWith(`${storage}/`) || (path === storage);
        });
        if (type == null) {
            throw new FileTransferError(`Invalid path: "${path}"`);
        }
        return { type, path: path.substr(type.length + 1) };
    }

    /**
     * Request program break
     */
    private async _requestBreak(): Promise<void> {
        if (this.port == null) {
            throw new Error("Not connected");
        }
        await promisify(this.port.set).call(this.port, { brk: true, dtr: false });
        await promisify(this.port.set).call(this.port, { brk: false, dtr: true });
    }

    /**
     * Mount Wakayama.rb as an USB mass storage
     */
    private _mountDrive(): Promise<void> {
        return new Promise((resolve, reject) => {
            let disposable = this.onDidDisconnect(() => {
                disposable.dispose();
                resolve();
            });
            this.serialSend("M\r")
            .then(() => {
                return this.serialRecv("\r\n>")
                .then(() => {
                    reject(new NotSupportedError());
                }, (reason) => {
                    console.debug(
                        `[${this.constructor.name}.prototype._mountDrive]`,
                        "Ignore error during reset",
                        reason
                    );
                });
            }, (reason) => {
                reject(reason);
            });
        });
    }

    /*
    protected getConfigXmlPath(): string {
        return path.join(RubicProcess.self.workspaceRoot, "wrbb.xml");
    }

    getAutoStartProgram(): Thenable<string> {
        return Promise.resolve(RubicProcess.self.readTextFile(
            this.getConfigXmlPath(), false, ""
        ))
        .then((content: string) => {
            let match = content.match(/file.*['"]([^'"])['"]/);
            return (match != null) ? match[1] : null;
        });
    }

    setAutoStartProgram(relativePath: string): Thenable<void> {
        if (relativePath.match(/['"]/) != null) {
            return Promise.reject(new Error(
                "This board cannot handle files with quotemarks (['] or [\"])"
            ));
        }
        return Promise.resolve(RubicProcess.self.updateTextFile(
            this.getConfigXmlPath(),
            (content) => {
                return dedent`
                    <?xml version="1.0" encoding="utf-8" standalone="yes"?>
                    <Config><Start file="${relativePath}" /></Config>
                `;
            }
        ));
    }
    */

    /**
     * Search USB mass storage device for firmware update mode
     */
    private async _searchUsbMassStorage(): Promise<string> {
        for (let retry = 0; retry < WRBB_RESET_MAX_RETRIES; ++retry) {
            await delay(WRBB_RESET_DELAY_MS);
            const disks = await enumerateRemovableDisks(1, WRBB_MSD_MAX_CAPACITY);
            for (let disk of disks) {
                if (fse.existsSync(path.join(disk.path, CITRUS_MSD_FILE)) ||
                    fse.existsSync(path.join(disk.path, SAKURA_MSD_FILE))) {
                    return disk.path;
                }
            }
        }
        throw new Error(
            localize("board-not-found-x", "{0} is not found", this.getBoardName())
        );
    }
}

Board.addConstructor(WakayamaRbBoard);
