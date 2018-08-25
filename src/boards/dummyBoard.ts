import { Board, BoardCandidate } from "./board";
import { ProgressReporter } from "../extension";
import { CancellationToken } from "vscode";

/**
 * Dummy board for testing
 */
export class DummyBoard extends Board {
    /**
     * Get localized board name
     * @return Board name
     */
    static getBoardName(): string {
        return "Dummy board";
    }

    /**
     * Enumerate boards
     * @return A thenable that resolves to an array of scanned boards
     */
    static list(): Thenable<BoardCandidate[]> {
        return Promise.resolve([]);
    }

    /**
     * Construct board instance
     */
    constructor() {
        super();
    }

    connect(path: string): Thenable<void> {
        throw new Error("Method not implemented.");
    }

    disconnect(): Thenable<void> {
        throw new Error("Method not implemented.");
    }

    getInfo(): Thenable<import("d:/Works/VSCE/rubic-vscode/src/boards/board").BoardInformation> {
        throw new Error("Method not implemented.");
    }

    getStorageInfo(): Thenable<import("d:/Works/VSCE/rubic-vscode/src/boards/board").BoardStorageInfo[]> {
        throw new Error("Method not implemented.");
    }

    writeFile(filePath: string, data: Buffer, progress?: ProgressReporter, token?: CancellationToken): Thenable<void> {
        throw new Error("Method not implemented.");
    }

}

Board.addConstructor(DummyBoard);
