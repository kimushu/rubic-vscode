import * as fs from "fs";
import * as fse from "fs-extra";
import * as path from "path";
import * as rimraf from "rimraf";
import { rubicTestContext, vscode } from "../extension";
import { AssertionError } from "assert";
import { promisify } from "util";

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
        return promisify(rimraf)(getBaseDir());
    }

    /** writeFile */
    export function writeFile(filename: string, data: any): Thenable<void> {
        let fullPath = getFullPath(filename);
        return promisify(fse.ensureDir)(path.dirname(fullPath))
        .then(() => {
            return promisify(fse.writeFile as any)(fullPath, data);
        });
    }

    /** readFile */
    export function readFile(filename: string, encoding?: string): Thenable<string|Buffer> {
        return promisify(fse.readFile as any)(getFullPath(filename), encoding);
    }

    /** readFileSync */
    export function readFileSync(filename: string, encoding?: string): string|Buffer {
        return fse.readFileSync(getFullPath(filename), encoding);
    }

    /** stat */
    export function stat(filename: string): Thenable<fs.Stats> {
        return promisify(fse.stat)(getFullPath(filename));
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
        return promisify(fse.unlink)(getFullPath(filename))
        .then(() => {});
    }

    /** Watch file */
    export function watch(filename, options, listener): fse.FSWatcher {
        return fse.watch(getFullPath(filename), options, listener);
    }
}
