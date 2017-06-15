import * as fs from "fs";
import * as fse from "fs-extra";
import * as path from "path";
import * as pify from "pify";
import * as rimraf from "rimraf";

/**
 * Get user profile directory
 */
function getUserProfileDir(): string {
    switch (process.platform) {
        case "win32":
            return process.env.USERPROFILE;
        case "linux":
        case "darwin":
            return process.env.HOME;
    }
}

export module CacheStorage {
    const _baseDir = path.join(getUserProfileDir(), ".rubic", "cache");

    /** Get full path of cache file */
    export function getFullPath(filename: string): string {
        return path.join(_baseDir, filename);
    }

    /** Clear all files */
    export function clear(): Promise<void> {
        return pify(rimraf)(_baseDir);
    }

    /** writeFile */
    export function writeFile(filename: string, data: any): Promise<void> {
        let fullPath = getFullPath(filename);
        return pify(fse.ensureDir)(path.dirname(fullPath)).then(() => {
            return pify(fse.writeFile)(fullPath, data);
        });
    }

    /** readFile */
    export function readFile(filename: string, encoding: string = null): Promise<string|Buffer> {
        return pify(fse.readFile)(getFullPath(filename), encoding);
    }

    /** readFileSync */
    export function readFileSync(filename: string, encoding: string = null): string|Buffer {
        return fse.readFileSync(getFullPath(filename), encoding);
    }

    /** stat */
    export function stat(filename: string): Promise<fs.Stats> {
        return pify(fse.stat)(getFullPath(filename));
    }

    /** statSync */
    export function statSync(filename: string): fs.Stats {
        return fse.statSync(getFullPath(filename));
    }

    /** Check file existence */
    export function exists(filename: string): Promise<boolean> {
        return pify(fse.access)(getFullPath(filename)).then(
            () => { return true; },
            () => { return false; }
        );
    }

    /** Remove file */
    export function unlink(filename: string): Promise<void> {
        return pify(fse.unlink)(getFullPath(filename));
    }

    /** Watch file */
    export function watch(filename, options, listener): fse.FSWatcher {
        return fse.watch(getFullPath(filename), options, listener);
    }
}
