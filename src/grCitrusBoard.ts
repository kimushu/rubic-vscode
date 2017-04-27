import { WakayamaRbBoard } from "./wakayamaRbBoard";
import { BoardCandidate, BoardStdio } from './rubicBoard';
import * as stream from 'stream';
import * as Canarium from 'canarium';
import * as nls from 'vscode-nls';
import * as fse from 'fs-extra';
import * as pify from 'pify';
import * as path from 'path';
import { InteractiveDebugSession } from "./interactiveDebugSession";
import { enumerateRemovableDisks } from "./diskEnumerator";
import { exec } from 'child_process';

const localize = nls.loadMessageBundle(__filename);

const CITRUS_RESET_DELAY_MS = 2000;
const CITRUS_RESET_MAX_RETRIES = 5;
const CITRUS_MSD_MAX_CAPACITY = 4 * 1024 * 1024;
const CITRUS_MSD_FILE = "Gadget Renesas Project Home.html";

function delay(ms: number): Promise<void> {
    return <any>new Promise((resolve) => {
        global.setTimeout(resolve, ms);
    });
}

export class GrCitrusBoard extends WakayamaRbBoard {
    protected static _VID_PID_LIST = [
        {name: "Renesas GR-CITRUS", boardId: "grcitrus", vendorId: 0x2a50, productId: 0x0277}, // Akizuki
    ];

    async writeFirmware(debugSession: InteractiveDebugSession, filename: string): Promise<void> {
        if (await debugSession.showInformationMessage(
            localize("push-reset-button", "Push reset button on GR-CITRUS board."),
            {title: localize("continue", "Continue")}
        ) != null) {
            let basePath = await this._searchUsbMassStorage();
            let destPath = path.join(basePath, path.basename(filename));
            let copy_cmd = (process.platform === "win32") ? "copy" : "cp";
            await pify(exec)(`${copy_cmd} "${filename}" "${destPath}"`);
            return;
        }
        return Promise.reject(
            Error(localize("canceled", "Operation canceled"))
        );
    }

    private async _searchUsbMassStorage(): Promise<string> {
        for (let retry = 0; retry < CITRUS_RESET_MAX_RETRIES; ++retry) {
            await delay(CITRUS_RESET_DELAY_MS);
            let disks = await enumerateRemovableDisks(1, CITRUS_MSD_MAX_CAPACITY);
            for (let index = 0; index < disks.length; ++index) {
                let disk = disks[index];
                if (fse.existsSync(path.join(disk.path, CITRUS_MSD_FILE))) {
                    return disk.path;
                }
            }
        }
        return Promise.reject(
            Error(localize("grcitrus-not-found", "GR-CITRUS is not found"))
        );
    }

    public constructor(path: string) {
        super(path);
    }
}
