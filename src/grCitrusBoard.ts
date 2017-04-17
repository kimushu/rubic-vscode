import { WakayamaRbBoard } from "./wakayamaRbBoard";
import { BoardCandidate, BoardStdio } from './rubicBoard';
import * as stream from 'stream';
import * as Canarium from 'canarium';
import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle(__filename);

export class GrCitrusBoard extends WakayamaRbBoard {
    protected static _VID_PID_LIST = [
        {name: "Renesas GR-CITRUS", boardId: "grcitrus", vendorId: 0x2a50, productId: 0x0277}, // Akizuki
    ];

    static getName(boardId: string): string {
        return localize("grcitrus.name", "GR-CITRUS");
    }

    public constructor(id: string, path: string) {
        super(id, path);
    }
}
