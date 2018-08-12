import { DebugProtocol } from "vscode-debugprotocol";
import { IPC as NodeIPC } from "node-ipc";
import { ExtensionContext, DebugConfigurationProvider, WorkspaceFolder, CancellationToken, ProviderResult, DebugConfiguration } from "vscode";
import { vscode } from "../extension";
import { Socket } from "net";
import { AssertionError } from "assert";
import * as nls from "vscode-nls";
const localize = nls.loadMessageBundle(__filename);

/**
 * Debug server for extension host process
 * (This communicates with debug adapter process via node-ipc)
 */
export class DebugServer {
    private static _servers: { [id: string]: DebugServer } = {};

    /**
     * Activate debug server related features
     */
    static activateExtension(context: ExtensionContext): any {
        context.subscriptions.push(
            vscode.debug.registerDebugConfigurationProvider(
                "rubic", this
            )
        );
    }

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values or by adding/changing/removing attributes.
     * If more than one debug configuration provider is registered for the same type, the resolveDebugConfiguration calls are chained
     * in arbitrary order and the initial debug configuration is piped through the chain.
     * Returning the value 'undefined' prevents the debug session from starting.
     *
     * @param folder The workspace folder from which the configuration originates from or undefined for a folderless setup.
     * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
     * @param token A cancellation token.
     * @return The resolved debug configuration or undefined.
     */
    static resolveDebugConfiguration?(folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
        if (folder == null) {
            vscode.window.showErrorMessage(localize(
                "open-folder-first",
                "Please open a folder to place files before starting debugging with Rubic"
            ));
            return undefined;
        }
        const server = new DebugServer();
        server.startServer();
        this._servers[server.id] = server;
        if (debugConfiguration.boardData == null) {
            debugConfiguration.boardData = {};
        }
        return server.extendLaunchArgs(debugConfiguration);
    }

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
    private constructor() {
        this.id = `DebugServer@${Math.random().toString(36).substr(2)}`;
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
        const newArgs = Object.assign({}, args);
        newArgs.__rubicServerId = this.id;
        return newArgs;
    }

    startServer(): void {
        if (this._ipc.server) {
            return;
        }
        console.log(`Starting debug server (id=${this.id})`);
        this._ipc.serve(() => this._service());
        this._ipc.server!.start();
    }

    stopServer(): void {
        console.log(`Stopping debug server (id=${this.id})`);
        this._ipc.server.stop();
    }

    private _service(): void {
        const { server } = this._ipc;
        server.on("request", (data, socket) => {
            this._dispatchRequest(data, socket);
        });
        server.on("shutdown", () => {
            this.stopServer();
            delete DebugServer._servers[this.id];
        });
    }

    private _dispatchRequest(data: { command: string, response: any, args: any }, socket: Socket): void {
        const { server } = this._ipc;
        const { command, response, args } = data;
        let thenable: Thenable<void>;
        if ((command === "launch") || (command === "attach")) {
            this._sessionId = data.args.__sessionId;
            this._socket = socket;
        }
        switch (command) {
        case "disconnect":
            thenable = this.disconnectRequest(response, args);
            break;
        case "launch":
            thenable = this.launchRequest(response, args);
            break;
        case "attach":
            thenable = this.attachRequest(response, args);
            break;
        case "restart":
            thenable = this.restartRequest(response, args);
            break;
        case "setBreakPoints":
            thenable = this.setBreakPointsRequest(response, args);
            break;
        case "setFunctionBreakPoints":
            thenable = this.setFunctionBreakPointsRequest(response, args);
            break;
        case "setExceptionBreakPoints":
            thenable = this.setExceptionBreakPointsRequest(response, args);
            break;
        case "configurationDone":
            thenable = this.configurationDoneRequest(response, args);
            break;
        case "continue":
            thenable = this.continueRequest(response, args);
            break;
        case "next":
            thenable = this.nextRequest(response, args);
            break;
        case "stepIn":
            thenable = this.stepInRequest(response, args);
            break;
        case "stepOut":
            thenable = this.stepOutRequest(response, args);
            break;
        case "stepBack":
            thenable = this.stepBackRequest(response, args);
            break;
        case "reverseContinue":
            thenable = this.reverseContinueRequest(response, args);
            break;
        case "restartFrame":
            thenable = this.restartFrameRequest(response, args);
            break;
        case "goto":
            thenable = this.gotoRequest(response, args);
            break;
        case "pause":
            thenable = this.pauseRequest(response, args);
            break;
        case "source":
            thenable = this.sourceRequest(response, args);
            break;
        case "threads":
            thenable = this.threadsRequest(response);
            break;
        case "terminateThreads":
            thenable = this.terminateThreadsRequest(response, args);
            break;
        case "stackTrace":
            thenable = this.stackTraceRequest(response, args);
            break;
        case "scopes":
            thenable = this.scopesRequest(response, args);
            break;
        case "variables":
            thenable = this.variablesRequest(response, args);
            break;
        case "setVariable":
            thenable = this.setVariableRequest(response, args);
            break;
        case "setExpression":
            thenable = this.setExpressionRequest(response, args);
            break;
        case "evaluate":
            thenable = this.evaluateRequest(response, args);
            break;
        case "stepInTargets":
            thenable = this.stepInTargetsRequest(response, args);
            break;
        case "gotoTargets":
            thenable = this.gotoTargetsRequest(response, args);
            break;
        case "completions":
            thenable = this.completionsRequest(response, args);
            break;
        case "exceptionInfo":
            thenable = this.exceptionInfoRequest(response, args);
            break;
        case "loadedSources":
            thenable = this.loadedSourcesRequest(response, args);
            break;
        default:
            thenable = Promise.reject(new Error(`Unknown request: ${command}`));
            break;
        }
        thenable.then(() => {
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
