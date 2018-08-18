import * as SerialPort from "serialport";
import * as pify from "pify";
import * as util from "util";
import { Board, BoardCandidate, BoardConstructor } from "./board";
import { AssertionError } from "assert";
import { TimeoutError } from "../util/errors";
import { vscode } from "../extension";

export interface UsbSerialId {
    vendorId: number;
    productId: number;
}

interface SerialWaiter {
    resolve: Function;
    reject?: Function;
    timerId?: NodeJS.Timer;
    length?: number;
    token?: Buffer;
    string?: boolean;
    offset?: number;
}

/**
 * Abstract board with serial communication
 */
export class SerialBoard extends Board {
    private _port: SerialPort | null = null;
    private _onDidDisconnect = new vscode.EventEmitter<void>();
    private _waiter: SerialWaiter | null = null;
    private _received: Buffer = Buffer.alloc(0);

    /**
     * A function to judge if the port is a target board
     */
    protected static judgePort?: (port: SerialPort.PortConfig) => boolean;

    /**
     * A list of USB serial VendorID / ProductID list
     */
    protected static usbSerialIdList?: UsbSerialId[];

    /**
     * Auto drain interval in milliseconds
     */
    protected autoDrainInterval?: number;

    /**
     * Enumerate boards
     * @return A thenable that resolves to an array of scanned boards
     */
    public static list(): Thenable<BoardCandidate[]> {
        let { judgePort, usbSerialIdList } = this;
        return pify(SerialPort.list).call(SerialPort)
        .then((ports: SerialPort.PortConfig[]) => {
            let result: BoardCandidate[] = [];
            ports.forEach((portConfig) => {
                let vid = parseInt(portConfig.vendorId, 16);
                let pid = parseInt(portConfig.productId, 16);
                let supported = false;
                if (judgePort != null) {
                    supported = judgePort(portConfig);
                } else if (usbSerialIdList != null) {
                    if (isNaN(vid) || isNaN(pid)) {
                        return;
                    }
                    supported = usbSerialIdList.some((entry) => {
                        return (vid === entry.vendorId && pid === entry.productId);
                    });
                }
                let board: BoardCandidate = {
                    boardClass: this.name,
                    path: portConfig.comName,
                    name: portConfig.comName,
                    vendorId: vid,
                    productId: pid
                };
                if (supported) {
                    board.name = (<BoardConstructor><any>this).getBoardName();
                } else {
                    board.unsupported = true;
                }
                result.push(board);
            });
            return result;
        });
    }

    /**
     * Connect to board
     * @param path Path of the board
     */
    async connect(path: string): Promise<void> {
        if (this._port != null) {
            throw new Error("Already connected");
        }
        const printDebug = (this.serialDebugLevel > 0) ? (...args) => {
            console.log(`[${this.constructor.name}.prototype.connect]`, ...args);
        } : () => {};
        this._path = path;
        this._port = new SerialPort(path, {
            autoOpen: false,
            baudRate: 115200,
        });
        printDebug("Creating new SerialPort instance:", path);
        this._port.on("data", this._dataHandler.bind(this));
        this._port.on("error", this._errorHandler.bind(this));
        this._port.on("close", this._closeHandler.bind(this));
        try {
            printDebug("Opening port ");
            await pify(this._port.open).call(this._port);
            printDebug("Authenticating board");
            await this.serialAuth();
        } catch (reason) {
            printDebug("Failed to open:", reason);
            await this.disconnect().catch(() => {});
            throw reason;
        }
    }

    /**
     * Check if the board is connected or not
     */
    get isConnected(): boolean {
        return (this._port != null);
    }

    /**
     * An event to signal a board has been disconnected.
     */
    get onDidDisconnect() { return this._onDidDisconnect.event; }

    /**
     * Disconnect from board
     */
    async disconnect(): Promise<void> {
        if (this._port == null) {
            throw new Error("Not connected");
        }
        const printDebug = (this.serialDebugLevel > 0) ? (...args) => {
            console.log(`[${this.constructor.name}.prototype.disconnect]`, ...args);
        } : () => {};
        try {
            printDebug("Disconnecting");
            await pify(this._port.close).call(this._port);
        } finally {
            this._path = undefined;
            this._port = null;
        }
    }

    /**
     * Get port instance
     */
    protected get port(): SerialPort | null {
        return this._port;
    }

    /**
     * Get debug level
     */
    protected get serialDebugLevel(): number {
        if (this.boardData == null) {
            return 0;
        }
        return this.boardData.debugCommunication;
    }

    /**
     * Authenticate board (Invoked just after connection)
     */
    protected serialAuth(): Promise<void> {
        throw new AssertionError();
    }

    /**
     * Send data
     * @param data A string or buffer to send
     */
    protected serialSend(data: string | Buffer): Promise<void> {
        const printDebug = (this.serialDebugLevel > 0) ? (...args) => {
            console.log(`[${this.constructor.name}.prototype.serialSend]`, ...args);
        } : () => {};
        const buffer = Buffer.from(<any>data);
        if (this.serialDebugLevel > 0) {
            printDebug("Sending", buffer);
            printDebug("Sending (string)", util.inspect(buffer.toString()));
        }
        if (this._port == null) {
            return Promise.reject(new AssertionError({
                message: "Not connected @ serialSend"
            }));
        }
        return pify(this._port.write).call(this._port, buffer);
    }

    /**
     * Receive data until find a specified string
     * @param trig A trigger string to finish receive
     * @param timeout A timeout in milliseconds
     */
    protected serialRecv(trig: string, timeout?: number): Promise<string>;

    /**
     * Receive data until find a specified binary data
     * @param trig A trigger buffer to finish receive
     * @param timeout A timeout in milliseconds
     */
    protected serialRecv(trig: Buffer, timeout?: number): Promise<Buffer>;

    /**
     * Receive specified length data
     * @param trig A length to receive in bytes
     * @param timeout A timeout in milliseconds
     */
    protected serialRecv(trig: number, timeout?: number): Promise<Buffer>;

    protected async serialRecv(trig: string | Buffer | number, timeout?: number): Promise<string | Buffer> {
        const printDebug = (this.serialDebugLevel > 0) ? (...args) => {
            console.log(`[${this.constructor.name}.prototype.serialRecv]`, ...args);
        } : () => {};
        if (this._waiter != null) {
            const { reject } = this._waiter;
            if (reject != null) {
                this._waiter.reject = undefined;
                reject(new Error("Operation cancelled by next action"));
                printDebug("Rejected previous operation by next action");
            }
        }
        if (this._port == null) {
            throw new AssertionError({
                message: "Not connected @ serialRecv"
            });
        }
        await pify(this._port.drain).call(this._port);
        return new Promise<string | Buffer>((resolve, reject) => {
            const waiter: SerialWaiter = {
                resolve: (value) => {
                    this._waiter = null;
                    resolve(value);
                },
                reject: (reason) => {
                    this._waiter = null;
                    if (waiter.timerId != null) {
                        global.clearTimeout(waiter.timerId);
                    }
                    reject(reason);
                },
            };
            if (this.autoDrainInterval != null) {
                waiter.timerId = global.setInterval(
                    () => {
                        if (this._port == null) {
                            return;
                        }
                        this._port.drain((err) => {
                            if (err == null) {
                                return;
                            }
                            const { reject } = waiter;
                            if (reject != null) {
                                waiter.reject = undefined;
                                reject(err);
                            }
                        });
                    },
                    this.autoDrainInterval
                );
            }
            if (timeout != null) {
                global.setTimeout(() => {
                    const { reject } = waiter;
                    if (reject != null) {
                        waiter.reject = undefined;
                        reject(new TimeoutError("Receive timed out"));
                    }
                }, timeout);
            }
            if (typeof(trig) === "number") {
                waiter.length = trig;
                printDebug("By length", trig);
            } else {
                if (typeof(trig) === "string") {
                    waiter.string = true;
                }
                waiter.token = Buffer.from(<any>trig);
                waiter.offset = 0;
                printDebug("By token", waiter.token);
            }
            this._waiter = waiter;
            this._dataHandler(undefined);
        });
    }

    /**
     * Flush all received data
     */
    protected async serialFlush(): Promise<void> {
        const printDebug = (this.serialDebugLevel > 0) ? (...args) => {
            console.log(`[${this.constructor.name}.prototype.serialFlush]`, ...args);
        } : () => {};
        if (this._waiter != null) {
            const { reject } = this._waiter;
            if (reject != null) {
                this._waiter.reject = undefined;
                reject(new Error("Operation cancelled by flush"));
                printDebug("Rejected previous operation by flush");
            }
        }
        if (this._port == null) {
            throw new AssertionError({
                message: "Not connected @ serialFlush"
            });
        }
        this._waiter = null;
        printDebug("Flushing");
        await pify(this._port.flush).call(this._port);
        this._received = Buffer.alloc(0);
    }

    /**
     * Process received data
     * @param rawData A raw data buffer which stores received data from board
     */
    private _dataHandler(rawData?: Buffer): void {
        const printDebug = (this.serialDebugLevel > 0) ? (...args) => {
            console.log(`[${this.constructor.name}.prototype._dataHandler]`, ...args);
        } : () => {};
        if (rawData != null) {
            this._received = Buffer.concat([this._received, rawData]);
        }
        const buffer = this._received;

        if (this.serialDebugLevel > 1) {
            if (rawData != null) {
                printDebug("Received [RAW]", rawData);
                printDebug("Received [RAW] (string)", util.inspect(rawData.toString()));
            } else {
                printDebug("Receiver triggered");
            }
        }
        const waiter = this._waiter;
        if ((buffer.byteLength === 0) || (waiter == null)) {
            return;
        }
        if (waiter.length != null) {
            if (buffer.byteLength < waiter.length) {
                return;
            }
        } else if (buffer.byteLength < waiter.token!.byteLength) {
            return;
        } else {
            let found = buffer.indexOf(waiter.token!, waiter.offset!);
            if (found < 0) {
                waiter.offset = buffer.byteLength - waiter.token!.byteLength + 1;
                return;
            }
            waiter.length = found + waiter.token!.byteLength;
        }

        // Receive complete
        const resolve = waiter.resolve;
        waiter.reject = undefined;
        if (waiter.timerId != null) {
            global.clearTimeout(waiter.timerId);
        }
        let chunk: Buffer | string = Buffer.from(buffer.slice(0, waiter.length));
        if (this.serialDebugLevel > 0) {
            printDebug("Found chunk", chunk);
            printDebug("Found chunk (string)", util.inspect(chunk.toString()));
        }
        if (waiter.string) {
            chunk = chunk.toString();
        }
        this._received = buffer.slice(waiter.length);
        resolve(chunk);
    }

    /**
     * Process error
     * @param error An error object
     */
    private _errorHandler(error: Error): void {
        const printDebug = (this.serialDebugLevel > 0) ? (...args) => {
            console.log(`[${this.constructor.name}.prototype._errorHandler]`, ...args);
        } : () => {};
        printDebug(error);
        if (this._waiter != null) {
            const { reject } = this._waiter;
            if (reject != null) {
                this._waiter.reject = undefined;
                reject(new Error("Operation cancelled by error"));
                printDebug("Rejected previous operation by error");
            }
        }
    }

    /**
     * Process closing event
     */
    private _closeHandler(): void {
        this._onDidDisconnect.fire();
        this._port = null;
    }
}
