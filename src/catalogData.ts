'use strict';

///<reference path="../schema/catalog.d.ts" />
import { CacheStorage } from './cacheStorage';
import { readGithubFile, GitHubRepository } from './githubFetcher';
import * as semver from 'semver';
import { RubicExtension } from "./extension";
import * as nls from 'vscode-nls';
import * as path from 'path';
import * as pify from 'pify';
import * as request from 'request';
import * as decompress from 'decompress';

import vscode = require("vscode");

const CATALOG_JSON = "catalog.json";
const CATALOG_ENCODING = "utf8";
const RELEASE_JSON  = "release.json";

const OFFICIAL_CATALOG: GitHubRepository = {
    owner: "kimushu",
    repo: "rubic-catalog",
    branch: "vscode-master"
};

let localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

const LOCALE: string = JSON.parse(process.env.VSCODE_NLS_CONFIG).locale;

export function toLocalizedString(ls: RubicCatalog.LocalizedString): string {
    if (ls == null) { return <any>ls; }
    let result = ls[LOCALE];
    if (result != null) { return result; }
    result = ls.en;
    if (result != null) { return result; }
    return (<any>ls).toString();
}

export class CatalogData implements vscode.Disposable {
    private _root: RubicCatalog.Root;

    /** Construct instance */
    constructor() {
    }

    /** Dispose this instance */
    dispose() {
        this._root = null;
    }

    /** Check if catalog data is loaded */
    get loaded() { return (this._root != null); }

    /** Get list of boards */
    get boards() { return (this._root && this._root.boards) || []; }

    /** Get last modified date */
    get lastModified() { return this._root && new Date(this._root.lastModified); }

    /**
     * Lookup board definition from board class name
     * @param boardClass Class name of board
     */
    getBoard(boardClass: string): RubicCatalog.Board {
        if (!this._root) { return null; }
        return this._root.boards.find((board: RubicCatalog.Board) => {
            return (board.class === boardClass);
        });
    }

    /**
     * Lookup repository definition from repository's UUID
     * @param uuid UUID of repository
     */
    getRepository(uuid: string): RubicCatalog.RepositorySummary {
        if (!this._root) { return null; }
        for (let index = 0; index < this._root.boards.length; ++index) {
            let board = this._root.boards[index];
            let repo = board.repositories.find((repo) => {
                return (repo.uuid === uuid);
            });
            if (repo) { return repo; }
        }
        return null;
    }

    /**
     * Lookup release definition from repository's UUID and release tag
     * @param repositoryUuid UUID of repository
     * @param releaseTag Tag name of release
     */
    getRelease(repositoryUuid: string, releaseTag: string): RubicCatalog.ReleaseSummary {
        let repo = this.getRepository(repositoryUuid);
        if (!repo || !repo.cache || !repo.cache.releases) { return null; }
        return repo.cache.releases.find((rel) => rel.tag === releaseTag);
    }

    /**
     * Get/download cached directory (relative path in CacheStorage)
     */
    getCacheDir(repositoryUuid: string, releaseTag: string, download: boolean = true): Promise<string> {
        let rel = this.getRelease(repositoryUuid, releaseTag);
        let dirPath = path.join(repositoryUuid, releaseTag);
        return CacheStorage.exists(path.join(dirPath, RELEASE_JSON)).then((exists) => {
            if (exists) { return dirPath; }
            if (!download) { return null; }
            return Promise.resolve(
            ).then(() => {
                return pify(request)({url: rel.url, encoding: null});
            }).then((resp) => {
                return decompress(resp.body, CacheStorage.getFullPath(dirPath));
            }).then(() => {
                return dirPath;
            })
        });
    }

    /**
     * Load catalog data from cache
     */
    load(): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            return CacheStorage.readFile(CATALOG_JSON, CATALOG_ENCODING);
        }).then((jsonText: string) => {
            return JSON.parse(jsonText);
        }).then((root: RubicCatalog.Root) => {
            return this.import(root)
        });
    }

    /**
     * Update catalog data
     */
    update(repo: GitHubRepository = OFFICIAL_CATALOG): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            return readGithubFile(repo, CATALOG_JSON, CATALOG_ENCODING);
        }).then((jsonText: string) => {
            return JSON.parse(jsonText)
        }).then((root: RubicCatalog.Root) => {
            return this.import(root);
        }).then(() => {
            return this.store();
        });
    }

    /**
     * Import catalog
     * @param root Root definition
     */
    import(root: RubicCatalog.Root): Promise<void> {
        if (!semver.satisfies(RubicExtension.version, root.rubicVersion)) {
            return Promise.reject(Error(localize(
                "rubic-is-too-old",
                "Rubic is too old. Please update Rubic extension"
            )));
        }
        this._root = root;
        return Promise.resolve();
    }

    /**
     * Save catalog to cache
     */
    store(): Promise<void> {
        if (!this._root) {
            return Promise.reject(
                Error("Catalog is not loaded")
            );
        }
        return CacheStorage.writeFile(
            CATALOG_JSON,
            Buffer.from(JSON.stringify(this._root), CATALOG_ENCODING)
        );
    }
}
