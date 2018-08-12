// vscode-nls should be configured before loading all other modules
import * as nls from "vscode-nls";
const localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

import { DebugSession } from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { IPC as NodeIPC } from "node-ipc";
import { AssertionError } from "assert";
import { Socket } from "net";
import * as fs from "fs";

const ipc = new NodeIPC();
ipc.config.appspace = "kimushu.rubic";
ipc.config.silent = true;

interface IpcClient {
    on(event: string, callback: (...args: any[]) => void): IpcClient;
    on(event: "error", callback: (err: any) => void): IpcClient;
    on(event: "connect" | "disconnect" | "destroy", callback: () => void): IpcClient;
    on(event: "socket.disconnected", callback: (socket: Socket, destroyedSocketId: string) => void): IpcClient;
    emit(event: string, value?: any): IpcClient;
    off(event: string, handler: any): IpcClient;
}

/**
 * Debug session for Rubic
 */
class RubicDebugSession extends DebugSession {
    private _serverId?: string;
    private _ipcClient?: IpcClient;

    /**
     * Setup communication with extension host process
     */
    private _setup(args: any): Thenable<void> {
        this._serverId = args.__rubicServerId;
        if (this._ipcClient != null) {
            return Promise.resolve();
        }
        return new Promise<void>((resolve, reject) => {
            ipc.connectTo(this._serverId!, undefined, () => {
                this._ipcClient = ipc.of[this._serverId!];
                if (this._ipcClient == null) {
                    return reject(new Error("Failed to connect IPC server"));
                }
                this._ipcClient.on("response", (response: DebugProtocol.Response) => {
                    fs.appendFileSync("r:/session.log", `response: ${response.command}\n`);
                    this.sendResponse(response);
                    if (response.command === "disconnect") {
                        fs.appendFileSync("r:/session.log", "after disconnect\n");
                        this.shutdown();
                    }
                });
                this._ipcClient.on("event", (event: DebugProtocol.Event) => {
                    this.sendEvent(event);
                });
                return resolve();
            });
        });
    }

    /**
     * Assert if IPC is established
     */
    private _assertIpc(): Thenable<void> {
        if (this._ipcClient != null) {
            return Promise.resolve();
        }
        return Promise.reject(new AssertionError({
            message: "No IPC connection"
        }));
    }

    /**
     * Forward requests to extension host process
     * @param command Command
     * @param response Response
     * @param args Arguments
     */
    private _forward(command: string, response: DebugProtocol.Response, args: any): void {
        fs.appendFileSync("r:/session.log", `forward: ${command}\n`);
        let thenable: Thenable<void>;
        switch (command) {
        case "launch":
        case "attach":
            thenable = this._setup(args);
            break;
        default:
            thenable = this._assertIpc();
            break;
        }
        thenable.then(() => {
            this._ipcClient!.emit("request", { command, response, args });
        })
        .then(undefined, (reason) => {
            this.sendErrorResponse(response, 5201);
        });
    }

    shutdown(): void {
        fs.appendFileSync("r:/session.log", `shutdown\n`);
        if (this._ipcClient != null) {
            this._ipcClient.emit("shutdown");
            ipc.disconnect(this._serverId!);
            this._ipcClient = undefined;
        }
        return DebugSession.prototype.shutdown.call(this);
    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {
        this._forward("disconnect", response, args);
    }
    protected launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments): void {
        this._forward("launch", response, args);
    }
    protected attachRequest(response: DebugProtocol.AttachResponse, args: DebugProtocol.AttachRequestArguments): void {
        this._forward("attach", response, args);
    }
    protected restartRequest(response: DebugProtocol.RestartResponse, args: DebugProtocol.RestartArguments): void {
        this._forward("restart", response, args);
    }
    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
        this._forward("setBreakPoints", response, args);
    }
    protected setFunctionBreakPointsRequest(response: DebugProtocol.SetFunctionBreakpointsResponse, args: DebugProtocol.SetFunctionBreakpointsArguments): void {
        this._forward("setFunctionBreakPoints", response, args);
    }
    protected setExceptionBreakPointsRequest(response: DebugProtocol.SetExceptionBreakpointsResponse, args: DebugProtocol.SetExceptionBreakpointsArguments): void {
        this._forward("setExceptionBreakPoints", response, args);
    }
    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
        this._forward("configurationDone", response, args);
    }
    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        this._forward("continue", response, args);
    }
    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        this._forward("next", response, args);
    }
    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
        this._forward("stepIn", response, args);
    }
    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
        this._forward("stepOut", response, args);
    }
    protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {
        this._forward("stepBack", response, args);
    }
    protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments): void {
        this._forward("reverseContinue", response, args);
    }
    protected restartFrameRequest(response: DebugProtocol.RestartFrameResponse, args: DebugProtocol.RestartFrameArguments): void {
        this._forward("restartFrame", response, args);
    }
    protected gotoRequest(response: DebugProtocol.GotoResponse, args: DebugProtocol.GotoArguments): void {
        this._forward("goto", response, args);
    }
    protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments): void {
        this._forward("pause", response, args);
    }
    protected sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments): void {
        this._forward("source", response, args);
    }
    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        this._forward("threads", response, undefined);
    }
    protected terminateThreadsRequest(response: DebugProtocol.TerminateThreadsResponse, args: DebugProtocol.TerminateThreadsRequest): void {
        this._forward("terminateThreads", response, args);
    }
    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        this._forward("stackTrace", response, args);
    }
    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        this._forward("scopes", response, args);
    }
    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        this._forward("variables", response, args);
    }
    protected setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments): void {
        this._forward("setVariable", response, args);
    }
    protected setExpressionRequest(response: DebugProtocol.SetExpressionResponse, args: DebugProtocol.SetExpressionArguments): void {
        this._forward("setExpression", response, args);
    }
    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        this._forward("evaluate", response, args);
    }
    protected stepInTargetsRequest(response: DebugProtocol.StepInTargetsResponse, args: DebugProtocol.StepInTargetsArguments): void {
        this._forward("stepInTargets", response, args);
    }
    protected gotoTargetsRequest(response: DebugProtocol.GotoTargetsResponse, args: DebugProtocol.GotoTargetsArguments): void {
        this._forward("gotoTargets", response, args);
    }
    protected completionsRequest(response: DebugProtocol.CompletionsResponse, args: DebugProtocol.CompletionsArguments): void {
        this._forward("completions", response, args);
    }
    protected exceptionInfoRequest(response: DebugProtocol.ExceptionInfoResponse, args: DebugProtocol.ExceptionInfoArguments): void {
        this._forward("exceptionInfo", response, args);
    }
    protected loadedSourcesRequest(response: DebugProtocol.LoadedSourcesResponse, args: DebugProtocol.LoadedSourcesArguments): void {
        this._forward("loadedSources", response, args);
    }
}

DebugSession.run(RubicDebugSession);
