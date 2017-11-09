import * as assert from "assert";
import * as vscode from "vscode";
import * as rubic from "../../src/extension";

suite("Auto activation tests", function() {

    test("Rubic is detected", function() {
        const ext = vscode.extensions.getExtension("kimushu.rubic");
        assert(ext);
    });

    test("Rubic has been automatically activated by existence of rubic.json", function() {
        const ext = vscode.extensions.getExtension("kimushu.rubic");
        assert(ext.isActive);
    });

});
