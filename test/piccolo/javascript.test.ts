import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import * as rimraf from "rimraf";
import * as path from "path";
import { findBoard } from "../board-finder";
// import * as delay from "delay";
require("promise.prototype.finally").shim();

suite("Piccolo online tests with JavaScript", function() {
    let workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    function setBoardPath(value: string): void {
        let rubicJson = path.join(workspaceRoot, ".vscode", "rubic.json");
        let obj = JSON.parse(fs.readFileSync(rubicJson, "utf8"));
        obj.hardware.boardPath = value;
        fs.writeFileSync(rubicJson, JSON.stringify(obj, null, 4), "utf8");
    }
    suiteSetup(function(done) {
        // Cleanup files
        rimraf(path.join(workspaceRoot, "*.mrb"), done);
    });
    suiteSetup(function(done) {
        // Search test port
        findBoard(0x0403, 0x6015, (err, boardPath) => {
            if (err) {
                return done(err);
            }
            setBoardPath(boardPath);
            done();
        });
    });
    suiteTeardown(function() {
        setBoardPath("");
    });
    test("Launch program", function(done) {
        this.timeout(0);
        vscode.debug.startDebugging(
            vscode.workspace.workspaceFolders[0], "Launch"
        ).then((value) => {
            if (!value) {
                return done(new Error("Failed to launch"));
            }
            assert(vscode.debug.activeDebugSession != null);
            let timeouts = 10;
            let timer = setInterval(() => {
                if (--timeouts <= 0) {
                    clearInterval(timer);
                    return done(new Error("Timed out"));
                }
                if (vscode.debug.activeDebugSession == null) {
                    clearInterval(timer);
                    done();
                }
            }, 1000);
        });
    });
});
