import { EventEmitter } from "events";
import * as stream from "stream";

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
    /** Path of the board */
    path: string;
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

export interface BoardStdioStream {
    /** stdin (PC -> board) */
    stdin?: stream.Writable;
    /** stdout (board -> PC) */
    stdout: stream.Readable;
    /** stderr (board -> PC) */
    stderr?: stream.Readable;
}

export interface BoardDebugStream {
    tx: stream.Writable;
    rx: stream.Readable;
}

export interface BoardConstructor {
    /**
     * Enumerate boards
     */
    list: () => Promise<BoardCandidate[]>;

    /**
     * Get localized board name
     */
    getBoardName: () => string;

    /**
     * Constructor
     */
    new (FIXME_path?: string): Board;
}

export class Board extends EventEmitter {
    private static _classes: {[className: string]: BoardConstructor} = {};

    protected constructor(FIXME_path?: string) {
        super();
    }

    /**
     * Register board class
     */
    static addConstructor(constructor: BoardConstructor) {
        this._classes[constructor.name] = constructor;
    }

    /**
     * Get constructor of Board
     */
    static getConstructor(className: string): BoardConstructor {
        return this._classes[className];
    }

    /**
     * Enumerate boards
     * @return An array of scanned boards
     */
    static enumerateBoards(): Promise<BoardCandidate[]> {
        return Promise.reject(new Error("Not implemented"));
    }

    /**
     * Get localized board name
     * @return Board name
     */
    static getBoardName(): string {
        throw new Error("Not implemented");
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
    dispose() {
        return this.disconnect()
        .catch(() => {})
        .then(() => {
            this.removeAllListeners();
        });
    }

    /**
     * Connect to board
     * @param path Path of the board
     */
    connect(path: string): Promise<void> {
        return Promise.reject(new Error("Not implemented"));
    }

    /**
     * Disconnect from board
     */
    disconnect(): Promise<void> {
        return Promise.reject(new Error("Not implemented"));
    }

    /**
     * Get board information
     */
    getInfo(): Promise<BoardInformation> {
        return Promise.reject(new Error("Not implemented"));
    }

    /**
     * Write file
     * @param relativePath Relative path of the file to be stored
     * @param data Data to write
     */
    writeFile(relativePath: string, data: Buffer): Promise<void> {
        return Promise.reject(new Error("Not implemented"));
    }

    /**
     * Read file
     * @param relativePath Relative path of the file to be read
     * @return Read data
     */
    readFile(relativePath: string): Promise<Buffer> {
        return Promise.reject(new Error("Not supported"));
    }

    /**
     * Enumerate files
     * @param relativePath Relative path of directory
     * @return An array of relative path of found files
     */
    enumerateFiles(relativePath: string): Promise<string[]> {
        return Promise.reject(new Error("Not supported"));
    }

    /** Format internal storage */
    formatStorage(): Promise<void> {
        return Promise.reject(new Error("Not supported"));
    }

    /**
     * Program firmware
     */
    writeFirmware(filename: string, reporter: (message: string) => void): Promise<void> {
        return Promise.reject(new Error("Not supported"));
    }

    /**
     * Run program
     * @param relativePath Relative path of the file to be executed
     */
    runProgram(relativePath: string): Promise<void> {
        return Promise.reject(new Error("Not supported"));
    }

    /**
     * Get program running state
     */
    isRunning(): Promise<boolean> {
        return Promise.reject(new Error("Not supported"));
    }

    /**
     * Stop program
     */
    stopProgram(): Promise<void> {
        return Promise.reject(new Error("Not supported"));
    }

    /**
     * Get standard I/O streams
     */
    getStdioStream(): Promise<BoardStdioStream> {
        return Promise.reject(new Error("Not supported"));
    }

    /**
     * Get debug streams
     */
    getDebugStream(): Promise<BoardDebugStream> {
        return Promise.reject(new Error("Not supported"));
    }

    /**
     * Reset board
     */
    reset(): Promise<void> {
        return Promise.reject(new Error("Not supported"));
    }

    /**
     * Get auto start program setting
     */
    getAutoStartProgram(): Promise<string> {
        return Promise.reject(new Error("Not supported"));
    }

    /**
     * Set auto start program setting
     * @param relativePath Relative path of the file to be executed
     */
    setAutoStartProgram(relativePath: string): Promise<void> {
        return Promise.reject(new Error("Not supported"));
    }
}

require("./peridotClassicBoard");
require("./peridotPiccoloBoard");
require("./wakayamaRbBoard");
require("./grCitrusBoard");
