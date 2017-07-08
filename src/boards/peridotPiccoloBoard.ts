import { SWI_BASE, SWI_REG_RSTSTS, SWI_RSTSTS_KEY_VAL, SWI_RSTSTS_RST_MSK, SWI_REG_CLASSID, rpd2bytes } from "./peridotClassicBoard";
import { BoardCandidate, Board } from "./board";
import * as path from "path";
import * as pify from "pify";
import * as fs from "fs";
import * as nls from "vscode-nls";
import * as decompress from "decompress";
import { Canarium } from "canarium";
import { PeridotBoard } from "./peridotBoard";
require("promise.prototype.finally").shim();
const localize = nls.loadMessageBundle(__filename);

const PICCOLO_BOOT_CLASSID = 0x72a90000;
const WRITER_ELF_PATH = path.join(__dirname, "..", "..", "..", "lib", "peridot_piccolo_writer.elf");
const WRITER_IMG1_PATH = "/sys/flash/image1";
const WRITER_UFM_PATH = "/sys/flash/ufm";
const WRITER_SPI_PATH = "/sys/flash/spi";
const WRITER_BOOT_TIMEOUT_MS = 5000;
const FLASH_SPLIT_SIZE = 16384;

export class PeridotPiccoloBoard extends PeridotBoard {
    constructor(path_fixme: string) {
        super();
    }

    public static getBoardName(): string {
        return "PERIDOT Piccolo";
    }

    protected static judgeSupportedOrNot(candidate: BoardCandidate): void {
        // Nothing to do
        // Piccolo has no fixed USB-UART device, so all VCP devices may be used as piccolo
    }

    writeFirmware(filename: string, boardPath: string, reporter: (message?: string) => void): Promise<boolean> {
        let writerElf: Buffer;
        let spiElf: Buffer;
        let img1Rpd: Buffer;
        let ufmRpd: Buffer;
        let timeout: number;
        let canarium: Canarium;

        let tryOpen = (path: string, timeoutEach: number = null): Promise<Canarium.RemoteFile> => {
            return canarium.openRemoteFile(path, {O_WRONLY: true}, undefined, timeoutEach)
            .catch((reason) => {
                if (Date.now() < timeout) {
                    // Retry
                    return tryOpen(path, timeoutEach);
                }
                return Promise.reject(reason);
            });
        };
        let tryWrite = (file: Canarium.RemoteFile, data: Buffer, message: string, offset: number = 0): Promise<void> => {
            let partLength = Math.min(data.length - offset, FLASH_SPLIT_SIZE);
            if (partLength === 0) {
                return;
            }
            let nextOffset = offset + partLength;
            reporter(`${message} (${(nextOffset / 1024).toFixed()}/${(data.length / 1024).toFixed()} kB)`);
            return file.write(data.slice(offset, nextOffset), true, null)
            .then(() => {
                return tryWrite(file, data, message, nextOffset);
            });
        };

        return Promise.all([
            pify(fs.readFile)(WRITER_ELF_PATH),
            pify(fs.readFile)(filename)
        ])
        .then((buffers) => {
            let zip: Buffer;
            [ writerElf, zip ] = buffers;
            // Extract firmware files
            return decompress(zip);
        })
        .then((files) => {
            spiElf = (files.find((file) => file.path === "spi.elf") || {}).data;
            img1Rpd = (files.find((file) => file.path === "image1.rpd") || {}).data;
            ufmRpd = (files.find((file) => file.path === "ufm.rpd") || {}).data;
        })
        .then(() => {
            // Connect to board
            return this.getCanarium(boardPath);

        })
        .then((result) => {
            canarium = result;

            // Check current configuration image
            return canarium.avm.iord(SWI_BASE, SWI_REG_CLASSID);
        })
        .then((classId) => {
            if (classId !== PICCOLO_BOOT_CLASSID) {
                return Promise.reject(new Error(localize(
                    "not-boot-mode",
                    "PERIDOT Piccolo is not running in boot-loader mode"
                )));
            }
            reporter(
                localize("setup-writer", "Setting up writer program")
            );
            // Reset NiosII
            return canarium.avm.iowr(SWI_BASE, SWI_REG_RSTSTS, SWI_RSTSTS_KEY_VAL | SWI_RSTSTS_RST_MSK);
        })
        .then(() => {
            // Load ELF
            return this.loadElf(writerElf);
        })
        .then(() => {
            // Start NiosII
            return canarium.avm.iowr(SWI_BASE, SWI_REG_RSTSTS, SWI_RSTSTS_KEY_VAL);
        })
        .then(() => {
            // Write Image1 (CFM1+CFM2)
            if (img1Rpd == null) {
                return;
            }
            timeout = Date.now() + WRITER_BOOT_TIMEOUT_MS;
            return tryOpen(WRITER_IMG1_PATH, 1000)
            .then((file) => {
                return tryWrite(
                    file,
                    rpd2bytes(img1Rpd),
                    localize("write-img1", "Writing Image1 area"),
                )
                .finally(() => {
                    return file.close();
                });
            });
        })
        .then(() => {
            // Write UFM
            if (ufmRpd == null) {
                return;
            }
            timeout = Date.now() + WRITER_BOOT_TIMEOUT_MS;
            return tryOpen(WRITER_UFM_PATH)
            .then((file) => {
                return tryWrite(
                    file,
                    rpd2bytes(ufmRpd),
                    localize("write-ufm", "Writing UFM area"),
                )
                .finally(() => {
                    return file.close();
                });
            });
        })
        .then(() => {
            // Write SPI
            if (spiElf == null) {
                return;
            }
            timeout = Date.now() + WRITER_BOOT_TIMEOUT_MS;
            return tryOpen(WRITER_SPI_PATH)
            .then((file) => {
                return tryWrite(
                    file,
                    spiElf,
                    localize("write-spi", "Writing SPI flash"),
                )
                .finally(() => {
                    return file.close();
                });
            });
        })
        .finally(() => {
            // Disconnect
            return this.disconnect();
        })
        .then(() => {
            return true;
        });
    }
}
Board.addConstructor(PeridotPiccoloBoard);
