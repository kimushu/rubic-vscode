import {
    RubicProcess, RubicProgress, RubicProgressOptions,
    RubicDebugRequestArguments, RubicDebugHook,
    RubicConfirmOptions, RubicMessageItem
} from "./rubicProcess";
import {
    DebugSession, ExtensionContext, OutputChannel, ProgressLocation, ProgressOptions,
    commands, debug, window, workspace
} from "vscode";
import * as path from "path";
import * as nls from "vscode-nls";
import * as fse from "fs-extra";
import { Sketch } from "../sketch";
import * as CJSON from "comment-json";
import { CatalogData } from "../catalog/catalogData";
import { RubicDebugConfigProvider } from "../debug/rubicDebugConfigProvider";
import * as delay from "delay";
import { rubicTest } from "../extension";

const localize = nls.loadMessageBundle(__filename);

const LOCALIZED_YES = localize("yes", "Yes");
const LOCALIZED_NO = localize("no", "No");

const RUBIC_DEBUG_SERVER_PORT = process.env["RUBIC_DEBUG_SERVER_PORT"];
const CMD_GUESS_PROGRAM_NAME = "extension.rubic.guessProgramName";
const HOST_RESPONSE_NAME = "host.response";

interface DebugSessionSet {
    [sessionId: string]: DebugSession;
}

interface DelegateSessionSet {
    [name: string]: {
        resolve: (sessionId: string) => void;
    };
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
export class RubicHostProcess extends RubicProcess {
    /* Properties */
    get isHost() { return true; }
    get isDebug() { return false; }
    get workspaceRoot(): string {
        let { workspaceFolders } = workspace;
        if (workspaceFolders == null) {
            return undefined;
        }
        return workspaceFolders[0].uri.fsPath;
    }
    get extensionRoot() { return this._context.extensionPath; }
    get sketch() { return this._sketch; }
    get catalogData() { return this._catalogData; }
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
    readonly showInformationConfirm = function (this: RubicHostProcess, message: string, options?: RubicConfirmOptions): Thenable<boolean> {
        return this._showConfirm("Information", message, options);
    };
    readonly showWarningConfirm = function (this: RubicHostProcess, message: string, options?: RubicConfirmOptions): Thenable<boolean> {
        return this._showConfirm("Warning", message, options);
    };
    readonly showErrorConfirm = function (this: RubicHostProcess, message: string, options?: RubicConfirmOptions): Thenable<boolean> {
        return this._showConfirm("Error", message, options);
    };
    private _showConfirm(level: string, message: string, options: RubicConfirmOptions): Thenable<boolean> {
        let items: RubicMessageItem[] = [{
            title: LOCALIZED_YES
        },{
            title: LOCALIZED_NO,
            isCloseAffordance: true
        }];
        return this[`show${level}Message`](message, options, ...items)
        .then((item) => {
            return item === items[0];
        });
    }
    readonly showQuickPick = function (this: RubicHostProcess, items: any, options?: any): any {
        return window.showQuickPick(items, options);
    };
    readonly showInputBox = function (this: RubicHostProcess, options?: any): any {
        return window.showInputBox(options);
    };
    readonly withProgress = function<T> (this: RubicHostProcess, origOptions: RubicProgressOptions, task: (progress: RubicProgress<{ message?: string }>) => Thenable<T>): Thenable<T> {
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
    private _withProgressStart(options: RubicProgressOptions): Thenable<string> {
        let progress_id = this.getUniqueId("p");
        let ctx = <ProgressContext>{ progress_id };
        ctx.thenable = this.withProgress(options, (progress) => {
            return new Promise<void>((resolve) => {
                ctx.reporter = (value) => progress.report(value);
                ctx.completer = resolve;
                this._progressContexts[progress_id] = ctx;
            });
        });
        return Promise.resolve(progress_id);
    }
    private _withProgressReport(progress_id: string, message: string): Thenable<void> {
        let ctx = this._progressContexts[progress_id];
        if (ctx == null) {
            return Promise.reject(new Error(
                `unknown progress context id: ${progress_id}`
            ));
        }
        ctx.reporter({ message });
        return Promise.resolve();
    }
    private _withProgressEnd(progress_id: string): Thenable<void> {
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
    private _withProgressClear(): void {
        for (let progress_id in this._progressContexts) {
            this._withProgressEnd(progress_id);
        }
    }
    readonly printOutput = function (this: RubicHostProcess, text: string, preserveFocus?: boolean): Thenable<void> {
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
    readonly printDebug = function (this: RubicHostProcess, message?: any, ...params: any[]): void {
        console.log("[HOST]", message, params);
    };

    /* Debug process management */
    readonly registerDebugHook = function(this: RubicHostProcess, listener: RubicDebugHook): void {
        if (this._debugHooks.indexOf(listener) < 0) {
            this._debugHooks.unshift(listener);
        }
    };
    readonly delegateRequest = function(this: RubicHostProcess, request: string, args: any, timeout?: number): Thenable<any> {
        let name = `__delegate__${Math.random().toString(16).substr(2)}`;
        let config: RubicDebugRequestArguments = {
            type: "rubic",
            name,
            request: "attach",
            debugServer: RUBIC_DEBUG_SERVER_PORT,
        };
        commands.executeCommand("workbench.debug.panel.action.clearReplAction");
        return new Promise<string>((resolve, reject) => {
            this._delegateSessions[name] = { resolve };
            debug.startDebugging(workspace.workspaceFolders[0], config)
            .then((succeeded) => {
                if (!succeeded) {
                    delete this._delegateSessions[name];
                    return reject(new Error("vscode.debug.startDebugging failed"));
                }
            });
        })
        .then((sessionId) => {
            delete this._delegateSessions[name];
            let session = this._debugSessions[sessionId];
            if (session == null) {
                throw new Error(`No debug session id=${sessionId}`);
            }
            let promises = [
                session.customRequest(request, args)
                .then((value) => {
                    if (value.reason != null) {
                        throw value.reason;
                    }
                    return value.result;
                })
            ];
            if (timeout != null) {
                promises.push(delay.reject(timeout));
            }
            return Promise.race(promises)
            .finally(() => {
                return session.customRequest("stop", null);
            });
        });
    };

    /* Settings */
    readonly getRubicSetting = function(this: RubicHostProcess, path: string): Thenable<any> {
        let fullPath = `rubic.${path}`;
        if (rubicTest.workspaceSettings) {
            return Promise.resolve(rubicTest.workspaceSettings[fullPath]);
        }
        return Promise.resolve(workspace.getConfiguration().get<any>(fullPath));
    };
    readonly getMementoValue = function<T>(this: RubicHostProcess, key: string, defaultValue?: T): Thenable<T> {
        if (rubicTest.mementoValues) {
            if (key in rubicTest.mementoValues) {
                return rubicTest.mementoValues[key];
            }
            return Promise.resolve(defaultValue);
        }
        return Promise.resolve()
        .then(() => this._context.globalState.get(key, defaultValue));
    };
    readonly setMementoValue = function<T>(this: RubicHostProcess, key: string, value: T): Thenable<void> {
        if (rubicTest.mementoValues) {
            rubicTest.mementoValues[key] = value;
            return Promise.resolve();
        }
        return this._context.globalState.update(key, value);
    };

    /* File access */
    readonly updateTextFile = function(this: RubicHostProcess, fullPath: string, updater: any, defaultOrRemover?: any, encoding?: string): Thenable<void> {
        let relPath = path.relative(fullPath, this.workspaceRoot);
        let editor = window.visibleTextEditors.find((editor) => {
            return path.relative(editor.document.fileName, fullPath) === "";
        });
        if (editor == null || !editor.document.isDirty) {
            if (typeof(updater) === "function") {
                return this.readTextFile(fullPath, false, defaultOrRemover, encoding)
                .then((oldValue) => {
                    return updater(oldValue);
                })
                .then((newValue) => {
                    fse.ensureDirSync(path.dirname(fullPath));
                    fse.writeFileSync(fullPath, newValue, encoding || "utf8");
                });
            } else {
                return this.readTextFile(fullPath, true, {}, encoding)
                .then((obj) => {
                    // Update values
                    Object.assign(obj, updater);

                    // Remove values
                    let remove = (target, src) => {
                        if ((target == null) || (src == null)) {
                            return;
                        }
                        for (let key in Object.keys(src)) {
                            let sub = src[key];
                            if (sub === true) {
                                delete target[key];
                            } else {
                                remove(target[key], sub);
                            }
                        }
                    };
                    remove(obj, defaultOrRemover);

                    fse.ensureDirSync(path.dirname(fullPath));
                    fse.writeFileSync(fullPath, CJSON.stringify(obj, null, 4));
                });
            }
        }
        return Promise.reject(new Error(
            localize("file-x-dirty", "File \"{0}\" is modified and not saved.", relPath)
        ));
    };

    /* Construct and dispose */

    /**
     * Construct abstraction layer for Extension Host process
     */
    constructor(private _context: ExtensionContext) {
        super();
        _context.subscriptions.push(
            commands.registerCommand(CMD_GUESS_PROGRAM_NAME, () => {
                RubicProcess.self.showWarningMessage(
                    "guessProgramName is obsolete! Please regenerate your launch.json"
                );
            })
        );
        _context.subscriptions.push(
            debug.registerDebugConfigurationProvider(
                "rubic",
                new RubicDebugConfigProvider(this._debugHooks)
            )
        );
        _context.subscriptions.push(
            debug.onDidStartDebugSession((session) => {
                this._debugSessions[session.id] = session;
                let delegate = this._delegateSessions[session.name];
                if (delegate != null) {
                    delegate.resolve(session.id);
                }
            })
        );
        _context.subscriptions.push(
            debug.onDidTerminateDebugSession((session) => {
                delete this._debugSessions[session.id];
                delete this._delegateSessions[session.name];
                this._withProgressClear();
            })
        );
        _context.subscriptions.push(
            debug.onDidReceiveDebugSessionCustomEvent((event) => {
                let { id, request, args } = event.body;
                this._processRequest(request, args)
                .then((result) => {
                    if (id != null) {
                        event.session.customRequest(
                            HOST_RESPONSE_NAME,
                            { id, result }
                        );
                    }
                }, (reason) => {
                    if (id != null) {
                        event.session.customRequest(
                            HOST_RESPONSE_NAME,
                            { id, reason: (reason || new Error("unknown error"))
                        });
                    }
                });
            })
        );
        if (this.workspaceRoot != null) {
            this._sketch = new Sketch(this.workspaceRoot);
            _context.subscriptions.push(this._sketch);
            this._sketch.load(true)
            .catch((reason) => {
                this.showErrorMessage(
                    localize("sketch-load-failed-x", "Failed to load sketch: {0}", reason)
                );
            });
        }
        this._catalogData = new CatalogData();
    }

    readonly dispose = function(this: RubicHostProcess): Thenable<void> {
        return Promise.resolve();
    };

    /** Request handler */
    private _processRequest(type: string, args: any): Thenable<any> {
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
            case "showInformationConfirm":
            case "showWarningConfirm":
            case "showErrorConfirm":
                return this[type](args.message, args.options);
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
            case "printDebug":
                console.log("[DAP]", args.text);
                break;
        }
        return Promise.reject(
            new Error(`unsupported request type: ${type}`)
        );
    }

    /** Sketch instance */
    private readonly _sketch: Sketch;

    /** CatalogData instance */
    private readonly _catalogData: CatalogData;

    /** Debug hooks */
    private readonly _debugHooks: RubicDebugHook[] = [];

    /** Set of debug processes */
    private readonly _debugSessions: DebugSessionSet = {};

    /** Set of debug processes for delegate */
    private readonly _delegateSessions: DelegateSessionSet = {};

    /** Set of progress contexts */
    private _progressContexts: ProgressContextSet = {};

    /** Output channel for Rubic */
    private _outputChannel: OutputChannel;
}
