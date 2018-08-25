import { DebugProtocol } from "vscode-debugprotocol";
import { IPC as NodeIPC } from "node-ipc";
import { Socket } from "net";
import { AssertionError } from "assert";
import { Sketch } from "../sketch";

/**
 * Debug server for extension host process
 * (This communicates with debug adapter process via node-ipc)
 */
export class DebugServer {
    private static _servers: { [id: string]: DebugServer } = {};

    /** Server ID */
    public readonly id: string;

    /** IPC instance */
    private _ipc = new NodeIPC();

    /** Socket to client (Initialized at attach/launch) */
    private _socket?: Socket;

    /** VSCode debug session ID */
    private _sessionId?: string;

    /**
     * Get VSCode debug session ID
     */
    get sessionId(): string | undefined { return this._sessionId; }

    /**
     * Construct instance
     */
    protected constructor() {
        this.id = `DebugServer@${Math.random().toString(36).substr(2)}`;
        DebugServer._servers[this.id] = this;
        this._ipc.config.appspace = "kimushu.rubic";
        this._ipc.config.id = this.id;
        this._ipc.config.silent = true;
        console.log(`Construct a new debug server (id=${this.id})`);
    }

    /**
     * Extend debug arguments with communication information
     * @param args Debug arguments
     */
    extendLaunchArgs(args: any): any {
        return Object.assign({
            __rubicServerId: this.id
        }, args);
    }

    /**
     * Start server
     */
    startServer(): void {
        if (this._ipc.server) {
            return;
        }
        console.log(`Starting debug server (id=${this.id})`);
        this._ipc.serve(() => this._service());
        this._ipc.server!.start();
    }

    /**
     * Stop server
     */
    stopServer(): void {
        if (this._ipc.server != null) {
            console.log(`Stopping debug server (id=${this.id})`);
            this._ipc.server.stop();
        }
    }

    /**
     * Dispose object
     */
    dispose(): void {
        this.stopServer();
        delete DebugServer._servers[this.id];
        console.log(`Disposing debug server (id=${this.id})`);
    }

    private _service(): void {
        const { server } = this._ipc;
        server.on("request", (data, socket) => {
            this._dispatchRequest(data, socket);
        });
        server.on("shutdown", () => {
            this.dispose();
        });
    }

    private _dispatchRequest(data: { command: string, response: any, args: any }, socket: Socket): void {
        const { server } = this._ipc;
        const { command, response, args } = data;
        if ((command === "launch") || (command === "attach")) {
            this._sessionId = data.args.__sessionId;
            this._socket = socket;
        }
        Promise.resolve()
        .then(() => {
            switch (command) {
            case "disconnect":
                return this.disconnectRequest(response, args);
            case "launch":
                return this.launchRequest(response, args);
            case "attach":
                return this.attachRequest(response, args);
            case "restart":
                return this.restartRequest(response, args);
            case "setBreakPoints":
                return this.setBreakPointsRequest(response, args);
            case "setFunctionBreakPoints":
                return this.setFunctionBreakPointsRequest(response, args);
            case "setExceptionBreakPoints":
                return this.setExceptionBreakPointsRequest(response, args);
            case "configurationDone":
                return this.configurationDoneRequest(response, args);
            case "continue":
                return this.continueRequest(response, args);
            case "next":
                return this.nextRequest(response, args);
            case "stepIn":
                return this.stepInRequest(response, args);
            case "stepOut":
                return this.stepOutRequest(response, args);
            case "stepBack":
                return this.stepBackRequest(response, args);
            case "reverseContinue":
                return this.reverseContinueRequest(response, args);
            case "restartFrame":
                return this.restartFrameRequest(response, args);
            case "goto":
                return this.gotoRequest(response, args);
            case "pause":
                return this.pauseRequest(response, args);
            case "source":
                return this.sourceRequest(response, args);
            case "threads":
                return this.threadsRequest(response);
            case "terminateThreads":
                return this.terminateThreadsRequest(response, args);
            case "stackTrace":
                return this.stackTraceRequest(response, args);
            case "scopes":
                return this.scopesRequest(response, args);
            case "variables":
                return this.variablesRequest(response, args);
            case "setVariable":
                return this.setVariableRequest(response, args);
            case "setExpression":
                return this.setExpressionRequest(response, args);
            case "evaluate":
                return this.evaluateRequest(response, args);
            case "stepInTargets":
                return this.stepInTargetsRequest(response, args);
            case "gotoTargets":
                return this.gotoTargetsRequest(response, args);
            case "completions":
                return this.completionsRequest(response, args);
            case "exceptionInfo":
                return this.exceptionInfoRequest(response, args);
            case "loadedSources":
                return this.loadedSourcesRequest(response, args);
            default:
                throw new Error(`Unknown request: ${command}`);
            }
        })
        .then(() => {
            response.success = true;
            delete response.message;
        }, (reason) => {
            response.success = false;
            response.message = `${reason}`;
            response.body = reason;
        })
        .then(() => {
            server.emit(socket, "response", response);
        });
    }

    protected sendEvent(event: DebugProtocol.Event): void {
        if (this._socket == null) {
            throw new AssertionError({ message: "Socket is not initialized" });
        }
        const { server } = this._ipc;
        server.emit(this._socket, "event", event);
    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected attachRequest(response: DebugProtocol.AttachResponse, args: DebugProtocol.AttachRequestArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected restartRequest(response: DebugProtocol.RestartResponse, args: DebugProtocol.RestartArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected setFunctionBreakPointsRequest(response: DebugProtocol.SetFunctionBreakpointsResponse, args: DebugProtocol.SetFunctionBreakpointsArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected setExceptionBreakPointsRequest(response: DebugProtocol.SetExceptionBreakpointsResponse, args: DebugProtocol.SetExceptionBreakpointsArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected restartFrameRequest(response: DebugProtocol.RestartFrameResponse, args: DebugProtocol.RestartFrameArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected gotoRequest(response: DebugProtocol.GotoResponse, args: DebugProtocol.GotoArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments): Thenable<void> {
        return Promise.resolve();
    }
    
    protected threadsRequest(response: DebugProtocol.ThreadsResponse): Thenable<void> {
        return Promise.resolve();
    }

    protected terminateThreadsRequest(response: DebugProtocol.TerminateThreadsResponse, args: DebugProtocol.TerminateThreadsRequest): Thenable<void> {
        return Promise.resolve();
    }

    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected setExpressionRequest(response: DebugProtocol.SetExpressionResponse, args: DebugProtocol.SetExpressionArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected stepInTargetsRequest(response: DebugProtocol.StepInTargetsResponse, args: DebugProtocol.StepInTargetsArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected gotoTargetsRequest(response: DebugProtocol.GotoTargetsResponse, args: DebugProtocol.GotoTargetsArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected completionsRequest(response: DebugProtocol.CompletionsResponse, args: DebugProtocol.CompletionsArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected exceptionInfoRequest(response: DebugProtocol.ExceptionInfoResponse, args: DebugProtocol.ExceptionInfoArguments): Thenable<void> {
        return Promise.resolve();
    }

    protected loadedSourcesRequest(response: DebugProtocol.LoadedSourcesResponse, args: DebugProtocol.LoadedSourcesArguments): Thenable<void> {
        return Promise.resolve();
    }
}
