import {
    RubicProcess, RubicMessageOptions, RubicQuickPickOptions,
    RubicInputBoxOptions, RubicMessageItem,
    RubicProgress, RubicProgressOptions, RubicConfirmOptions
} from "./rubicProcess";
import { DebugSession } from "vscode-debugadapter";
import { Sketch } from "../sketch";
require("promise.prototype.finally").shim();

interface RubicDebugSession extends DebugSession {
    sendHostRequest(request: string, args: any, withResponse: boolean): Thenable<any>;
}

export class RubicDebugProcess extends RubicProcess {
    /* Properties */
    get isHost() { return false; }
    get isDebug() { return true; }
    get workspaceRoot() { return this._privateData.workspaceRoot; }
    get extensionRoot() { return this._privateData.extensionRoot; }
    get sketch() { return this._sketch; }
    get debugConfiguration() { return this._debugConfiguration; }

    /* UI functions */
    readonly showInformationMessage = function (this: RubicDebugProcess, message: string, ...args: any[]): any {
        return this._showMessage("Information", message, ...args);
    };
    readonly showWarningMessage = function (this: RubicDebugProcess, message: string, ...args: any[]): any {
        return this._showMessage("Warning", message, ...args);
    };
    readonly showErrorMessage = function (this: RubicDebugProcess, message: string, ...args: any[]): any {
        return this._showMessage("Error", message, ...args);
    };
    private _showMessage(level: string, message: string, ...originalItems: any[]): Thenable<any> {
        let options: RubicMessageOptions;
        let firstItem = originalItems[0];
        if (firstItem != null) {
            if ((<RubicMessageItem>firstItem).title == null) {
                options = firstItem;
                originalItems.shift();
            }
        }
        let byString = (typeof(originalItems[0]) === "string");
        let items = byString ? originalItems.map((item) => ({title: item})) : originalItems;
        return this._request(`show${level}Message`, {message, options, items})
        .then((index: number) => {
            return originalItems[index];
        });
    }
    readonly showInformationConfirm = function (this: RubicDebugProcess, message: string, options?: RubicConfirmOptions): Thenable<boolean> {
        return this._request("showInformationConfirm", {message, options});
    };
    readonly showWarningConfirm = function (this: RubicDebugProcess, message: string, options?: RubicConfirmOptions): Thenable<boolean> {
        return this._request("showWarningConfirm", {message, options});
    };
    readonly showErrorConfirm = function (this: RubicDebugProcess, message: string, options?: RubicConfirmOptions): Thenable<boolean> {
        return this._request("showErrorConfirm", {message, options});
    };
    readonly showQuickPick = function (this: RubicDebugProcess, originalItems: any[], options?: RubicQuickPickOptions): Thenable<any> {
        let byString = (typeof(originalItems[0]) === "string");
        let items = byString ? originalItems.map((item) => ({label: item, detail: ""})): originalItems;
        return this._request("showQuickPick", {items, options})
        .then((index: number) => {
            return originalItems[index];
        });
    };
    readonly showInputBox = function (this: RubicDebugProcess, options?: RubicInputBoxOptions): Thenable<any> {
        return this._request("showInputBox", {options});
    };
    readonly withProgress = function<T> (this: RubicDebugProcess, options: RubicProgressOptions, task: (progress: RubicProgress<{ message?: string }>) => Thenable<T>): Thenable<T> {
        return this._request("withProgress.start", {options})
        .then((progress_id) => {
            return Promise.resolve(task({
                report: (value: { message?: string }) => {
                    this._request("withProgress.report", {progress_id, message: value.message});
                }
            }))
            .finally(() => {
                return this._request("withProgress.end", {progress_id});
            });
        });
    };
    readonly printOutput = function (this: RubicDebugProcess, text: string, preserveFocus?: boolean): Thenable<void> {
        return this._request("printOutput", {text, preserveFocus});
    };
    readonly clearOutput = function (this: RubicDebugProcess): Thenable<void> {
        return this._request("clearOutput", {});
    };

    /* Debug process management */
    readonly registerDebugHook = function (): any {
        return Promise.reject(new Error("registerDebugHook() is not available in debug process"));
    };
    readonly delegateRequest = function (): any {
        return Promise.reject(new Error("delegateRequest() is not available in debug process"));
    };

    /* Settings */
    readonly getRubicSetting = function(this: RubicDebugProcess, path: string): Thenable<any> {
        return this._request("getRubicSetting", {path});
    };
    readonly getMementoValue = function<T>(this: RubicDebugProcess, key: string, defaultValue?: T): Thenable<T> {
        return Promise.reject(new Error("getMementoValue() is not available in debug process"));
    };
    readonly setMementoValue = function<T>(this: RubicDebugProcess, key: string, value: T): Thenable<void> {
        return Promise.reject(new Error("setMementoValue() is not available in debug process"));
    };

    /* File access */
    readonly updateTextFile = function(this: RubicDebugProcess, fullPath: string, updater: any, remover?: any): Thenable<void> {
        return Promise.reject(new Error("updateTextFile() is not available in debug process"));
    };

    /* Construct and dispose */

    /**
     * Construct abstraction layer for Debug Adapter process
     */
    constructor(private _debugSession: RubicDebugSession, configuration: any) {
        // Initialize members
        super(true);
        this._debugConfiguration = Object.assign({}, configuration);
        this._privateData = this._debugConfiguration.__private;
        if (this._privateData == null) {
            throw new Error("RubicDebugSession is not started correctly");
        }
        delete this._debugConfiguration.__private;

        // Construct sketch
        this._sketch = new Sketch(this.workspaceRoot);
    }

    readonly dispose = function(this: RubicDebugProcess): Thenable<void> {
        return Promise.resolve();
    };

    /** Requester */
    private _request(type: string, args: any): Thenable<any> {
        return this._debugSession.sendHostRequest(type, args, true);
    }

    /** Private data for Rubic */
    private _privateData: {
        workspaceRoot: string;
        extensionRoot: string;
    };

    /** Debug configuration data */
    private _debugConfiguration: any;

    /** Sketch instance */
    private _sketch: Sketch;
}
