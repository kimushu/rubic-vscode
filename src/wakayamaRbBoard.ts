'use strict';

import { RubicBoard, BoardCandidate, BoardStdio, BoardInformation } from './rubicBoard';
import * as stream from 'stream';
import { SerialPort } from 'serialport';
import * as nls from 'vscode-nls';
let localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

const DEBUG = false;

export class WakayamaRbBoard extends RubicBoard {
    private _port: SerialPort;
    private _info: BoardInformation;
    private _stdio: BoardStdio;
    private _waiter: {
        resolve: Function, reject: Function,
        timerId: NodeJS.Timer,
        length?: number, token?: Buffer, string?: boolean,
        offset?: number
    };
    private _received: Buffer;
    private _DRAIN_INTERVAL_MS = 250;

    protected static _VID_PID_LIST = [
        {name: "WAKAYAMA.RB board", boardId: "wakayamarb", vendorId: 0x2129, productId: 0x0531}, // TOKUDEN
        {name: "WAKAYAMA.RB board", boardId: "wakayamarb", vendorId: 0x045b, productId: 0x0234}, // Renesas
    ];

    public constructor(private _boardId: string, private _path: string) {
        super();
        this._port = new SerialPort(_path, {
            autoOpen: false,
            baudRate: 115200,
            //parser: SerialPort.parsers.readline("\r"),
        })
        this._port.on("data", this._dataHandler.bind(this));
        this._port.on("error", this._errorHandler.bind(this));
    }

    static getIdList(): string[] {
        return Array.from(new Set(this._VID_PID_LIST.map((entry) => {
            return entry.boardId
        })));
    }

    static getName(boardId: string): string {
        return localize("wakayamarb.name", "WAKAYAMA.RB board");
    }

    public static list(): Promise<BoardCandidate[]> {
        return new Promise((resolve, reject) => {
            SerialPort.list((err, ports: any[]) => {
                if (err) { return reject(err) }
                let result: BoardCandidate[] = [];
                ports.forEach((port) => {
                    let vid = parseInt(port.vendorId, 16);
                    let pid = parseInt(port.productId, 16);
                    let entry = this._VID_PID_LIST.find((entry) => {
                        return (vid == entry.vendorId && pid == entry.productId);
                    });
                    if (entry) {
                        result.push({
                            path: port.comName,
                            name: entry.name,
                            boardId: entry.boardId,
                            boardClass: this,
                            vendorId: vid,
                            productId: pid
                        });
                    }
                })
                resolve(result);
            })
        })  // return new Promise()
    }

    private _portCall(method: string, ...args): Promise<any> {
        return new Promise((resolve, reject) => {
            this._port[method](...args, (error, result) => {
                if (error) { return reject(error); }
                resolve(result);
            })
        });
    }

    connect(): Promise<void> {
        return this._portCall("open")
    }

    disconnect(): Promise<void> {
        return this._portCall("close")
    }

    dispose(): void {
        this._port && this._port.close();
    }

    getInfo(): Promise<BoardInformation> {
        if (this._info) {
            return Promise.resolve(this._info);
        }
        return Promise.resolve(
        ).then(() => {
            return this._flush();
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
                    Error("Failed to detect firmware")
                );
            }
            this._info = {
                boardId: this._boardId,
                path: this._path,
                firmwareId: firmwareId,
            };
            return this._info;
        }); // return Promise.resolve().then()...
    }

    writeFile(filename: string, data: Buffer): Promise<void> {
        let ascii: Buffer = Buffer.allocUnsafe(data.byteLength * 2);
        let hex: number[] = [0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x41,0x42,0x43,0x44,0x45,0x46];
        for (let byteOffset = 0; byteOffset < data.byteLength; ++byteOffset) {
            let v = data[byteOffset];
            ascii[byteOffset*2+0] = hex[v >>> 4];
            ascii[byteOffset*2+1] = hex[v & 15];
        }
        return Promise.resolve(
        ).then(() => {
            return this._send(`U ${filename} ${ascii.byteLength}\r`);
        }).then(() => {
            return this._recv(" 60");
        }).then(() => {
            return this._send(ascii);
        }).then(() => {
            return this._recv("Saving");
        }).then(() => {
            return this._recv("\r\n>");
        }).then(() => {
            return;
        }); // return Promise.resolve().then()...
    }

    readFile(filename: string): Promise<Buffer> {
        let len: number = NaN;
        return Promise.resolve(
        ).then(() => {
            return this._send(`F ${filename}\r`);
        }).then(() => {
            return this._recv(" 60");
        }).then(() => {
            return this._send("\r");
        }).then(() => {
            return this._recv(" 60");
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
            if (!isNaN(len) && ascii && ascii.length == (len * 2)) {
                let buf = Buffer.allocUnsafe(len);
                for (let byteOffset = 0; byteOffset < len; ++byteOffset) {
                    let byte = parseInt(ascii.substr(byteOffset * 2, 2), 16);
                    if (isNaN(byte)) { buf = null; break; }
                    buf[byteOffset] = byte;
                }
                if (buf) { return buf; }
            }
            return Promise.reject(
                Error(localize("read-error", "Failed to read file"))
            );
        }); // return Promise.resolve().then()...
    }

    enumerateFiles(dir: string): Promise<string[]> {
        return Promise.resolve(
        ).then(() => {
            return this._send("L\r");
        }).then(() => {
            return this._recv("\r\n>");
        }).then((resp: string) => {
            let files: string[] = [];
            if (dir !== "" && !dir.endsWith('/')) {
                dir = dir + "/";
            }
            resp.split("\r\n").forEach((line) => {
                let m = line.match(/^ (.+) (\d+) byte$/);
                if (m && m[1].startsWith(dir)) {
                    files.push(m[1].substring(dir.length));
                }
            })
            return files;
        }); // return Promise.resolve().then()...
    }

    formatStorage(): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            return this._send("Z\r");
        }).then(() => {
            return this._recv("\r\n>");
        }).then(() => {
            return;
        }); // return Promise.resolve().then()...
    }

    runSketch(filename: string): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            return this._send(`R ${filename}\r`);
        }).then(() => {
            // Skip "R xxx" line
            return this._recv("\n")
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
                        this.emit("stop");
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

    getStdio(): Promise<BoardStdio> {
        return Promise.resolve(this._stdio);
    }

    isSketchRunning(): Promise<boolean> {
        return Promise.resolve(!!this._stdio);
    }

    private _flush(): Promise<void> {
        this._received = null;
        if (DEBUG) { console.log("_flush()"); }
        return this._portCall("flush");
    }

    private _send(data: string|Buffer): Promise<void> {
        let buf = Buffer.from(<any>data);
        if (DEBUG) { console.log("_send():", buf); }
        return this._portCall("write", buf);
    }

    private _recv(trig: string|Buffer|number): Promise<string|Buffer> {
        if (this._waiter) {
            global.clearTimeout(this._waiter.timerId);
            let reject = this._waiter.reject;
            this._waiter = null;
            reject(Error("Operation cancelled"));
        }
        return this._portCall("drain").then(() => {
            return new Promise((resolve, reject) => {
                let waiter: any = {resolve, reject};
                waiter.timerId = global.setInterval(
                    () => { this._portCall("drain"); },
                    this._DRAIN_INTERVAL_MS
                );
                if (typeof(trig) == "number") {
                    waiter.length = trig;
                    if (DEBUG) { console.log("_recv():", trig); }
                } else {
                    if (typeof(trig) == "string") {
                        waiter.string = true;
                    }
                    waiter.token = Buffer.from(<any>trig);
                    waiter.offset = 0;
                    if (DEBUG) { console.log("_recv():", waiter.token); }
                }
                this._waiter = waiter;
                this._dataHandler(null);
            });
        });
    }

    private _dataHandler(raw: Buffer) {
        let buffer: Buffer;
        if (!raw) {
            buffer = this._received;
        } else if (!this._received) {
            buffer = this._received = Buffer.from(raw);
        } else {
            buffer = this._received = Buffer.concat([this._received, raw]);
        }

        if (DEBUG) { console.log("_dataHandler():", raw); }
        let waiter = this._waiter;
        if (!buffer || !waiter) { return; }
        if (typeof(waiter.length) !== "undefined") {
            if (buffer.byteLength < waiter.length) {
                return;
            }
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
        if (waiter.string) {
            part = part.toString();
        }
        this._received = buffer.slice(waiter.length);
        if (DEBUG) { console.log("_dataHandler:resolve():", part); }
        resolve(part)
    }

    private _errorHandler(error): void {
        console.error(error);
    }
}
