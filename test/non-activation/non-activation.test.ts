import * as assert from "assert";
import * as vscode from "vscode";

suite("Non activation tests", function() {

    test("Rubic is detected", function() {
        const ext = vscode.extensions.getExtension("kimushu.rubic");
        assert(ext);
    });

    test("Rubic has *not* been automatically activated", function() {
        const ext = vscode.extensions.getExtension("kimushu.rubic");
        assert(!ext.isActive);
    });

});

suite("Manual activation tests", function() {

    test("Rubic can be activated by command", function() {
        this.timeout(10000);
        const ext = vscode.extensions.getExtension("kimushu.rubic");
        return vscode.commands.executeCommand("extension.rubic.showCatalog")
        .then(() => {
            assert(ext.isActive);
        });
    });

});
