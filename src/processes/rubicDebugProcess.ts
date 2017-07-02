import {
    RubicProcess, RubicMessageOptions, RubicQuickPickOptions,
    RubicInputBoxOptions, RubicMessageItem, RubicQuickPickItem,
    RubicProgress, RubicProgressOptions, RubicConfirmOptions
} from "./rubicProcess";
import { DebugSession, TerminatedEvent } from "vscode-debugadapter";
import * as ipc from "node-ipc";
import { Sketch } from "../sketch";

interface HostRequest {
    request_id: string;
    type: string;
    resolve: (result: any) => void;
    reject: (reason: any) => void;
}

interface HostRequestSet {
    [request_id: string]: HostRequest;
}

interface RubicDebugSession extends DebugSession {
    rubicDebugRequest(request: string, args: any): Thenable<any>;
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
    readonly withProgress = function (this: RubicDebugProcess, options: RubicProgressOptions, task: (progress: RubicProgress<{ message?: string }>) => Thenable<void>): Thenable<void> {
        return this._request("withProgress.start", {options})
        .then((progress_id) => {
            return task({
                report: (value: { message?: string }) => {
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
    readonly sendDebugRequest = function (): any {
        return Promise.reject(new Error("sendDebugRequest() is not available in debug process"));
    };
    readonly stopDebugProcess = function (): any {
        return Promise.reject(new Error("stopDebugProcess() is not available in debug process"));
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

        // Setup IPC
        let { host_id, debugger_id } = this._privateData;
        this._clientSetup = new Promise((resolve) => {
            ipc.config.silent = true;
            ipc.connectTo(host_id, () => {
                let client = ipc.of[host_id];
                client.on("connect", () => {
                    client.emit("app.initialized", { debugger_id });
                    client.on("app.terminate", (data, socket) => {
                        this._debugSession.sendEvent(
                            new TerminatedEvent(false)
                        );
                    });
                    client.on("app.host-response", (data, socket) => {
                        let req = this._requests[data.id];
                        if (req == null) {
                            console.warn(`host-response event with unknown request id: ${data.id}`);
                            return;
                        }
                        delete this._requests[data.id];
                        if (data.reason !== undefined) {
                            req.reject(data.reason);
                        } else {
                            req.resolve(data.result);
                        }
                    });
                    client.on("app.debug-request", (data, socket) => {
                        let { request_id, request, args } = data;
                        _debugSession.rubicDebugRequest(request, args)
                        .then((result) => {
                            client.emit("app.debug-response", {
                                debugger_id, request_id, result
                            });
                        }, (reason) => {
                            client.emit("app.debug-response", {
                                debugger_id, request_id, reason: `${reason}`
                            });
                        });
                    });
                    client.destroy = () => ipc.disconnect(host_id);
                    resolve(client);
                });
            });
        });
    }

    readonly dispose = function(this: RubicDebugProcess): Thenable<void> {
        return this._clientSetup
        .then((client) => {
            client.destroy();
        });
    };

    /** Requester */
    private _request(type: string, args: any): Thenable<any> {
        return this._clientSetup
        .then((client) => {
            return new Promise((resolve, reject) => {
                let id = this.getUniqueId("hr");
                this._requests[id] = {
                    request_id: id, type, resolve, reject
                };
                client.emit("app.host-request", {type, id, args});
            });
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

    /** Sketch instance */
    private _sketch: Sketch;

    /** Client setup */
    private readonly _clientSetup: Promise<any>;

    /** Set of pending requests */
    private _requests: HostRequestSet = {};

}
