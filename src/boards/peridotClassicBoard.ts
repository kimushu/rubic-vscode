import { Board, BoardCandidate, BoardStdioStream, BoardInformation } from "./board";
import * as stream from "stream";
import { Canarium } from "canarium";
import * as nls from "vscode-nls";
import * as path from "path";
import * as fs from "fs";
import * as pify from "pify";
import * as elfy from "elfy";
import { RubicProcess } from "../processes/rubicProcess";
const localize = nls.loadMessageBundle(__filename);

export const SWI_BASE = 0x10000000;
export const SWI_REG_CLASSID = 0;
export const SWI_REG_RSTSTS = 4;
export const SWI_REG_MESSAGE = 6;
export const SWI_RSTSTS_KEY_VAL = (0xdead << 16);
export const SWI_RSTSTS_BOOTIMG_MSK = (1 << 11);
export const SWI_RSTSTS_RST_MSK = (1 << 8);

const WRITER_RBF_PATH = path.join(__dirname, "..", "..", "lib", "peridot_classic_writer.rbf");
const WRITER_SPI_PATH = "/sys/flash/spi";
const WRITER_BOOT_TIMEOUT_MS = 5 * 1000;
const BIT_REVERSE: number[] = [];

function buf2ab(buf: Buffer): ArrayBuffer {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

elfy.constants.machine["113"] = "nios2";

/**
 * Convert RPD to raw bytes data (Execute bit-reversing and byte-swapping)
 * @param rpd RPD data
 */
export function rpd2bytes(rpd: Buffer): Buffer {
    if (BIT_REVERSE.length === 0) {
        for (let i = 0; i < 256; ++i) {
            BIT_REVERSE[i] =
                ((i << 7) & 0x80) | ((i << 5) & 0x40) | ((i << 3) & 0x20) | ((i << 1) & 0x10) |
                ((i >> 7) & 0x01) | ((i >> 5) & 0x02) | ((i >> 3) & 0x04) | ((i >> 1) & 0x08);
        }
    }
    let bytes = Buffer.alloc((rpd.byteLength + 3) & ~3);
    for (let i = 0; i < rpd.byteLength; ++i) {
        bytes.writeUInt8(BIT_REVERSE[rpd[i]], i ^ 3);
    }
    return bytes;
}

export class PeridotClassicBoard extends Board {
    private _storageRoot: string = "/mnt/internal";
    protected canarium: Canarium;
    private _stdio: BoardStdioStream;

    public constructor(private _path: string) {
        super();
        this.canarium = new Canarium();
        this.canarium.onClosed = this.onClosed.bind(this);
        this._stdio = null;
    }

    public static getBoardName(): string {
        return "PERIDOT Classic";
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
                        return this.canarium.avm.write(program.paddr, program.data);
                    })
                    .then(() => {
                        let zeroFill = program.memsz - filesz;
                        if (zeroFill > 0) {
                            return this.canarium.avm.write(program.paddr + filesz, Buffer.alloc(zeroFill, 0));
                        }
                    });
                }, Promise.resolve()
            );
        });
    }

    connect(): Promise<void> {
        return this.canarium.open(this._path);
    }

    disconnect(): Promise<void> {
        return this.canarium.close();
    }

    getInfo(): Promise<BoardInformation> {
        return this.canarium.getinfo().then((info) => {
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
            return this.canarium.openRemoteFile(
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
            return this.canarium.openRemoteFile(
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

    writeFirmware(filename: string, boardPath: string, reporter: (message?: string) => void): Promise<boolean> {
        let writerRbf: Buffer;
        let firmRbf: Buffer;
        let canarium = this.canarium;

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
                return canarium.open(boardPath);
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
            return this.canarium.openRemoteFile(
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
            return this.canarium.openRemoteFile(
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
            return this.canarium.openRemoteFile(
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
            return this.canarium.openRemoteFile(
                options.stdin ? options.stdin : "/dev/stdin",
                {O_WRONLY: true}
            ).then(
                (file) => { stdin = new CanariumWritableStream(file); },
                (error) => { console.error(error); }
            );
        }).then(() => {
            return this.canarium.openRemoteFile(
                options.stdout ? options.stdout : "/dev/stdout",
                {O_RDONLY: true}
            ).then(
                (file) => { stdout = new CanariumReadableStream(file); }
            );
        }).then(() => {
            return this.canarium.openRemoteFile(
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
