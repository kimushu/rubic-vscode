'use strict';

import {
    InitializedEvent,
    Thread
} from 'vscode-debugadapter';
import { debugAdapter } from './customDebugWrapper';
const { CustomDebugSession } = debugAdapter;
import { DebugProtocol } from 'vscode-debugprotocol';
import { RubicBoard } from "./rubicBoard";
import { PeridotBoard } from "./peridotBoard";
import { BoardCatalog } from "./boardCatalog";

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    /** An absolute path to the program to debug */
    program: string;
    /** An absolute path to the workspace folder */
    workspathRoot: string;
    /** Board ID */
    boardId: string;
    /** Firmware ID */
    firmwareId?: string;
}

export interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments {
}

class RubicDebugSession extends CustomDebugSession {
    private static THREAD_ID: number = 1;
    private static THREAD_NAME: string = "Main thread";
    private _board: RubicBoard;

    public constructor() {
        super();
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        this.sendEvent(new InitializedEvent());
    }

	protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
    }

    protected attachRequest(response: DebugProtocol.AttachResponse, args: AttachRequestArguments): void {
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body.threads = [new Thread(RubicDebugSession.THREAD_ID, RubicDebugSession.THREAD_NAME)];
        this.sendResponse(response);
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        // シリアル送信(stdinへ突っ込む)
        response.body = {
            result: "", variablesReference: 0
        }
        this.sendResponse(response);
    }
}

CustomDebugSession.run(RubicDebugSession);
