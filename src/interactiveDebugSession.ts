import { DebugSession } from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';

import vscode = require("vscode"); // Import declaration only

export class InteractiveDebugSession extends DebugSession {
    private _pendingResponses: DebugProtocol.Response[] = [];
    private _waitingRequests = {};

    protected constructor () {
        super();
    }

    protected customRequest(command: string, response: DebugProtocol.Response, args: any): void {
        this._pendingResponses.push(response);
        if (command === "interactive.userResponse") {
            let seq = args && args.request_seq;
            let resolve = this._waitingRequests[seq];
            delete this._waitingRequests[seq];
            resolve && resolve(args.result);
        } else if (command === "interactive.codeRequest") {
            let creq_id = args && args.id;
            let creq_cmd = args && args.command;
            let creq_args = args && args.args;
            Promise.resolve(
            ).then(() => {
                if (creq_id == null || creq_cmd == null) {
                    return Promise.reject(Error("Invalid interactive.codeRequest"));
                }
                return this.interactiveRequest(creq_cmd, creq_args);
            }).then((result) => {
                let resp = this._pendingResponses.shift();
                resp.body = {id: creq_id, response: "interactive.codeSuccess", result};
                this.sendResponse(resp);
            }, (reason) => {
                let resp = this._pendingResponses.shift();
                resp.body = {id: creq_id, response: "interactive.codeFailure", reason};
                this.sendResponse(resp);
            });
        }
    }

    protected interactiveRequest(command: string, args: any): Promise<any> {
        return Promise.reject(Error("Not supported"));
    }

    public showErrorMessage(message: string, ...items: string[]): Thenable<string|undefined>;
    public showErrorMessage(message: string, options: vscode.MessageOptions, ...items: string[]): Thenable<string|undefined>;
    public showErrorMessage<T extends vscode.MessageItem>(message: string, ...items: T[]): Thenable<T|undefined>;
    public showErrorMessage<T extends vscode.MessageItem>(message: string, options: vscode.MessageOptions, ...items: T[]): Thenable<T|undefined>;
    public showErrorMessage(message: string, options: vscode.MessageOptions, ...items: any[]): Thenable<any> {
        let resp = this._pendingResponses.shift();
        resp.body = {}
        return Promise.resolve(undefined);
    }

    public showInformationMessage(message: string, ...items: string[]): Thenable<string|undefined>;
    public showInformationMessage(message: string, options: vscode.MessageOptions, ...items: string[]): Thenable<string|undefined>;
    public showInformationMessage<T extends vscode.MessageItem>(message: string, ...items: T[]): Thenable<T|undefined>;
    public showInformationMessage<T extends vscode.MessageItem>(message: string, options: vscode.MessageOptions, ...items: T[]): Thenable<T|undefined>;
    public showInformationMessage(message: string, options: vscode.MessageOptions, ...items: any[]): Thenable<any> {
        return Promise.resolve(undefined);
    }

    public showInputBox(options?: vscode.InputBoxOptions, token?: vscode.CancellationToken): Thenable<string|undefined> {
        return Promise.resolve(undefined);
    }

    public showWarningMessage(message: string, ...items: string[]): Thenable<string|undefined>;
    public showWarningMessage(message: string, options: vscode.MessageOptions, ...items: string[]): Thenable<string|undefined>;
    public showWarningMessage<T extends vscode.MessageItem>(message: string, ...items: T[]): Thenable<T|undefined>;
    public showWarningMessage<T extends vscode.MessageItem>(message: string, options: vscode.MessageOptions, ...items: T[]): Thenable<T|undefined>;
    public showWarningMessage(message: string, options: vscode.MessageOptions, ...items: any[]): Thenable<any> {
        return Promise.resolve(undefined);
    }

}