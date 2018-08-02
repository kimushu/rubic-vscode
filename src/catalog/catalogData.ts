///<reference path="../../node_modules/@rubic/catalog-fetcher/lib/catalog.d.ts" />
import { CacheStorage } from "../util/cacheStorage";
import { readGithubFile, GitHubRepository } from "../util/githubFetcher";
import * as semver from "semver";
import * as nls from "vscode-nls";
import * as path from "path";
import * as request from "request";
import * as decompress from "decompress";
import { Disposable, EventEmitter } from "vscode";
import { extensionContext, vscode, RUBIC_VERSION, ProgressReporter } from "../extension";

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
    icon: undefined,
    author: { en: "nobody" },
    website: undefined,
    topics: [],
    repositories: [{
        host: "github",
        owner: "kimushu",
        repo: "dummy-repo1",
        uuid: "32d64356-cb50-493b-b3a9-cc55d066a8a6",
        cache: {
            name: { en: "dummy-repo1" },
            description: { en: "Dummy repository" },
            releases: [{
                name: "dummy-release1",
                tag: "dummy-tag1",
                description: "Dummy release tag 1",
                published_at: 0,
                updated_at: 0,
                author: "nobody",
                url: "http://0.0.0.0/dummy",
                cache: {
                    variations: [{
                        path: "dummy-variation1",
                        name: { en: "Dummy variation 1" },
                        description: { en: "Dummy variation 1 description" },
                        runtimes: [{
                            name: "mruby"
                        }],
                    }],
                },
            }],
        },
    }],
    disabled: true,
};

interface CatalogRootCustom {
    __custom__?: boolean;
}

const LOCALE: string = JSON.parse(process.env.VSCODE_NLS_CONFIG!).locale;

export function toLocalizedString(ls: RubicCatalog.LocalizedString): string {
    if (ls == null) { return "(null)"; }
    let result: string = ls[LOCALE];
    if (result != null) { return result; }
    result = ls.en;
    if (result != null) { return result; }
    return (<any>ls).toString();
}

export class CatalogData implements Disposable {
    private static _instance?: CatalogData;
    private _onDidUpdate = new EventEmitter<CatalogData>();
    private _root: RubicCatalog.Root | null = null;
    private _boards: RubicCatalog.BoardV1[] | null = null;

    /**
     * Get singleton instance.
     */
    static get instance(): CatalogData {
        if (this._instance == null) {
            this._instance = new CatalogData();
        }
        return this._instance;
    }

    /**
     * An event to signal catalog data has been updated.
     */
    get onDidUpdate() { return this._onDidUpdate.event; }

    /**
     * Construct instance
     */
    private constructor() {
        extensionContext.subscriptions.push(this);
    }

    /** Dispose this instance */
    dispose() {
        this._root = null;
        this._boards = null;
    }

    /** Check if catalog data is loaded */
    get isLoaded() { return (this._root != null); }

    /** Check if catalog data is from custom repository */
    get isCustom() { return (!!this._root && !!(<CatalogRootCustom>this._root).__custom__); }

    /** Get list of boards */
    get boards() {
        if (this._root == null) {
            return [];
        }
        if (this._boards == null) {
            this._boards = (this._root.boardsV1 || []).concat();
            this._root.boards.forEach((board) => {
                if (!this._boards!.some((b) => b.class === board.class)) {
                    this._boards!.push(board);
                }
            });
        }
        return this._boards;
    }

    /** Get last modified date */
    get lastModified() { return this._root && new Date(this._root.lastModified); }

    /**
     * Lookup board definition from board class name
     * @param boardClass Class name of board
     */
    getBoard(boardClass?: string): CatalogData.Board | undefined {
        if (this._root == null || boardClass == null) {
            return undefined;
        }
        let board: RubicCatalog.Board | undefined;
        if (boardClass === DUMMY_CATALOG.class) {
            board = DUMMY_CATALOG;
        } else {
            board = this.boards.find((board) => (board.class === boardClass));
        }
        return this._wrapBoardInterface(board);
    }

    /**
     * Lookup repository definition from repository's UUID
     * @param uuid UUID of repository
     */
    getRepository(uuid?: string): CatalogData.Repository | undefined {
        if (this._root == null || uuid == null) {
            return undefined;
        }
        for (let catalog of [[DUMMY_CATALOG], this.boards]) {
            for (let board of catalog) {
                const repo = board.repositories.find((repo) => {
                    return (repo.uuid === uuid);
                });
                if (repo != null) {
                    return CatalogData._wrapRepositoryInterface(repo, this._wrapBoardInterface(board));
                }
            }
        }
        return undefined;
    }

    /**
     * Lookup release definition from repository's UUID and release tag
     * @param repositoryUuid UUID of repository
     * @param releaseTag Tag name of release
     */
    getRelease(repositoryUuid?: string, releaseTag?: string): CatalogData.Release | undefined {
        const repo = this.getRepository(repositoryUuid);
        return (repo != null) ? repo.getRelease(releaseTag) : undefined;
    }

    /**
     * Lookup variation definition
     * @param repositoryUuid UUID of repository
     * @param releaseTag Tag name of release
     * @param variationPath Path of variation
     */
    getVariation(repositoryUuid: string, releaseTag: string, variationPath: string): CatalogData.Variation | undefined {
        const rel = this.getRelease(repositoryUuid, releaseTag);
        return (rel != null) ? rel.getVariation(variationPath) : undefined;
    }

    /**
     * Make CatalogData.Board instance by wrapping board data from catalog
     * @param board Plain board data from catalog
     */
    private _wrapBoardInterface(board?: RubicCatalog.BoardV1): CatalogData.Board | undefined {
        if (board == null) {
            return undefined;
        }
        return Object.assign({
            catalogData: this,
            getRepository: function(this: CatalogData.Board, repositoryUuid: string): CatalogData.Repository | undefined {
                const repo = this.repositories.find((repo) => repo.uuid === repositoryUuid);
                if (repo == null) {
                    return undefined;
                }
                return CatalogData._wrapRepositoryInterface(repo, this);
            }
        }, board);
    }

    /**
     * Make CatalogData.Repository instance by wrapping repository data from catalog
     * @param repo Plain repository data from catalog
     * @param board Parent board instance
     */
    private static _wrapRepositoryInterface(repo: RubicCatalog.RepositorySummaryV1, board?: CatalogData.Board | undefined): CatalogData.Repository | undefined {
        if (board == null) {
            return undefined;
        }
        return Object.assign({
            board,
            getRelease: function(this: CatalogData.Repository, releaseTag: string): CatalogData.Release | undefined {
                if (this.cache == null) {
                    return undefined;
                }
                const rel = (this.cache.releases || []).find((rel) => rel.tag === releaseTag);
                return CatalogData._wrapReleaseInterface(rel, this);
            }
        }, repo);
    }

    /**
     * Make CatalogData.Release instance by wrapping release data from catalog
     * @param release Plain release data from catalog
     * @param repository Parent repository instance
     */
    private static _wrapReleaseInterface(release?: RubicCatalog.ReleaseSummaryV1, repository?: CatalogData.Repository): CatalogData.Release | undefined {
        if (release == null) {
            return undefined;
        }
        const obj: any = Object.assign({
            repository,
            getVariation: function(this: CatalogData.Release, variationPath: string): CatalogData.Variation | undefined {
                if (this.cache == null) {
                    return undefined;
                }
                const vari = (this.cache.variations || []).find((vari) => vari.path === variationPath);
                return CatalogData._wrapVariationInterface(vari, this);
            },
            download: function(this: CatalogData.Release, progress: ProgressReporter, force: boolean = false): Thenable<string> {
                const { repository } = this;
                return repository.board.catalogData._download(this, progress, force)
                .then(() => {
                    return this.cacheDir;
                });
            }
        }, release);
        Object.defineProperties(obj, {
            hasCache: {
                get: function(this: CatalogData.Release) {
                    return CacheStorage.exists(path.join(this.cacheDir, RELEASE_JSON));
                }
            },
            cacheDir: {
                get: function(this: CatalogData.Release) {
                    return path.join(this.repository.uuid, this.tag);
                }
            },
        });
        return obj;
    }

    /**
     * Make CatalogData.Variation instance by wrapping variation data from catalog
     * @param variation Plain variation data from catalog
     * @param release Parent release instance
     */
    private static _wrapVariationInterface(variation?: RubicCatalog.VariationV1, release?: CatalogData.Release): CatalogData.Variation | undefined {
        if (variation == null) {
            return undefined;
        }
        const obj: any = Object.assign({ release }, variation);
        Object.defineProperties(obj, {
            hasCache: {
                get: function(this: CatalogData.Variation) {
                    return this.release.hasCache;
                }
            },
            cachePath: {
                get: function(this: CatalogData.Variation) {
                    return path.join(this.release.cacheDir, this.path);
                }
            },
        });
        return obj;
    }

    /**
     * Download firmwar
     * @param release Target release instance
     * @param progress 
     * @param force 
     */
    private _download(release: CatalogData.Release, progress: ProgressReporter, force: boolean): Thenable<void> {
        if (!force && release.hasCache) {
            // Skip download
            return Promise.resolve();
        }
        return new Promise<request.RequestResponse>((resolve, reject) => {
            const title = localize("downloading", "Downloading");
            let ended: number = 0;
            let total: number = NaN;
            let req = request({uri: release.url, encoding: null}, (err, resp) => {
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

                let value = `${(ended / 1024).toFixed()}`;
                if (!isNaN(total)) {
                    value += `/${(total / 1024).toFixed()}`;
                }
                value += "kB";
                if (progress != null) {
                    progress.report(`${title} (${value})`);
                }
            });
        })
        .then((resp) => {
            const title = localize("decompressing", "Decompressing");
            if (progress != null) {
                progress.report(title);
            }
            return decompress(resp.body, CacheStorage.getFullPath(release.cacheDir));
        })
        .then(() => {
        });
    }

    /**
     * Load catalog data from cache
     */
    load(): Thenable<void> {
        return Promise.resolve()
        .then(() => {
            return CacheStorage.readFile(CATALOG_JSON, CATALOG_ENCODING);
        })
        .then((jsonText: string) => {
            return JSON.parse(jsonText);
        })
        .then((root: RubicCatalog.Root) => {
            return this._import(root);
        });
    }

    /**
     * Update catalog data
     * @param force Update even if 
     */
    update(progress: ProgressReporter, force: boolean = false): Thenable<boolean> {
        return Promise.resolve()
        .then(() => {
            // Load cache
            if (!this.isLoaded) {
                return this.load();
            }
        })
        .then(() => {
            // Already loaded or load succeeded
            const lastFetched = extensionContext.globalState.get("lastFetched", 0);
            const nextFetch = lastFetched + (UPDATE_PERIOD_MINUTES * 60 * 1000);
            if (!force && Date.now() < nextFetch) {
                // Skip update
                console.log(`Rubic catalog update has been skipped (by ${new Date(nextFetch).toLocaleString()})`);
                return false;
            }
            // Too old. Try update
            throw null;
        })
        .catch(() => {
            // Reject reason is one of them
            //   1. Cache is not readable
            //   2. Cache is not valid JSON
            //   3. Cache is too old
            return this._fetch(progress)
            .then(() => {
                return extensionContext.globalState.update("lastFetched", Date.now());
            })
            .then(() => {
                console.log(`Rubic catalog has been updated (force=${force})`);
                return true;
            });
        });
    }

    /**
     * Fetch latest catalog data from web
     */
    private _fetch(progress: ProgressReporter): Thenable<void> {
        let isCustomRepo = false;
        return Promise.resolve()
        .then(() => {
            return vscode.workspace.getConfiguration("rubic").get<GitHubRepository>("catalog");
        })
        .then((repoInfo) => {
            if (repoInfo != null) {
                const { owner, repo, branch } = repoInfo;
                if (owner != null && repo != null) {
                    isCustomRepo = true;
                    return {owner, repo, branch: branch || "master"};
                }
            }
            return OFFICIAL_CATALOG_REPO;
        })
        .then((repo) => {
            if (progress != null) {
                progress.report(localize("download-catalog", "Downloading catalog"));
            }
            return readGithubFile(repo, CATALOG_JSON, CATALOG_ENCODING);
        })
        .then((jsonText: string) => {
            return JSON.parse(jsonText);
        })
        .then((root: RubicCatalog.Root) => {
            if (isCustomRepo) {
                (<CatalogRootCustom>root).__custom__ = true;
            }
            return this._import(root);
        })
        .then(() => {
            return this.store();
        });
    }

    /**
     * Import catalog
     * @param root Root definition
     */
    private _import(root: RubicCatalog.Root): Thenable<void> {
        if (!semver.satisfies(RUBIC_VERSION, root.rubicVersion)) {
            return Promise.reject(new Error(localize(
                "rubic-is-too-old",
                "Rubic is too old. Please update Rubic extension"
            )));
        }
        this._root = root;
        this._boards = null;
        return Promise.resolve();
    }

    /**
     * Save catalog to cache
     */
    store(): Thenable<void> {
        if (!this._root) {
            return Promise.reject(
                new Error("Catalog is not loaded")
            );
        }
        return CacheStorage.writeFile(
            CATALOG_JSON,
            Buffer.from(JSON.stringify(this._root), CATALOG_ENCODING)
        );
    }
}

export namespace CatalogData {
    export interface Board extends RubicCatalog.BoardV1 {
        readonly catalogData: CatalogData;
        getRepository(repositoryUuid?: string): Repository | undefined;
    }

    export interface Repository extends RubicCatalog.RepositorySummaryV1 {
        readonly board: Board;
        getRelease(releaseTag?: string): Release | undefined;
    }

    export interface Release extends RubicCatalog.ReleaseSummaryV1 {
        readonly repository: Repository;
        getVariation(variationPath?: string): Variation | undefined;
        readonly hasCache: boolean;
        readonly cacheDir: string;
        download(progress: (text: string) => void, force?: boolean): Thenable<string>;
    }

    export interface Variation extends RubicCatalog.VariationV1 {
        readonly release: Release;
        readonly hasCache: boolean;
        readonly cachePath: string;
    }
}
