import { BoardConstructor, Board } from "../boards/board";

/**
 * Stores system composition (board type, firmware type, etc.)
 */
export class SystemComposition {
    /** Name of board class */
    public boardClassName?: string;

    /** UUID of firmware repository */
    public repositoryUuid?: string;

    /** Tag name of release */
    public releaseTag?: string;

    /** Path of variation */
    public variationPath?: string;

    /** Board class instance */
    get boardClass(): BoardConstructor | undefined {
        if (this.boardClassName != null) {
            return Board.getConstructor(this.boardClassName);
        }
    }

    /** `true` if all composition fixed */
    get isFixed(): boolean {
        return (this.boardClassName != null) &&
            (this.repositoryUuid != null) &&
            (this.releaseTag != null) &&
            (this.variationPath != null);
    }

    /** `true` if all composition equals */
    compare(another: SystemComposition): boolean {
        return (this.boardClassName === another.boardClassName) &&
            (this.repositoryUuid === another.repositoryUuid) &&
            (this.releaseTag === another.releaseTag) &&
            (this.variationPath === another.variationPath);
    }
}
