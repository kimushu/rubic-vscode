// vscode-nls should be configured before loading all other modules
import * as nls from "vscode-nls";
const localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

import { DebugSession, Event, OutputEvent, TerminatedEvent } from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { RubicDebugProcess } from "../processes/rubicDebugProcess";
import { SketchLoadResult } from "../sketch";
import { RubicProcess } from "../processes/rubicProcess";
import { Board, BoardStdioStream, BoardInformation, BoardDebugStream } from "../boards/board";
import * as glob from "glob";
import * as pify from "pify";
import * as fs from "fs";
import * as path from "path";
import * as net from "net";

const SEPARATOR_RUN  = `${"-".repeat(64)}`;
const SEPARATOR_STOP = `${"-".repeat(64)}`;

interface Disposable {
    dispose(): any;
}

interface BoardDataArguments {
    boardData?: any;
}

interface BoardPathArguments {
    boardClass?: string;
    boardPath?: string;
}

interface RubicLaunchRequestArguments extends DebugProtocol.LaunchRequestArguments, BoardPathArguments, BoardDataArguments {
    noTransfer?: boolean;
    format?: boolean;
    program: string;
    debugPort?: number;
}

interface RubicAttachRequestArguments extends DebugProtocol.AttachRequestArguments, BoardDataArguments {
}

interface GetInfoArguments extends BoardPathArguments {
}

interface WriteFirmwareArguments extends BoardPathArguments {
    fullPath: string;
}

interface HostRequestQueue {
    [id: string]: {
        resolve: (value: any) => void;
        reject: (reason: any) => void;
    };
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

    /** Server for external debugger */
    private _debugServer: net.Server;

    /** Resolver for debug stream */
    private _debugStreamResolver: (s: BoardDebugStream) => void;

    /** Sent host requests (with response) */
    private _hostRequests: HostRequestQueue = {};

    /**
     * Execute normal program launch on board
     * @param response Response
     * @param args Arguments
     */
    protected launchRequest(response: DebugProtocol.LaunchResponse, args: RubicLaunchRequestArguments): void {
        this.subscriptions.push(new RubicDebugProcess(this, args));

        if (!args.noDebug && args.debugPort != null) {
            let promise = new Promise<BoardDebugStream>((resolve, reject) => {
                this._debugStreamResolver = resolve;
            });
            this._debugServer = net.createServer((socket) => {
                console.log(`External debugger attached (${socket.remoteAddress}:${socket.remotePort} -> ${socket.localAddress}:${socket.localPort}`);
                promise.then((s) => {
                    console.log("Connected pipe between external debugger and board");
                    socket.pipe(s.tx);
                    s.rx.pipe(socket);
                });
            });
            this._debugServer.listen(args.debugPort);
            this.subscriptions.push({
                dispose: () => this._debugServer.close()
            });
        }
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
     * Stop programs
     * @param response Response
     * @param args Arguments
     */
    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {
        Promise.resolve()
        .then(() => {
            return this._stopProgram();
        })
        .finally(() => {
            return this._disconnectBoard();
        })
        .then(() => {
            this.sendResponse(response);
        }, (reason) => {
            this.sendErrorResponse(response, 1003, `Failed to stop program: ${reason}`);
        });
    }

    /**
     * Receiver for custom request
     * @param command Event name
     * @param response Response
     * @param args Arguments
     */
    protected customRequest(command: string, response: DebugProtocol.Response, args: any): void {
        response.command = command;
        switch (command) {
            case "host.response":
                // Event response from HostProcess
                let { id, result, reason } = args;
                let req = this._hostRequests[id];
                if (req != null) {
                    delete this._hostRequests[id];
                    if (reason != null) {
                        req.reject(reason);
                    } else {
                        req.resolve(result);
                    }
                }
                this.sendResponse(response);
                return;
            case "stop":
                // Stop debug session
                this.sendResponse(response);
                this.sendEvent(new TerminatedEvent());
                return;
        } 

        // Process custom debug requests
        this.rubicDebugRequest(command, args)
        .then((result) => {
            response.body = { result };
            this.sendResponse(response);
        }, (reason) => {
            response.body = { reason: `${reason}` };
            this.sendResponse(response);
        });
    }

    /**
     * Send custom request to host process
     * @param request Request name
     * @param args Arguments
     * @param withResponse Wait response (if false, returned promise will soon resolved with undefined)
     */
    sendHostRequest(request: string, args: any, withResponse: boolean): Thenable<any> {
        let id: string;
        let promise: Promise<any>;
        if (withResponse) {
            id = Math.random().toString(16).substr(2);
            promise = new Promise((resolve, reject) => {
                this._hostRequests[id] = { resolve, reject };
            });
        } else {
            promise = Promise.resolve();
        }
        this.sendEvent(new Event("host.request", { id, request, args }));
        return promise;
    }

    /**
     * Process Rubic custom debug request
     * @param request Request name
     * @param args Arguments
     */
    protected rubicDebugRequest(request: string, args: any): Thenable<any> {
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
    shutdown(): void {
        // Dispose of subscribed objects
        let { subscriptions } = this;
        this.subscriptions = null;
        (subscriptions || []).reduce((promise, obj) => {
            return promise
            .then(() => {
                return obj.dispose();
            })
            .catch(() => {});
        }, Promise.resolve());
        return DebugSession.prototype.shutdown.call(this);
    }

    /**
     * Report message by sending OutputEvent
     * @param output Output message without newline
     * @param noNewLine Omit new line code
     */
    private _report(output: string, noNewLine?: boolean): void {
        this.sendEvent(new OutputEvent(output + (noNewLine ? "" : "\n")));
    }

    /**
     * Construct board instance
     * @param args Arguments passed as debug configuration
     */
    private _constructBoard(args: BoardPathArguments & BoardDataArguments): Promise<void> {
        let { sketch } = RubicProcess.self;
        let boardClass = (args.boardClass != null) ? args.boardClass : sketch.boardClass;
        let constructor = Board.getConstructor(boardClass);
        return Promise.resolve()
        .then(() => {
            if (constructor == null) {
                throw new Error(`No board class named: ${boardClass}`);
            }
            this._board = new constructor();
            this._board.boardData = args.boardData || {};
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
        if (this._board.isConnected) {
            this._report(
                localize("disconnecting-board", "Disconnecting from board")
            );
        }
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
            if (args.format) {
                // Format storage
                this._report(
                    localize("formatting-storage", "Formatting internal storage of the board")
                );
                return this._board.formatStorage();
            }
        })
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
                        localize("writing-file-x", "Writing file: {0}", file) + " ",
                        true
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
                            return this._board.writeFile(
                                file, newContent,
                                (message) => this._report(message, true)
                            );
                        }
                    });
                })
                .finally(() => {
                    // Print newline
                    this._report("");
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
            this._board.once("stop", (force, result) => {
                this._report(SEPARATOR_STOP);
                this._report(
                    force ?
                    localize("program-forcedly-stopped", "Program forcedly stopped") :
                    localize("program-ended", "Program ended") + (result != null ? ` ${result}` : "")
                );
                this.sendEvent(new TerminatedEvent());
            });
            return this._board.runProgram(file);
        })
        .then(() => {
            if (this._debugStreamResolver == null) {
                return;
            }
            return this._board.getDebugStream()
            .then((debugStream) => {
                this._debugStreamResolver(debugStream);
            });
        })
        .then(() => {
            return this._board.getStdioStream();
        })
        .then((stdio) => {
            this._stdio = stdio;
            this._watchStdio();
        });
    }

    /**
     * Start watching for stdio
     */
    private _watchStdio(): void {
        if (this._stdio == null) {
            return;
        }
        if (this._stdio.stdout != null) {
            this._stdio.stdout.on("data", (chunk) => {
                this.sendEvent(
                    new OutputEvent(chunk.toString(), "stdout")
                );
            });
        }
        if (this._stdio.stderr != null) {
            this._stdio.stderr.on("data", (chunk) => {
                this.sendEvent(
                    new OutputEvent(chunk.toString(), "stderr")
                );
            });
        }
    }

    /**
     * Stop program
     */
    private _stopProgram(): Promise<void> {
        return Promise.resolve()
        .then(() => {
            return this._board.stopProgram();
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

    /**
     * Write firmware
     * @param args Arguments passed by custom request
     */
    private _writeFirmware(args: WriteFirmwareArguments): Promise<boolean> {
        let followInstMessage = `${localize(
            "follow-inst",
            "Please follow instructions showed on the top of window"
        )} $(arrow-up)`;
        return Promise.resolve(RubicProcess.self.withProgress({
            location: { Window: true },
            title: localize("firmware-update", "Firmware update")
        }, (progress) => {
            return Promise.resolve()
            .then(() => {
                return this._constructBoard(args);
            })
            .then(() => {
                return this._board.writeFirmware(args.fullPath, args.boardPath, (message?: string) => {
                    if (message == null) {
                        message = followInstMessage;
                    }
                    progress.report({ message });
                });
            });
        }));
    }
}

DebugSession.run(RubicDebugSession);
