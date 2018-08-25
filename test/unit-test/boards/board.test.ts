import { Board } from "../../../src/boards/board";
import * as chai from "chai";
const { assert } = chai;

describe("Board", function() {
    describe(".addConstructor()", function() {
        it("is a function with 1 argument", function() {
            assert.isFunction(Board.addConstructor);
            assert.strictEqual(Board.addConstructor.length, 1);
        });
    });
    describe(".getConstructor()", function() {
        it("is a function with 1 argument", function() {
            assert.isFunction(Board.getConstructor);
            assert.strictEqual(Board.getConstructor.length, 1);
        });
        it("returns undefined when non-existent name is given", function() {
            assert.isUndefined(Board.getConstructor("NotExistentBoard"));
        });
        it("returns Board constructor when existent name is given", function() {
            const value = Board.getConstructor("DummyBoard")!;
            assert.isFunction(value);
            assert.isFunction(value.list);
            assert.isFunction(value.getBoardName);
        });
    });
    it("is a function", function() {
        assert.isFunction(Board);
    });
});
