'use strict';

import { Disposable, commands, OutputChannel, window, workspace, ExtensionContext } from 'vscode';
import { Sketch } from "./sketch";
import * as glob from 'glob';
import * as path from 'path';
import * as mrbc from 'mruby-native';

import * as nls from 'vscode-nls';
let localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

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

    private _mrubyChannel: OutputChannel;

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
            this._mrubyChannel = window.createOutputChannel(
                localize("mruby-compiler", "mruby Compiler")
            )
        );

        this._disposable = Disposable.from(...subscriptions);
    }

    private _startDebugSession(config: any): Thenable<any> {
        let mergedConfig = Object.assign({}, config);
        return Promise.resolve(
        ).then(() => {
            //return Sketch.load(workspace.rootPath);
            return <any>{};
        }).then((rubicConfig) => {
            return this._compileSources(rubicConfig);
        }).then(() => {
            commands.executeCommand("vscode.startDebug", config);
            return {status: "ok"};
        });
    }

    private _compileSources(rubicConfig: Sketch): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            let files: string[] = [];
            let opt = {cwd: rubicConfig.workspaceRoot};
            rubicConfig.compile_include.forEach((pattern) => {
                let includedFiles: string[] = glob.sync(pattern, opt);
                files.push(...includedFiles);
            });
            rubicConfig.compile_exclude.forEach((pattern) => {
                let excludedFiles: string[] = glob.sync(pattern, opt);
                if (excludedFiles.length === 0) { return; }
                files = files.filter((file) => { return excludedFiles.indexOf(file) === -1; });
            });
            return files.reduce(
                (promise, file) => {
                    return promise.then(() => {
                        switch (path.extname(file)) {
                        case ".rb":
                            return this._compileMruby(rubicConfig, file);
                        case ".ts":
                            return Promise.reject(Error("TypeScript is not supported yet"));
                        }
                    });
                }, Promise.resolve()
            );
        }); // Promise.resolve().then()
    }

    private _compileMruby(rubicConfig: Sketch, file: string): Promise<void> {
        return new Promise<any>((resolve, reject) => {
            mrbc.compile(
                file,
                {cwd: rubicConfig.workspaceRoot},
                (err, stdout, stderr) => {
                    stdout && this._mrubyChannel.append(stdout);
                    stderr && this._mrubyChannel.append(stderr);
                    if (stdout || stderr) { this._mrubyChannel.show(); }
                    if (err) {
                        return reject(Error(
                            localize("mruby-compile-failed", "mruby compile failed")
                        ));
                    }
                    return resolve();
                }
            );
        });
    }

    private _provideInitConfig(): any {
        console.warn("TODO");
    }

    private _guessProgramName(): any {
        console.warn("TODO");
        return "main.mrb";
    }
}
