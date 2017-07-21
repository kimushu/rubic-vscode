import { Board, BoardInformation, BoardStdioStream, BoardDebugStream, BoardCandidate } from "./board";
import { Canarium } from "canarium";
import { Writable, Readable } from "stream";
import { RubicProcess } from "../processes/rubicProcess";
import * as path from "path";
import * as elfy from "elfy";
require("promise.prototype.finally").shim();

const AGENT_PATH_DEFAULT = "/sys/rubic";
const STDIN_PATH  = "/dev/stdin";
const STDOUT_PATH = "/dev/stdout";
const STDERR_PATH = "/dev/stderr";
const INT_STORAGE_PATH = "/mnt/internal";
//const FORMAT_TIMEOUT_MS = 10 * 1000;
const RPC_TIMEOUT = 5000;
const STATUS_POLL_INTERVAL = 1000;

elfy.constants.machine["113"] = "nios2";

function getRemoteWritableStream(file: Canarium.RemoteFile): Writable {
    let stream = new Writable({
        write(chunk: Buffer, encoding, callback) {
            file.write(chunk, true, RPC_TIMEOUT).then(
                () => { callback(); },
                (reason) => { callback(reason); }
            );
        }
    });
    stream.on("close", () => file.close());
    return stream;
}

function getRemoteReadableStream(file: Canarium.RemoteFile): Readable {
    let stream = new Readable({
        read(size: number) {
            let retry = () => {
                return file.read(size, false, null)
                .then((chunk) => {
                    this.push(chunk);
                    size -= chunk.length;
                    if (size > 0) {
                        return retry();
                    }
                });
            };
            retry().catch((reason) => {
                if (reason instanceof Canarium.RemoteError) {
                    if (reason.code === Canarium.RemoteError.EAGAIN) {
                        // Ignore error
                        return;
                    }
                }
                this.emit("error", reason);
            });
        }
    });
    stream.on("close", () => file.close());
    return stream;
}

export class PeridotBoard extends Board {
    private _canarium: Canarium;
    private _statusPoll: NodeJS.Timer;

    protected constructor(private _agentPath: string = AGENT_PATH_DEFAULT) {
        super();
    }

    static list(): Promise<BoardCandidate[]> {
        return Canarium.enumerate().then((boards: any[]) => {
            return boards.map((board) => {
                let candidate: BoardCandidate = {
                    boardClass: this.name,
                    name: board.name,
                    path: board.path,
                };
                if (board.vendorId) { candidate.vendorId = board.vendorId; }
                if (board.productId) { candidate.productId = board.productId; }
                this.judgeSupportedOrNot(candidate);
                return candidate;
            });
        });
    }

    protected static judgeSupportedOrNot(candidate: BoardCandidate): void {
    }

    protected getDefaultBitrate(): number {
        return null;
    }

    /**
     * Get Canarium instance with connection check
     */
    protected getCanarium(path?: string, bitrate?: number): Promise<Canarium> {
        if (this._canarium == null) {
            if (path != null) {
                return this.connect(path, bitrate)
                .then(() => {
                    return this.getCanarium();
                });
            }
            return Promise.reject(new Error("Not connected"));
        }
        return Promise.resolve(this._canarium);
    }

    connect(path: string, bitrate?: number): Promise<void> {
        if (this._canarium != null) {
            return Promise.reject(
                new Error("Already connected")
            );
        }
        this._canarium = new Canarium();
        if (bitrate == null) {
            bitrate = this.getDefaultBitrate();
        }
        if (bitrate != null) {
            this._canarium.serialBitrate = bitrate;
        }
        this._canarium.onClosed = () => {
            this._canarium = null;
            this.emit("disconnected");
        };
        return this._canarium.open(path)
        .then(() => {
            this.emit("connected", path);
        })
        .catch((reason) => {
            this._canarium = null;
            return Promise.reject(reason);
        });
    }

    disconnect(): Promise<void> {
        this._stopStatusPolling();
        return this.getCanarium()
        .then((canarium) => {
            return canarium.close();
        });
    }

    getInfo(): Promise<BoardInformation> {
        return this.getCanarium()
        .then((canarium) => {
            return canarium.getinfo()
            .then((info) => {
                return {
                    path: canarium.base.path,
                    serialNumber: `${info.id}-${info.serialcode}`,
                };
            });
        });
    }

    writeFile(relativePath: string, data: Buffer): Promise<void> {
        return this.getCanarium()
        .then((canarium) => {
            return canarium.openRemoteFile(
                `${INT_STORAGE_PATH}/${relativePath}`,
                {O_CREAT: true, O_WRONLY: true, O_TRUNC: true},
                0o644,
                RPC_TIMEOUT
            )
            .then((file) => {
                const SPLIT_BYTES = 512;
                let tryWrite = (offset: number) => {
                    let end = Math.min(data.length, offset + SPLIT_BYTES);
                    return file.write(data.slice(offset, end), true, RPC_TIMEOUT)
                    .then(() => {
                        if (end < data.length) {
                            return tryWrite(end);
                        }
                    });
                };
                return tryWrite(0).finally(() => {
                    return file.close(RPC_TIMEOUT);
                });
            });
        });
    }

    readFile(relativePath: string): Promise<Buffer> {
        return this.getCanarium()
        .then((canarium) => {
            return canarium.openRemoteFile(
                `${INT_STORAGE_PATH}/${relativePath}`,
                {O_RDONLY: true},
                undefined,
                RPC_TIMEOUT
            )
            .then((file) => {
                return file.read(Infinity, true);
            });
        });
    }

    formatStorage(): Promise<void> {
        let path = `${this._agentPath}/format`;
        return this.getCanarium()
        .then((canarium) => {
            return canarium.openRemoteFile(
                path, {O_WRONLY: true}, undefined, RPC_TIMEOUT
            )
            .then((file) => {
                return file.close(RPC_TIMEOUT);
            })
            .then(() => {
                let pollStatus = () => {
                    return canarium.openRemoteFile(path, {O_RDONLY: true}, undefined, RPC_TIMEOUT)
                    .then((file) => {
                        return file.read(1, true, RPC_TIMEOUT)
                        .finally(() => {
                            return file.close(RPC_TIMEOUT);
                        });
                    })
                    .then((buf) => {
                        if (buf.toString() === "0") {
                            return pollStatus();
                        }
                    });
                };
                return pollStatus();
            });
        });
    }

    private _startStatusPolling(): void {
        this._stopStatusPolling();
        this._statusPoll = setInterval(
            () => {
                this.isRunning()
                .then((running) => {
                    if (!running) {
                        this._stopStatusPolling();
                        this.emit("stop");
                    }
                });
            }, STATUS_POLL_INTERVAL
        );
    }

    private _stopStatusPolling(): void {
        if (this._statusPoll != null) {
            clearInterval(this._statusPoll);
            this._statusPoll = null;
        }
    }

    runProgram(relativePath: string): Promise<void> {
        let path = `${INT_STORAGE_PATH}/${relativePath}`;
        return this.getCanarium()
        .then((canarium) => {
            return canarium.openRemoteFile(
                `${this._agentPath}/run`,
                {O_WRONLY: true},
                undefined,
                RPC_TIMEOUT
            )
            .then((file) => {
                return file.write(Buffer.from(path), true, RPC_TIMEOUT)
                .then(() => {
                    this.emit("start", relativePath);
                    this._startStatusPolling();
                    return file.close(RPC_TIMEOUT);
                });
            });
        });
    }

    isRunning(): Promise<boolean> {
        return this.getCanarium()
        .then((canarium) => {
            return canarium.openRemoteFile(
                `${this._agentPath}/run`,
                {O_RDONLY: true},
                undefined,
                RPC_TIMEOUT
            )
            .then((file) => {
                return file.read(256 /* FIXME */, false)
                .then((path) => {
                    return (path.length === 0 || path.indexOf(0) === 0);
                }, (reason) => {
                    console.log(reason);
                    return false;
                })
                .finally(() => {
                    return file.close(RPC_TIMEOUT);
                });
            }, (reason) => {
                console.log(reason);
                return false;
            });
        });
    }

    stopProgram(): Promise<void> {
        return this.getCanarium()
        .then((canarium) => {
            return canarium.openRemoteFile(
                `${this._agentPath}/stop`,
                {O_WRONLY: true},
                undefined,
                RPC_TIMEOUT
            )
            .then((file) => {
                return file.close(RPC_TIMEOUT);
            });
        });
    }

    getStdioStream(): Promise<BoardStdioStream> {
        let stdin, stdout, stderr;
        return this.getCanarium()
        .then((canarium) => {
            return Promise.all([
                canarium.openRemoteFile(STDIN_PATH, {O_WRONLY: true, O_NONBLOCK: true}, undefined, RPC_TIMEOUT),
                canarium.openRemoteFile(STDOUT_PATH, {O_RDONLY: true, O_NONBLOCK: true}, undefined, RPC_TIMEOUT),
                canarium.openRemoteFile(STDERR_PATH, {O_RDONLY: true, O_NONBLOCK: true}, undefined, RPC_TIMEOUT),
            ])
            .then(([stdin, stdout, stderr]) => {
                return {
                    stdin: getRemoteWritableStream(stdin),
                    stdout: getRemoteReadableStream(stdout),
                    stderr: getRemoteReadableStream(stderr),
                };
            });
        });
    }

    getDebugStream(): Promise<BoardDebugStream> {
        return this.getCanarium()
        .then((canarium) => {
            return Promise.all([
                canarium.openRemoteFile(`${this._agentPath}/debug_rx}`, {O_WRONLY: true}, undefined, RPC_TIMEOUT),
                canarium.openRemoteFile(`${this._agentPath}/debug_tx}`, {O_RDONLY: true}, undefined, RPC_TIMEOUT),
            ])
            .then(([tx, rx]) => {
                return {
                    tx: getRemoteWritableStream(tx),
                    rx: getRemoteReadableStream(rx),
                };
            });
        });
    }

    reset(): Promise<void> {
        return this.getCanarium()
        .then((canarium) => {
            return canarium.reset()
            .then(() => {});
        });
    }

    protected getConfigJsonPath(): string {
        return path.join(RubicProcess.self.workspaceRoot, "peridot.json");
    }

    getAutoStartProgram(): Promise<string> {
        let jsonPath = this.getConfigJsonPath();
        return Promise.resolve()
        .then(() => {
            return RubicProcess.self.readTextFile(jsonPath, true, {});
        })
        .then((obj: any) => {
            return obj.bootProgram;
        })
        .then((fullPath: string) => {
            let prefix = `${INT_STORAGE_PATH}/`;
            if (fullPath.startsWith(prefix)) {
                return fullPath.substr(prefix.length);
            }
            return fullPath;
        });
    }

    setAutoStartProgram(relativePath: string): Promise<void> {
        let jsonPath = this.getConfigJsonPath();
        return Promise.resolve()
        .then(() => {
            return RubicProcess.self.updateTextFile(
                jsonPath,
                {
                    bootProgram: `${INT_STORAGE_PATH}/${relativePath}`
                }
            );
        });
    }

    /**
     * Load ELF
     * @param data ELF data
     */
    protected loadElf(data: Buffer): Promise<void> {
        return Promise.resolve()
        .then(() => {
            return elfy.parse(data);
        })
        .then((elf) => {
            if (elf.machine !== "nios2") {
                return Promise.reject(new Error("Not NiosII program"));
            }
            return elf.body.programs.reduce(
                (promise, program) => {
                    if (program.type !== "load") {
                        return promise;
                    }
                    let filesz = program.data.length;
                    return promise
                    .then(() => {
                        return this._canarium.avm.write(program.paddr, program.data);
                    })
                    .then(() => {
                        let zeroFill = program.memsz - filesz;
                        if (zeroFill > 0) {
                            return this._canarium.avm.write(program.paddr + filesz, Buffer.alloc(zeroFill, 0));
                        }
                    });
                }, Promise.resolve()
            );
        });
    }
}
