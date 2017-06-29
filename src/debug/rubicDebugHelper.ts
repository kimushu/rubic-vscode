import { Disposable, commands, OutputChannel, window, workspace, ExtensionContext } from "vscode";
import { Sketch, generateDebugConfiguration } from "../sketch";
import * as path from "path";

import { RubicProcess } from "../rubicProcess";

interface StartSessionResult {
    status: "ok"|"initialConfiguration"|"saveConfiguration";
    content?: string;
}

const CMD_PROVIDE_INIT_CFG = "extension.rubic.provideInitialConfigurations";
const CMD_GUESS_PROGRAM_NAME = "extension.rubic.guessProgramName";

export class RubicDebugHelper implements Disposable {
    /**
     * Construct debug helper
     * @param context Extension context
     */
    constructor(context: ExtensionContext) {
        context.subscriptions.push(
            commands.registerCommand(CMD_PROVIDE_INIT_CFG, () => {
                return this._provideInitConfig();
            })
        );
        context.subscriptions.push(
            commands.registerCommand(CMD_GUESS_PROGRAM_NAME, () => {
                RubicProcess.self.showWarningMessage(
                    "guessProgramName is obsolete! Please regenerate your launch.json"
                );
            })
        );
    }

    /**
     * Dispose of object
     */
    dispose() {
    }

    /**
     * Provide initial debug configuration
     */
    private _provideInitConfig(): string {
        return JSON.stringify({
            version: "0.2.0",
            configurations: [generateDebugConfiguration(workspace.rootPath)]
        }, null, 4);
    }
}
