import { WakayamaRbBoard } from "./wakayamaRbBoard";
import * as nls from "vscode-nls";

const localize = nls.loadMessageBundle(__filename);

export class GrCitrusBoard extends WakayamaRbBoard {
    protected getBoardName(): string {
        return localize("board-name", "GR-CITRUS");
    }

    protected static _VID_PID_LIST = [
        {name: "Renesas GR-CITRUS", vendorId: 0x2a50, productId: 0x0277}, // Akizuki
    ];

    public constructor(path: string) {
        super(path);
    }
}
