import { DebugSession, OutputEvent, TerminatedEvent } from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { RubicDebugProcess } from "../rubicDebugProcess";
import { SketchLoadResult } from "../sketch";
import { RubicProcess } from "../rubicProcess";
import { Board, BoardStdioStream, BoardInformation } from "../boards/board";
import * as nls from "vscode-nls";
import * as glob from "glob";
import * as pify from "pify";
import * as fs from "fs";
import * as path from "path";

const localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

const SEPARATOR_RUN  = `${"-".repeat(64)}`;
const SEPARATOR_STOP = `${"-".repeat(64)}`;

interface Disposable {
    dispose(): any;
}

interface BoardPathArguments {
    boardClass?: string;
    boardPath?: string;
}

interface RubicLaunchRequestArguments extends DebugProtocol.LaunchRequestArguments, BoardPathArguments {
    noTransfer?: boolean;
    program: string;
}

interface RubicAttachRequestArguments extends DebugProtocol.AttachRequestArguments {
}

interface GetInfoArguments extends BoardPathArguments {
}

interface WriteFirmwareArguments extends BoardPathArguments {
    fullPath: string;
}

/**
 * Debug session for Rubic
 */
class RubicDebugSession extends DebugSession {
    /** Board instance */
    private _board: Board;

    /** stdio */
    private _stdio: BoardStdioStream;

    /** Subscriptions for disposable object */
    public subscriptions: Disposable[] = [];

    /**
     * Execute normal program launch on board
     * @param response Response
     * @param args Arguments
     */
    protected launchRequest(response: DebugProtocol.LaunchResponse, args: RubicLaunchRequestArguments): void {
        this.subscriptions.push(new RubicDebugProcess(this, args));
        RubicProcess.self.sketch.load(false)
        .then((value) => {
            if (value !== SketchLoadResult.LOAD_SUCCESS) {
                throw new Error("Failed to load sketch");
            }
        })
        .then(() => {
            return this._constructBoard(args);
        })
        .then(() => {
            return this._connectBoard(args);
        })
        .then(() => {
            return this._transferFiles(args);
        })
        .then(() => {
            return this._startProgram(args);
        })
        .then(() => {
            this.sendResponse(response);
        }, (reason) => {
            this._report(`${reason}`);
            this.sendErrorResponse(response, 1001, `Failed to launch debugger: ${reason}`);
        });
    }

    /**
     * Execute special request from Rubic
     * @param response Response
     * @param args Arguments
     */
    protected attachRequest(response: DebugProtocol.AttachResponse, args: RubicAttachRequestArguments): void {
        this.subscriptions.push(new RubicDebugProcess(this, args));
        RubicProcess.self.sketch.load(false)
        .then((value) => {
            if (value !== SketchLoadResult.LOAD_SUCCESS) {
                throw new Error("Failed to load sketch");
            }
        })
        .then(() => {
            this.sendResponse(response);
        }, (reason) => {
            this.sendErrorResponse(response, 1002, `Failed to attach debugger: ${reason}`);
        });
    }

    /**
     * Process Rubic custom debug request
     * @param request Request name
     * @param args Arguments
     */
    rubicDebugRequest(request: string, args: any): Thenable<any> {
        switch (request) {
            case "board.getInfo":
                return this._getInfo(args);
            case "board.writeFirmware":
                return this._writeFirmware(args);
        }
        return Promise.reject(new Error(`Unknown rubic debug request: ${request}`));
    }

    /**
     * Shutdown debug session
     */
    shutdown() {
        // Dispose of subscribed objects
        let { subscriptions } = this;
        this.subscriptions = null;
        return (subscriptions || []).reduce((promise, obj) => {
            return promise
            .then(() => {
                return obj.dispose();
            })
            .catch(() => {});
        }, Promise.resolve())
        .then(() => {
            return DebugSession.prototype.shutdown.call(this);
        });
    }

    /**
     * Report message by sending OutputEvent
     * @param output Output message without newline
     */
    private _report(output: string): void {
        this.sendEvent(new OutputEvent(output + "\n"));
    }

    /**
     * Construct board instance
     * @param args Arguments passed as debug configuration
     */
    private _constructBoard(args: BoardPathArguments): Promise<void> {
        let { sketch } = RubicProcess.self;
        let boardClass = (args.boardClass != null) ? args.boardClass : sketch.boardClass;
        let constructor = Board.getConstructor(boardClass);
        return Promise.resolve()
        .then(() => {
            if (constructor == null) {
                throw new Error(`No board class named: ${boardClass}`);
            }
            this._board = new constructor();
            this.subscriptions.push(this._board);
        });
    }

    /**
     * Connect to board
     * @param args Arguments passed as debug configuration
     */
    private _connectBoard(args: BoardPathArguments): Promise<void> {
        let { sketch } = RubicProcess.self;
        let boardPath = (args.boardPath != null) ? args.boardPath : sketch.boardPath;
        this._report(localize(
            "connecting-board-x",
            "Connecting to board: {0} @ {1}",
            this._board.getBoardName(), boardPath
        ));
        return this._board.connect(boardPath);
    }

    /**
     * Disconnect from board
     */
    private _disconnectBoard(): Promise<void> {
        this._report(
            localize("disconnecting-board", "Disconnecting from board")
        );
        return this._board.disconnect();
    }

    /**
     * Transfer sketch files
     * @param args Arguments passed as debug configuration
     * @return Promise object which fulfills with number of transfered files (including skipped files)
     */
    private _transferFiles(args: RubicLaunchRequestArguments): Promise<number> {
        let { sketch, workspaceRoot } = RubicProcess.self;
        let includeGlob = sketch.transfer_include || [];
        let excludeGlob = sketch.transfer_exclude || [];
        let globOptions = { cwd: workspaceRoot };

        if (args.noTransfer) {
            return Promise.resolve(0);
        }

        return Promise.resolve()
        .then(() => {
            // Search files
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
                    return (toBeExcluded.indexOf(file) === -1);
                });
            });

            // Now, 'files' are array of file names (relative path from workspaceRoot)
            return files;
        })
        .then((files) => {
            let skipped = 0;
            return files.reduce((promise, file) => {
                return promise
                .then(() => {
                    this._report(
                        localize("writing-file-x", "Writing file: {0}", file)
                    );
                    return pify(fs.readFile)(path.join(workspaceRoot, file));
                })
                .then((newContent: Buffer) => {
                    return this._board.readFile(file)
                    .catch((reason) => {
                        // Ignore error on readback
                        return null;
                    })
                    .then((oldContent: Buffer) => {
                        return (oldContent && oldContent.equals(newContent));
                    })
                    .then((skip) => {
                        if (skip) {
                            ++skipped;
                        } else {
                            return this._board.writeFile(file, newContent);
                        }
                    });
                });
            }, Promise.resolve())
            .then(() => {
                let msg = localize("transfer-complete", "Transfer complete");
                if (skipped === 1) {
                    msg += " (" + localize("skipped-file-1", "Skipped {0} unchanged file", 1) + ")";
                } else if (skipped > 1) {
                    msg += " (" + localize("skipped-file-n", "Skipped {0} unchanged files", skipped) + ")";
                }
                this._report(msg);
                return files.length;
            });
        });
    }

    /**
     * Start program
     * @param args Arguments passed as debug configuration
     */
    private _startProgram(args: RubicLaunchRequestArguments): Promise<void> {
        let { workspaceRoot } = RubicProcess.self;
        let file = path.relative(workspaceRoot, args.program).replace(/\\/g, "/");
        this._report(
            localize("run-program-x", "Running program: {0}", file)
        );
        this._report(SEPARATOR_RUN);
        return Promise.resolve()
        .then(() => {
            this._board.once("stop", () => {
                this._report(SEPARATOR_STOP);
                this._report(
                    localize("program-ended", "Program ended")
                );
                this.sendEvent(new TerminatedEvent());
            });
            return this._board.runProgram(file);
        })
        .then(() => {
            return this._board.getStdioStream();
        })
        .then((stdio) => {
            this._stdio = stdio;
            if (stdio.stdout != null) {
                stdio.stdout.on("data", (chunk) => {
                    this.sendEvent(
                        new OutputEvent(chunk.toString(), "stdout")
                    );
                });
            }
            if (stdio.stderr != null) {
                stdio.stderr.on("data", (chunk) => {
                    this.sendEvent(
                        new OutputEvent(chunk.toString(), "stderr")
                    );
                });
            }
        });
    }

    /**
     * Get board info
     * @param args Arguments passed by custom request
     */
    private _getInfo(args: GetInfoArguments): Promise<BoardInformation> {
        return Promise.resolve()
        .then(() => {
            return this._constructBoard(args);
        })
        .then(() => {
            return this._connectBoard(args);
        })
        .then(() => {
            return this._board.getInfo();
        })
        .then((info) => {
            this._report(`${localize("pass-of-board", "Path of the board")} : ${info.path}`);
            if (info.serialNumber != null) {
                this._report(`${localize("serial-number", "Serial number")} : ${info.serialNumber}`);
            }
            if (info.repositoryUuid != null) {
                this._report(`${localize("repo-uuid", "UUID of repository")} : ${info.repositoryUuid}`);
            }
            if (info.release != null) {
                this._report(`${localize("tag-rel", "Tag name of release")} : ${info.release}`);
            }
            if (info.variation != null) {
                this._report(`${localize("name-variation", "Name of variation")} : ${info.variation}`);
            }
            if (info.firmwareId != null) {
                this._report(`${localize("firm-id", "ID of firmware")} : ${info.firmwareId}`);
            }
            return this._disconnectBoard()
            .then(() => info);
        });
    }

    private _writeFirmware(args: WriteFirmwareArguments): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            RubicProcess.self.withProgress({
                location: { Window: true },
                title: localize("writing-firmware", "Writing firmware")
            }, (progress) => {
                return Promise.resolve()
                .then(() => {
                    return this._constructBoard(args);
                })
                .then(() => {
                    return this._board.writeFirmware(args.fullPath, (message: string) => {
                        progress.report({ message });
                    });
                })
                .then(resolve, reject);
            });
        });
    }
}

DebugSession.run(RubicDebugSession);
