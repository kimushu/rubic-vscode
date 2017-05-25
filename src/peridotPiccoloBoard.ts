import { PeridotClassicBoard } from "./peridotClassicBoard";
import { BoardCandidate } from "./rubicBoard";

export class PeridotPiccoloBoard extends PeridotClassicBoard {
    constructor(path: string) {
        super(path);
    }

    protected static judgeSupportedOrNot(candidate: BoardCandidate): void {
        // Nothing to do
        // Piccolo has no fixed USB-UART device, so all VCP devices may be used as piccolo
    }
}