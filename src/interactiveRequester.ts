import { commands, window, workspace } from 'vscode';

const DEBUG_SESSION_DELAY_MS    = 1000;
const DEBUG_SESSION_MAX_TRIES = 5;
let pendingRequests = {};

export class NoDebugSessionError extends Error {
    constructor(message?: string) {
        super(message);
        Object.setPrototypeOf(this, NoDebugSessionError.prototype);
    }
}

export function soloInteractiveDebugRequest(command: string, args: any): Thenable<any> {
    return commands.executeCommand(
        "vscode.startDebug",
        {
            type: "rubic",
            request: "attach",
            workspaceRoot: workspace.rootPath,
            debugServer: 4711
        }
    ).then(() => {
        let retry = DEBUG_SESSION_MAX_TRIES;
        let issue = () => {
            return new Promise((resolve) => {
                global.setTimeout(resolve, DEBUG_SESSION_DELAY_MS);
            }).then(() => {
                return interactiveDebugRequest(command, args);
            }).catch((reason) => {
                if (reason instanceof NoDebugSessionError && --retry > 0) {
                    return issue();
                }
                return Promise.reject(reason);
            });
        };
        return issue();
    });
}

export function interactiveDebugRequest(command: string, args: any): Thenable<any> {
    let command_id = Math.random().toString(36).substr(2);
    let promise = new Promise((resolve, reject) => {
        pendingRequests[command_id] = {resolve, reject};
    });
    let issue = (args) => {
        return commands.executeCommand(
            "workbench.customDebugRequest",
            "interactiveRequest",
            args
        ).then(reply);
    };
    let reply = (response) => {
        if (response == null) {
            throw new NoDebugSessionError("no debug session");
        }

        let {body} = response;
        if (body.command_id != null) {
            let request = pendingRequests[body.command_id];
            delete pendingRequests[body.command_id];
            if (!request) {
                throw Error(`unknown command_id: ${body.command_id}`);
            }
            if (body.result) {
                request.resolve(body.result[0]);
            } else if (body.reason) {
                request.reject(body.reason[0]);
            } else {
                throw Error("invalid command response");
            }
            return;
        }

        let {question_id, question} = body;
        return Promise.resolve(
        ).then(() => {
            switch (question) {
                case "showErrorMessage":
                case "showInformationMessage":
                case "showWarningMessage":
                    return window[question](
                        body.message,
                        body.options,
                        ...body.items
                    ).then((item) => {
                        return (item != null) ? body.items.indexOf(item) : null;
                    });
                case "showInputBox":
                    return window.showInputBox(body.options);
                case "showQuickPick":
                    return window.showQuickPick(body.items, body.options).then((item) => {
                        return (item != null) ? body.items.indexOf(item) : null;
                    });
                default:
                    console.warn(`unknown question: ${question}`);
            }
        }).then((result) => {
            return issue({question_id, result});
        });
    };
    issue({command_id, command, args}).then(reply, (reason) => {
        let request = pendingRequests[command_id];
        delete pendingRequests[command_id];
        request.reject(reason);
    });
    return promise;
}
