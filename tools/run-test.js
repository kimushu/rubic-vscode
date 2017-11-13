const path = require("path");
const rootDir = path.normalize(path.join(__dirname, ".."));
const tester = path.join(rootDir, "node_modules", "vscode", "bin", "test");
const cp = require("child_process");
let tests = process.argv.slice(2);
let failed = 0;

tests.forEach((test) => {
    let [ testName, wsName ] = test.split("@", 2);
    if (wsName == null) {
        wsName = testName;
    }
    let testRoot = path.join(rootDir, "out", "test", testName);
    let workspace = path.join(rootDir, "test", "workspace", wsName);
    console.log("#".repeat(100));
    console.log(`# [${test}] Started at ${new Date().toString()}`);
    console.log("");
    let cmd = (process.platform === "win32") ? "node" : "env";
    let args = [tester];
    if (process.platform !== "win32") {
        args.unshift("node");
    }
    let result = cp.spawnSync(cmd, args, {
        env: {
            CODE_TESTS_PATH: testRoot,
            CODE_TESTS_WORKSPACE: workspace
        },
        stdio: "inherit"
    });
    console.log(`# [${test}] Finished at ${new Date().toString()} (result=${result.status})`);
    if (result.status !== 0) {
        console.error(`# ${result.error}`);
        console.info(result.env);
        ++failed;
    }
    console.log("");
});

if (failed > 0) {
    process.exitCode = 1;
}
