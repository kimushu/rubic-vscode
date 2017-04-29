import { Disposable, commands, OutputChannel, window, workspace, ExtensionContext } from 'vscode';
import { Sketch } from "./sketch";
import * as glob from 'glob';
import * as path from 'path';
import * as mrbc from 'mruby-native';

import * as nls from 'vscode-nls';
import { compileMrubySources } from "./mrubyCompiler";
import { RubicExtension } from "./extension";
const localize = nls.loadMessageBundle(__filename);

const CMD_START_DEBUG_SESSION = "extension.rubic.startDebugSession";
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

    private _rubicOutputChannel: OutputChannel;

    public constructor(private _context: ExtensionContext) {
        if (DebugHelper._instance) {
            console.warn("Multiple DebugHelper instances!");
            DebugHelper._instance.dispose();
        }
        DebugHelper._instance = this;
        
        let subscriptions: Disposable[] = [];

        subscriptions.push(
            commands.registerCommand(CMD_START_DEBUG_SESSION, (config) => {
                return this._startDebugSession(config);
            })
        );

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

        subscriptions.push(
            this._rubicOutputChannel = window.createOutputChannel(
                localize("rubic-output", "Rubic Output")
            )
        );

        this._disposable = Disposable.from(...subscriptions);
    }

    private async _startDebugSession(config: any): Promise<any> {
        let mergedConfig = Object.assign({}, config);
        let {sketch} = RubicExtension.instance;
        await this._compileSources(sketch);
        commands.executeCommand("vscode.startDebug", config);
        return {status: "ok"};
    }

    private async _compileSources(sketch: Sketch): Promise<void> {
        this._rubicOutputChannel.appendLine(localize(
            "start-compile-d",
            "Start compile before launch ({0})",
            new Date().toLocaleString()
        ));
        await compileMrubySources(
            sketch.workspaceRoot,
            (value) => this._rubicOutputChannel.append(value)
        );
    }

    private _provideInitConfig(): any {
        console.warn("TODO");
    }

    private _guessProgramName(): any {
        console.warn("TODO");
        return "main.mrb";
    }
}
