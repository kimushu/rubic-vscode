'use strict';

///<reference path="../schema/catalog.d.ts" />
import { CacheStorage } from './cacheStorage';
import { readGithubFile, GitHubRepository } from './githubFetcher';
import * as semver from 'semver';
import { RubicExtension } from "./extension";
import * as nls from 'vscode-nls';

import vscode = require("vscode");

const CATALOG_JSON = "catalog.json";
const CATALOG_ENCODING = "utf8";
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
            return (board.class === boardClass)
        });
    }

    /**
     * Lookup firmware definition from firmware's UUID
     * @param uuid UUID of firmware
     */
    getFirmware(uuid: string): RubicCatalog.RepositorySummary {
        if (!this._root) { return null; }
        for (let index = 0; index < this._root.boards.length; ++index) {
            let board = this._root.boards[index];
            let firmware = board.repositories.find((firmware) => {
                return (firmware.uuid === uuid);
            });
            if (firmware) { return firmware; }
        }
        return null;
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
