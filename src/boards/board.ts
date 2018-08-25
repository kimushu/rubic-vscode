import * as stream from "stream";
import { ProgressReporter } from "../extension";
import { AssertionError } from "assert";
import { NotSupportedError } from "../util/errors";
import { Digest } from "../util/digest";
import { CancellationToken, Disposable, Event, EventEmitter } from "vscode";

export interface BoardCandidate {
    /** Board class name */
    boardClass: string;
    /** name of the board */
    name: string;
    /** path of the board */
    path: string;
    /** Vendor ID */
    vendorId?: number;
    /** Product ID */
    productId?: number;
    /** Unsupported */
    unsupported?: boolean;
}

export interface BoardInformation {
    /** Serial number */
    serialNumber?: string;
    /** UUID of the repository */
    repositoryUuid?: string;
    /** Name of release */
    release?: string;
    /** Path of variation */
    variation?: string;
    /** ID of the firmware */
    firmwareId?: string;
}

export interface BoardStorageInfo {
    /** Localized name */
    localizedName: string;
    /** Mount point path */
    mountPoint: string;
    /** Is external storage (Add-on board, SD-card etc.) */
    external?: boolean;
    /** Is read-only storage */
    readOnly?: boolean;
}

export interface BoardResult {
    /** Exit code */
    code?: number;

    /** Error object */
    error?: Error;
}

export interface BoardStdioStream {
    /** A stream for stdin (PC -> board) */
    readonly stdin?: stream.Writable;

    /** A stream for stdout (board -> PC) */
    readonly stdout: stream.Readable;

    /** A stream for stderr (board -> PC) */
    readonly stderr?: stream.Readable;
}

export interface BoardDebugStream {
    tx: stream.Writable;
    rx: stream.Readable;
}

export interface BoardConstructor {
    /**
     * Enumerate boards
     * @return A thenable that resolves to an array of scanned boards
     */
    list: () => Thenable<BoardCandidate[]>;

    /**
     * Get localized board name
     * @return Board name
     */
    getBoardName: () => string;

    /**
     * Construct board instance
     */
    new (): Board;
}

/**
 * Abstract board class
 */
export abstract class Board implements Disposable {
    private static _classes: {[className: string]: BoardConstructor} = {};

    /**
     * Register board class
     * @param constructor Constructor function of the board to be registered
     */
    static addConstructor(constructor: BoardConstructor) {
        this._classes[constructor.name] = constructor;
    }

    /**
     * Get constructor of Board
     * @param className The name of board class
     */
    static getConstructor(className: string): BoardConstructor | undefined {
        return this._classes[className];
    }

    /** The auxiliary data to be passed to the board (board specific) */
    public boardData: any;

    /** Current path */
    protected _path?: string;

    /** Disconnect event */
    protected _onDidDisconnect = new EventEmitter<void>();

    /**
     * Construct board instance
     */
    protected constructor() {
        this.boardData = undefined;
    }

    /**
     * Get localizes board name (instance method version)
     * @return Board name
     */
    getBoardName(): string {
        return (<BoardConstructor>this.constructor).getBoardName();
    }

    /**
     * Dispose object
     */
    dispose(): void {
        if (this.isConnected) {
            this.disconnect();
        }
    }

    /**
     * Get board path
     */
    get path(): string | undefined {
        return this._path;
    }

    /**
     * Connect to board
     * @param path Path of the board
     */
    abstract connect(path: string): Thenable<void>;

    /**
     * Check if the board is connected or not
     */
    get isConnected(): boolean {
        throw new AssertionError();
    }

    /**
     * An event to signal a board has been disconnected.
     */
    get onDidDisconnect(): Event<void> { return this._onDidDisconnect.event; }

    /**
     * Disconnect from board
     */
    abstract disconnect(): Thenable<void>;

    /**
     * Get board information
     * @return A thenable that resolves to board information
     */
    abstract getInfo(): Thenable<BoardInformation>;

    /**
     * Get storage information
     * @return A thenable that resolves to array of storage information
     */
    abstract getStorageInfo(): Thenable<BoardStorageInfo[]>;

    /**
     * Write file
     * @param filePath Full path of the file to be written
     * @param data Data to write
     * @param progress Object for progress reporting
     * @param token A cancellation token
     */
    abstract writeFile(filePath: string, data: Buffer, progress?: ProgressReporter, token?: CancellationToken): Thenable<void>;

    /**
     * Read file
     * @param filePath Full path of the file to be read
     * @param progress Object for progress reporting
     * @param token A cancellation token
     * @return A thenable that resolves to read data
     */
    readFile(filePath: string, progress?: ProgressReporter, token?: CancellationToken): Thenable<Buffer> {
        return Promise.reject(new NotSupportedError());
    }

    /**
     * Read file digest
     * @param filePath Full path of the file to be read
     * @param token A cancellation token
     * @return A thenable that resolves to digest information
     */
    readFileDigest(filePath: string, token?: CancellationToken): Thenable<Digest> {
        return this.readFile(filePath)
        .then((buffer) => {
            return new Digest(buffer);
        });
    }

    /**
     * Enumerate files
     * @param dirPath Full path of directory (Wildcards not accepted)
     * @param recursive Set true to search recursively
     * @param token A cancellation token
     * @return A thenable that resolves to an array of full path of files found
     */
    enumerateFiles(dirPath: string, recursive?: boolean, token?: CancellationToken): Thenable<string[]> {
        return Promise.reject(new NotSupportedError());
    }

    /**
     * Remove file
     * @param filePath Full path of the file to be read
     */
    removeFile(filePath: string): Thenable<void> {
        return Promise.reject(new NotSupportedError());
    }

    /**
     * Format storage
     * @param mountPoint Full path of mount point (directory) to be formatted
     */
    formatStorage(mountPoint: string): Thenable<void> {
        return Promise.reject(new NotSupportedError());
    }

    /**
     * Program firmware
     * @param buffer Firmware data
     * @param reporter Object for progress reporting
     * @return A thenable that resolves to boolean value
     *         (true: succeeded, false: aborted by user)
     */
    writeFirmware(buffer: Buffer, progress?: ProgressReporter): Thenable<boolean> {
        return Promise.reject(new NotSupportedError());
    }

    /**
     * Start program
     * @param filePath A full path of the file to be executed
     */
    startProgram(filePath: string): Thenable<void> {
        return Promise.reject(new NotSupportedError());
    }

    /**
     * Check if a program is running or not
     */
    get isRunning(): boolean {
        throw new NotSupportedError();
    }

    /**
     * An event to signal a program has been finished.
     */
    get onDidFinish(): Event<BoardResult> { throw new NotSupportedError(); }

    /**
     * Abort program
     * @param code A code passed to onDidFinished event
     */
    abortProgram(code?: number): Thenable<void> {
        return Promise.reject(new NotSupportedError());
    }

    /**
     * Get standard I/O streams
     */
    getStdioStream(): Thenable<BoardStdioStream> {
        return Promise.reject(new NotSupportedError());
    }

    /**
     * Get debug streams
     */
    getDebugStream(): Thenable<BoardDebugStream> {
        return Promise.reject(new NotSupportedError());
    }

    /**
     * Reset board
     */
    reset(): Thenable<void> {
        return Promise.reject(new NotSupportedError());
    }

    /**
     * Get boot program setting
     */
    getBootProgramPath(): Thenable<string> {
        return Promise.reject(new NotSupportedError());
    }

    /**
     * Set boot program setting
     * @param filePath A full path of the file to be executed
     */
    setBootProgramPath(filePath: string): Thenable<void> {
        return Promise.reject(new NotSupportedError());
    }
}

require("./dummyBoard");
// require("./peridotPiccoloBoard");
require("./wakayamaRbBoard");
require("./grCitrusBoard");
require("./pyBoard");
require("./m5stack");
