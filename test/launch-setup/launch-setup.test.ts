import * as assert from "assert";
import * as vscode from "vscode";
import * as rimraf from "rimraf";
import * as path from "path";
import * as fs from "fs";
import * as CJSON from "comment-json";

suite("launch.json setup test", function() {

    let workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    let launchJson = path.join(workspaceRoot, ".vscode", "launch.json");

    suiteSetup(function(done) {
        rimraf(launchJson, done);
    });

    suiteTeardown(function(done) {
        rimraf(launchJson, done);
    });

    test("launch.json can be created by Rubic at the first debug", function() {
        this.timeout(10000);
        return vscode.debug.startDebugging(vscode.workspace.workspaceFolders[0], <any>{ type: "rubic" })
        .then((succeeded) => {
            assert(succeeded);
            let json = CJSON.parse(fs.readFileSync(launchJson, "utf8"));
            assert.strictEqual(json.configurations.length, 1);
            assert.strictEqual(json.configurations[0].type, "rubic");
            assert.strictEqual(json.configurations[0].request, "launch");
            assert.strictEqual(json.configurations[0].name, "Launch");
        });
    });

});
