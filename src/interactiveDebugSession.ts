import { DebugSession } from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";

import vscode = require("vscode"); // Import declaration only

export class InteractiveDebugSession extends DebugSession {
    private _pendingResponses: DebugProtocol.Response[] = [];
    private _pendingQuestions = {};

    protected constructor () {
        super();
    }

    protected customRequest(command: string, response: DebugProtocol.Response, args: any): void {
        if (command !== "interactiveRequest") {
            this.sendErrorResponse(response, 1001, "unknown custom request");
            return;
        }
        this._pendingResponses.push(response);
        if (args.command != null) {
            // New command issued
            let {command_id} = args;
            Promise.resolve(
            ).then(() => {
                return this.interactiveRequest(args.command, args.args);
            }).then((result) => {
                let resp = this._pendingResponses.shift();
                resp.body = {command_id, result: [result]};
                this.sendResponse(resp);
            }, (reason) => {
                let resp = this._pendingResponses.shift();
                resp.body = {command_id, reason: [`${reason}:${reason.stack}`]};
                this.sendResponse(resp);
            });
        } else {
            // Answer received
            let resolve = this._pendingQuestions[args.question_id];
            delete this._pendingQuestions[args.question_id];
            if (resolve != null) {
                resolve(args.result);
            }
        }
    }

    protected interactiveRequest(command: string, args: any): Thenable<any> {
        return Promise.reject(Error("Not supported"));
    }

    public showErrorMessage(message: string, ...items: string[]): Thenable<string|undefined>;
    public showErrorMessage(message: string, options: vscode.MessageOptions, ...items: string[]): Thenable<string|undefined>;
    public showErrorMessage<T extends vscode.MessageItem>(message: string, ...items: T[]): Thenable<T|undefined>;
    public showErrorMessage<T extends vscode.MessageItem>(message: string, options: vscode.MessageOptions, ...items: T[]): Thenable<T|undefined>;
    public showErrorMessage(message: string, ...items: any[]): Thenable<any> {
        return this._showMessage("showErrorMessage", message, items);
    }

    public showInformationMessage(message: string, ...items: string[]): Thenable<string|undefined>;
    public showInformationMessage(message: string, options: vscode.MessageOptions, ...items: string[]): Thenable<string|undefined>;
    public showInformationMessage<T extends vscode.MessageItem>(message: string, ...items: T[]): Thenable<T|undefined>;
    public showInformationMessage<T extends vscode.MessageItem>(message: string, options: vscode.MessageOptions, ...items: T[]): Thenable<T|undefined>;
    public showInformationMessage(message: string, ...items: any[]): Thenable<any> {
        return this._showMessage("showInformationMessage", message, items);
    }

    public showInputBox(options?: vscode.InputBoxOptions): Thenable<string|undefined> {
        return this._question({question: "showInputBox", options});
    }

    public showQuickPick(items: string[]|Thenable<string[]>, options?: vscode.QuickPickOptions): Thenable<string|undefined>;
    public showQuickPick<T extends vscode.QuickPickItem>(items: T[]|Thenable<T[]>, options?: vscode.QuickPickOptions): Thenable<T|undefined>;
    public showQuickPick(origItems: any, options?: vscode.QuickPickOptions): Thenable<any> {
        return Promise.resolve(origItems).then((rawItems) => {
            let items = rawItems.map((value) => {
                return (value && value.label != null) ? value : {label: value};
            });
            return this._question({question: "showQuickPick", items}).then((choiceIndex: number) => {
                return (choiceIndex != null) ? rawItems[choiceIndex] : undefined;
            });
        });
    }

    public showWarningMessage(message: string, ...items: string[]): Thenable<string|undefined>;
    public showWarningMessage(message: string, options: vscode.MessageOptions, ...items: string[]): Thenable<string|undefined>;
    public showWarningMessage<T extends vscode.MessageItem>(message: string, ...items: T[]): Thenable<T|undefined>;
    public showWarningMessage<T extends vscode.MessageItem>(message: string, options: vscode.MessageOptions, ...items: T[]): Thenable<T|undefined>;
    public showWarningMessage(message: string, ...items: any[]): Thenable<any> {
        return this._showMessage("showWarningMessage", message, items);
    }

    public showStatusMessage(text: string, tooltip?: string): Thenable<void> {
        return this._question({question: "showStatusMessage", text, tooltip});
    }

    public hideStatusMessage(): Thenable<void> {
        return this._question({question: "hideStatusMessage"});
    }

    public showProgressMessage(title: string): Thenable<void> {
        return this._question({question: "showProgressMessage", title});
    }

    public hideProgressMessage(): Thenable<void> {
        return this._question({question: "hideProgressMessage"});
    }

    private _showMessage(question: string, message: string, rawItems: any[]): Thenable<any> {
        let options: vscode.MessageOptions;
        if (typeof(rawItems[0]) === "object" && rawItems[0].title == null) {
            options = rawItems.shift();
        }
        let items = rawItems.map((value) => {
            return (value && value.title != null) ? value : {title: value};
        });
        return this._question({question, message, options, items}).then((choiceIndex: number) => {
            return (choiceIndex != null) ? rawItems[choiceIndex] : undefined;
        });
    }

    private _question(params: any): Thenable<any> {
        return new Promise((resolve, reject) => {
            let resp = this._pendingResponses.shift();
            if (resp == null) {
                reject(Error("No interactive request chain"));
                return;
            }
            let question_id = Math.random().toString(36).substr(2);
            resp.body = Object.assign({question_id}, params);
            this._pendingQuestions[question_id] = resolve;
            this.sendResponse(resp);
        });
    }
}