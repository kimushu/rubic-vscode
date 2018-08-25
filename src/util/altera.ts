import * as elfy from "elfy";
import { CanariumGen1, CanariumGen2 } from "canarium";

const BIT_REVERSE: number[] = [];

/**
 * Convert RPD to raw bytes data (Execute bit-reversing and byte-swapping)
 * @param rpd RPD data
 */
export function convertRpdToBytes(rpd: Buffer): Buffer {
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

elfy.constants.machine["113"] = "nios2";

/**
 * Load ELF for Nios II
 * @param data ELF data
 */
export function loadNios2Elf(canarium: CanariumGen1|CanariumGen2, data: Buffer): Promise<void> {
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
                    return canarium.avm.write(program.paddr, program.data);
                })
                .then(() => {
                    let zeroFill = program.memsz - filesz;
                    if (zeroFill > 0) {
                        return canarium.avm.write(program.paddr + filesz, Buffer.alloc(zeroFill, 0));
                    }
                });
            }, Promise.resolve()
        );
    });
}
