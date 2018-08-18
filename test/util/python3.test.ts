import * as python3 from "../../src/util/python3";
import * as chai from "chai";
const { assert } = chai;

describe("python3.repr", function() {
    it("is a function with 1 argument", function() {
        assert.isFunction(python3.repr);
        assert.strictEqual(python3.repr.length, 1);
    });
    it("can convert interger number to int", function() {
        assert.strictEqual(python3.repr(12345), "12345");
    });
    it("can convert float number to float", function() {
        assert.strictEqual(python3.repr(1234.5), "1234.5");
    });
    it("can convert string to str", function() {
        assert.strictEqual(python3.repr("12345"), "'12345'");
    });
    it("can convert string to str with escape", function() {
        assert.strictEqual(
            python3.repr("\x00\tfoo\rbar\n\"'\x7f"),
            "'\\x00\\tfoo\\rbar\\n\"\\'\\x7f'"
        );
    });
    it("can convert Array to list", function() {
        assert.strictEqual(
            python3.repr([12345, 1234.5, "foo"]),
            "[12345, 1234.5, 'foo']"
        );
    });
});

describe("python3.evaluate", function() {
    it("is a function with 1 argument", function() {
        assert.isFunction(python3.eval_);
        assert.strictEqual(python3.eval_.length, 1);
    });
    it("can convert int to integer number", function() {
        assert.strictEqual(python3.eval_("12345"), 12345);
    });
    it("can convert float to float number", function() {
        assert.strictEqual(python3.eval_("1234.5"), 1234.5);
    });
    it("can convert str to string", function() {
        assert.strictEqual(python3.eval_("'12345'"), "12345");
    });
    it("fails conversion of non-terminated string", function() {
        assert.throws(() => python3.eval_("'12345"), TypeError);
    });
    it("fails conversion of illegally escaped string", function() {
        assert.throws(() => python3.eval_("'\\q'"), TypeError);
    });
    it("can convert list to Array", function() {
        assert.deepEqual(python3.eval_("[ 123, 4.5,6\n,'abc' ]"), [123, 4.5, 6, "abc"]);
    });
    it("can convert string list to Array", function() {
        assert.deepEqual(python3.eval_("['abc','def']"), ["abc", "def"]);
    });
    it("can convert nested list to Array", function() {
        assert.deepEqual(python3.eval_("[[1,2, ],[ 4] ]"), [[1, 2], [4]]);
    });
});
