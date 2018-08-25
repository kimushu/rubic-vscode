import { Digest } from "../../../src/util/digest";
import * as chai from "chai";
const { assert } = chai;

describe("Digest", function() {
    it("is a function", function() {
        assert.isFunction(Digest);
    });
    describe("with default algorithm", function() {
        it("uses md5", function() {
            assert.strictEqual(new Digest(Buffer.alloc(0)).algorithm, "md5");
        });
    });
    [
        ["md5", "d41d8cd98f00b204e9800998ecf8427e", "900150983cd24fb0d6963f7d28e17f72"],
        ["sha1", "da39a3ee5e6b4b0d3255bfef95601890afd80709", "a9993e364706816aba3e25717850c26c9cd0d89d"],
        ["crc32", "00000000", "352441c2"],
    ].forEach(([algorithm, expect_empty, expect_abc]) => {
        describe(`with ${algorithm} algorithm`, function() {
            it("has correct algorithm", function() {
                const instance = new Digest(Buffer.alloc(0), algorithm as any);
                assert.strictEqual(instance.algorithm, algorithm);
            });
            it("has correct value for empty data", function() {
                const instance = new Digest(Buffer.alloc(0), algorithm as any);
                assert.strictEqual(instance.value, expect_empty);
            });
            it("has correct value for \"abc\"", function() {
                const instance = new Digest(Buffer.from("abc"), algorithm as any);
                assert.strictEqual(instance.value, expect_abc);
            });
        });
    });
    describe(".prototype.match()", function () {
        it("is a function with 1 argument", function() {
            assert.isFunction(Digest.prototype.match);
            assert.strictEqual(Digest.prototype.match.length, 1);
        });
        it("returns false when it has different value (digest vs digest)", function () {
            const instance1 = new Digest(Buffer.alloc(0));
            const instance2 = new Digest(Buffer.alloc(1));
            assert.notStrictEqual(instance1.value, instance2.value);
            assert.strictEqual(instance1.match(instance2), false);
        });
        it("returns true when it has the same value (digest vs digest)", function () {
            const instance1 = new Digest(Buffer.alloc(0));
            const instance2 = new Digest(Buffer.alloc(0));
            assert.strictEqual(instance1.value, instance2.value);
            assert.strictEqual(instance1.match(instance2), true);
        });
        it("returns false when it has different value (digest vs Buffer)", function () {
            const instance1 = new Digest(Buffer.alloc(0));
            assert.strictEqual(instance1.match(Buffer.alloc(1)), false);
        });
        it("returns true when it has the same value (digest vs Buffer)", function () {
            const instance1 = new Digest(Buffer.alloc(0));
            assert.strictEqual(instance1.match(Buffer.alloc(0)), true);
        });
        it("raises when different algorithm used", function() {
            assert.throws(() => {
                const instance1 = new Digest(Buffer.alloc(0), "md5");
                const instance2 = new Digest(Buffer.alloc(0), "sha1");
                instance1.match(instance2);
            });
        });
    });
});
