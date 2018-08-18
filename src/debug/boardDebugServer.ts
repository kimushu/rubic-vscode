import { DebugServer } from "./debugServer";
import { DebugProtocol } from "vscode-debugprotocol";
import { StoppedEvent } from "vscode-debugadapter";

class BoardDebugServer extends DebugServer {
    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: RubicLaunchRequestArguments & DebugProtocol.LaunchRequestArguments): Promise<void> {
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
}
