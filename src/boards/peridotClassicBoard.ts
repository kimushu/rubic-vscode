import { Board, BoardCandidate, BoardStdioStream, BoardInformation } from "./board";
import * as stream from "stream";
import { Canarium } from "canarium";
import * as nls from "vscode-nls";
import * as path from "path";
import * as fs from "fs";
import * as pify from "pify";
import { RubicProcess } from "../processes/rubicProcess";
const localize = nls.loadMessageBundle(__filename);

const WRITER_RBF_PATH = path.join(__dirname, "..", "..", "lib", "peridot_classic_writer.rbf");
const WRITER_SPI_PATH = "/sys/flash/spi";
const WRITER_BOOT_TIMEOUT_MS = 5 * 1000;

function buf2ab(buf: Buffer): ArrayBuffer {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export class PeridotClassicBoard extends Board {
    private _storageRoot: string = "/mnt/internal";
    private _canarium: Canarium;
    private _stdio: BoardStdioStream;

    public constructor(private _path: string) {
        super();
        this._canarium = new Canarium();
        this._canarium.onClosed = this.onClosed.bind(this);
        this._stdio = null;
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
        if (candidate.vendorId !== 0x0403 || candidate.productId !== 0x6015) {
            candidate.unsupported = true;
        }
    }

    connect(): Promise<void> {
        return this._canarium.open(this._path);
    }

    disconnect(): Promise<void> {
        return this._canarium.close();
    }

    getInfo(): Promise<BoardInformation> {
        return this._canarium.getinfo().then((info) => {
            return {
                firmwareId: null,
                path: this._path,
                serialNumber: info.serialcode,
            };
        });
    }

    writeFile(filename: string, data: Buffer): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            return this._canarium.openRemoteFile(
                this._getStoragePath(filename),
                {O_WRONLY: true, O_CREAT: true, O_TRUNC: true}
            );
        }).then((fd) => {
            return fd.write(Buffer.from(buf2ab(data)), true).then(
                (result) => fd.close().then(() => result),
                (reason) => fd.close().catch(() => null).then(() => Promise.reject(reason))
            );
        }).then((written) => {
            return;
        });
    }

    readFile(filename: string): Promise<Buffer> {
        return Promise.resolve(
        ).then(() => {
            return this._canarium.openRemoteFile(
                this._getStoragePath(filename),
                {O_RDONLY: true}
            );
        }).then((fd) => {
            let fileLength: number;
            return fd.lseek(0, {SEEK_END: true}).then((size) => {
                fileLength = size;
                if (fileLength === 0) { return; }
                return fd.lseek(0, {SEEK_SET: true});
            }).then((offset) => {
                if (fileLength === 0) { return Buffer.alloc(0); }
                return fd.read(fileLength, true);
            }).then(
                (result) => fd.close().then(() => result),
                (reason) => fd.close().catch(() => null).then(() => Promise.reject(reason))
            );
        });
    }

    writeFirmware(filename: string, reporter: (message: string) => void): Promise<boolean> {
        let writerRbf: Buffer;
        let firmRbf: Buffer;
        let canarium = this._canarium;

        return Promise.all([
            pify(fs.readFile)(WRITER_RBF_PATH),
            pify(fs.readFile)(filename),
        ])
        .then((buffers) => {
            [ writerRbf, firmRbf ] = buffers;
        })
        .then(() => {
            return RubicProcess.self.showInformationMessage(
                localize("switch_to_ps", "Change switch to PS mode"),
                { title: localize("change-done", "OK, changed") }
            )
            .then((item) => item != null);
        })
        .then((yes) => {
            if (!yes) {
                return false;
            }
            return Promise.resolve()
            .then(() => {
                // Connect to board
                return canarium.open(this._path);
            })
            .then(() => {
                // Write RBF
                return canarium.config(null, writerRbf);
            })
            .then(() => {
                // Open a special file for SPI flash update
                let tsLimit = Date.now() + WRITER_BOOT_TIMEOUT_MS;
                function tryOpen(): Promise<Canarium.RemoteFile> {
                    return canarium.openRemoteFile(WRITER_SPI_PATH, {O_RDWR: true})
                    .catch((reason) => {
                        // Retry if error
                        if (Date.now() < tsLimit) {
                            return tryOpen();
                        }
                        throw reason;
                    });
                }
                return tryOpen();
            })
            .then((file) => {
                // Write SPI flash
                return file.write(firmRbf)
                .then(() => {
                    return file.close();
                }, (reason) => {
                    return file.close()
                    .catch(() => {})
                    .then(() => { throw reason; });
                });
            })
            .then(() => {
                return RubicProcess.self.showInformationMessage(
                    localize("switch_to_as", "Change switch back to AS mode")
                );
            })
            .then(() => {
                return true;
            });
        });
    }

    formatStorage(): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            return this._canarium.openRemoteFile(
                "/sys/rubic/format",
                {O_WRONLY: true, O_TRUNC: true}
            );
        }).then((fd) => {
            return fd.close();
        }).then(() => {
            return;
        });
    }

    runProgram(filename: string): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            return this._canarium.openRemoteFile(
                "/sys/rubic/run",
                {O_WRONLY: true, O_TRUNC: true}
            );
        }).then((fd) => {
            return fd.write(Buffer.from(this._getStoragePath(filename)), true).then(
                (result) => fd.close().then(() => result),
                (reason) => fd.close().catch(() => null).then(() => Promise.reject(reason))
            );
        }).then((result) => {
            return;
        });
    }

    stopProgram(): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            return this._canarium.openRemoteFile(
                "/sys/rubic/stop",
                {O_WRONLY: true, O_TRUNC: true}
            );
        }).then((fd) => {
            return fd.close();
        });
    }

    getStdioStream(options?: {stdin?: string, stdout?: string, stderr?:string}): Promise<BoardStdioStream> {
        if (this._stdio) {
            return Promise.resolve(this._stdio);
        }
        if (!options) {
            options = {};
        }
        let stdin, stdout, stderr;
        return Promise.resolve(
        ).then(() => {
            return this._canarium.openRemoteFile(
                options.stdin ? options.stdin : "/dev/stdin",
                {O_WRONLY: true}
            ).then(
                (file) => { stdin = new CanariumWritableStream(file); },
                (error) => { console.error(error); }
            );
        }).then(() => {
            return this._canarium.openRemoteFile(
                options.stdout ? options.stdout : "/dev/stdout",
                {O_RDONLY: true}
            ).then(
                (file) => { stdout = new CanariumReadableStream(file); }
            );
        }).then(() => {
            return this._canarium.openRemoteFile(
                options.stderr ? options.stderr : "/dev/stderr",
                {O_RDONLY: true}
            ).then(
                (file) => { stderr = new CanariumReadableStream(file); },
                (error) => { console.error(error); }
            );
        }).then(() => {
            this._stdio = <BoardStdioStream>{stdin, stdout, stderr};
            return this._stdio;
        });  // return Promise.resolve().then()...
    }

    private onClosed() {
        this._stdio = null;
    }

    private _getStoragePath(filename: string): string {
        return this._storageRoot + "/" + filename;
    }
}
Board.addConstructor(PeridotClassicBoard);

class CanariumWritableStream extends stream.Writable {
    constructor(private _file: any) {
        super({decodeStrings: true});
    }

    public _write(chunk: Buffer, encoding: string, callback: Function) {
        this._file.write(buf2ab(chunk), true).then(
            () => { callback(); },
            (error) => { callback(error); }
        );
    }
}

class CanariumReadableStream extends stream.Readable {
    constructor(private _file: any) {
        super({encoding: null});
    }

    public _read(size: number) {
        this._file.read(size).then((arrayBuffer: ArrayBuffer) => {
            this.push(Buffer.from(arrayBuffer));
        });
    }
}
