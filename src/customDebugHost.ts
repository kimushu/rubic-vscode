import * as common from './customDebugCommon';
import * as ipc from 'node-ipc';
import { commands } from 'vscode';

class BridgeRequest {
    resolve: Function;
    reject: Function;
    reqId: string;
}

let _requests: any = {};
let _ipcId: string = null;

export function customDebugRequest(request: string, requestArgs: any): Promise<any> {
    return _initIpc().then((ipcId) => {
        return new Promise<any>((resolve, reject) => {
            let args: any = {request, requestArgs};
            let reqId: string;
            if (ipcId) {
                reqId = Math.random().toString(36).substring(2);
                let req: BridgeRequest = {resolve, reject, reqId};
                _requests[reqId] = req;
                args.replyTo = {ipcId, reqId};
            };
            commands.executeCommand(
                "customDebugRequest", common.REQ_NAME, args
            ).then((result) => {
                if (!ipcId) {
                    resolve(result)
                }
            }, (error) => {
                if (reqId) {
                    delete _requests[reqId];
                }
                reject(error);
            });
        });
    });
}

function _initIpc(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        if (!_ipcId) {
            let id = common.IPCID_PREFIX + process.pid;
            ipc.config.id = id;
            ipc.serve(() => {
                ipc.server.on(common.RESP_NAME, _handleIpcResponse.bind(this));
            });
            ipc.server.start();
            _ipcId = id;
        }
        resolve(_ipcId);
    })
}

function _handleIpcResponse(data: {reqId: string, error?: any, result?: any}, socket): void {
    let {reqId, resolve, reject} = <BridgeRequest>(_requests[data.reqId] || {});
    if (!reqId) { return; }
    delete _requests[reqId];
    if (data.error !== undefined) {
        return reject(data.error);
    } else {
        return resolve(data.result);
    }
}
