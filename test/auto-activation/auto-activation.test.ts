import * as assert from "assert";
import * as vscode from "vscode";
import * as rimraf from "rimraf";
import * as path from "path";

suite("Auto activation tests", function() {

    let workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    let launchJson = path.join(workspaceRoot, ".vscode", "launch.json");

    suiteSetup(function(done) {
        rimraf(launchJson, done);
    });

    suiteTeardown(function(done) {
        rimraf(launchJson, done);
    });

    test("Rubic is detected", function() {
        const ext = vscode.extensions.getExtension("kimushu.rubic");
        assert(ext);
    });

    test("Rubic has been automatically activated by existence of rubic.json", function() {
        const ext = vscode.extensions.getExtension("kimushu.rubic");
        assert(ext.isActive);
    });

    test("Debug fails without hardware configuration", function() {
        this.timeout(0);
        return vscode.debug.startDebugging(vscode.workspace.workspaceFolders[0], <any>{ type: "rubic" })
        .then((succeeded) => {
            throw new Error("should be rejected");
        }, (reason) => {
            // OK
        });
    });
    
});
