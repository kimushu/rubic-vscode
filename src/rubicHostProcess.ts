import { RubicProcess, RubicProgress, RubicProgressOptions } from "./rubicProcess";
import {
    ExtensionContext, OutputChannel, ProgressLocation, ProgressOptions,
    commands, window, workspace
} from "vscode";
import * as ipc from "node-ipc";
import * as path from "path";
import * as nls from "vscode-nls";
import * as fs from "fs";

const localize = nls.loadMessageBundle(__filename);

interface DebugProcessReference {
    debugger_id: string;
    socket?: any;
    startResolve: () => void;
    startReject: (reason: any) => void;
    stopResolve?: () => void;
    stopReject?: (reason: any) => void;
}

interface DebugProcessReferenceSet {
    [debugger_id: string]: DebugProcessReference;
}

interface ProgressContext {
    progress_id: string;
    thenable: Thenable<void>;
    reporter: (value: { message?: string }) => void;
    completer: () => void;
}

interface ProgressContextSet {
    [progress_id: string]: ProgressContext;
}

/**
 * Extension host process
 */
class RubicHostProcess extends RubicProcess {
    /* Properties */
    get isHost() { return true; }
    get isDebug() { return false; }
    get workspaceRoot() { return workspace.rootPath; }
    get extensionRoot() { return this._context.extensionPath; }
    get debugConfiguration() {
        throw new Error("debugConfiguration is not available in host process");
    }

    /* UI functions */
    readonly showInformationMessage = function (this: RubicHostProcess, message: string, ...args: any[]): any {
        return window.showInformationMessage(message, ...args);
    };
    readonly showWarningMessage = function (this: RubicHostProcess, message: string, ...args: any[]): any {
        return window.showWarningMessage(message, ...args);
    };
    readonly showErrorMessage = function (this: RubicHostProcess, message: string, ...args): any {
        return window.showErrorMessage(message, ...args);
    };
    readonly showQuickPick = function (this: RubicHostProcess, items: any, options?: any): any {
        return window.showQuickPick(items, options);
    };
    readonly showInputBox = function (this: RubicHostProcess, options?: any): any {
        return window.showInputBox(options);
    };
    readonly withProgress = function (this: RubicHostProcess, origOptions: RubicProgressOptions, task: (progress: RubicProgress<{ message?: string }>) => Thenable<void>): Thenable<void> {
        let options: ProgressOptions;
        if (typeof(origOptions.location) === "number") {
            options = <ProgressOptions>origOptions;
        } else {
            options = {
                location: origOptions.location.SourceControl ? ProgressLocation.SourceControl : ProgressLocation.Window,
                title: origOptions.title
            };
        }
        return window.withProgress(options, task);
    };
    private _withProgressStart(options: RubicProgressOptions): Promise<string> {
        let progress_id = `rubic-p-${Math.random().toString(36).substr(2)}`;
        let ctx = <ProgressContext>{ progress_id };
        ctx.thenable = this.withProgress(options, (progress) => {
            return new Promise<void>((resolve) => {
                ctx.reporter = (value) => progress.report(value);
                ctx.completer = resolve;
            });
        });
        return Promise.resolve(progress_id);
    }
    private _withProgressReport(progress_id: string, message: string): Promise<void> {
        let ctx = this._progressContexts[progress_id];
        if (ctx == null) {
            return Promise.reject(new Error(
                `unknown progress context id: ${progress_id}`
            ));
        }
        ctx.reporter({ message });
        return Promise.resolve();
    }
    private _withProgressEnd(progress_id: string): Promise<void> {
        let ctx = this._progressContexts[progress_id];
        if (ctx == null) {
            return Promise.reject(new Error(
                `unknown progress context id: ${progress_id}`
            ));
        }
        delete this._progressContexts[progress_id];
        ctx.completer();
        return Promise.resolve(ctx.thenable);
    }
    readonly printOutput = function (this: RubicHostProcess, text: string, preserveFocus?: boolean): Promise<void> {
        if (this._outputChannel == null) {
            this._outputChannel = window.createOutputChannel("Rubic");
            this._context.subscriptions.push(this._outputChannel);
        }
        this._outputChannel.append(text);
        this._outputChannel.show(preserveFocus);
        return Promise.resolve();
    };
    readonly clearOutput = function (this: RubicHostProcess): Promise<void> {
        if (this._outputChannel != null) {
            this._outputChannel.clear();
        }
        return Promise.resolve();
    };

    /* Debug process management */
    readonly startDebugProcess = function(this: RubicHostProcess, configuration: any): Promise<string> {
        return this._serverSetup.then(() => {
            let host_id = ipc.config.id;
            let debugger_id = `rubic-d-${Math.random().toString(36).substr(2)}`;
            let { workspaceRoot, extensionRoot } = this;
            let config = Object.assign({}, configuration);
            config.__private = { host_id, debugger_id, workspaceRoot, extensionRoot };
            return new Promise<void>((startResolve, startReject) => {
                this._debuggers[debugger_id] = {
                    debugger_id, startResolve, startReject
                };
            })
            .then(() => {
                return debugger_id;
            });
        });
    };
    readonly stopDebugProcess = function(this: RubicHostProcess, debugger_id: string): Promise<void> {
        return this._serverSetup.then(() => {
            let ref = this._debuggers[debugger_id];
            if (ref == null) {
                throw new Error(
                    `Cannot find debugger process named ${debugger_id}`
                );
            }
            return new Promise<void>((resolve, reject) => {
                ipc.server.emit(ref.socket, "terminate", {});
                ref.stopResolve = resolve;
                ref.stopReject = reject;
            });
        });
    };

    /* Settings */
    readonly getRubicSetting = function(this: RubicHostProcess, path: string): Promise<any> {
        return workspace.getConfiguration().get<any>(path);
    };
    readonly readTextFile = function(this: RubicHostProcess, fullPath: string, json?: boolean, defaultValue?: string | any): Thenable<string | any> {
        if (!fs.existsSync(fullPath)) {
            if (defaultValue == null) {
                return Promise.reject(
                    new Error(`File "${fullPath} not found`)
                );
            }
            return Promise.resolve(defaultValue);
        }
        return Promise.resolve()
        .then(() => {
            let value = fs.readFileSync(fullPath, "utf8");
            if (json) {
                value = JSON.parse(value);
            }
            return value;
        });
    };
    readonly updateTextFile = function(this: RubicHostProcess, fullPath: string, updater: any, remover?: any): Thenable<void> {
        let relPath = path.relative(fullPath, this.workspaceRoot);
        let editor = window.visibleTextEditors.find((editor) => {
            return path.relative(editor.document.fileName, fullPath) === "";
        });
        if (editor == null || !editor.document.isDirty) {
            return Promise.resolve();
        }
        return Promise.reject(new Error(
            localize("file-x-dirty", "File \"{0}\" is modified and not saved.", relPath)
        ));
    };

    /**
     * Construct abstraction layer for Extension Host process
     */
    constructor(private _context: ExtensionContext) {
        super();
        this._serverSetup = new Promise<void>((resolve) => {
            ipc.config.id = `rubic-h-${Math.random().toString(36).substr(2)}`;
            ipc.serve(resolve);
        })
        .then(() => {
            ipc.server.on("initialized", (data, socket) => {
                let { debugger_id } = data;
                let ref = this._debuggers[debugger_id];
                if (ref == null) {
                    console.warn(`initialize event from unknown debugger id: ${debugger_id}`);
                    return;
                }
                ref.socket = socket;
                ref.startResolve();
            });
            ipc.server.on("request", (data, socket) => {
                let { type, id, } = data;
                Promise.resolve()
                .then(() => {
                    return this._processRequest(type, data.args || {});
                })
                .then((result: any) => {
                    ipc.server.emit(socket, "response", {
                        id, result: (result == null) ? null : result
                    });
                })
                .catch((reason: any) => {
                    ipc.server.emit(socket, "response", {
                        id, reason: (reason == null) ? null : reason
                    });
                });
            });
        });
    }

    /** Request handler */
    private _processRequest(type: string, args: any): Promise<any> {
        switch (type) {
            case "getRubicSetting":
                return this.getRubicSetting(args.path);
            case "showInformationMessage":
            case "showWarningMessage":
            case "showErrorMessage":
                return this[type](args.message, args.options, ...args.items)
                .then((item) => {
                    return args.items.indexOf(item);
                });
            case "showQuickPick":
                return this.showQuickPick(args.items, args.options)
                .then((item) => {
                    return args.items.indexOf(item);
                });
            case "showInputBox":
                return this.showInputBox(args.options);
            case "withProgress.start":
                return this._withProgressStart(args.options);
            case "withProgress.report":
                return this._withProgressReport(args.progress_id, args.message);
            case "withProgress.end":
                return this._withProgressEnd(args.progress_id);
            case "printOutput":
                return this.printOutput(args.text, args.preserveFocus);
            case "clearOutput":
                return this.clearOutput();
        }
        return Promise.reject(
            new Error(`unsupported request type: ${type}`)
        );
    }

    /** Server setup */
    private readonly _serverSetup: Promise<void>;

    /** Set of debug processes */
    private readonly _debuggers: DebugProcessReferenceSet = {};

    /** Set of progress contexts */
    private _progressContexts: ProgressContextSet = {};

    /** Output channel for Rubic */
    private _outputChannel: OutputChannel;

}
