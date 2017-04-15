'use strict';

import * as Handlebars from 'handlebars';
import * as nls from 'vscode-nls';
import * as path from 'path';
import * as util from 'util';
import { BoardClass, RubicBoard } from './rubicBoard';
import { BoardClassList } from './boardClassList';
import { CacheStorage } from './cacheStorage';
import {
    CancellationToken, Disposable,
    EventEmitter, ExtensionContext,
    MessageItem, ProviderResult, QuickPickItem,
    StatusBarAlignment, StatusBarItem,
    TextDocumentContentProvider, Uri, ViewColumn,
    commands, window, workspace
} from 'vscode';
import { CatalogData, toLocalizedString } from './catalogData';
import { FSWatcher, readFileSync, watch } from 'fs';
import { RubicExtension } from './extension';
import { SketchLoadResult } from './sketch';
import * as MarkdownIt from 'markdown-it';

const localize = nls.loadMessageBundle(__filename);

const URI_CATALOG = Uri.parse("rubic://catalog");
const CMD_SHOW_CATALOG = "extension.rubic.showCatalog";
const CMD_UPDATE_CATALOG = "extension.rubic.updateCatalog";
const CMD_SELECT_PORT  = "extension.rubic.selectPort";
const CMD_TEST_CONNECTION  = "extension.rubic.testConnection";
const CMD_WRITE_FIRMWARE  = "extension.rubic.writeFirmware";
const UPDATE_PERIOD_MINUTES = 12 * 60;

const LOCALIZED_NO_PORT = localize("no-port", "No port selected");

interface CatalogSelection {
    boardClass: string;
    repositoryUuid: string;
    releaseTag: string;
    variationPath: string;
}

function makeGithubURL(owner: string, repo: string, branch?: string): string {
    let suffix = branch ? `/tree/${branch}` : "";
    return `https://github.com/${owner}/${repo}${suffix}`
}

export class CatalogViewer implements TextDocumentContentProvider {
    private _sbiPort: StatusBarItem;
    private _sbiBoard: StatusBarItem;
    private _provSelect: CatalogSelection;
    private _currentPanel: number;
    private _onDidChange = new EventEmitter<Uri>();
    get onDidChange() { return this._onDidChange.event; }

    /**
     * Constructor of CatalogViewer
     */
    public constructor(context: ExtensionContext) {
        // Register commands
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
                console.log("test connection"); // TODO
            }),
            commands.registerCommand(CMD_WRITE_FIRMWARE, () => {
                console.log("write firmware"); // TODO
            })
        );

        // Register scheme
        context.subscriptions.push(
            workspace.registerTextDocumentContentProvider("rubic", this)
        );

        // Add status bar item
        this._initStatusBar(context);
    }

    /**
     * showCatalog command receiver (No parameters)
     */
    private _showCatalogView(): void {
        let sketch = RubicExtension.instance.sketch;
        Promise.resolve({
        }).then(() => {
            if (sketch.loaded) { return SketchLoadResult.LOAD_SUCCESS; }
            // Load sketch (with migration)
            return sketch.load(true);
        }).then((result) => {
            if (result === SketchLoadResult.LOAD_CANCELED) { return; }
            this._provSelect = {
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
        console.log("_updateCatalogView: " + JSON.stringify(params));

        // Update provisional selections
        let id = params.item;
        switch (params.panel) {
            case "board":
                this._provSelect.boardClass = id;
                id = null;
                // fall through
            case "repository":
                this._provSelect.repositoryUuid = id;
                id = null;
                // fall through
            case "release":
                this._provSelect.releaseTag = id;
                id = null;
                // fall through
            case "variation":
                this._provSelect.variationPath = id;
                id = null;
                break;
        }

        Promise.resolve(
        ).then(() => {
            if (this._provSelect.variationPath == null) { return; }

            // Download release assets
            let {catalogData} = RubicExtension.instance;
            let {sketch} = RubicExtension.instance;
            let prepare = catalogData.prepareCacheDir(
                this._provSelect.repositoryUuid, this._provSelect.releaseTag
            ).then(() => {});
            let confirm: Promise<void>;
            if ((this._provSelect.boardClass === sketch.boardClass) &&
                (this._provSelect.repositoryUuid === sketch.repositoryUuid) &&
                (this._provSelect.releaseTag === sketch.releaseTag) &&
                (this._provSelect.variationPath === sketch.variationPath)) {
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
            )).then((item) => {
                if (item === items[0]) {
                    // Save
                    return sketch.update(this._provSelect).then(() => {
                        this.updateStatusBar();
                    });
                } else {
                    // Return to variation select
                    this._provSelect.variationPath = null;
                }
            }).then(() => {
                return prepare;
            });
        }).then(() => {
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
        let {catalogData} = RubicExtension.instance;
        return Promise.resolve(
        ).then(() => {
            return catalogData.update();
        }).then(() => {
            this._triggerUpdate();
            let {lastModified} = catalogData;
            window.showInformationMessage(
                localize(
                    "catalog-updated-d",
                    "Rubic catalog has been update (Last modified: {0})",
                    lastModified ? lastModified.toLocaleString() : "N/A"
                )
            );
        });
    }

    /**
     * selectPort command receiver
     */
    public selectPort(): void {
        let {sketch} = RubicExtension.instance;
        let boardClass = BoardClassList.getClass(sketch.boardClass);
        boardClass.list().then((ports) => {
            let choose = (filter: boolean) => {
                interface PortQuickPickItem extends QuickPickItem {
                    path: string
                }
                let items: PortQuickPickItem[] = [];
                let hidden = 0;
                ports.forEach((port) => {
                    if (filter && port.unsupported) {
                        ++hidden;
                        return;
                    }
                    let item: PortQuickPickItem = {
                        label: port.path,
                        description: port.name,
                        path: port.path
                    }
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
                        label: localize("show-hidden-ports", "Show hidden ports"),
                        description: "", // filled after
                        path: null
                    };
                    if (hidden > 1) {
                        item.description = localize("ports-hidden-n", "{0} ports hidden", hidden);
                    } else {
                        item.description = localize("ports-hidden-1", "{0} port hidden", 1);
                    }
                    items.push(item);
                }
                let boardName = boardClass.name;
                let board = RubicExtension.instance.catalogData.getBoard(boardClass.name);
                if (board != null) {
                    boardName = toLocalizedString(board.name);
                }
                return window.showQuickPick(items, {
                    placeHolder: localize("select-port-msg", "Which {0} do you use?", boardName)
                }).then((item) => {
                    if (item == null) { return null; }
                    if (item.path != null) {
                        return item.path;
                    }
                    return choose(false);
                })
            };
            return choose(true);
        }).then((boardPath: string) => {
            if (boardPath != null) {
                return sketch.update({boardPath}).then(() => {
                    this.updateStatusBar();
                    this._triggerUpdate();
                });
            }
        });
    }

    /**
     * Initialize status bar extension
     */
    private _initStatusBar(context: ExtensionContext) {
        this._sbiBoard = window.createStatusBarItem(StatusBarAlignment.Left);
        this._sbiBoard.tooltip = localize("click-to-show-catalog", "Click here to show Rubic board catalog");
        this._sbiBoard.command = CMD_SHOW_CATALOG;
        context.subscriptions.push(this._sbiBoard);
        this._sbiPort = window.createStatusBarItem(StatusBarAlignment.Left);
        this._sbiPort.tooltip = localize("click-to-select-port", "Click here to select port");
        this._sbiPort.command = CMD_SELECT_PORT;
        context.subscriptions.push(this._sbiPort);
    }

    /**
     * Update status bar items
     */
    public updateStatusBar() {
        let {sketch, catalogData} = RubicExtension.instance;
        if (!sketch.loaded) {
            // No sketch (Rubic is disabled)
            this._sbiBoard.hide();
            this._sbiPort.hide();
        } else if (!sketch.boardClass) {
            // No board selected
            this._sbiBoard.text = "$(circuit-board) " + localize("no-board", "No board selected");
            this._sbiBoard.show();
            this._sbiPort.hide();
        } else {
            let board = catalogData.getBoard(sketch.boardClass);
            if (!board) {
                this._sbiBoard.text = "$(circuit-board) $(alert) " + localize("no-catalog", "No catalog");
                this._sbiBoard.show();
                this._sbiPort.hide();
            } else {
                this._sbiBoard.text = "$(circuit-board) " + toLocalizedString(board.name);
                this._sbiBoard.show();
                this._sbiPort.text = "$(triangle-right) " + (
                    sketch.boardPath || LOCALIZED_NO_PORT
                );
                this._sbiPort.show();
            }
        }
    }

    /**
     * Load cache
     */
    public loadCache(update: boolean = true, force: boolean = false): Promise<boolean> {
        let {context, catalogData} = RubicExtension.instance;
        let lastFetched = context.globalState.get("lastFetched", 0);
        let nextFetch = lastFetched + (UPDATE_PERIOD_MINUTES * 60 * 1000);
        return Promise.resolve(
        ).then(() => {
            // Load cache
            if (!catalogData.loaded) {
                return catalogData.load();
            }
        }).then(() => {
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
        }).catch((reason) => {
            if (!update) { return Promise.reject(reason); }
            // Reject reason is one of them
            //   1. Cache is not readable
            //   2. Cache is not valid JSON
            //   3. Cache is too old
            return catalogData.update().then(() => {
                context.globalState.update("lastFetched", Date.now());
                console.log(`Rubic catalog has been updated (force=${force})`);
                return true;
            });
        });
    }

    public provideTextDocumentContent(uri: Uri, token: CancellationToken): Promise<string> {
        let {context, catalogData} = RubicExtension.instance;
        console.log(`provideTextDocumentContent: ${uri}`);
        if (uri.scheme !== "rubic" || uri.authority !== "catalog") {
            return Promise.reject(Error("invalid URI for rubic catalog"));
        }
        return Promise.resolve(
        ).then(() => {
            let {sketch} = RubicExtension.instance;
            let template: Function = Handlebars.compile(
                readFileSync(path.join(context.extensionPath, "catalog.hbs"), "utf8")
            );
            let defaultPanel = 0;
            let variables: any = {
                extensionPath: context.extensionPath,
                command: CMD_SHOW_CATALOG,
                localized: {
                    official: localize("official", "Official"),
                    preview: localize("preview", "Preview"),
                    obsolete: localize("obsolete", "Obsolete"),
                    website: localize("website", "Website"),
                    loading: localize("loading", "Loading"),
                    changed: localize("changed", "Changed"),
                    not_selected: localize("not-selected", "Not selected"),
                    unselectable: localize("unselectable", "Unselectable"),
                    no_item: localize("no-item", "No item")
                },
                panels: [{
                    id: "board",
                    label: localize("board", "Board"),
                    withIcons: true,
                    favorites: true,
                    items: []
                },{
                    id: "repository",
                    label: localize("repository", "Repository"),
                    disabled: true,
                    items: []
                },{
                    id: "release",
                    label: localize("release", "Release"),
                    disabled: true,
                    items: []
                },{
                    id: "variation",
                    label: localize("variation", "Variation"),
                    disabled: true,
                    items: []
                },{
                    id: "details",
                    label: localize("details", "Details"),
                    disabled: true,
                    loading: localize("dl_firmware", "Downloading firmware"),
                    pages: []
                }]
            };

            if (!this._provSelect) {
                this._provSelect = <any>{};
            }
            let favoriteBoards = context.globalState.get("favoriteBoards", []);
            let [pb, pr, pe, pv, pd] = variables.panels;
            let sb: RubicCatalog.Board;
            let sr: RubicCatalog.RepositorySummary;
            let se: RubicCatalog.ReleaseSummary;
            let sv: RubicCatalog.Variation;

            // List boards
            pb.not_selected = (this._provSelect.boardClass == null);
            pb.changed = !pb.not_selected && (this._provSelect.boardClass !== sketch.boardClass);
            catalogData.boards.forEach((board) => {
                if (board.disabled) { return board.disabled; }
                let title = toLocalizedString(board.name);
                let settled = !pb.not_selected && (board.class === this._provSelect.boardClass);
                pb.items.push({
                    id: board.class,
                    icon: board.icon,
                    title: title,
                    description: toLocalizedString(board.description),
                    author: toLocalizedString(board.author),
                    website: toLocalizedString(board.website),
                    preview: !!board.preview,
                    favorite: (favoriteBoards.indexOf(board.class) >= 0),
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
                pr.not_selected = (this._provSelect.repositoryUuid == null);
                pr.changed = !pr.not_selected && (this._provSelect.repositoryUuid !== sketch.repositoryUuid);
                sb.repositories.forEach((firm) => {
                    if (firm.disabled) { return; }
                    if (!firm.cache) { return; }
                    let title = toLocalizedString(firm.cache.name);
                    let settled = !pr.not_selected && (firm.uuid === this._provSelect.repositoryUuid);
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
                pe.not_selected = (this._provSelect.releaseTag == null);
                pe.changed = !pe.not_selected && (this._provSelect.releaseTag !== sketch.releaseTag);
                sr.cache.releases.forEach((rel) => {
                    if (!rel.cache) { return; }
                    let title = toLocalizedString(rel.cache.name || {en: rel.name});
                    let settled = !pe.not_selected && (rel.tag === this._provSelect.releaseTag);
                    pe.items.push({
                        id: rel.tag,
                        title: title,
                        description: toLocalizedString(rel.cache.description || {en: rel.description}),
                        author: `${localize("tag", "Tag")} : ${rel.tag} / ${
                            localize("release-date", "Release date")
                            } : ${new Date(rel.published_at).toLocaleDateString()}`,
                        preview: !!rel.preview,
                        settled: settled,
                        _index: pe.items.length
                    });
                    if (settled) {
                        pe.decision = title;
                        se = rel;
                        defaultPanel = 3;
                    }
                });
            }

            // List variations (If release is selected)
            if (se) {
                pv.disabled = false;
                if (se.cache.variations.length === 1 && this._provSelect.variationPath == null) {
                    // Select variation automatically
                    this._provSelect.variationPath = se.cache.variations[0].path;
                }
                pv.not_selected = (this._provSelect.variationPath == null);
                pv.changed = !pv.not_selected && (this._provSelect.variationPath !== sketch.variationPath);
                se.cache.variations.forEach((vary) => {
                    let title = toLocalizedString(vary.name);
                    let settled = !pv.not_selected && (vary.path === this._provSelect.variationPath);
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
                })
            }

            // Make detail pages
            if (sv) {
                let md = new MarkdownIt(<any>{html: true});
                pd.disabled = false;
                pd.pages.push({
                    title: localize("conn_and_firmware", "Connection & Firmware"),
                    active: true,
                    content: md.render(`
## ${localize("connection", "Connection")}
* <a href="command:${CMD_SELECT_PORT}" class="catalog-page-button catalog-page-button-dropdown">${
    sketch.boardPath || LOCALIZED_NO_PORT
}</a><a href="command:${CMD_TEST_CONNECTION}" class="catalog-page-button">${
    localize("test-connection", "Test connection")
}</a>
## ${localize("firmware", "Firmware")}
* ${sv.path} (${"N/A"} kB)<br><a href="command:${CMD_WRITE_FIRMWARE}" class="catalog-page-button">${
    localize("write-firmware", "Write firmware to board")
}</a>
## ${localize("runtimes", "Runtimes")}
* List1
* List2
`)
                });
                if (sv.document != null) {
                    let md = new MarkdownIt();
                    pd.pages.push({
                        title: localize("document", "Document")
                    })
                }
            }

            if (this._currentPanel == null) {
                this._currentPanel = defaultPanel;
            }
            variables.panels[this._currentPanel].opened = true;

            // Generate HTML
            return template(variables);
        });
    }
}
