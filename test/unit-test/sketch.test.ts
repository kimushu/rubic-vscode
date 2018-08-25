import { Sketch } from "../../src/sketch";
import * as chai from "chai";
import { Uri } from "vscode";
import * as path from "path";
const { assert } = chai;
chai.use(require("chai-as-promised"));

describe("Sketch", function() {
    it("is a function", function() {
        assert.isFunction(Sketch);
    });
    describe(".find()", function() {
        it("returns thenable object", function() {
            const thenable = Sketch.find({
                uri: Uri.file(path.join(__dirname, "non-existent")),
                name: "non-existent",
                index: 0,
            });
            assert.isFunction(thenable.then);
        });
        it("resolves to undefined for non-existent folder (createNew=false)", function() {
            return assert.isFulfilled(Sketch.find({
                uri: Uri.file(path.join(__dirname, "non-existent")),
                name: "non-existent",
                index: 0,
            }).then((sketch) => {
                assert.isUndefined(sketch);
            }));
        });
        it("resolves to a sketch with hasConfig=false for non-existent folder (createNew=true)", function() {
            return assert.isFulfilled(Sketch.find({
                uri: Uri.file(path.join(__dirname, "non-existent")),
                name: "non-existent",
                index: 0,
            }, true).then((sketch) => {
                assert.instanceOf(sketch, Sketch);
                assert.isFalse(sketch!.hasConfig);
                sketch!.dispose();
            }));
        });
    });
});
