import { Board, BoardCandidate, BoardStdioStream, BoardInformation } from "./board";
import * as stream from "stream";
import { Canarium } from "canarium";
import * as nls from "vscode-nls";
import * as path from "path";
import * as fs from "fs";
import * as pify from "pify";
import { RubicProcess } from "../processes/rubicProcess";
import { PeridotBoard } from "./peridotBoard";
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

export class PeridotClassicBoard extends PeridotBoard {

    public constructor(_path: string) {
        super(_path);
    }

    public static getBoardName(): string {
        return "PERIDOT Classic";
    }

    protected static judgeSupportedOrNot(candidate: BoardCandidate): void {
        if (candidate.vendorId !== 0x0403 || candidate.productId !== 0x6015) {
            candidate.unsupported = true;
        }
    }

    writeFirmware(filename: string, boardPath: string, reporter: (message?: string) => void): Promise<boolean> {
        let writerRbf: Buffer;
        let firmRbf: Buffer;
        let canarium: Canarium;

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
                return this.getCanarium(boardPath);
            })
            .then((result) => {
                canarium = result;

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
