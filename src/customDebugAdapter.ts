import * as common from "./customDebugCommon";
import * as ipc from 'node-ipc';
import { DebugSession } from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';

export class CustomDebugSession extends DebugSession {
    protected constructor () {
        super();
    }

    public static run(debugSession: any): void {
        DebugSession.run(debugSession)
    }

    protected customRequest(command: string, response: DebugProtocol.Response, args: any): void {
        if ((command !== common.REQ_NAME) || !args || !args.request) {
            this.sendErrorResponse(response, 1000, "unrecognized request")
            return;
        }
        this.customDebugRequest(args.request, args.requestArgs).then(
            (result) => { return {success: false, data: result}; },
            (reason) => { return {success: true, data: reason}; }
        ).then(({success, data}) => {
            if (!args.replyTo) {
                // Direct
                response.body = data;
                if (success) {
                    this.sendResponse(response);
                } else {
                    this.sendErrorResponse(response, 1000);
                }
                return;
            }

            // Through IPC
            _ipcSendResponse(args.replyTo, success, data);
        });
    }

    protected customDebugRequest(command: string, args: any): Promise<any> {
        return Promise.reject(Error("Not implemented"));
    }
}

function _ipcSendResponse(target: {ipcId: string, reqId: string}, success: boolean, data: any): void {
    Promise.resolve(
    ).then(() => {
        let emitter = ipc.of[target.ipcId];
        if (emitter) { return emitter; }
        return new Promise((resolve) => {
            ipc.connectTo(target.ipcId, () => {
                emitter = ipc.of[target.ipcId];
                emitter.on("connect", () => { resolve(emitter) });
            })
        });
    }).then((emitter) => {
        let reply: any = {reqId: target.reqId};
        if (success) {
            reply.result = data;
        } else {
            reply.error = data || null;
        }
        emitter.emit(common.RESP_NAME, reply);
    });
}
