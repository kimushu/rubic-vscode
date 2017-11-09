import * as assert from "assert";
import * as vscode from "vscode";
import * as delay from "delay";
require("promise.prototype.finally").shim();

suite("Catalog tests", function() {

    test("Catalog can be opened by command", function() {
        let disposable: vscode.Disposable;
        return Promise.race([
            new Promise((resolve) => {
                disposable = vscode.workspace.onDidOpenTextDocument((document) => {
                    assert.equal(document.uri.toString(), "rubic://catalog");
                    resolve();
                });
                vscode.commands.executeCommand("extension.rubic.showCatalog");
            }),
            delay.reject(1000, new Error("Timed out"))
        ])
        .finally(() => {
            disposable.dispose();
        });
    });

});
