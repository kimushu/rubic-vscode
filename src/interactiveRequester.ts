import { commands, window } from 'vscode';

let pendingRequests = {};

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
        console.log("reply: " + JSON.stringify(response));
        if (response == null) {
            throw Error("no debug session");
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
                    console.log(`unknown question: ${question}`);
            }
        }).then((result) => {
            return issue({question_id, result});
        });
    };
    issue({command_id, command, args}).then(reply);
    return promise;
}
