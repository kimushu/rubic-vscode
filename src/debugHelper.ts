'use strict';

import { Disposable, commands, window } from 'vscode';

const CMD_PROVIDE_INIT_CFG = "extension.rubic.provideInitialConfigurations";
const CMD_GUESS_PROGRAM_NAME = "extension.rubic.guessProgramName";

export class DebugHelper {
    private static _instance: DebugHelper;
    public static get instance(): DebugHelper {
        return this._instance;
    }

    private _disposable: Disposable;
    public dispose(): void {
        this._disposable.dispose();
    }

    public constructor(private _extensionPath: string) {
        if (DebugHelper._instance) {
            console.warn("Multiple DebugHelper instances!");
            DebugHelper._instance.dispose();
        }
        DebugHelper._instance = this;
        
        let subscriptions: Disposable[] = [];

        subscriptions.push(
            commands.registerCommand(CMD_PROVIDE_INIT_CFG, () => {
                return this._provideInitConfig();
            })
        );

        subscriptions.push(
            commands.registerCommand(CMD_GUESS_PROGRAM_NAME, () => {
                return this._guessProgramName();
            })
        );

        this._disposable = Disposable.from(...subscriptions);
    }

    private _provideInitConfig(): any {
        console.warn("TODO");
    }

    private _guessProgramName(): any {
        console.warn("TODO");
    }
}
