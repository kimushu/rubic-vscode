///<reference path="../../node_modules/@rubic/catalog-fetcher/lib/catalog.d.ts" />
import { CacheStorage } from "../util/cacheStorage";
import { readGithubFile, GitHubRepository } from "../util/githubFetcher";
import * as semver from "semver";
import * as nls from "vscode-nls";
import * as path from "path";
import * as request from "request";
import * as decompress from "decompress";

import vscode = require("vscode");
import { RubicProcess } from "../processes/rubicProcess";

const localize = nls.loadMessageBundle(__filename);

const UPDATE_PERIOD_MINUTES = 12 * 60;

const CATALOG_JSON = "catalog.json";
const CATALOG_ENCODING = "utf8";
const RELEASE_JSON  = "release.json";

const OFFICIAL_CATALOG_REPO: GitHubRepository = {
    owner: "kimushu",
    repo: "rubic-catalog",
    branch: "vscode-master"
};

const DUMMY_CATALOG: RubicCatalog.Board = {
    class: "DummyBoard",
    name: { en: "Dummy board" },
    description: { en: "Dummy board for offline tests" },
    icon: null,
    author: { en: "nobody" },
    website: null,
    topics: [],
    repositories: [
        {
            host: null,
            owner: "nobody",
            repo: "dummy-repo1",
            uuid: "32d64356-cb50-493b-b3a9-cc55d066a8a6",
            cache: {
                name: { en: "dummy-repo1" },
                description: { en: "Dummy repository" },
                releases: [
                    {
                        name: "dummy-release1",
                        tag: "dummy-tag1",
                        description: "Dummy release tag 1",
                        published_at: 0,
                        updated_at: 0,
                        author: "nobody",
                        url: null,
                        cache: {
                            variations: [
                                {
                                    path: "dummy-variation1",
                                    name: { en: "Dummy variation 1" },
                                    description: { en: "Dummy variation 1 description" },
                                    runtimes: [
                                        {
                                            name: "mruby"
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                ]
            }
        }
    ],
    disabled: true
};

interface CatalogRootOverlay {
    __custom__?: boolean;
}

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

    /** Check if catalog data is from custom repository */
    get custom() { return (this._root && !!(<CatalogRootOverlay>this._root).__custom__); }

    /** Get list of boards */
    get boards() { return (this._root && this._root.boards) || []; }

    /** Get last modified date */
    get lastModified() { return this._root && new Date(this._root.lastModified); }

    /**
     * Lookup board definition from board class name
     * @param boardClass Class name of board
     */
    getBoard(boardClass: string): RubicCatalog.Board {
        if (this._root == null || boardClass == null) { return null; }
        if (boardClass === DUMMY_CATALOG.class) {
            return DUMMY_CATALOG;
        }
        return this._root.boards.find((board: RubicCatalog.Board) => {
            return (board.class === boardClass);
        });
    }

    /**
     * Lookup repository definition from repository's UUID
     * @param uuid UUID of repository
     */
    getRepository(uuid: string): RubicCatalog.RepositorySummary {
        if (this._root == null || uuid == null) { return null; }
        for (let catalog of [[DUMMY_CATALOG], this._root.boards]) {
            for (let board of catalog) {
                let repo = board.repositories.find((repo) => {
                    return (repo.uuid === uuid);
                });
                if (repo) { return repo; }
            }
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
    prepareCacheDir(repositoryUuid: string, releaseTag: string, download: boolean = true): Promise<string> {
        let rel = this.getRelease(repositoryUuid, releaseTag);
        let dirPath = path.join(repositoryUuid, releaseTag);
        return CacheStorage.exists(path.join(dirPath, RELEASE_JSON)).then((exists) => {
            if (exists) { return dirPath; }
            if (!download) { return null; }
            return new Promise<void>((resolve, reject) => {
                RubicProcess.self.withProgress({
                    location: {Window: true},
                    title: localize("download-firm", "Downloading firmware"),
                }, (progress) => {
                    return new Promise<request.RequestResponse>((resolve, reject) => {
                        let ended: number = 0;
                        let total: number = NaN;
                        let req = request({uri: rel.url, encoding: null}, (err, resp) => {
                            if (err != null) {
                                return reject(err);
                            }
                            return resolve(resp);
                        });
                        req.on("response", (resp) => {
                            total = parseInt(<string>resp.headers["content-length"]);
                        });
                        req.on("data", (chunk) => {
                            ended += chunk.length;

                            let message = `${(ended / 1024).toFixed()}`;
                            if (!isNaN(total)) {
                                message += `/${(total / 1024).toFixed()}`;
                            }
                            message += "kB";
                            progress.report({message});
                        });
                    }).then((resp) => {
                        progress.report({message: localize("decompressing", "Decompressing")});
                        return decompress(resp.body, CacheStorage.getFullPath(dirPath));
                    }).then(resolve, reject);
                });
            })
            .then(() => {
                return dirPath;
            });
        });
    }

    /**
     * Lookup variation definition
     */
    getVariation(repositoryUuid: string, releaseTag: string, variationPath: string): RubicCatalog.Variation {
        let rel = this.getRelease(repositoryUuid, releaseTag);
        if (rel && rel.cache) {
            return rel.cache.variations.find((v) => v.path === variationPath);
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
            return this.import(root);
        });
    }

    /**
     * Update catalog data
     */
    fetch(force: boolean = false): Promise<boolean> {
        let nextFetch: number;
        return Promise.resolve()
        .then(() => {
            return RubicProcess.self.getMementoValue("lastFetched", 0);
        })
        .then((lastFetched) => {
            nextFetch = lastFetched + (UPDATE_PERIOD_MINUTES * 60 * 1000);
            // Load cache
            if (!this.loaded) {
                return this.load();
            }
        })
        .then(() => {
            if (!force && Date.now() < nextFetch) {
                // Skip update
                console.log(`Rubic catalog update has been skipped (by ${new Date(nextFetch).toLocaleString()})`);
                return false;
            }
            // Too old. Try update
            throw null;
        })
        .catch((reason) => {
            // Reject reason is one of them
            //   1. Cache is not readable
            //   2. Cache is not valid JSON
            //   3. Cache is too old
            return this._doFetch().then(() => {
                return RubicProcess.self.setMementoValue("lastFetched", Date.now());
            })
            .then(() => {
                console.log(`Rubic catalog has been updated (force=${force})`);
                return true;
            });
        });
    }

    /**
     * Update catalog data (inner)
     */
    private _doFetch(): Promise<void> {
        let isCustomRepo = false;
        return Promise.resolve()
        .then(() => {
            return RubicProcess.self.getRubicSetting("catalog");
        })
        .then(({owner, repo, branch}) => {
            if (owner != null && repo != null) {
                isCustomRepo = true;
                return {owner, repo, branch: branch || "master"};
            }
            return OFFICIAL_CATALOG_REPO;
        })
        .then((repo) => {
            return new Promise((resolve, reject) => {
                RubicProcess.self.withProgress(
                    {
                        location: {Window: true},
                        title: localize("download-catalog", "Downloading catalog")
                    },
                    () => {
                        return readGithubFile(repo, CATALOG_JSON, CATALOG_ENCODING)
                        .then(resolve, reject);
                    }
                );
            });
        }).then((jsonText: string) => {
            return JSON.parse(jsonText);
        }).then((root: RubicCatalog.Root) => {
            if (isCustomRepo) {
                (<CatalogRootOverlay>root).__custom__ = true;
            }
            return this.import(root);
        }).then(() => {
            return this.store();
        });
    }

    /**
     * Import catalog
     * @param root Root definition
     * @param isCustomRepo Whether the definition is from custom repository
     */
    import(root: RubicCatalog.Root): Promise<void> {
        if (!semver.satisfies(RubicProcess.self.version, root.rubicVersion)) {
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
