'use strict';

import { RubicBoard, BoardCandidate, BoardStdio, BoardInformation } from './rubicBoard';
import * as stream from 'stream';
import * as Canarium from 'canarium';
import { SerialPort } from 'serialport';
import * as nls from 'vscode-nls';
let localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

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
    private _DRAIN_INTERVAL_MS: 250;

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

    getInfo(): Promise<BoardInformation> {
        if (this._info) {
            return Promise.resolve(this._info);
        }
        return Promise.resolve(
        ).then(() => {
            return this._flush();
        }).then(() => {
            return this._send("H\n");
        }).then(() => {
            return this._recv("(H [ENTER])\r>");
        }).then((resp: string) => {
            let firmwareId: string = null;
            resp.split("\r").forEach((line) => {
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
        });
    }

    private _flush(): Promise<void> {
        this._received = null;
        return this._portCall("flush");
    }

    private _send(data: string|Buffer): Promise<void> {
        let buf = Buffer.from(<any>data);
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
                } else {
                    if (typeof(trig) == "string") {
                        waiter.string = true;
                    }
                    waiter.token = Buffer.from(<any>trig);
                    waiter.offset = 0;
                }
                this._waiter = waiter;
            });
        });
    }

    private _dataHandler(raw: Buffer) {
        let buffer: Buffer;
        if (!this._received) {
            buffer = this._received = Buffer.from(raw);
        } else {
            buffer = this._received = Buffer.concat([this._received, raw]);
        }

        let waiter = this._waiter;
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
        resolve(part)
    }
}
