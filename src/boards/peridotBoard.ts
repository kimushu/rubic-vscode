import { Board, BoardInformation, BoardStdioStream, BoardDebugStream, BoardCandidate } from "./board";
import { Canarium } from "canarium";
import { Writable, Readable } from "stream";
import { RubicProcess } from "../processes/rubicProcess";
import * as path from "path";
import * as elfy from "elfy";

const AGENT_PATH_DEFAULT = "/sys/rubic";
const STDIN_PATH  = "/dev/stdin";
const STDOUT_PATH = "/dev/stdout";
const STDERR_PATH = "/dev/stderr";

elfy.constants.machine["113"] = "nios2";

function getRemoteWritableStream(file: Canarium.RemoteFile): Writable {
    return new Writable({
        write(chunk: Buffer, encoding, callback) {
            file.write(chunk, true).then(
                () => { callback(); },
                (reason) => { callback(reason); }
            );
        }
    });
}

function getRemoteReadableStream(file: Canarium.RemoteFile): Readable {
    return new Readable({
        read(size: number) {
            let retry = () => {
                return file.read(size)
                .then((chunk) => {
                    this.push(chunk);
                    size -= chunk.length;
                    if (size > 0) {
                        return retry();
                    }
                });
            };
            retry().catch((reason) => {
                this.emit("error", reason);
            });
        }
    });
}

export class PeridotBoard extends Board {
    private _canarium: Canarium;

    protected constructor(private _storagePath: string, private _agentPath: string = AGENT_PATH_DEFAULT) {
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

    /**
     * Get Canarium instance with connection check
     */
    protected getCanarium(path?: string): Promise<Canarium> {
        if (this._canarium == null) {
            if (path != null) {
                return this.connect(path)
                .then(() => {
                    return this.getCanarium();
                });
            }
            return Promise.reject(new Error("Not connected"));
        }
        return Promise.resolve(this._canarium);
    }

    connect(path: string): Promise<void> {
        if (this._canarium != null) {
            return Promise.reject(
                new Error("Already connected")
            );
        }
        this._canarium = new Canarium();
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
                `${this._storagePath}/${relativePath}`,
                {O_CREAT: true, O_WRONLY: true},
                0o644            
            )
            .then((file) => {
                return file.write(data, true)
                .then(() => {
                    return file.close();
                });
            });
        });
    }

    readFile(relativePath: string): Promise<Buffer> {
        return this.getCanarium()
        .then((canarium) => {
            return canarium.openRemoteFile(
                `${this._storagePath}/${relativePath}`,
                {O_RDONLY: true}
            )
            .then((file) => {
                return file.read(Infinity);
            });
        });
    }

    runProgram(relativePath: string): Promise<void> {
        let path = `${this._storagePath}/${relativePath}`;
        return this.getCanarium()
        .then((canarium) => {
            return canarium.openRemoteFile(
                `${this._agentPath}/run`,
                {O_WRONLY: true}
            )
            .then((file) => {
                return file.write(Buffer.from(path), true)
                .then(() => {
                    return file.close();
                });
            });
        });
    }

    isRunning(): Promise<boolean> {
        return this.getCanarium()
        .then((canarium) => {
            return canarium.openRemoteFile(
                `${this._agentPath}/run`,
                {O_RDONLY: true}
            )
            .then((file) => {
                return file.read(Infinity)
                .then((path) => {
                    return (path.length === 0 || path.indexOf(0) === 0);
                });
            });
        });
    }

    stopProgram(): Promise<void> {
        return this.getCanarium()
        .then((canarium) => {
            return canarium.openRemoteFile(
                `${this._agentPath}/stop`,
                {O_WRONLY: true}
            )
            .then((file) => {
                return file.close();
            });
        });
    }

    getStdioStream(): Promise<BoardStdioStream> {
        return this.getCanarium()
        .then((canarium) => {
            return Promise.all([
                canarium.openRemoteFile(STDIN_PATH, {O_WRONLY: true}),
                canarium.openRemoteFile(STDOUT_PATH, {O_RDONLY: true}),
                canarium.openRemoteFile(STDERR_PATH, {O_RDONLY: true}),
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
                canarium.openRemoteFile(`${this._agentPath}/debug_rx}`, {O_WRONLY: true}),
                canarium.openRemoteFile(`${this._agentPath}/debug_tx}`, {O_RDONLY: true}),
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
            let prefix = `${this._storagePath}/`;
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
                    bootProgram: `${this._storagePath}/${relativePath}`
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
