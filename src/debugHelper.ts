import { Disposable, commands, OutputChannel, window, workspace, ExtensionContext } from "vscode";
import { Sketch, generateDebugConfiguration } from "./sketch";
import * as path from "path";

import * as nls from "vscode-nls";
import { compileMrubySources } from "./mrubyCompiler";
import { RubicExtension } from "./extension";
const localize = nls.loadMessageBundle(__filename);

interface StartSessionResult {
    status: "ok"|"initialConfiguration"|"saveConfiguration";
    content?: string;
}

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
    public get rubicOutputChannel() { return this._rubicOutputChannel; }

    /* tslint:disable-next-line:no-unused-variable */
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

    private async _startDebugSession(config: any): Promise<StartSessionResult> {
        if (Object.keys(config).length === 0) {
            return {
                status: "saveConfiguration",
                content: await this._provideInitConfig()
            };
        }
        let mergedConfig = Object.assign({
            debugServer: process.env["DEBUG_SERVER_PORT"]
        }, config);
        let {sketch} = RubicExtension.instance;
        if (sketch.boardPath == null) {
            if (await RubicExtension.instance.catalogViewer.selectPort() == null) {
                return {status: "ok"};
            }
        }
        await this._compileSources(sketch);
        commands.executeCommand("vscode.startDebug", mergedConfig);
        return {status: "ok"};
    }

    private async _compileSources(sketch: Sketch): Promise<void> {
        // FIXME: support other languages
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

    private async _provideInitConfig(): Promise<string> {
        return JSON.stringify({
            version: "0.2.0",
            configurations: [await generateDebugConfiguration(workspace.rootPath)]
        }, null, 4);
    }

    private async _guessProgramName(): Promise<string> {
        // FIXME: support other languages
        let files: string[] = (await workspace.findFiles("*.rb")).map(
            (uri) => path.relative(workspace.rootPath, uri.fsPath)
        );

        if (files.length === 0) {
            throw new Error(
                localize("no-program-src", "No program source file found")
            );
        }

        let index = (files.length === 1) ? 0 : files.indexOf("main.rb");
        if (index < 0) {
            throw new Error(localize(
                "cannot-guess-src-x",
                "Cannot guess file to start. Write filename to launch.json or rename filename to \"{0}\"",
                "main.rb"
            ));
        }
        return files[index].replace(/\.rb$/, ".mrb");
    }
}
