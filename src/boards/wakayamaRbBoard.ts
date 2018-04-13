import { Board, BoardCandidate, BoardStdioStream, BoardInformation, BoardConstructor } from "./board";
import * as stream from "stream";
import * as SerialPort from "serialport";
import * as nls from "vscode-nls";
import * as fse from "fs-extra";
import * as pify from "pify";
import * as path from "path";
import { enumerateRemovableDisks } from "../util/diskEnumerator";
import { exec } from "child_process";
import { RubicProcess } from "../processes/rubicProcess";
import * as dedent from "dedent";

const localize = nls.loadMessageBundle(__filename);

const WRBB_RESET_DELAY_MS = 2000;
const WRBB_RESET_MAX_RETRIES = 5;
const WRBB_MSD_MAX_CAPACITY = 4 * 1024 * 1024;
const WRBB_PROG_DELAY_MS = 2000;
const CITRUS_MSD_FILE = "Gadget Renesas Project Home.html";
const SAKURA_MSD_FILE = "SAKURA BOARD for Gadget Renesas Project Home.html";
const CHAR_CODE_PROMPT = ">".charCodeAt(0);
const CHAR_CODE_PROGRESS = ".".charCodeAt(0);

function delay(ms: number): Promise<void> {
    return <any>new Promise((resolve) => {
        global.setTimeout(resolve, ms);
    });
}

export class WakayamaRbBoard extends Board {
    private _path: string;
    private _port: SerialPort;
    private _info: BoardInformation;
    private _stdio: BoardStdioStream;
    private _waiter: {
        resolve: Function, reject: Function,
        timerId: NodeJS.Timer,
        length?: number, token?: Buffer, string?: boolean,
        offset?: number
    };
    private _received: Buffer;
    private _DRAIN_INTERVAL_MS = 250;

    public static getBoardName(): string {
        return localize("board-name", "Wakayama.rb board");
    }

    protected static VID_PID_LIST = [
        {vendorId: 0x2129, productId: 0x0531},  // TOKUDEN
        {vendorId: 0x045b, productId: 0x0234},  // Renesas
    ];

    public constructor() {
        super();
    }

    public static list(): Promise<BoardCandidate[]> {
        return pify(SerialPort.list).call(SerialPort)
        .then((ports: SerialPort.PortConfig[]) => {
            let result: BoardCandidate[] = [];
            ports.forEach((port) => {
                let vid = parseInt(port.vendorId, 16);
                let pid = parseInt(port.productId, 16);
                if (isNaN(vid) || isNaN(pid)) {
                    return;
                }
                let entry = this.VID_PID_LIST.find((entry) => {
                    return (vid === entry.vendorId && pid === entry.productId);
                });
                let board: BoardCandidate = {
                    boardClass: this.name,
                    path: port.comName,
                    name: port.comName,
                    vendorId: vid,
                    productId: pid
                };
                if (entry) {
                    board.name = this.getBoardName();
                } else {
                    board.unsupported = true;
                }
                result.push(board);
            });
            return result;
        });
    }

    private _portCall(method: string, ...args): Promise<any> {
        if (this._port == null) {
            this._port = new SerialPort(this._path, {
                autoOpen: false,
                baudRate: 115200,
            });
            this._port.on("data", this._dataHandler.bind(this));
            this._port.on("error", this._errorHandler.bind(this));
        }
        return new Promise((resolve, reject) => {
            this._port[method](...args, (error, result) => {
                if (error) { return reject(error); }
                resolve(result);
            });
        });
    }

    get isConnected(): boolean {
        return !!this._port;
    }

    connect(path: string): Promise<void> {
        this._path = path;
        return this._portCall("open");
    }

    disconnect(): Promise<void> {
        if (this._port != null) {
            return this._portCall("close");
        }
        return Promise.resolve();
    }

    getInfo(): Promise<BoardInformation> {
        if (this._info) {
            return Promise.resolve(this._info);
        }
        return Promise.resolve(
        ).then(() => {
            return this._requestBreak();
        }).then(() => {
            return this._send("H\r");
        }).then(() => {
            return this._recv("H [ENTER])\r\n>");
        }).then((resp: string) => {
            let firmwareId: string = null;
            resp.split("\r\n").forEach((line) => {
                let match = line.match(/^WAKAYAMA\.RB Board Ver\.([^,]+),/);
                if (match) { firmwareId = match[1]; }
            });
            if (!firmwareId) {
                return <Promise<any>>Promise.reject(
                    Error(localize("failed-detect", "Failed to detect firmware"))
                );
            }
            this._info = {
                path: this._path,
                firmwareId: firmwareId,
            };
            return this._info;
        }); // return Promise.resolve().then()...
    }

    writeFile(filename: string, data: Buffer, progress: (message: string) => void): Promise<void> {
        let ascii: Buffer = Buffer.allocUnsafe(data.byteLength * 2);
        let hex: number[] = [0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x41,0x42,0x43,0x44,0x45,0x46];
        for (let byteOffset = 0; byteOffset < data.byteLength; ++byteOffset) {
            let v = data[byteOffset];
            ascii[byteOffset*2+0] = hex[v >>> 4];
            ascii[byteOffset*2+1] = hex[v & 15];
        }
        return Promise.resolve(
        ).then(() => {
            return this._requestBreak();
        }).then(() => {
            return this._send(`U ${filename} ${ascii.byteLength}\r`);
        }).then(() => {
            if (data.byteLength === 0) {
                return;
            }
            return Promise.resolve()
            .then(() => {
                return this._recv("Waiting");
            }).then(() => {
                return this._send(ascii);
            }).then(() => {
                return this._recv("Saving");
            });
        }).then(() => {
            let waitWithProgress = () => {
                return this._recv(1)
                .then((value: Buffer) => {
                    let byte = value[0];
                    if (byte === CHAR_CODE_PROMPT) {
                        return;
                    }
                    if (byte === CHAR_CODE_PROGRESS) {
                        progress(".");
                    }
                    return waitWithProgress();
                });
            };
            return waitWithProgress();
        }).then(() => {
            return;
        }); // return Promise.resolve().then()...
    }

    readFile(filename: string): Promise<Buffer> {
        let len: number = NaN;
        return Promise.resolve(
        ).then(() => {
            return this._requestBreak();
        }).then(() => {
            return this._send(`F ${filename}\r`);
        }).then(() => {
            return this._recv("Waiting");
        }).then(() => {
            return this._send("\r");
        }).then(() => {
            return this._recv("Waiting");
        }).then((resp: string) => {
            let lines = resp.split("\r\n");
            let waiting = lines.findIndex((line) => line.startsWith("Waiting"));
            len = parseInt(lines[waiting - 1]);
            return this._send("\r");
        }).then(() => {
            return this._recv("\r\n>");
        }).then((resp: string) => {
            let lines = resp.split("\r\n");
            let footer = lines.findIndex((line) => line.startsWith("WAKAYAMA"));
            let ascii = lines[footer - 1];
            ascii = ascii && ascii.substr(-(len * 2));
            if (!isNaN(len) && ascii && ascii.length === (len * 2)) {
                let buf = Buffer.allocUnsafe(len);
                for (let byteOffset = 0; byteOffset < len; ++byteOffset) {
                    let byte = parseInt(ascii.substr(byteOffset * 2, 2), 16);
                    if (isNaN(byte)) { buf = null; break; }
                    buf[byteOffset] = byte;
                }
                if (buf) { return buf; }
            }
            throw (
                new Error(localize("read-error", "Failed to read file"))
            );
        }); // return Promise.resolve().then()...
    }

    enumerateFiles(dir: string): Promise<string[]> {
        return Promise.resolve(
        ).then(() => {
            return this._requestBreak();
        }).then(() => {
            return this._send("L\r");
        }).then(() => {
            return this._recv("\r\n>");
        }).then((resp: string) => {
            let files: string[] = [];
            if (dir !== "" && !dir.endsWith("/")) {
                dir = dir + "/";
            }
            resp.split("\r\n").forEach((line) => {
                let m = line.match(/^ (.+) (\d+) byte$/);
                if (m && m[1].startsWith(dir)) {
                    files.push(m[1].substring(dir.length));
                }
            });
            return files;
        }); // return Promise.resolve().then()...
    }

    writeFirmware(filename: string, boardPath: string, reporter: (message?: string) => void): Promise<boolean> {
        let boardName = (<BoardConstructor>this.constructor).getBoardName();
        const warn = ` $(stop)${localize(
            "warn-x",
            "Please wait! Do not disconnect {0}",
            boardName
        )} `;
        reporter();
        return Promise.resolve()
        .then(() => {
            return RubicProcess.self.showInformationMessage(
                localize("push-reset-button-x", "Push reset button on {0}", boardName),
                {title: localize("push-done", "OK, pushed")}
            );
        })
        .then((select) => {
            if (select == null) {
                return false;
            }
            reporter(localize("searching-x", "Searching {0}...", boardName));
            return this._searchUsbMassStorage()
            .then((basePath) => {
                reporter(localize("sending-data", "Sending data") + warn);
                let destPath = path.join(basePath, path.basename(filename));
                let copy_cmd = (process.platform === "win32") ? "copy" : "cp";
                return pify(exec)(`${copy_cmd} "${filename}" "${destPath}"`);
            })
            .then(() => {
                reporter(localize("updating-flash", "Updating flash") + warn);
                return delay(WRBB_PROG_DELAY_MS);
            })
            .then(() => {
                return RubicProcess.self.showInformationMessage(localize(
                    "wait-led-nonblink-x",
                    "Wait until LED on {0} stops blinking",
                    boardName
                ), {
                    title: localize("confirm-done", "OK, confirmed"),
                    isCloseAffordance: true
                });
            })
            .then(() => {
                return true;
            });
        });
    }

    formatStorage(): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            return this._requestBreak();
        }).then(() => {
            return this._send("Z\r");
        }).then(() => {
            return this._recv("\r\n>");
        }).then(() => {
            return;
        }); // return Promise.resolve().then()...
    }

    runProgram(filename: string): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            return this._requestBreak();
        }).then(() => {
            return this._send(`R ${filename}\r`);
        }).then(() => {
            // Skip "R xxx" line
            return this._recv("\n");
        }).then(() => {
            let stdout = new stream.Readable({
                encoding: "utf8",
                read: (size) => {}
            });
            let stdoutReader = () => {
                return this._recv("\n").then((resp: string) => {
                    if (resp.match(/^WAKAYAMA\.RB .*H \[ENTER\]\)\r\n$/)) {
                        stdout.push(null);
                        this._stdio = null;
                        this.emit("stop", false);
                    } else {
                        stdout.push(resp);
                    }
                }).then(() => {
                    if (!this._stdio) { return; }
                    return stdoutReader();
                });
            };
            stdoutReader();
            this._stdio = {stdout};
            this.emit("start", filename);
        }); // return Promise.resolve().then()...
    }

    getStdioStream(): Promise<BoardStdioStream> {
        return Promise.resolve(this._stdio);
    }

    isRunning(): Promise<boolean> {
        return Promise.resolve(!!this._stdio);
    }

    stopProgram(): Promise<void> {
        if (this.isRunning()) {
            this.emit("stop", true);
        }
        return this._requestBreak();
    }

    private _requestBreak(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._port.set({brk: true}, (error) => {
                if (error != null) {
                    return reject(error);
                }
                this._port.set({brk: false}, (error) => {
                    if (error != null) {
                        return reject(error);
                    }
                    return resolve();
                });
            });
        });
    }

    protected getConfigXmlPath(): string {
        return path.join(RubicProcess.self.workspaceRoot, "wrbb.xml");
    }

    getAutoStartProgram(): Promise<string> {
        return Promise.resolve(RubicProcess.self.readTextFile(
            this.getConfigXmlPath(), false, ""
        ))
        .then((content: string) => {
            let match = content.match(/file.*['"]([^'"])['"]/);
            return (match != null) ? match[1] : null;
        });
    }

    setAutoStartProgram(relativePath: string): Promise<void> {
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

    private _searchUsbMassStorage(): Promise<string> {
        let tryEnumerate = (retry: number): Promise<string> => {
            return delay(WRBB_RESET_DELAY_MS)
            .then(() => {
                return enumerateRemovableDisks(1, WRBB_MSD_MAX_CAPACITY);
            })
            .then((disks) => {
                for (let disk of disks) {
                    if (fse.existsSync(path.join(disk.path, CITRUS_MSD_FILE)) ||
                        fse.existsSync(path.join(disk.path, SAKURA_MSD_FILE))) {
                        return disk.path;
                    }
                }
                if (retry < WRBB_RESET_MAX_RETRIES) {
                    return tryEnumerate(retry + 1);
                }
                throw new Error(
                    localize("board-not-found-x", "{0} is not found", this.getBoardName())
                );
            });
        };
        return tryEnumerate(0);
    }

    private _send(data: string|Buffer): Promise<void> {
        let buf = Buffer.from(<any>data);
        if (this.boardData.debugCommunication > 0) {
            RubicProcess.self.printDebug("_send():", buf);
        }
        return this._portCall("write", buf);
    }

    private _recv(trig: string|Buffer|number): Promise<string|Buffer> {
        let printDebug = (this.boardData.debugCommunication > 0) ? (...args) => {
            RubicProcess.self.printDebug("_recv():", ...args);
        } : () => {};
        if (this._waiter) {
            let reject = this._waiter.reject;
            this._waiter = null;
            reject(new Error("Operation cancelled"));
            printDebug("[reject]");
        }
        return this._portCall("drain").then(() => {
            return new Promise<string|Buffer>((resolve, reject) => {
                let waiter: any = {resolve, reject: (reason) => {
                    global.clearTimeout(waiter.timerId);
                    reject(reason);
                }};
                waiter.timerId = global.setInterval(
                    () => { this._portCall("drain").catch(waiter.reject); },
                    this._DRAIN_INTERVAL_MS
                );
                if (typeof(trig) === "number") {
                    waiter.length = trig;
                    printDebug("[length]", trig);
                } else {
                    if (typeof(trig) === "string") {
                        waiter.string = true;
                    }
                    waiter.token = Buffer.from(<any>trig);
                    waiter.offset = 0;
                    printDebug("[token]", waiter.token);
                }
                this._waiter = waiter;
                this._dataHandler(null);
            });
        });
    }

    private _dataHandler(raw: Buffer) {
        let printDebug = (this.boardData.debugCommunication > 0) ? (...args) => {
            RubicProcess.self.printDebug("_dataHandler():", ...args);
        } : () => {};
        let buffer: Buffer;
        if (!raw) {
            buffer = this._received;
        } else if (!this._received) {
            buffer = this._received = Buffer.from(raw);
        } else {
            buffer = this._received = Buffer.concat([this._received, raw]);
        }

        if (this.boardData.debugCommunication > 1) {
            printDebug("[recv]", raw);
        }
        let waiter = this._waiter;
        if (!buffer || !waiter) { return; }
        if (typeof(waiter.length) !== "undefined") {
            if (buffer.byteLength < waiter.length) {
                return;
            }
        } else if (buffer.byteLength < waiter.token.byteLength) {
            return;
        } else {
            let found = buffer.indexOf(waiter.token, waiter.offset);
            if (found < 0) {
                waiter.offset = buffer.byteLength - waiter.token.byteLength + 1;
                return;
            }
            waiter.length = found + waiter.token.byteLength;
        }

        // Receive complete
        this._waiter = null;
        let resolve = waiter.resolve;
        global.clearTimeout(waiter.timerId);
        let part: Buffer|string = Buffer.from(buffer.slice(0, waiter.length));
        printDebug("[done]", part);
        if (waiter.string) {
            part = part.toString();
        }
        this._received = buffer.slice(waiter.length);
        resolve(part);
    }

    private _errorHandler(error): void {
        console.error(error);
    }
}
Board.addConstructor(WakayamaRbBoard);
