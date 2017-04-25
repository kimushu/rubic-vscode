import { WakayamaRbBoard } from "./wakayamaRbBoard";
import { BoardCandidate, BoardStdio } from './rubicBoard';
import * as stream from 'stream';
import * as Canarium from 'canarium';
import * as nls from 'vscode-nls';
import * as fse from 'fs-extra';
import * as pify from 'pify';
import { InteractiveDebugSession } from "./interactiveDebugSession";
import { enumerateRemovableDisks } from "./diskEnumerator";

const localize = nls.loadMessageBundle(__filename);

const CITRUS_RESET_DELAY_MS = 1000;
const CITRUS_RESET_MAX_RETRIES = 5;

function delay(ms: number): Promise<void> {
    return <any>new Promise((resolve) => {
        global.setTimeout(resolve, ms);
    });
}

export class GrCitrusBoard extends WakayamaRbBoard {
    protected static _VID_PID_LIST = [
        {name: "Renesas GR-CITRUS", boardId: "grcitrus", vendorId: 0x2a50, productId: 0x0277}, // Akizuki
    ];

    static getName(boardId: string): string {
        return localize("grcitrus.name", "GR-CITRUS");
    }

    async programFirmware(debugSession: InteractiveDebugSession, filename: string): Promise<void> {
        let preDisks = await enumerateRemovableDisks();
        let basePath: string;
        if (await debugSession.showErrorMessage(
            localize("push-reset-button", "Push reset button on GR-CITRUS board.")
        ) != null) {
            for (let retry = 0; retry < CITRUS_RESET_MAX_RETRIES; ++retry) {
                await delay(CITRUS_RESET_DELAY_MS);
                let postDisks = await enumerateRemovableDisks(1, 4*1024*1024);
                let newDisks = postDisks.filter((diskPost) => {
                    return preDisks.findIndex((diskPre) => diskPre.path === diskPost.path)
                });
                
            }
        }
        return Promise.reject(
            Error(localize("canceled", "Operation canceled"))
        );
    }

    public constructor(id: string, path: string) {
        super(id, path);
    }
}
