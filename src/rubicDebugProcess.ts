import {
    RubicProcess, RubicMessageOptions, RubicQuickPickOptions,
    RubicInputBoxOptions, RubicMessageItem, RubicQuickPickItem,
    RubicProgress, RubicProgressOptions
} from "./rubicProcess";
import { DebugSession, TerminatedEvent } from "vscode-debugadapter";
import * as ipc from "node-ipc";

interface Request {
    request_id: string;
    type: string;
    resolve: (result: any) => void;
    reject: (reason: any) => void;
}

interface RequestSet {
    [request_id: string]: Request;
}

export class RubicDebugProcess extends RubicProcess {
    /* Properties */
    get isHost() { return false; }
    get isDebug() { return true; }
    get workspaceRoot() { return this._privateData.workspaceRoot; }
    get extensionRoot() { return this._privateData.extensionRoot; }
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
    private _showMessage(level: string, message: string, ...originalItems: any[]): Promise<any> {
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
    readonly showQuickPick = function (this: RubicDebugProcess, originalItems: any[], options?: RubicQuickPickOptions): Promise<any> {
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
    readonly withProgress = function (this: RubicDebugProcess, options: RubicProgressOptions, task: (progress: RubicProgress<{ message?: string }>) => Thenable<void>): Thenable<void> {
        return this._request("withProgress.start", {options})
        .then((progress_id) => {
            return task({
                report(value: { message?: string }) {
                    this._request("withProgress.report", {progress_id, message: value.message});
                }
            })
            .then(() => {
                return this._request("withProgress.end", {progress_id});
            }, (reason) => {
                let result = Promise.reject(reason);
                return this._request("withProgress.end", {progress_id})
                .then(() => result, () => result);
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
    readonly startDebugProcess = function (): any {
        return Promise.reject(new Error("startDebugProcess() is not available in debug process"));
    };
    readonly stopDebugProcess = function (): any {
        return Promise.reject(new Error("stopDebugProcess() is not available in debug process"));
    };

    /* Settings */
    readonly getRubicSetting = function(this: RubicDebugProcess, path: string): Thenable<any> {
        return this._request("getRubicSetting", {path});
    };
    readonly updateTextFile = function(this: RubicDebugProcess, fullPath: string, updater: any, remover?: any): Thenable<void> {
        return Promise.reject(new Error("updateTextFile() is not available in debug process"));
    };

    /**
     * Construct abstraction laer for Debug Adapter process
     */
    constructor(private _debugSession: DebugSession, configuration: any) {
        super();
        this._debugConfiguration = Object.assign({}, configuration);
        this._privateData = this._debugConfiguration.__private;
        if (this._privateData == null) {
            throw new Error("RubicDebugSession is not started correctly");
        }
        delete this._debugConfiguration.__private;

        let { host_id, debugger_id } = this._privateData;
        ipc.connectTo(host_id, () => {
            let client = ipc.of[host_id];
            client.on("connect", () => {
                client.emit("initialized", { debugger_id });
                client.on("terminate", (data, socket) => {
                    this._debugSession.sendEvent(
                        new TerminatedEvent(false)
                    );
                });
                client.on("response", (data, socket) => {
                    let req = this._requests[data.id];
                    if (req == null) {
                        console.warn(`response event with unknown request id: ${data.id}`);
                        return;
                    }
                    delete this._requests[data.id];
                    if (data.reason !== undefined) {
                        req.reject(data.reason);
                    } else {
                        req.resolve(data.result);
                    }
                });
            });
        });
    }

    /** Requester */
    private _request(type: string, args: any): Promise<any> {
        return new Promise((resolve, reject) => {
            let request_id = `rubic-r-${Math.random().toString(36).substr(2)}`;
            this._requests[request_id] = {
                request_id, type, resolve, reject
            };
        });
    }

    /** Private data for Rubic */
    private _privateData: {
        host_id: string;
        debugger_id: string;
        workspaceRoot: string;
        extensionRoot: string;
    };

    /** Debug configuration data */
    private _debugConfiguration: any;

    /** Client setup */
    private readonly _clientSetup: Promise<void>;

    /** Set of pending requests */
    private _requests: RequestSet = {};

}
