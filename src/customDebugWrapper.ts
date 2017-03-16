import * as ipc from 'node-ipc';

// Import type information only (for extensionHost)
import vscode = require('vscode');

// Import type information only (for debugAdapter)
import vscode_dap = require('vscode-debugadapter');
import vscode_dpr = require('vscode-debugprotocol');

const REQ_NAME = "custom-request";
const RESP_NAME = "custom-response";
const IPCID_PREFIX = "customDebugWrapper-";

export namespace extensionHost {
    const vscode = require("vscode");

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
                vscode.commands.executeCommand(
                    "customDebugRequest", REQ_NAME, args
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

    export function customDebugRequestWithInteraction(request: string, requestArgs: any): Promise<any> {
        let next = () => {
            let interaction;
            return customDebugRequest(request, requestArgs).then((response) => {
                interaction = response && response.interaction;
                request = interaction && interaction.request;
                let command = interaction && interaction.command;
                if (command) {
                    return vscode.window[command](...interaction.commandArgs).then((result) => {
                        if (request) {
                            requestArgs = response;
                            response.interaction = {commandResult: result};
                            return next();
                        }
                        return response;
                    });
                }
                if (!request) {
                    return response;
                }
                requestArgs = interaction.requestArgs;
                return next();
            });
        };
        return next();
    }

    function _initIpc(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            if (!_ipcId) {
                let id = IPCID_PREFIX + process.pid;
                ipc.config.id = id;
                ipc.serve(() => {
                    ipc.server.on(RESP_NAME, _handleIpcResponse.bind(this));
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
}

export namespace debugAdapter {

    interface DebugSessionClass {
        new(...args): vscode_dap.DebugSession;
        run(debugSession: any): void;
    }
    const DebugSession: DebugSessionClass = require('vscode-debugadapter').DebugSession;

    export class CustomDebugSession extends DebugSession {
        protected constructor (...args) {
            super(...args);
        }

        public static run(debugSession: any): void {
            DebugSession.run(debugSession)
        }

        protected customRequest(command: string, response: vscode_dpr.DebugProtocol.Response, args: any): void {
            if ((command !== REQ_NAME) || !args || !args.request) {
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
            emitter.emit(RESP_NAME, reply);
        });
    }
}
