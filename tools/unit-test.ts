import * as path from "path";
import { spawn } from "child_process";

const rootDir = path.normalize(path.join(__dirname, "..", ".."));
const execSuffix = (process.platform === "win32") ? ".exe" : "";
const executable = path.join(rootDir, ".vscode-test", "stable", `Code${execSuffix}`);

const result = spawn(executable,
    [
        "./node_modules/mocha/bin/mocha",
        "--colors",
        "--exit",
        "--require", "mocha-steps",
        "./out/test/unit-test/**/*.test.js",
    ], {
        cwd: rootDir,
        env: {
            ELECTRON_RUN_AS_NODE: "1",
            NODE_PATH: path.join(rootDir, "out", "test", "stubs"),
            VSCODE_NLS_CONFIG: JSON.stringify({locale: "en"}),
        },
        stdio: "pipe",
    }
);
result.stdin.end();
result.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
});
result.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
});
result.on("exit", (code) => {
    process.exitCode = code;
});
