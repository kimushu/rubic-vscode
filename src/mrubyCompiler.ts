import { compile } from "mruby-native";
import { readFile, writeFile } from "fs";
import * as pify from "pify";
import * as path from "path";
import * as glob from "glob";

const CONFIG_FILE = "mrbconfig.json";
const DUMP_EXT = ".dump";

export async function compileMrubySources(workspaceRoot: string, errorPrinter?: (string) => void): Promise<void> {
    let content;
    try {
        content = await pify(readFile)(path.join(workspaceRoot, CONFIG_FILE));
    } catch(error) {
        content = "{}";
    }

    let cfg = JSON.parse(content) || {};
    let compilerOptions = cfg.compilerOptions || {debug: true};
    let include = cfg.include || ["*.rb"];
    let exclude = cfg.exclude || [];
    let globOptions = {
        cwd: workspaceRoot
    };
    let allFiles: string[] = [];
    for (let i = 0; i < include.length; ++i) {
        let files: string = await pify(glob)(include[i], globOptions);
        allFiles = allFiles.concat(files);
    }
    for (let i = 0; i < exclude.length; ++i) {
        let files: string[] = await pify(glob)(exclude[i], globOptions);
        allFiles = allFiles.filter((file) => {
            return (files.indexOf(file) < 0);
        });
    }
    compilerOptions.cwd = workspaceRoot;
    for (let i = 0; i < allFiles.length; ++i) {
        let stdout = await new Promise((resolve, reject) => {
            compile(allFiles[i], compilerOptions, (error, stdout, stderr) => {
                if (errorPrinter) {
                    errorPrinter(stderr);
                }
                if (error) {
                    return reject(error);
                }
                return resolve(stdout);
            });
        });
        if (compilerOptions.verbose) {
            let dump = path.parse(allFiles[i]);
            dump.ext = DUMP_EXT;
            await pify(writeFile)(path.format(dump), stdout);
        }
    }
}
