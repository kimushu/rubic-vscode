import {
    InitializedEvent,
    OutputEvent,
    TerminatedEvent,
    Thread,
    DebugSession
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { RubicBoard, BoardStdio, BoardInformation } from "./rubicBoard";
import { BoardClassList } from "./boardClassList";
import * as path from 'path';
import * as glob from 'glob';
import * as pify from 'pify';
import { Writable } from "stream";
import { readFile, writeFile } from 'fs';
import { Sketch } from "./sketch";
import * as nls from 'vscode-nls';
import { InteractiveDebugSession } from "./interactiveDebugSession";

const localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

const SEPARATOR_RUN  = "----------------------------------------------------------------\n";
const SEPARATOR_STOP = "----------------------------------------------------------------\n";

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

class RubicDebugSession extends InteractiveDebugSession {
    private static THREAD_ID: number = 1;
    private static THREAD_NAME: string = "Main thread";
    private _attachMode: boolean;
    private _board: RubicBoard;
    private _sketch: Sketch;
    private _stdin: Writable;

    public constructor() {
        super();
        this._attachMode = false;
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        this.log("initializeRequest()", args);
        this.sendEvent(new InitializedEvent());
        this.sendResponse(response);
    }

	protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
        this.log("launchRequest()", args);
        Promise.resolve(
        ).then(() => {
            this._sketch = new Sketch(args.workspaceRoot);
            return this._sketch.load(false);
        }).then((sketch) => {
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

    protected attachRequest(response: DebugProtocol.AttachResponse, args: DebugProtocol.AttachRequestArguments): void {
        this.log("attachRequest()", args);
        this._attachMode = true;
        this.sendResponse(response);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        this.log("threadsRequest()");
        response.body = {
            threads: [
                new Thread(RubicDebugSession.THREAD_ID, RubicDebugSession.THREAD_NAME)
            ]
        };
        this.sendResponse(response);
    }

	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        this.log("stackTraceRequest()", args);
        response.body = {
            stackFrames: [],
            totalFrames: 0
        };
        this.sendResponse(response);
    }

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        this.log("scopesRequest()", args);
        response.body = {
            scopes: []
        };
        this.sendResponse(response);
    }

	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        this.log("variablesRequest()", args);
        response.body = {
            variables: []
        };
        this.sendResponse(response);
    }

/*
	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        this.log("evaluateRequest()", args);
		response.body = {
			result: `evaluate(context: '${args.context}', '${args.expression}')`,
			variablesReference: 0
		};
		this.sendResponse(response);
	}*/

    protected interactiveRequest(command: string, args: any): Thenable<any> {
        switch (command) {
            case "writeFirmware":
                return this._writeFirmware(args.boardClass, args.boardPath, args.filename);
            case "getInfo":
                return this._getBoardInfo(args.boardClass, args.boardPath, args.printOutput);
            default:
                this.sendEvent(new TerminatedEvent());
                return Promise.reject(Error("Unknown interactive request"));
        }
    }

    protected connectBoard(args: RubicRequestArguments): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            let boardId = args.boardId || this._sketch.boardClass;
            let boardPath = args.boardPath || this._sketch.boardPath;

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

    /**
     * Get information of the board
     * @param boardClassName Class name of the board
     * @param boardPath Path of the board
     * @param printOutput If true, print output to Debug console
     */
    private async _getBoardInfo(boardClassName: string, boardPath: string, printOutput: boolean): Promise<BoardInformation> {
        let boardClass = BoardClassList.getClass(boardClassName);
        let board = new boardClass(boardPath);
        try {
            if (printOutput) {
                this.sendEvent(new OutputEvent(localize(
                    "conn-test-start",
                    "Starting connection test"
                ) + ` (${new Date().toLocaleString()})\n`));
                this.sendEvent(new OutputEvent(SEPARATOR_RUN));
            }
            await board.connect();
            let info = await board.getInfo();

            if (printOutput) {
                let msg = "";
                msg += `${localize("path-of-board", "Path of board")} : ${info.path}\n`
                if (info.serialNumber != null) {
                    msg += `${localize("serialnumber", "Serial number")} : ${info.serialNumber}\n`;
                }
                if (info.repositoryUuid != null) {
                    msg += `${localize("repo-uuid", "UUID of repository")} : ${info.repositoryUuid}\n`;
                }
                if (info.release != null) {
                    msg += `${localize("tag-rel", "Tag name of release")} : ${info.release}\n`;
                }
                if (info.variation != null) {
                    msg += `${localize("name-variation", "Name of variation")} : ${info.variation}\n`;
                }
                if (info.firmwareId != null) {
                    msg += `${localize("firm-id", "ID of firmware")} : ${info.firmwareId}\n`;
                }
                this.sendEvent(new OutputEvent(msg));
            }
            return info;
        } catch (error) {
            if (printOutput) {
                this.sendEvent(new OutputEvent(`${error.stack || error.toString()}\n`));
            }
            throw error;
        } finally {
            board.disconnect().catch(() => null);
            this.sendEvent(new OutputEvent(SEPARATOR_STOP));
            this.sendEvent(new TerminatedEvent());
        }
    }

    /**
     * Write firmware to the board
     * @param boardClassName Class name of the board
     * @param boardPath Path of the board
     * @param filename Filename of firmware
     */
    private async _writeFirmware(boardClassName: string, boardPath: string, filename: string): Promise<void> {
        let boardClass = BoardClassList.getClass(boardClassName);
        let board = new boardClass(boardPath);
        try {
            await board.writeFirmware(this, filename);
        } finally {
            this.sendEvent(new TerminatedEvent());
        }
    }

    protected async transferFiles(): Promise<number> {
        let includeGlob: string[] = this._sketch.transfer_include || [];
        let excludeGlob: string[] = this._sketch.transfer_exclude || [];
        let globOptions = {cwd: this._sketch.workspaceRoot};
        let files: string[] = [];

        // Add files which match 'include' glob pattern
        includeGlob.forEach((pattern) => {
            let toBeIncluded: string[] = glob.sync(pattern, globOptions);
            files.push(...toBeIncluded);
        });

        // Then, remove files which match 'exclude' glob pattern
        excludeGlob.forEach((pattern) => {
            let toBeExcluded: string[] = glob.sync(pattern, globOptions);
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
                ((files.length == 1) ?
                    localize("start-transfer-1", "Start transfer {0} file", 1)
                :   localize("start-transfer-n", "Start transfer {0} files", files.length)) + "\n"
        ));

        let skipped = 0;

        // Start file transfer
        for (let index = 0; index < files.length; ++index) {
            let file = files[index];

            this.sendEvent(new OutputEvent(
                localize("writing-file-x", "Writing file: {0}", file) + "\n"
            ));

            // Read new file content
            let newContent: Buffer = await pify(readFile)(path.join(this._sketch.workspaceRoot, file));
            let oldContent: Buffer;

            // Start read back from board
            try {
                oldContent = await this._board.readFile(file);
            } catch (error) {
                // Ignore all errors during read back
                oldContent = null;
            }

            if (oldContent && oldContent.equals(newContent)) {
                ++skipped;
                break; // File is already identical (Skip writing)
            }

            // Start write new content to board
            await this._board.writeFile(file, newContent);
        }

        let msg = localize("transfer-complete", "Transfer complete");
        if (skipped == 1) {
            msg += " (" + localize("skipped-file-1", "Skipped {0} unchanged file", 1) + ")\n";
        } else if (skipped > 1) {
            msg += " (" + localize("skipped-file-n", "Skipped {0} unchanged files", skipped) + ")\n";
        }
        this.sendEvent(new OutputEvent(msg));
        return files.length;
    }

    protected startProgram(args: LaunchRequestArguments): Promise<void> {
        let file = path.relative(this._sketch.workspaceRoot, args.program);
        this.sendEvent(new OutputEvent(
            localize("run-program-x", "Run program: {0}", file) + "\n"
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

DebugSession.run(RubicDebugSession);
