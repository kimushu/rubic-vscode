import { SystemComposition } from "../../../src/util/systemComposition";
import { DummyBoard } from "../../../src/boards/dummyBoard";
import * as chai from "chai";
const { assert } = chai;

describe("SystemComposition", function() {
    let instance: SystemComposition;
    beforeEach(function() {
        instance = new SystemComposition();
    });
    afterEach(function() {
        instance = undefined as any;
    });
    it("is a constructor function", function() {
        // checked in beforeEach()
    });
    it("has boardClassName property", function() {
        const value = "DummyBoard";
        assert.isUndefined(instance.boardClassName);
        assert.doesNotThrow(() => instance.boardClassName = value);
        assert.strictEqual(instance.boardClassName, value);
    });
    it("has repositoryUuid property", function() {
        const value = "DummyRepo";
        assert.isUndefined(instance.repositoryUuid);
        assert.doesNotThrow(() => instance.repositoryUuid = value);
        assert.strictEqual(instance.repositoryUuid, value);
    });
    it("has releaseTag property", function() {
        const value = "DummyTag";
        assert.isUndefined(instance.releaseTag);
        assert.doesNotThrow(() => instance.releaseTag = value);
        assert.strictEqual(instance.releaseTag, value);
    });
    it("has variationPath property", function() {
        const value = "DummyVariation";
        assert.isUndefined(instance.variationPath);
        assert.doesNotThrow(() => instance.variationPath = value);
        assert.strictEqual(instance.variationPath, value);
    });
    describe("boardClass property", function() {
        it("is read-only", function() {
            assert.throws(() => (instance as any).boardClass = DummyBoard);
        });
        it("has constructor function when valid name given", function() {
            instance.boardClassName = "DummyBoard";
            assert.strictEqual(instance.boardClass, DummyBoard);
        });
        it("is undefined when no name given", function() {
            assert.isUndefined(instance.boardClass);
        });
        it("is undefined when invalid name given", function() {
            instance.boardClassName = "NonExistentBoard";
            assert.isUndefined(instance.boardClass);
        });
    });
    describe("isFixed property", function() {
        it("is read-only", function() {
            assert.throws(() => (instance as any).isFixed = false);
        });
        it("is false when any property is undefined", function() {
            assert.isFalse(instance.isFixed);
            instance.boardClassName = "DummyBoard";
            assert.isFalse(instance.isFixed);
            instance.repositoryUuid = "DummyRepo";
            assert.isFalse(instance.isFixed);
            instance.releaseTag = "DummyTag";
            assert.isFalse(instance.isFixed);
        });
        it("is true only when all properties are not undefined", function() {
            instance.boardClassName = "DummyBoard";
            instance.repositoryUuid = "DummyRepo";
            instance.releaseTag = "DummyTag";
            instance.variationPath = "DummyPath";
            assert.isTrue(instance.isFixed);
        });
    });
    describe("compare()", function() {
        it("returns false when any property is different", function() {
            ["boardClassName", "repositoryUuid", "releaseTag", "variationPath"].forEach((key) => {
                const another = new SystemComposition();
                another[key] = `Dummy-${key}`;
                assert.isFalse(instance.compare(another));
            });
        });
        it("returns true when all property is the same", function() {
            const another = new SystemComposition();
            assert.isTrue(instance.compare(another));
            another.boardClassName = instance.boardClassName = "DummyBoard";
            assert.isTrue(instance.compare(another));
            another.repositoryUuid = instance.repositoryUuid = "DummyRepo";
            assert.isTrue(instance.compare(another));
            another.releaseTag = instance.releaseTag = "DummyTag";
            assert.isTrue(instance.compare(another));
            another.variationPath = instance.variationPath = "DummyPath";
            assert.isTrue(instance.compare(another));
        });
    });
});
