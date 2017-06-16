import * as nls from "vscode-nls";
import * as path from "path";
import * as util from "util";
import * as dedent from "dedent";
import { BoardConstructor, Board, BoardCandidate, BoardInformation } from "../boards/board";
import { CacheStorage } from "../util/cacheStorage";
import {
    CancellationToken, Disposable,
    EventEmitter, ExtensionContext,
    MessageItem, ProviderResult, QuickPickItem,
    StatusBarAlignment, StatusBarItem,
    TextDocumentContentProvider, Uri, ViewColumn,
    commands, window, workspace
} from "vscode";
import { CatalogData, toLocalizedString } from "./catalogData";
import { FSWatcher, readFileSync, watch } from "fs";
import { SketchLoadResult } from "../sketch";
import * as MarkdownIt from "markdown-it";
import { GitHubRepository } from "../util/githubFetcher";
import { interactiveDebugRequest, soloInteractiveDebugRequest } from "../interactiveRequester";
import { RubicProcess } from "../rubicProcess";

const Handlebars = require("./handlebars");
require("./template");

const localize = nls.loadMessageBundle(__filename);

export const CMD_SHOW_CATALOG = "extension.rubic.showCatalog";
export const CMD_SELECT_PORT  = "extension.rubic.selectPort";

const URI_CATALOG = Uri.parse("rubic://catalog");
const CMD_UPDATE_CATALOG = "extension.rubic.updateCatalog";
const CMD_TEST_CONNECTION  = "extension.rubic.testConnection";
const CMD_WRITE_FIRMWARE  = "extension.rubic.writeFirmware";

const CFG_SHOW_PREVIEW = "catalog.showPreview";

const UPDATE_PERIOD_MINUTES = 12 * 60;

interface CatalogSelection {
    boardClass: string;
    repositoryUuid: string;
    releaseTag: string;
    variationPath: string;
}

function makeGithubURL(owner: string, repo: string, branch?: string): string {
    let suffix = branch ? `/tree/${branch}` : "";
    return `https://github.com/${owner}/${repo}${suffix}`;
}

export class CatalogViewer implements TextDocumentContentProvider, Disposable {
    private _sbiPort: StatusBarItem;
    private _sbiBoard: StatusBarItem;
    private _currentSelection: CatalogSelection;
    private _currentPanel: string;
    private _onDidChange = new EventEmitter<Uri>();
    get onDidChange() { return this._onDidChange.event; }

    /**
     * Constructor of CatalogViewer
     */
    public constructor(context: ExtensionContext) {
        // Register commands
        if (RubicProcess.self.workspaceRoot == null) {
            context.subscriptions.push(
                commands.registerCommand(CMD_SHOW_CATALOG, () => {
                    return window.showInformationMessage(localize(
                        "open-folder-before",
                        "Open a folder to place your files before opening Rubic board catalog"
                    ));
                })
            );
            return;
        }
        context.subscriptions.push(
            commands.registerCommand(CMD_SHOW_CATALOG, (params) => {
                if (params) {
                    this._updateCatalogView(params);
                } else {
                    this._showCatalogView();
                }
            }),
            commands.registerCommand(CMD_UPDATE_CATALOG, () => {
                this._fetchCatalog();
            }),
            commands.registerCommand(CMD_SELECT_PORT, () => {
                this.selectPort();
            }),
            commands.registerCommand(CMD_TEST_CONNECTION, () => {
                this._testConnection();
            }),
            commands.registerCommand(CMD_WRITE_FIRMWARE, () => {
                this._writeFirmware();
            })
        );

        // Register scheme
        context.subscriptions.push(
            workspace.registerTextDocumentContentProvider("rubic", this)
        );

        this.loadCache()
        .catch((reason) => {
            window.showErrorMessage(
                localize("failed-load-catalog-x", "Failed to load catalog: {0}", reason)
            );
        });
    }

    /**
     * Dispose
     */
    public dispose() {
        // Nothing to do
    }

    /**
     * showCatalog command receiver (No parameters)
     */
    private _showCatalogView(): void {
        let { sketch } = RubicProcess.self;
        if (sketch.invalid) {
            commands.executeCommand("vscode.open", Uri.file(sketch.filename)).then(() => {
                return window.showWarningMessage(
                    localize("syntax-error-f", "Syntax error detected in {0}. Please correct manually", path.basename(sketch.filename))
                );
            });
            return;
        }
        Promise.resolve()
        .then(() => {
            if (sketch.loaded) { return SketchLoadResult.LOAD_SUCCESS; }
            // Load sketch (with migration)
            return sketch.load(true);
        })
        .then((result) => {
            if (result === SketchLoadResult.LOAD_CANCELED) { return; }
            this._currentSelection = {
                boardClass: sketch.boardClass,
                repositoryUuid: sketch.repositoryUuid,
                releaseTag: sketch.releaseTag,
                variationPath: sketch.variationPath
            };
            let active = window.activeTextEditor;
            return commands.executeCommand("vscode.previewHtml",
                URI_CATALOG,
                (active ? active.viewColumn : ViewColumn.One),
                localize("catalog-title", "Rubic board catalog")
            );
        });
    }

    /**
     * showCatalog command receiver (With parameters)
     */
    private _updateCatalogView(params: any) {
        // Update provisional selections
        let { itemId } = params;
        switch (params.panelId) {
            case "board":
                this._currentSelection.boardClass = itemId;
                this._currentSelection.repositoryUuid = null;
                this._currentSelection.releaseTag = null;
                this._currentSelection.variationPath = null;
                this._currentPanel = "repository";
                break;
            case "repository":
                this._currentSelection.repositoryUuid = itemId;
                this._currentSelection.releaseTag = null;
                this._currentSelection.variationPath = null;
                this._currentPanel = "release";
                break;
            case "release":
                this._currentSelection.releaseTag = itemId;
                this._currentSelection.variationPath = null;
                this._currentPanel = "variation";
                break;
            case "variation":
                this._currentSelection.variationPath = itemId;
                this._currentPanel = "details";
                break;
        }
        if (1) {
            this._triggerUpdate();
            return;
        }

        Promise.resolve()
        .then(() => {
            if (this._currentSelection.variationPath == null) { return; }

            // Download release assets
            let { catalogData, sketch } = RubicProcess.self;
            let prepare = catalogData.prepareCacheDir(
                this._currentSelection.repositoryUuid, this._currentSelection.releaseTag
            ).then(() => {});
            let confirm: Promise<void>;
            if ((this._currentSelection.boardClass === sketch.boardClass) &&
                (this._currentSelection.repositoryUuid === sketch.repositoryUuid) &&
                (this._currentSelection.releaseTag === sketch.releaseTag) &&
                (this._currentSelection.variationPath === sketch.variationPath)) {
                return prepare;
            }
            let items: MessageItem[] = [{
                title: localize("yes", "Yes")
            },{
                title: localize("no", "No"),
                isCloseAffordance: true
            }];

            return Promise.resolve(window.showInformationMessage(
                localize("board-changed", "Board configuration has been changed. Are you sure to save?"),
                ...items
            ))
            .then((item) => {
                if (item === items[0]) {
                    // Save
                    return sketch.update(this._currentSelection);
                } else {
                    // Return to variation select
                    this._currentSelection.variationPath = null;
                }
            })
            .then(() => {
                return prepare;
            });
        })
        .then(() => {
            // Update page
            this._currentPanel = null;
            this._triggerUpdate();
        });
    }

    /**
     * Trigger page update
     */
    private _triggerUpdate(): void {
        this._onDidChange.fire(URI_CATALOG);
    }

    /**
     * Fetch catalog and update viewer
     */
    private _fetchCatalog(): Promise<void> {
        let rprocess = RubicProcess.self;
        let { catalogData } = rprocess;
        let { lastModified } = catalogData;
        return Promise.resolve()
        .then(() => {
            return catalogData.fetch();
        })
        .then(() => {
            this._triggerUpdate();
            if (catalogData.lastModified !== lastModified) {
                rprocess.showInformationMessage(
                    localize(
                        "catalog-updated-d",
                        "Rubic catalog has been updated (Last modified: {0})",
                        lastModified ? lastModified.toLocaleString() : "N/A"
                    )
                );
            } else {
                rprocess.showInformationMessage(
                    localize(
                        "catalog-not-updated",
                        "No update for Rubic catalog"
                    )
                );
            }
        });
    }

    /**
     * selectPort command receiver
     */
    public selectPort(): Promise<string> {
        let { sketch } = RubicProcess.self;
        let boardClass = Board.getConstructor(sketch.boardClass);
        let choose = (filter: boolean): Promise<string> => {
            interface PortQuickPickItem extends QuickPickItem {
                path?: string;
                rescan?: boolean;
            }
            let items: PortQuickPickItem[] = [];
            let hidden = 0;
            return Promise.resolve()
            .then(() => {
                return boardClass.list();
            })
            .then((ports) => {
                ports.sort((a, b) => (a.name < b.name) ? -1 : 1);
                ports.forEach((port) => {
                    if (filter && port.unsupported) {
                        ++hidden;
                        return;
                    }
                    let item: PortQuickPickItem = {
                        label: port.path,
                        description: port.name,
                        path: port.path
                    };
                    if (port.vendorId != null && port.productId != null) {
                        let vid = ("0000" + port.vendorId.toString(16)).substr(-4);
                        let pid = ("0000" + port.productId.toString(16)).substr(-4);
                        item.description += ` (VID:0x${vid}, PID:0x${pid})`;
                    }
                    if (port.unsupported) {
                        item.description += " $(alert)";
                        item.detail = localize("may-not-supported", "The board on this port may be not supported");
                    }
                    items.push(item);
                });
                if (hidden > 0) {
                    let item: PortQuickPickItem = {
                        label: `$(issue-opened)\t${localize("show-hidden-ports", "Show hidden ports")}`,
                        description: "" // filled after
                    };
                    if (hidden > 1) {
                        item.description = localize("ports-hidden-n", "{0} ports hidden", hidden);
                    } else {
                        item.description = localize("ports-hidden-1", "{0} port hidden", 1);
                    }
                    items.push(item);
                }
                items.push({
                    label: `$(sync)\t${localize("refresh", "Refresh")}`,
                    description: localize("rescan-ports", "Rescan ports"),
                    rescan: true
                });
                let boardName = boardClass.name;
                let board = RubicProcess.self.catalogData.getBoard(boardClass.name);
                if (board != null) {
                    boardName = toLocalizedString(board.name);
                }
                return window.showQuickPick(items, {
                    placeHolder: localize("select-port-msg", "Which {0} do you use?", boardName)
                }).then((item) => {
                    if (item == null) { return null; }
                    if (item.rescan) { return choose(filter); }
                    if (item.path == null) { return choose(false); }
                    return item.path;
                });
            }); // return Promise.resolve().then()
        };
        return choose(true).then((boardPath: string) => {
            if (boardPath != null) {
                return sketch.update({boardPath}).then(() => {
                    this._triggerUpdate();
                    return boardPath;
                });
            }
        });
    }

    /**
     * Load cache
     */
    public loadCache(update: boolean = true, force: boolean = false): Promise<boolean> {
        let {catalogData} = RubicProcess.self;
        let nextFetch: number;
        return Promise.resolve()
        .then(() => {
            return RubicProcess.self.getMementoValue("lastFetched", 0);
        })
        .then((lastFetched) => {
            nextFetch = lastFetched + (UPDATE_PERIOD_MINUTES * 60 * 1000);
            // Load cache
            if (!catalogData.loaded) {
                return catalogData.load();
            }
        })
        .then(() => {
            if (!update) {
                // Do not update
                return false;
            }
            if (!force && Date.now() < nextFetch) {
                // Skip update
                console.log(`Rubic catalog update has been skipped (by ${new Date(nextFetch).toLocaleString()})`);
                return false;
            }
            // Too old. Try update
            return <any>Promise.reject(null);
        })
        .catch((reason) => {
            if (!update) { return Promise.reject(reason); }
            // Reject reason is one of them
            //   1. Cache is not readable
            //   2. Cache is not valid JSON
            //   3. Cache is too old
            return catalogData.fetch().then(() => {
                return RubicProcess.self.setMementoValue("lastFetched", Date.now());
            })
            .then(() => {
                console.log(`Rubic catalog has been updated (force=${force})`);
                return true;
            });
        });
    }

    /**
     * Provide HTML for Rubic board catalog
     */
    provideTextDocumentContent(uri: Uri, token: CancellationToken): Promise<string> {
        let { catalogData, sketch } = RubicProcess.self;
        if (uri.scheme !== "rubic" || uri.authority !== "catalog") {
            return Promise.reject(new Error("invalid URI for Rubic board catalog"));
        }

        let vars: CatalogTemplateRoot = {
            extensionPath: RubicProcess.self.extensionRoot,
            commandEntry: CMD_SHOW_CATALOG,
            showPreview: null,
            unofficial: catalogData.custom,
            localized: {
                official: localize("official", "Official"),
                preview: localize("preview", "Preview"),
                obsolete: localize("obsolete", "Obsolete"),
                website: localize("website", "Website"),
                loading: localize("loading", "Loading"),
                changed: localize("changed", "Changed"),
                not_selected: localize("not-selected", "Not selected"),
                no_item: localize("no-item", "No item")
            },
            panels: [{
                id: "board",
                title: localize("board", "Board"),
                disabled: true,
            },{
                id: "repository",
                title: localize("repository", "Repository"),
                disabled: true,
            },{
                id: "release",
                title: localize("release", "Release"),
                disabled: true,
            },{
                id: "variation",
                title: localize("variation", "Variation"),
                disabled: true,
            },{
                id: "details",
                title: localize("details", "Details"),
                disabled: true,
                pages: [],
            }]
        };
        let currentPanel = vars.panels.find((panel) => panel.id === this._currentPanel);
        if (currentPanel == null) {
            currentPanel = vars.panels[0];
        }
        currentPanel.opened = true;
        return Promise.resolve()
        .then(() => {
            return RubicProcess.self.getRubicSetting(CFG_SHOW_PREVIEW)
            .then((result: boolean) => {
                console.log("showPreview:" + result);
                vars.showPreview = result;
            });
        })
        .then(() => {
            return this._provideBoardList(vars.panels[0], catalogData);
        })
        .then((board) => {
            return this._provideRepositoryList(vars.panels[1], board);
        })
        .then((repo) => {
            return this._provideReleaseList(vars.panels[2], repo);
        })
        .then((release) => {
            return this._provideVariationList(vars.panels[3], release);
        })
        .then((variation) => {
            return this._provideDetails(vars.panels[4], variation);
        })
        .then(() => {
            return Handlebars.templates["template.hbs"](vars);
        });
    }

    /**
     * Provide board list
     * @param panel Panel variables for handlebars rendering
     */
    private _provideBoardList(panel: CatalogTemplatePanel, catalogData: CatalogData): Promise<RubicCatalog.Board> {
        let { sketch } = RubicProcess.self;
        let { boardClass } = this._currentSelection;
        let selectedBoard: RubicCatalog.Board;
        panel.disabled = false;
        panel.initialItemId = boardClass;
        panel.savedItemId = sketch.loaded ? sketch.boardClass : "";
        panel.items = [];
        for (let board of catalogData.boards) {
            if (board.class === boardClass) {
                selectedBoard = board;
            } else if (board.disabled) {
                continue;
            }
            panel.items.push({
                id: board.class,
                title: toLocalizedString(board.name),
                selected: (board.class === boardClass),
                icon: board.icon,
                preview: board.preview,
                description: toLocalizedString(board.description),
                details: toLocalizedString(board.author),
                topics: (board.topics || []).map((topic) => ({
                    title: toLocalizedString(topic.name),
                    color: topic.color
                })),
            });
        }
        return Promise.resolve(selectedBoard);
    }

    /**
     * Provide repository list
     * @param panel Panel variables for handlebars rendering
     * @param board Selected board
     */
    private _provideRepositoryList(panel: CatalogTemplatePanel, board: RubicCatalog.Board): Promise<RubicCatalog.RepositorySummary> {
        if (board == null) {
            return Promise.resolve(null);
        }
        let { sketch } = RubicProcess.self;
        let { repositoryUuid } = this._currentSelection;
        let selectedRepo: RubicCatalog.RepositorySummary;
        panel.disabled = false;
        panel.initialItemId = repositoryUuid;
        panel.savedItemId = sketch.loaded ? sketch.repositoryUuid : "";
        panel.items = [];
        for (let repo of board.repositories) {
            if (repo.uuid === repositoryUuid) {
                selectedRepo = repo;
            }
            panel.items.push({
                id: repo.uuid,
                title: toLocalizedString(repo.cache.name),
                selected: (repo.uuid === repositoryUuid),
                preview: repo.cache.preview,
                description: toLocalizedString(repo.cache.description),
                details: repo.owner
            });
        }
        return Promise.resolve(selectedRepo);
    }

    /**
     * Provide release list
     * @param panel Panel variables for handlebars rendering
     * @param repo Selected repository
     */
    private _provideReleaseList(panel: CatalogTemplatePanel, repo: RubicCatalog.RepositorySummary): Promise<RubicCatalog.ReleaseSummary> {
        if (repo == null) {
            return Promise.resolve(null);
        }
        let { catalogData, sketch } = RubicProcess.self;
        let { repositoryUuid, releaseTag } = this._currentSelection;
        let selectedRelease: RubicCatalog.ReleaseSummary;
        panel.disabled = false;
        panel.initialItemId = releaseTag;
        panel.savedItemId = sketch.loaded ? sketch.releaseTag : "";
        panel.items = [];
        return repo.cache.releases.reduce((promise, rel) => {
            if (rel.tag === releaseTag) {
                selectedRelease = rel;
            }
            return promise
            .then(() => {
                return catalogData.prepareCacheDir(repositoryUuid, rel.tag, false);
            })
            .then((cacheDir) => {
                panel.items.push({
                    id: rel.tag,
                    title: toLocalizedString(rel.cache.name || {en: rel.name}),
                    selected: (rel.tag === releaseTag),
                    preview: rel.preview,
                    description: toLocalizedString(rel.cache.description || {en: rel.description}),
                    details: `${localize("tag", "Tag")} : ${rel.tag} / ${
                        localize("release-date", "Release date")
                        } : ${new Date(rel.published_at).toLocaleDateString()}${
                        cacheDir ? " (" + localize("downloaded", "Downloaded") + ")" : ""}`,
                });
            });
        }, Promise.resolve())
        .then(() => {
            return selectedRelease;
        });
    }

    /**
     * Provide variation list
     * @param panel Panel variables for handlebars rendering
     * @param release Selected release
     */
    private _provideVariationList(panel: CatalogTemplatePanel, release: RubicCatalog.ReleaseSummary): Promise<RubicCatalog.Variation> {
        if (release == null) {
            return Promise.resolve(null);
        }
        let { sketch } = RubicProcess.self;
        let { variationPath } = this._currentSelection;
        let selectedVariation: RubicCatalog.Variation;
        panel.disabled = false;
        panel.initialItemId = variationPath;
        panel.savedItemId = sketch.loaded ? sketch.variationPath : "";
        panel.items = [];
        for (let variation of release.cache.variations) {
            let topics: CatalogTemplateTopic[] = [];
            if (variation.path === variationPath) {
                selectedVariation = variation;
            }
            for (let rt of (variation.runtimes || [])) {
                switch (rt.name) {
                    case "mruby":
                        topics.push({title: "mruby", color: "red"});
                        for (let gem of ((<RubicCatalog.Runtime.Mruby>rt).mrbgems || [])) {
                            topics.push({
                                title: gem.name,
                                color: "gray",
                                tooltip: gem.description
                            });
                        }
                        break;
                    case "duktape":
                        topics.push({title: "JavaScript (ES5)", color: "yellow"});
                        topics.push({title: "TypeScript", color: "blue"});
                        break;
                    case "lua":
                        topics.push({title: "Lua", color: "blue"});
                        break;
                }
            } 
            panel.items.push({
                id: variation.path,
                title: toLocalizedString(variation.name),
                selected: (variation.path === variationPath),
                description: toLocalizedString(variation.description),
                topics
            });
        }
        return Promise.resolve(selectedVariation);
    }

    private _provideDetails(panel: CatalogTemplatePanel, variation: RubicCatalog.Variation): Promise<void> {
        if (variation == null) {
            return Promise.resolve(null);
        }
        let md = new MarkdownIt("default", {html: true});
        panel.disabled = false;
        panel.pages = [];
        return Promise.resolve()
        .then(() => {
            return this._renderConnPage(variation)
            .then((markdown) => {
                panel.pages.push({
                    title: localize("conn_and_firmware", "Connection & Firmware"),
                    active: true,
                    content: md.render(markdown),
                });
            });
        })
        .then(() => {
            return this._renderRuntimePage(variation)
            .then((markdown) => {
                panel.pages.push({
                    title: localize("runtimes", "Runtimes"),
                    content: md.render(markdown),
                });
            });
        })
        .then(() => {
            if (variation.document != null) {
                panel.pages.push({
                    title: localize("document", "Document"),
                    content: md.render(toLocalizedString(variation.document)),
                });
            }
        });
    }

/*
    FIXME_hoge () {
        if (!this._currentSelection) {
            this._currentSelection = <any>{};
        }
        let favoriteBoards = RubicProcess.self.getMementoValue("favoriteBoards", []); // FIXME
        let [pb, pr, pe, pv, pd] = vars.panels;
        let sb: RubicCatalog.Board;
        let sr: RubicCatalog.RepositorySummary;
        let se: RubicCatalog.ReleaseSummary;
        let sv: RubicCatalog.Variation;

        // List boards
        pb.not_selected = (this._currentSelection.boardClass == null);
        pb.changed = !pb.not_selected && (this._currentSelection.boardClass !== sketch.boardClass);
        catalogData.boards.forEach((board) => {
            if (board.disabled) { return board.disabled; }
            let title = toLocalizedString(board.name);
            let settled = !pb.not_selected && (board.class === this._currentSelection.boardClass);
            pb.items.push({
                id: board.class,
                icon: board.icon,
                title: title,
                description: toLocalizedString(board.description),
                author: toLocalizedString(board.author),
                website: toLocalizedString(board.website),
                preview: !!board.preview,
                favorite: (/*favoriteBoards FIXME!*-/[].indexOf(board.class) >= 0),
                settled: settled,
                _index: pb.items.length
            });
            if (settled) {
                pb.decision = title;
                sb = board;
                defaultPanel = 1;
            }
        });
        pb.items.sort((a, b) => {
            if (a.favorite && !b.favorite) { return -1; }
            if (b.favorite && !a.favorite) { return +1; }
            return a._index - b._index;
        });

        // List repositories (If board is selected)
        if (sb) {
            pr.disabled = false;
            pr.not_selected = (this._currentSelection.repositoryUuid == null);
            pr.changed = !pr.not_selected && (this._currentSelection.repositoryUuid !== sketch.repositoryUuid);
            sb.repositories.forEach((firm) => {
                if (firm.disabled) { return; }
                if (!firm.cache) { return; }
                let title = toLocalizedString(firm.cache.name);
                let settled = !pr.not_selected && (firm.uuid === this._currentSelection.repositoryUuid);
                pr.items.push({
                    id: firm.uuid,
                    title: title,
                    description: toLocalizedString(firm.cache.description),
                    author: firm.owner,
                    website: makeGithubURL(firm.owner, firm.repo, firm.branch),
                    official: !!firm.official,
                    preview: !!firm.cache.preview,
                    settled: settled,
                    _index: pr.items.length
                });
                if (settled) {
                    pr.decision = title;
                    sr = firm;
                    defaultPanel = 2;
                }
            });
        }

        // List repositories (If repository is selected)
        if (sr) {
            pe.disabled = false;
            pe.not_selected = (this._currentSelection.releaseTag == null);
            pe.changed = !pe.not_selected && (this._currentSelection.releaseTag !== sketch.releaseTag);
            for (let i = 0; i < sr.cache.releases.length; ++i) {
                let rel = sr.cache.releases[i];
                if (!rel.cache) { return; }
                let title = toLocalizedString(rel.cache.name || {en: rel.name});
                let settled = !pe.not_selected && (rel.tag === this._currentSelection.releaseTag);
                let cacheDir = await catalogData.prepareCacheDir(this._currentSelection.repositoryUuid, rel.tag, false);
                pe.items.push({
                    id: rel.tag,
                    title: title,
                    description: toLocalizedString(rel.cache.description || {en: rel.description}),
                    author: `${localize("tag", "Tag")} : ${rel.tag} / ${
                        localize("release-date", "Release date")
                        } : ${new Date(rel.published_at).toLocaleDateString()}${
                        cacheDir ? " (" + localize("downloaded", "Downloaded") + ")" : ""}`,
                    preview: !!rel.preview,
                    settled: settled,
                    _index: pe.items.length
                });
                if (settled) {
                    pe.decision = title;
                    se = rel;
                    defaultPanel = 3;
                }
            }
        }

        // List variations (If release is selected)
        if (se) {
            pv.disabled = false;
            pv.not_selected = (this._currentSelection.variationPath == null);
            pv.changed = !pv.not_selected && (this._currentSelection.variationPath !== sketch.variationPath);
            se.cache.variations.forEach((vary) => {
                let title = toLocalizedString(vary.name);
                let settled = !pv.not_selected && (vary.path === this._currentSelection.variationPath);
                pv.items.push({
                    id: vary.path,
                    title: title,
                    description: toLocalizedString(vary.description),
                    topics: [],
                    settled: settled
                });
                if (settled) {
                    pv.decision = title;
                    sv = vary;
                    defaultPanel = 4;
                }
            });
        }

        // Make detail pages
        if (sv) {
            let md = new MarkdownIt(<any>{html: true});
            pd.disabled = false;
        }

        if (!sb && this._currentSelection.boardClass != null) {
            window.showWarningMessage(localize("board-x-not-found",
                "No board named '{0}'", this._currentSelection.boardClass
            ));
        } else if (!sr && this._currentSelection.repositoryUuid != null) {
            window.showWarningMessage(localize("repo-x-not-found",
                "No repository named '{0}'", this._currentSelection.repositoryUuid
            ));
        } else if (!se && this._currentSelection.releaseTag != null) {
            window.showWarningMessage(localize("release-x-not-found",
                "No release named '{0}'", this._currentSelection.releaseTag
            ));
        } else if (!sv && this._currentSelection.variationPath != null) {
            window.showWarningMessage(localize("variation-x-not-found",
                "No variation named '{0}'", this._currentSelection.variationPath
            ));
        }

        if (this._currentPanel == null) {
            this._currentPanel = defaultPanel;
        }
        vars.panels[this._currentPanel].opened = true;

        // Generate HTML
        return template(vars);
    }*/

    private async _renderConnPage(v: RubicCatalog.Variation): Promise<string> {
        let { catalogData, sketch } = RubicProcess.self;
        return Promise.resolve()
        .then(() => {
            return catalogData.prepareCacheDir(this._currentSelection.repositoryUuid, this._currentSelection.releaseTag);
        })
        .then((cacheDir) => {
            return CacheStorage.stat(path.join(cacheDir, v.path));
        })
        .then(({ size }) => {
            let sizeText: string;
            if (size >= 1024) {
                sizeText = `${Math.round(size / 1024)} kB`;
            } else {
                sizeText = `${size} bytes`;
            }
            return dedent`
            ## ${localize("connection", "Connection")}
            * <a href="command:${CMD_SELECT_PORT}" class="catalog-page-button catalog-page-button-dropdown">${
                sketch.boardPath || localize("no-port", "No port selected")
            }</a><a href="command:${CMD_TEST_CONNECTION}" class="catalog-page-button">${
                localize("test-connection", "Test connection")
            }</a>
            ## ${localize("firmware", "Firmware")}
            * ${v.path} (${sizeText})<br><a href="command:${CMD_WRITE_FIRMWARE}" class="catalog-page-button">${
                localize("write-firmware", "Write firmware to board")
            }</a>
            `;
        });
    }

    private _renderRuntimePage(v: RubicCatalog.Variation): Promise<string> {
        let result: string[] = [];
        let sver = localize("version", "Version");
        for (let rt of v.runtimes) {
            switch (rt.name) {
                case "mruby":
                    let rtm = <RubicCatalog.Runtime.Mruby>rt;
                    result.push(`## ${localize("mruby-desc", "mruby (Lightweight Ruby)")}`);
                    result.push(`* ${sver} : \`${rtm.version}\``);
                    if (rtm.mrbgems) {
                        result.push(`* ${localize("included-mrbgems", "Included mrbgems")} :`);
                        for (let gem of rtm.mrbgems) {
                            result.push(`  * \`${gem.name}\` : ${gem.description}`);
                        }
                    }
                    break;
                case "duktape":
                    let rtd = <RubicCatalog.Runtime.Duktape>rt;
                    result.push(`* ${sver} : \`${rtd.version}\``);
                    result.push(`* ${localize("support-langs", "Supported languages")} : ` +
                        "JavaScript(ES5) / TypeScript"
                    );
                    break;
            }
        }
        return Promise.resolve(result.join("\n"));
    }

    /**
     * Test connection
     */
    private async _testConnection(): Promise<void> {
        let { sketch } = RubicProcess.self;
        let { boardClass, boardPath } = sketch;

        if (boardClass == null) {
            return;
        }
        if (boardPath == null) {
            boardPath = await this.selectPort();
            if (boardPath == null) {
                return;
            }
        }

        try {
            let result: BoardInformation = await soloInteractiveDebugRequest("getInfo", {
                boardClass: boardClass,
                boardPath: boardPath,
                printOutput: true
            });
            window.showInformationMessage(localize(
                "conn-test-success",
                "Connection test succeeded (See 'Debug console' for details)"
            ));
        } catch (error) {
            window.showErrorMessage(localize(
                "conn-test-failed",
                "Connection test failed (See 'Debug console' for details)"
            ));
        }
    }

    /**
     * Write firmware to the board
     */
    private async _writeFirmware(silent: boolean = false): Promise<void> {
        let { catalogData, sketch } = RubicProcess.self;

        // Get firmware data
        let cacheDir = await catalogData.prepareCacheDir(sketch.repositoryUuid, sketch.releaseTag);

        // Confirm to user
        if (!silent && await window.showInformationMessage(
            localize("confirm-write-firmware", "Are you sure to write firmware to the board?"),
            { title: localize("continue", "Continue") }
        ) == null) {
            return;
        }

        // Request firmware write
        await soloInteractiveDebugRequest("writeFirmware", {
            boardClass: sketch.boardClass,
            boardPath: sketch.boardPath,
            filename: CacheStorage.getFullPath(path.join(cacheDir, sketch.variationPath))
        });

        // Inform to user
        if (!silent) {
            await window.showInformationMessage(
                localize("finished-write-firmware", "Firmware has been successfully updated.")
            );
        }
    }
}
