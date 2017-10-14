/*
 * Prebuilt binary downloader for node-serialport
 */

const path = require("path");
const fs = require("fs-extra");
const pify = require("pify");
const download = require("download");
const decompress = require("decompress");

const BASE_URL = "https://github.com/EmergingTechnologyAdvisors/node-serialport/releases/download";
const ARCHS = ["darwin-x64", "linux-ia32", "linux-x64", "win32-ia32", "win32-x64"];

const SP_VERSION = require(path.join(__dirname, "..", "package.json")).dependencies.serialport;
console.log(`serialport version: ${SP_VERSION}`);

const EL_VERSIONS = process.argv.slice(2);

const CACHE_DIR = path.join(__dirname, "prebuild-cache");
const PKG_DIR = path.join(__dirname, "..", "node_modules", "serialport");
const DEST_DIR = path.join(PKG_DIR, "compiled");

const ELECTRON_VERSION_MAP = {
    "1.6.6": {node: "7.4.0", modules: "53"},
    "1.7.3": {node: "7.9.0", modules: "54"},
};

EL_VERSIONS.reduce((promise, elVer) => {
    return promise
    .then(() => {
        let vers = ELECTRON_VERSION_MAP[elVer];
        if (vers == null) {
            return Promise.reject(new Error(`Version mappings not found for Electron v${elVer}`));
        }
        console.log(`- Electron v${elVer} => node: ${vers.node}, modules: ${vers.modules}`);
        return ARCHS.reduce((promise, arch) => {
            let fn = `serialport-v${SP_VERSION}-electron-v${vers.modules}-${arch}.tar.gz`;
            let fp = path.join(CACHE_DIR, fn);
            return promise
            .then(() => {
                if (fs.existsSync(fp)) {
                    // Already downloaded
                    return;
                }
                let url = `${BASE_URL}/v${SP_VERSION}/${fn}`;
                console.log(`  - Downloading ${url}`);
                return download(url, CACHE_DIR);
            })
            .then(() => {
                return decompress(fp);
            })
            .then((files) => {
                let file = files.find((f) => f.path === "build/Release/serialport.node");
                if (file == null) {
                    return Promise.reject(new Error(`Prebuild binary not found in ${fp}`));
                }
                let destDir = path.join(DEST_DIR, vers.node, ...arch.split("-"));
                let destFile = path.join(destDir, "serialport.node");
                fs.ensureDirSync(destDir);
                console.log(`  - Copying binary ${destFile} (${file.data.length} bytes)`);
                return pify(fs.writeFile)(destFile, file.data);
            });
        }, Promise.resolve());
    });
}, pify(fs.ensureDir)(CACHE_DIR))
.then(() => {
    let localBuild = path.join(PKG_DIR, "build", "Release", "serialport.node");
    if (fs.existsSync(localBuild)) {
        console.log(`- Removed local build binary ${localBuild}`);
        fs.removeSync(localBuild);
    }
});
