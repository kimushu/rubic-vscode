import { DebugServer } from "./debugServer";
import { DebugProtocol } from "vscode-debugprotocol";
import { StoppedEvent } from "vscode-debugadapter";
import { Sketch } from "../sketch";

interface BoardLaunchRequestArguments {
    boardPath: string;
}

export class BoardDebugServer extends DebugServer {
    /**
     * Construct instance
     * @param sketch The instance of Sketch associated to this debug server
     */
    constructor(sketch: Sketch) {
        if (sketch.board == null) {
            throw new Error("No board");
        }
        super(sketch);
    }

    /**
     * Extend debug arguments with communication information
     * @param args Debug arguments
     */
    extendLaunchArgs(args: any): any {
        return DebugServer.prototype.extendLaunchArgs.call(this,
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
}
