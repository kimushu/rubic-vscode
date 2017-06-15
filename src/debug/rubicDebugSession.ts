import { DebugSession } from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { RubicDebugProcess } from "../rubicDebugProcess";

class RubicDebugSession extends DebugSession {
    protected launchRequest(response: DebugProtocol.LaunchResponse, args: DebugProtocol.LaunchRequestArguments): void {
        let process = new RubicDebugProcess(this, args);
    }

    protected attachRequest(response: DebugProtocol.AttachResponse, args: DebugProtocol.AttachRequestArguments): void {
        let process = new RubicDebugProcess(this, args);
    }
}

DebugSession.run(RubicDebugSession);
