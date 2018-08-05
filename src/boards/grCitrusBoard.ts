import { WakayamaRbBoard } from "./wakayamaRbBoard";
import * as nls from "vscode-nls";
import { Board } from "./board";

const localize = nls.loadMessageBundle(__filename);

/**
 * GR-CITRUS board by Gadget Renesas based on
 * Wakayama.rb board
 */
export class GrCitrusBoard extends WakayamaRbBoard {
    /**
     * A list of USB serial VendorID / ProductID list
     */
    protected static usbSerialIdList = [
        { vendorId: 0x2a50, productId: 0x0277 },    // Akizuki denshi
    ];

    /**
     * Get localized board name
     * @return Board name
     */
    public static getBoardName(): string {
        return localize("board-name", "GR-CITRUS");
    }

    /**
     * Construct board instance
     */
    public constructor() {
        super();
    }
}

Board.addConstructor(GrCitrusBoard);
