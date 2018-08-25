import { DebugServer } from "./debugServer";
import { DebugProtocol } from "vscode-debugprotocol";
import { StoppedEvent } from "vscode-debugadapter";
import { Sketch } from "../sketch";
import { AssertionError } from "assert";
import { WorkspaceFolder, DebugConfiguration, CancellationToken, ExtensionContext, Disposable } from "vscode";
import { vscode } from "../extension";

import * as nls from "vscode-nls";
import { CatalogViewer } from "../catalog/catalogViewer";
const localize = nls.loadMessageBundle(__filename);

interface BoardLaunchRequestArguments {
    boardPath: string;
}

export class BoardDebugServer extends DebugServer {
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
    static async resolveDebugConfiguration?(folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, token?: CancellationToken): Promise<DebugConfiguration | undefined> {
        if (folder == null) {
            vscode.window.showErrorMessage(localize(
                "open-folder-first",
                "Please open a folder to place files before starting debugging with Rubic"
            ));
            return undefined;
        }
        const sketch = await Sketch.find(folder);
        if (sketch == null) {
            const choice = await vscode.window.showInformationMessage(localize(
                "setup-first",
                "Please setup board configuration before starting debugging with Rubic"
            ), localize("open-catalog", "Open catalog"));
            if (choice != null) {
                CatalogViewer.open(folder);
            }
            return undefined;
        }
        const server = new BoardDebugServer(sketch);
        server.startServer();
        if (debugConfiguration.boardData == null) {
            debugConfiguration.boardData = {};
        }
        return server.extendLaunchArgs(debugConfiguration);
    }

    private _disposables: Disposable[] = [];

    /**
     * Construct instance
     * @param sketch The instance of Sketch associated to this debug server
     */
    constructor(readonly sketch: Sketch) {
        super();
        if (sketch.board == null) {
            throw new AssertionError({ message: "No board" });
        }
    }

    /**
     * Dispose object
     */
    dispose(): void {
        const { _disposables } = this;
        this._disposables = [];
        _disposables.forEach((disposable) => disposable.dispose());
        super.dispose();
    }

    /**
     * Extend debug arguments with communication information
     * @param args Debug arguments
     */
    extendLaunchArgs(args: any): any {
        return super.extendLaunchArgs(
            Object.assign({
                boardPath: this.sketch.boardPath
            }, args)
        );
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: BoardLaunchRequestArguments & DebugProtocol.LaunchRequestArguments): Promise<void> {
        if (args.boardPath == null) {
            throw new Error("No boardPath field in launch arguments");
        }
        const { board } = this.sketch;
        if (board == null) {
            throw new Error("No board instance in current sketch");
        }
        if ((board.path !== args.boardPath) && (board.isConnected)) {
            await board.disconnect();
        }
        await board.connect(args.boardPath);
        this._disposables.push(
            board.onDidDisconnect(() => {
                this.sendEvent(new StoppedEvent("Disconnected", 0));
            })
        );
    }

    protected async disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): Promise<void> {
        const { board } = this.sketch;
        if ((board != null) && (board.isConnected)) {
            await board.disconnect();
        }
    }
}
