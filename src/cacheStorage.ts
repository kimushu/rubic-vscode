'use strict';

import * as fse from 'fs-extra';
import * as path from 'path';
import * as pify from 'pify';
import * as rimraf from 'rimraf';

export module CacheStorage {
    const _baseDir = path.join(__dirname, "..", "..", "cache");

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
        return pify(fse.ensureDir)(_baseDir).then(() => {
            return pify(fse.writeFile)(getFullPath(filename), data);
        });
    }

    /** readFile */
    export function readFile(filename: string, encoding: string = null): Promise<string|Buffer> {
        return pify(fse.readFile)(getFullPath(filename), encoding);
    }

    /** Check file existence */
    export function exists(filename: string): Promise<boolean> {
        return pify(fse.exists)(getFullPath(filename));
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
