import * as fs from "fs";
import * as fse from "fs-extra";
import * as path from "path";
import * as pify from "pify";
import * as rimraf from "rimraf";
import { rubicTestContext, vscode } from "../extension";
import { AssertionError } from "assert";

/**
 * Get user profile directory
 */
function getUserProfileDir(): string {
    switch (process.platform) {
    case "win32":
        return <string>process.env.USERPROFILE;
    case "linux":
    case "darwin":
        return <string>process.env.HOME;
    }
    throw new AssertionError();
}

let baseDirCache: string;

/**
 * Get cache base directory
 */
function getBaseDir(): string {
    if (baseDirCache == null) {
        baseDirCache = (rubicTestContext && rubicTestContext.cacheDir) ||
            path.join(getUserProfileDir(), ".rubic", "cache");
    }
    return baseDirCache;
}

export module CacheStorage {

    /** Get full path of cache file */
    export function getFullPath(filename: string): string {
        return path.join(getBaseDir(), filename);
    }

    /** Clear all files */
    export function clear(): Thenable<void> {
        return pify(rimraf)(getBaseDir());
    }

    /** writeFile */
    export function writeFile(filename: string, data: any): Thenable<void> {
        let fullPath = getFullPath(filename);
        return pify(fse.ensureDir)(path.dirname(fullPath)).then(() => {
            return pify(fse.writeFile)(fullPath, data);
        });
    }

    /** readFile */
    export function readFile(filename: string, encoding?: string): Thenable<string|Buffer> {
        return pify(fse.readFile)(getFullPath(filename), encoding);
    }

    /** readFileSync */
    export function readFileSync(filename: string, encoding?: string): string|Buffer {
        return fse.readFileSync(getFullPath(filename), encoding);
    }

    /** stat */
    export function stat(filename: string): Thenable<fs.Stats> {
        return pify(fse.stat)(getFullPath(filename));
    }

    /** statSync */
    export function statSync(filename: string): fs.Stats {
        return fse.statSync(getFullPath(filename));
    }

    /** Check file existence */
    export function exists(filename: string): boolean {
        return fse.existsSync(getFullPath(filename));
    }

    /** Remove file */
    export function unlink(filename: string): Thenable<void> {
        return pify(fse.unlink)(getFullPath(filename));
    }

    /** Watch file */
    export function watch(filename, options, listener): fse.FSWatcher {
        return fse.watch(getFullPath(filename), options, listener);
    }
}
