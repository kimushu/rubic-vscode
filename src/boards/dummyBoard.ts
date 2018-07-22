import { Board, BoardCandidate } from "./board";

/**
 * Dummy board for testing
 */
class DummyBoard extends Board {
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
    static list: () => Thenable<BoardCandidate[]>;

    /**
     * Construct board instance
     */
    constructor() {
        super();
    }

}

Board.addConstructor(DummyBoard);
