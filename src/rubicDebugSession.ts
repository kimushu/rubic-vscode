import {
    InitializedEvent,
    OutputEvent,
    TerminatedEvent,
    Thread,
    DebugSession
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { RubicBoard, BoardStdio } from "./rubicBoard";
import { BoardClassList } from "./boardClassList";
import * as path from 'path';
import * as glob from 'glob';
import { Writable } from "stream";
import { readFileSync, writeFileSync } from 'fs';
import { Sketch } from "./sketch";
import * as nls from 'vscode-nls';
const localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

const SEPARATOR_RUN  = "----------------------------------------------------------------";
const SEPARATOR_STOP = "----------------------------------------------------------------";

interface RubicRequestArguments {
    /** An absolute path to the workspace folder */
    workspaceRoot: string;
    /** Board ID */
    boardId: string;
    /** Board path */
    boardPath: string;
    /** Firmware ID */
    firmwareId?: string;
}

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments, RubicRequestArguments {
    /** An absolute path to the program to debug */
    program: string;
}

export interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments, RubicRequestArguments {
}

class RubicDebugSession extends DebugSession {
    private static THREAD_ID: number = 1;
    private static THREAD_NAME: string = "Main thread";
    private _board: RubicBoard;
    private _config: Sketch;
    private _stdin: Writable;

    public constructor() {
        super();
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        this.sendEvent(new InitializedEvent());
        this.sendResponse(response);
    }

	protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
        Promise.resolve(
        ).then(() => {
            //return Sketch.load(args.workspaceRoot);
            return <any>{};
        }).then((config) => {
            this._config = config;
            return this.connectBoard(args);
        }).then(() => {
            return this.transferFiles();
        }).then(() => {
            return this.startProgram(args);
        }).then(() => {
            this.sendResponse(response);
        }).catch((error) => {
            this.sendErrorResponse(response, <DebugProtocol.Message>{
                id: 1001,
                format: (error || "unknown error").toString()
            });
        });
    }

    protected attachRequest(response: DebugProtocol.AttachResponse, args: AttachRequestArguments): void {
        // TODO
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [
                new Thread(RubicDebugSession.THREAD_ID, RubicDebugSession.THREAD_NAME)
            ]
        };
        this.sendResponse(response);
    }

	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        response.body = {
            stackFrames: [],
            totalFrames: 0
        };
        this.sendResponse(response);
    }

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        response.body = {
            scopes: []
        };
        this.sendResponse(response);
    }

	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        response.body = {
            variables: []
        };
        this.sendResponse(response);
    }

/*
	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
		response.body = {
			result: `evaluate(context: '${args.context}', '${args.expression}')`,
			variablesReference: 0
		};
		this.sendResponse(response);
	}*/

    protected connectBoard(args: RubicRequestArguments): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            let boardId = args.boardId || this._config.boardClass;
            let boardPath = args.boardPath || this._config.boardPath;

            // Get board class constructor
            let boardClass = BoardClassList.getClass(boardId);
            if (!boardClass) {
                return;
            }

            // Disconnect board (if old instance exists)
            this._board && this._board.dispose();

            // Instantiate new board
            this._board = new boardClass(boardPath);

            // Register event handlers
            this._board.on("stop", this._handleBoardStop.bind(this));

            // Connect
            return this._board.connect();
        }); // Promise.resolve().then()
    }

    protected transferFiles(): Promise<number> {
        return Promise.resolve(
        ).then(() => {
            let includeGlob: string[] = this._config.transfer_include;
            let excludeGlob: string[] = this._config.transfer_exclude;

            let files: string[] = [];

            // Add files which match 'include' glob pattern
            includeGlob.forEach((pattern) => {
                let toBeIncluded: string[] = glob.sync(pattern, {cwd: this._config.workspaceRoot});
                files.push(...toBeIncluded);
            });

            // Then, remove files which match 'exclude' glob pattern
            excludeGlob.forEach((pattern) => {
                let toBeExcluded: string[] = glob.sync(pattern, {cwd: this._config.workspaceRoot});
                files = files.filter((file) => {
                    return (toBeExcluded.indexOf(file) == -1);
                });
            });

            // Now, 'files' are array of file names (relative path from workspaceRoot)

            if (files.length == 0) {
                this.sendEvent(new OutputEvent(
                    localize("no-file-to-transfer", "No file to transfer")
                ));
                return 0;
            }

            this.sendEvent(
                new OutputEvent(
                    (files.length == 1) ?
                        localize("start-transfer-1", "Start transfer {0} file", 1)
                    :   localize("start-transfer-n", "Start transfer {0} files", files.length)
            ));

            let skipped = 0;

            // Start file transfer
            return files.reduce(
                (promise, file) => {
                    let newContent: Buffer;
                    return promise.then(() => {
                        this.sendEvent(new OutputEvent(
                            localize("writing-file-x", "Writing file: {0}", file)
                        ));

                        // Read new file content
                        newContent = readFileSync(path.join(this._config.workspaceRoot, file));

                        // Start read back from board
                        return this._board.readFile(file).catch(() => {
                            // Ignore all errors during read back
                            return Promise.resolve(<Buffer>null);
                        });
                    }).then((oldContent?: Buffer) => {
                        if (oldContent && oldContent.equals(newContent)) {
                            ++skipped;
                            return; // File is already identical (Skip writing)
                        }
                        // Start write new content to board
                        return this._board.writeFile(file, newContent);
                    });
                }, Promise.resolve()
            ).then(() => {
                let msg = localize("transfer-complete", "Transfer complete");
                if (skipped == 1) {
                    msg += " (" + localize("skipped-file-1", "Skipped {0} unchanged file", 1) + ")";
                } else if (skipped > 1) {
                    msg += " (" + localize("skipped-file-n", "Skipped {0} unchanged files", skipped) + ")";
                }
                this.sendEvent(new OutputEvent(msg));
                return files.length;
            }); // return files.reduce().then()
        }); // Promise.resolve().then()
    }

    protected startProgram(args: LaunchRequestArguments): Promise<void> {
        let file = path.relative(this._config.workspaceRoot, args.program);
        this.sendEvent(new OutputEvent(
            localize("run-program-x", "Run program: {0}", file)
        ));
        this.sendEvent(new OutputEvent(SEPARATOR_RUN));
        return this._board.runSketch(file).then(() => {
            return this._board.getStdio();
        }).then(({stdin, stderr, stdout}) => {
            this._stdin = stdin;
            stdout && stdout.on("data", this._handleOutputData.bind(this, "stdout"));
            stderr && stderr.on("data", this._handleOutputData.bind(this, "stderr"));
        });
    }

    private _handleOutputData(category: "stdout"|"stderr", chunk: Buffer): void {
        this.sendEvent(new OutputEvent(chunk.toString(), category));
    }

    private _handleBoardStop(): void {
        this.sendEvent(new OutputEvent(SEPARATOR_STOP));
        this.sendEvent(new OutputEvent(
            localize("program-ended", "Program ended")
        ));
        this.sendEvent(new TerminatedEvent());
    }
}

import * as vscode from 'vscode';
vscode.window.showInformationMessage("test");
//CustomDebugSession.run(RubicDebugSession);
