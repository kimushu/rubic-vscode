import { WakayamaRbBoard } from "./wakayamaRbBoard";
import * as nls from "vscode-nls";
import { Board } from "./board";

const localize = nls.loadMessageBundle(__filename);

export class GrCitrusBoard extends WakayamaRbBoard {
    public static getBoardName(): string {
        return localize("board-name", "GR-CITRUS");
    }

    protected static VID_PID_LIST = [
        {vendorId: 0x2a50, productId: 0x0277},  // Akizuki
    ];

    public constructor(FIXME_path?: string) {
        super(FIXME_path);
    }
}
Board.addConstructor(GrCitrusBoard);
