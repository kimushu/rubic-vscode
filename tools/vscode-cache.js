const download = require("download");
const fs = require("fs-extra");
const pify = require("pify");
const rimraf = require("rimraf");
const path = require("path");

const CACHE_DIR = ".vscode-test";
const VER_CACHED = path.join(CACHE_DIR, "__version__");
const VER_LATEST = path.join("tmp", "__latest__");

if (process.argv.indexOf("--latest") >= 0) {
    const downloadPlatform = (process.platform === 'darwin') ? 'darwin' : process.platform === 'win32' ? 'win32-archive' : 'linux-x64';
    download(`https://vscode-update.azurewebsites.net/api/releases/stable/${downloadPlatform}`)
    .then((buffer) => {
        let versions = JSON.parse(buffer.toString());
        let latest = versions[0];
        let cached;
        console.log(`[INFO] Latest VSCode version: ${latest}`);
        fs.ensureFileSync(VER_LATEST);
        fs.writeFileSync(VER_LATEST, latest, "utf8");
        try {
            cached = fs.readFileSync(VER_CACHED, "utf8");
        } catch (error) {
        }
        if (latest !== cached) {
            console.log(`[INFO] Invalidating old VSCode cache (${cached || "unknown"})`);
            return pify(rimraf)(CACHE_DIR);
        }
    });
} else if (process.argv.indexOf("--mark") >= 0) {
    let latest = fs.readFileSync(VER_LATEST, "utf8");
    fs.writeFileSync(VER_CACHED, latest, "utf8");
}
