'use strict';

import {
    StatusBarItem, StatusBarAlignment, EventEmitter,
    Uri, CancellationToken,
    ViewColumn, ProviderResult, MessageItem,
    Disposable, TextDocumentContentProvider, QuickPickItem,
    commands, window, workspace, ExtensionContext
} from 'vscode';

import { RubicBoard, BoardClass } from "./rubicBoard";
import { BoardClassList } from "./boardClassList";
import * as path from 'path';
import * as util from 'util';
import * as Handlebars from 'handlebars';
import { readFileSync, watch, FSWatcher } from 'fs';
import * as nls from 'vscode-nls';
import { RubicExtension } from "./extension";
import { CatalogData, toLocalizedString } from "./catalogData";
import { SketchLoadResult } from "./sketch";
import { CacheStorage } from './cacheStorage';

let localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

const URI_CATALOG = Uri.parse("rubic://catalog");
const CMD_SHOW_CATALOG = "extension.rubic.showCatalog";
const CMD_SELECT_PORT  = "extension.rubic.selectPort";
const UPDATE_PERIOD_MINUTES = 12 * 60;

interface CatalogSelection {
    boardClass: string;
    firmwareUuid: string;
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
            })
        );
        context.subscriptions.push(
            commands.registerCommand(CMD_SELECT_PORT, () => {
                this.selectPort();
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
            return sketch.load(window);
        }).then((result) => {
            if (result === SketchLoadResult.LOAD_CANCELED) { return; }
            this._provSelect = {
                boardClass: sketch.boardClass,
                firmwareUuid: sketch.firmwareUuid,
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
            case "firmware":
                this._provSelect.firmwareUuid = id;
                id = null;
                // fall through
            case "release":
                this._provSelect.releaseTag = id;
                id = null;
            case "variation":
                this._provSelect.variationPath = id;
                id = null;
        }

        // Update page
        console.log(`_provSelect:${JSON.stringify(this._provSelect)}`);
        this._currentPanel = null;
        this._onDidChange.fire(URI_CATALOG);
        if ((this._provSelect.boardClass != null) &&
            (this._provSelect.firmwareUuid != null) &&
            (this._provSelect.releaseTag != null) &&
            (this._provSelect.variationPath != null)) {
            let {sketch} = RubicExtension.instance;
            if ((this._provSelect.boardClass !== sketch.boardClass) ||
                (this._provSelect.firmwareUuid !== sketch.firmwareUuid) ||
                (this._provSelect.releaseTag !== sketch.releaseTag) ||
                (this._provSelect.variationPath !== sketch.variationPath)) {
                /*
                let items: MessageItem[] = [{
                    title: "OK"
                }];
                window.showInformationMessage(
                    localize("board-changed", "Board configuration has been changed. Are you sure to save?"),
                    ...items
                ).then((item) => {
                    console.log(item);
                });*/
            }
        }
    }

    /**
     * selectPort command receiver
     */
    public selectPort(): void {
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
                this._sbiBoard.text = "$(circuit-board) $(alert)" + localize("no-catalog", "No catalog");
                this._sbiBoard.show();
                this._sbiPort.hide();
            } else {
                this._sbiBoard.text = "$(circuit-board) " + toLocalizedString(board.name);
                this._sbiBoard.show();
                this._sbiPort.text = "$(triangle-right) " + (
                    sketch.boardPath || localize("no-port", "No port selected")
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
                    id: "firmware",
                    label: localize("firmware", "Firmware"),
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
                    id: "summary",
                    label: localize("summary", "Summary"),
                    disabled: true,
                    summary: {}
                }]
            };

            if (!this._provSelect) {
                this._provSelect = <any>{};
            }
            let favoriteBoards = context.globalState.get("favoriteBoards", []);
            let [pb, pf, pr, pv, ps] = variables.panels;
            let sb: RubicCatalog.Board;
            let sf: RubicCatalog.FirmwareSummary;
            let sr: RubicCatalog.ReleaseSummary;
            let sv: RubicCatalog.Variation;

            // List boards
            pb.not_selected = (this._provSelect.boardClass == null);
            pb.changed = !pb.not_selected && (this._provSelect.boardClass !== sketch.boardClass);
            catalogData.boards.forEach((board) => {
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

            // List firmwares (If board is selected)
            if (sb) {
                pf.disabled = false;
                pf.not_selected = (this._provSelect.firmwareUuid == null);
                pf.changed = !pf.not_selected && (this._provSelect.firmwareUuid !== sketch.firmwareUuid);
                sb.firmwares.forEach((firm) => {
                    if (firm.disabled) { return; }
                    if (!firm.cache) { return; }
                    let title = toLocalizedString(firm.cache.name);
                    let settled = !pf.not_selected && (firm.uuid === this._provSelect.firmwareUuid);
                    pf.items.push({
                        id: firm.uuid,
                        title: title,
                        description: toLocalizedString(firm.cache.description),
                        author: firm.owner,
                        website: makeGithubURL(firm.owner, firm.repo, firm.branch),
                        official: !!firm.official,
                        preview: !!firm.cache.preview,
                        settled: settled,
                        _index: pf.items.length
                    });
                    if (settled) {
                        pf.decision = title;
                        sf = firm;
                        defaultPanel = 2;
                    }
                });
            }

            // List releases (If firmware is selected)
            if (sf) {
                pr.disabled = false;
                pr.not_selected = (this._provSelect.releaseTag == null);
                pr.changed = !pr.not_selected && (this._provSelect.releaseTag !== sketch.releaseTag);
                sf.cache.releases.forEach((rel) => {
                    if (!rel.cache) { return; }
                    let title = toLocalizedString(rel.cache.name || {en: rel.name});
                    let settled = !pr.not_selected && (rel.tag === this._provSelect.releaseTag);
                    pr.items.push({
                        id: rel.tag,
                        title: title,
                        description: toLocalizedString(rel.cache.description || {en: rel.description}),
                        author: `${localize("tag", "Tag")} : ${rel.tag} / ${
                            localize("release-date", "Release date")
                            } : ${new Date(rel.published_at).toLocaleDateString()}`,
                        preview: !!rel.preview,
                        settled: settled,
                        _index: pr.items.length
                    });
                    if (settled) {
                        pr.decision = title;
                        sr = rel;
                        defaultPanel = 3;
                    }
                });
            }

            // List variations (If release is selected)
            if (sr) {
                pv.disabled = false;
                if (sr.cache.variations.length === 1 && this._provSelect.variationPath == null) {
                    // Select variation automatically
                    this._provSelect.variationPath = sr.cache.variations[0].path;
                }
                pv.not_selected = (this._provSelect.variationPath == null);
                pv.changed = !pv.not_selected && (this._provSelect.variationPath !== sketch.variationPath);
                sr.cache.variations.forEach((vary) => {
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
                        ps.disabled = false;
                        ps.opened = (this._currentPanel === 4);
                        ps.summary.icon = sb.icon;
                        ps.summary.groups = [{
                            header: localize("connection", "Connection"),
                            buttons: [{
                                text: sketch.boardPath || localize("select-port", "Select port"),
                                dropdown: true
                            },{
                                text: localize("test-connection", "Test connection")
                            }]
                        },{
                            header: localize("exec-runtime", "Program execution runtime"),
                            text: vary.runtimes.map((rt) => rt.name).join(", ")
                        },{
                            header: variables.panels[1].label,
                            text: "TODO",
                            buttons: [{
                                text: localize("write-firmware", "Write firmware to board")
                            }]
                        }];
                        defaultPanel = 4;
                    }
                })
            }

            if (this._currentPanel == null) {
                this._currentPanel = defaultPanel;
            }
            variables.panels[this._currentPanel].opened = true;
            console.log("current" + this._currentPanel);

            // Generate HTML
            return template(variables);
        });
    }
}
