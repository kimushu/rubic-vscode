import * as hasha from "hasha";
import { crc32 } from "crc";

export type DigestAlgorithm = "md5" | "sha1" | "crc32";

/**
 * Digest
 */
export class Digest {
    /** Raw value (type may be varies with algorithms) */
    public readonly rawValue: any;

    /** Stringified value */
    public readonly value: string;

    /**
     * Calculate digest value
     * @param data Input data
     * @param algorithm An algorithm
     */
    constructor(data: Buffer, public readonly algorithm: DigestAlgorithm = "md5") {
        switch (algorithm) {
        case "md5":
        case "sha1":
            this.value = this.rawValue = hasha(data, { algorithm });
            break;
        case "crc32":
            this.rawValue = crc32(data).toString(16);
            this.value = `0000000${this.rawValue}`.substr(-8);
            break;
        default:
            throw new Error(`Unknown hash algorithm: ${algorithm}`);
        }
    }

    /**
     * Compare digest
     * @param digest Another digest to be compared (algorithm must be the same)
     */
    match(digest: Digest): boolean;

    /**
     * Compare digest
     * @param data: Another data to be compared
     */
    match(data: Buffer): boolean;

    match(another: Digest | Buffer): boolean {
        if (another instanceof Buffer) {
            return this.match(new Digest(another, this.algorithm));
        }
        if (another.algorithm !== this.algorithm) {
            throw new Error(`Cannot compare digests by different algorithms!`);
        }
        return another.value === this.value;
    }
}
