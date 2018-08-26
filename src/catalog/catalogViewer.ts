///<reference path="catalogViewer.d.ts" />
import * as nls from "vscode-nls";
import {
    Disposable,
    EventEmitter, ExtensionContext,
    Uri, ViewColumn,
    WebviewPanel,
    WorkspaceFolder,
    ProgressLocation,
    QuickPickItem,
} from "vscode";
import { CatalogData, toLocalizedString } from "./catalogData";
import { Sketch } from "../sketch";
import * as MarkdownIt from "markdown-it";
import { Runtime } from "../runtimes/runtime";
import { SystemComposition } from "../util/systemComposition";
import { extensionContext, vscode } from "../extension";
import { CacheStorage } from "../util/cacheStorage";
import * as dedent from "dedent";

import HandlebarsType = require("handlebars");
import { BoardConstructor } from "../boards/board";
const handlebars: typeof HandlebarsType = require("./handlebars");
require("./webview/catalog.hbs");
const localize = nls.loadMessageBundle(__filename);

export const CMD_SHOW_CATALOG = "extension.rubic.showCatalog";
export const CMD_UPDATE_CATALOG = "extension.rubic.updateCatalog";
export const CMD_SELECT_PORT  = "extension.rubic.selectPort";

export class CatalogViewer implements Disposable {
    /**
     * Activate catalog viewer related features
     */
    static activateExtension(context: ExtensionContext): any {
        context.subscriptions.push(
            vscode.commands.registerCommand(CMD_SHOW_CATALOG, this._showCatalog, this),
            vscode.commands.registerCommand(CMD_UPDATE_CATALOG, this._updateCatalog, this),
            vscode.commands.registerCommand(CMD_SELECT_PORT, this._selectPort, this),
        );
    }

    private static _pickWorkspaceFolder(callback: (workspaceFolder: WorkspaceFolder) => any): void {
        const func_name = `${this.name}._pickWorkspaceFolder`;
        Promise.resolve()
        .then(() => {
            const workspaces = (vscode.workspace.workspaceFolders || []).length;
            if (workspaces === 0) {
                vscode.window.showErrorMessage(localize(
                    "open-folder-first",
                    "Please open a folder to place files before opening Rubic board catalog"
                ));
                return;
            } else if (workspaces === 1) {
                return vscode.workspace.workspaceFolders![0];
            } else {
                return vscode.window.showWorkspaceFolderPick({
                    placeHolder: localize(
                        "select-wsfolder-to-use",
                        "Please select workspace folder which you want to use Rubic."
                    )
                });
            }
        })
        .then((workspaceFolder) => {
            if (workspaceFolder != null) {
                return callback(workspaceFolder);
            }
        })
        .catch((reason) => {
            console.warn(`[${func_name}] unexpected rejection:`, reason);
        });
    }

    private static _showCatalog(): void {
        this._pickWorkspaceFolder((workspaceFolder) => {
            return this.open(workspaceFolder);
        });
    }

    private static _updateCatalog(): void {
        vscode.window.withProgress({
            location: ProgressLocation.Window,
            title: localize("fetching-catalog", "Fetching latest catalog")
        }, (progress, token): Thenable<void> => {
            return CatalogData.instance.update({
                report: (message: string) => {
                    progress.report({ message });
                }
            }, true)
            .then(() => {});
        });
    }

    private static _selectPort(sketch?: Sketch): void {
        this._pickWorkspaceFolder((workspaceFolder) => {
            Sketch.find(workspaceFolder)
            .then((sketch) => {
                if (sketch != null) {
                    return this.selectPort(sketch);
                }
            });
        });
    }

    private static async selectPort(sketch: Sketch): Promise<void> {
        const { board } = sketch;
        if (board == null) {
            throw new Error("No board instance");
        }
        const boardClass = board.constructor as BoardConstructor;
        let choose = async (filter: boolean): Promise<string | undefined> => {
            interface PortQuickPickItem extends QuickPickItem {
                path?: string;
                rescan?: boolean;
            }
            const items: PortQuickPickItem[] = [];
            let hidden = 0;
            const ports = await boardClass.list();
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
            const item = await vscode.window.showQuickPick(items, {
                placeHolder: localize(
                    "select-port-msg", "Which {0} do you use?", boardClass.getBoardName()
                )
            });
            if (item == null) { return undefined; }
            if (item.rescan) { return choose(filter); }
            if (item.path == null) { return choose(false); }
            return item.path;
        };
        return choose(true).then((boardPath: string) => {
            if (boardPath != null) {
                sketch.boardPath = boardPath;
                return sketch.save();
            }
        });
    }

    static async open(workspaceFolder?: WorkspaceFolder): Promise<CatalogViewer | undefined> {
        if (workspaceFolder == null) {
            return;
        }
        let sketch = await Sketch.find(workspaceFolder, true);
        if (sketch == null) {
            return;
        }
        return sketch.showCatalog();
    }

    private _webview: WebviewPanel | null = null;
    private _onDidClose = new EventEmitter<CatalogViewer>();
    private _selected: SystemComposition;
    private readonly _renderDescriptor: CatalogRenderDescriptor;

    /**
     * An event to signal a viewer has benn closed.
     */
    get onDidClose() { return this._onDidClose.event; }

    /**
     * Sketch instance which is assigned to this catalog viewer
     */
    public readonly sketch: Sketch;

    /**
     * Construct catalog viewer
     * @param sketch Assigned sketch
     */
    constructor(sketch: Sketch) {
        this.sketch = sketch;
        this._selected = sketch.getSystemComposition();

        const extensionUri = Uri.file(extensionContext.extensionPath);
        this._renderDescriptor = {
            baseUri: extensionUri.with({ scheme: "vscode-resource" }).toString(),
            folderName: this.sketch.folderName,
            localized: {
                official: localize("official", "Official"),
                preview: localize("preview", "Preview"),
                obsolete: localize("obsolete", "Obsolete"),
                website: localize("website", "Website"),
                loading: localize("loading", "Loading"),
                changed: localize("changed", "Changed"),
                notSelected: localize("not-selected", "Not selected"),
                noItem: localize("no-item", "No item")
            },
            panels: [{
                panelId: "board",
                localizedTitle: localize("board", "Board"),
                withIcons: true,
            },{
                panelId: "repository",
                localizedTitle: localize("repository", "Repository"),
            },{
                panelId: "release",
                localizedTitle: localize("release", "Release"),
            },{
                panelId: "variation",
                localizedTitle: localize("variation", "Variation"),
            },{
                panelId: "details",
                localizedTitle: localize("details", "Details"),
                withPages: true,
            }]
        };
    }

    /**
     * Dispose object
     */
    dispose() {
        this.close();
    }

    /**
     * Open catalog viewer in VSCode window
     */
    open() {
        if (this._webview != null) {
            this._webview.reveal();
            return;
        }
        const extensionUri = Uri.file(extensionContext.extensionPath);
        this._webview = vscode.window.createWebviewPanel(
            `rubic-catalog-${this.sketch.folderUri.toString()}`,
            localize(
                "catalog-x",
                "Rubic board catalog ({0})",
                this.sketch.folderName
            ),
            ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true,
            }
        );
        const disposables: Disposable[] = [];
        this._webview.webview.onDidReceiveMessage(this._processRequest, this, disposables);
        this._webview.onDidDispose(() => {
            this._onDidClose.fire(this);
            this._webview = null;
            return disposables.reduce(
                (promise, disposable) => promise.then(() => disposable.dispose()),
                Promise.resolve()
            );
        }, this, disposables);
        this._webview.onDidChangeViewState((event) => {
            this._setFocusState(event.webviewPanel.active);
        }, this, disposables);
        this._setFocusState(this._webview.active);
        this._webview.webview.html = handlebars.templates["catalog.hbs"](this._renderDescriptor);
    }

    private _setFocusState(state: boolean) {
        vscode.commands.executeCommand("setContext", "rubicCatalogFocus", state);
    }

    /**
     * Close catalog viewer
     */
    close() {
        if (this._webview != null) {
            this._webview.dispose();
        }
    }

    /**
     * Handler for messages from WebView
     * @param message Message from WebView
     */
    private _processRequest(message: WebViewCommunication.Request): void {
        Promise.resolve()
        .then(() => {
            switch (message.request) {
            case "console":
                switch (message.level) {
                case "log":
                case "info":
                case "warn":
                case "error":
                    console[message.level]("[WebView]", ...message.messages);
                    return;
                }
                break;
            case "ready":
                return this._readyHandler(message);
            case "getCache":
                return this._getCacheHandler(message);
            case "setSelection":
                return this._setSelectionHandler(message);
            case "button":
                return this._buttonHandler(message);
            }
            console.warn("Unexpected request from WebView:", message);
        })
        .then(undefined, (reason) => {
            console.warn(
                `[${this.constructor.name}.prototype._processRequest]`,
                "Unexpected rejection:", reason
            );
        });
    }

    /**
     * Process ready request
     * @param message Message from WebView
     */
    private _readyHandler(message: WebViewCommunication.ReadyRequest): Thenable<void> {
        return this._syncSelections(true, true)
        .then(() => {
            let array: (string | undefined)[] = this._getSelectionArray(this._selected);
            array.push(undefined);
            let index = array.indexOf(undefined);
            this._postCommand({
                command: "openPanel",
                panelId: ["board", "repository", "release", "variation", "details"][index],
            });
        });
    }

    /**
     * Process getCache request
     * @param message Message from WebView
     */
    private _getCacheHandler(message: WebViewCommunication.GetCacheRequest): Thenable<void> {
        const key: string[] = [];
        return this._getCatalogData()
        .then((catalogData): any => {
            if (message.panelId === "board") {
                return this._generateBoardCache(catalogData);
            }
            key.push(message.key[0]);
            const board = catalogData.getBoard(message.key[0]);
            if (board == null) {
                return;
            }
            if (message.panelId === "repository") {
                return this._generateRepositoryCache(board);
            }
            key.push(message.key[1]);
            const repo = board.getRepository(message.key[1]);
            if ((repo == null) || (repo.cache == null) || (repo.cache.releases == null)) {
                return;
            }
            if (message.panelId === "release") {
                return this._generateReleaseCache(repo);
            }
            key.push(message.key[2]);
            const rel = repo.getRelease(message.key[2]);
            if (rel == null) {
                return;
            }
            if (message.panelId === "variation") {
                return this._generateVariationCache(rel);
            }
            key.push(message.key[3]);
            const vari = rel.getVariation(message.key[3]);
            if (vari == null) {
                return;
            }
            if (message.panelId === "details") {
                return this._generateDetailsCache(vari);
            }
            throw new Error(`Unknown panelId: ${message.panelId}`);
        })
        .then((data) => {
            this._postCommand({
                command: "setCache",
                panelId: message.panelId,
                key, data,
            });
        });
    }

    /**
     * Generate cache for board list
     * @param catalogData Catalog data
     */
    private _generateBoardCache(catalogData: CatalogData): CatalogItemDescriptor[] {
        const items: CatalogItemDescriptor[] = [];
        catalogData.boards.forEach((board) => {
            if (board.disabled) {
                return;
            }
            items.push({
                itemId: board.class,
                localizedTitle: toLocalizedString(board.name),
                official: false,
                preview: !!board.preview,
                obsolete: false,
                icon: board.icon,
                topics: board.topics.map((topic) => ({
                    color: topic.color || "gray",
                    localizedTitle: toLocalizedString(topic.name)
                })),
                localizedDescription: toLocalizedString(board.description),
                localizedDetails: toLocalizedString(board.author),
            });
        });
        return items;
    }

    /**
     * Generate cache for repository list
     * @param board Target board
     */
    private _generateRepositoryCache(board: CatalogData.Board): CatalogItemDescriptor[] {
        const items: CatalogItemDescriptor[] = [];
        board.repositories.forEach((repo) => {
            if (repo.disabled) {
                return;
            }
            let repoCache = repo.cache;
            items.push({
                itemId: repo.uuid,
                localizedTitle: repo.repo,
                localizedDescription: (repoCache != null) ? toLocalizedString(repoCache.description) : undefined,
                localizedDetails: repo.owner,
                official: !!repo.official,
                preview: (repoCache != null) ? !!repoCache.preview : false,
                obsolete: false,
            });
        });
        return items;
    }

    /**
     * Generate cache for release list
     * @param repo Target repository
     */
    private _generateReleaseCache(repo: CatalogData.Repository): CatalogItemDescriptor[] {
        const items: CatalogItemDescriptor[] = [];
        repo.cache!.releases!.forEach((rel) => {
            const tagTitle = localize("tag", "Tag");
            const relDateTitle = localize("release-date", "Release date");
            // const downloadedTitle = localize("downloaded", "Downloaded");
            const relCache = rel.cache;
            items.push({
                itemId: rel.tag,
                localizedTitle: (relCache.name != null ?
                    toLocalizedString(relCache.name) : rel.name),
                localizedDescription: (relCache.description != null ?
                    toLocalizedString(relCache.description) : rel.description),
                localizedDetails: `${tagTitle} : ${rel.tag} / ${relDateTitle} : ${new Date(rel.published_at).toLocaleDateString()}`,
                official: false,
                preview: !!rel.preview,
                obsolete: false,
            });
        });
        return items;
    }

    /**
     * Generate cache for variation list
     * @param rel Target release
     */
    private _generateVariationCache(rel: CatalogData.Release): CatalogItemDescriptor[] {
        const items: CatalogItemDescriptor[] = [];
        rel.cache.variations.forEach((vari) => {
            let topics: CatalogTopicDescriptor[] = [];
            for (let runtimeInfo of (vari.runtimes || [])) {
                try {
                    let runtime = Runtime.constructRuntime(runtimeInfo);
                    if (runtime != null) {
                        topics.push(...runtime.getCatalogTopics());
                    }
                }
                catch (error) {
                    // Ignore errors
                }
            }
            items.push({
                itemId: vari.path,
                localizedTitle: toLocalizedString(vari.name),
                localizedDescription: toLocalizedString(vari.description),
                official: false,
                preview: !!vari.preview,
                topics,
            });
        });
        return items;
    }

    /**
     * Generate cache for detail pages
     * @param vari Target variation
     */
    private _generateDetailsCache(vari: CatalogData.Variation): Thenable<CatalogPageDescriptor[]> {
        const pages: CatalogPageDescriptor[] = [];
        return Promise.resolve()
        .then(() => {
            if (vari.hasCache) {
                return vari.cachePath;
            }
            return vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: localize("downloading-firm", "Downloading firmware"),
                cancellable: false,
            }, (progress) => {
                return vari.release.download({
                    report: (message) => progress.report({ message }),
                });
            });
        })
        .then((cachePath) => {
            const stat = CacheStorage.statSync(cachePath);
            const sizeText = (stat.size >= 1024) ? `${Math.round(stat.size / 1024)} kB` : `${stat.size} bytes`;
            const md = new MarkdownIt("default", { html: true });
            pages.push({
                localizedTitle: localize("conn_and_firmware", "Connection & Firmware"),
                content: md.render(dedent`
                    ## ${localize("connection", "Connection")}
                    * <button data-button-id="port" class="${
                        ["", "-green", "-dropdown"].map((s) => `catalog-page-button${s}`).join(" ")
                    }">${
                        this.sketch.boardPath || localize("no-port", "No selected port")
                    }</button><button data-button-id="test" class="${
                        ["", "-blue"].map((s) => `catalog-page-button${s}`).join(" ")
                    }">${localize("test-connection", "Test connection")}</button>
                    ## ${localize("firmware", "Firmware")}
                    * ${vari.path} (${sizeText})<br><button data-button-id="writeFirmware" class="${
                        ["", "-blue"].map((s) => `catalog-page-button${s}`).join(" ")
                    }">${localize("write-firmware", "Write firmware to board")}</button>
                `),
            });
            const lines: string[] = [];
            (vari.runtimes || []).forEach((runtimeInfo) => {
                try {
                    const runtime = Runtime.constructRuntime(runtimeInfo);
                    lines.push(runtime.renderDetails());
                    if (runtime.getTemplatePath() != null) {
                        lines.push(dedent`
                        * ${localize("code-template", "Code template")}
                        <br><button data-button-id="template" data-button-data="${runtimeInfo.name}" class="${
                            ["", "-blue"].map((s) => `catalog-page-button${s}`).join(" ")
                        }>${localize("apply-template", "Apply template")}</button>
                        `);
                    }
                } catch (error) {
                    // Ignore errors
                }
            });
            if (lines.length > 0) {
                pages.push({
                    localizedTitle: localize("runtimes", "Runtimes"),
                    content: md.render(lines.join("\n")),
                });
            }
            if (vari.document != null) {
                pages.push({
                    localizedTitle: localize("document", "Document"),
                    content: md.render(toLocalizedString(vari.document)),
                });
            }
            return pages;
        });
    }

    /**
     * Process setSelection request
     * @param message Message from WebView
     */
    private _setSelectionHandler(message: WebViewCommunication.SetSelectionRequest): Thenable<void> {
        const newSelection = new SystemComposition();
        if ((newSelection.boardClassName = message.selection[0]) != null) {
            if ((newSelection.repositoryUuid = message.selection[1]) != null) {
                if ((newSelection.releaseTag = message.selection[2]) != null) {
                    newSelection.variationPath = message.selection[3];
                }
            }
        }
        this._selected = newSelection;
        console.log(
            `[${this.constructor.name}.prototype._setSelectionHandler]`,
            JSON.stringify(message.selection)
        );
        return this._syncSelections(true);
    }

    /**
     * Process button request
     * @param message Message from WebView
     */
    private _buttonHandler(message: WebViewCommunication.ButtonRequest): Thenable<void> {
        return Promise.resolve();
    }

    private _syncSelections(current: boolean, saved: boolean = false): Thenable<void> {
        return this._getCatalogData()
        .then((catalogData) => {
            if (current) {
                const localizedTitles: string[] = [];
                const board = catalogData.getBoard(this._selected.boardClassName);
                if (board != null) {
                    localizedTitles.push(toLocalizedString(board.name));
                    const repo = board.getRepository(this._selected.repositoryUuid);
                    if (repo != null) {
                        localizedTitles.push(repo.repo);
                        const rel = repo.getRelease(this._selected.releaseTag);
                        if (rel != null) {
                            localizedTitles.push((rel.cache.name != null) ? toLocalizedString(rel.cache.name) : rel.name);
                            const vari = rel.getVariation(this._selected.variationPath);
                            if (vari != null) {
                                localizedTitles.push(toLocalizedString(vari.name));
                            }
                        }
                    }
                }
                this._postCommand({
                    command: "setSelection",
                    selection: this._getSelectionArray(this._selected),
                    localizedTitles,
                });
            }
            if (saved) {
                this._postCommand({
                    command: "setSavedSelection",
                    selection: this._getSelectionArray(this.sketch.getSystemComposition()),
                });
            }
        });
    }

    private _getSelectionArray(selection: SystemComposition): string[] {
        const array = [
            selection.boardClassName,
            selection.repositoryUuid,
            selection.releaseTag,
            selection.variationPath,
            undefined
        ];
        return <string[]>array.slice(0, array.findIndex((value) => (value == null)) + 1);
    }

    private _postCommand(message: WebViewCommunication.Command): void {
        if (this._webview == null) {
            console.warn("Unexpected command posting:", message);
        } else {
            this._webview.webview.postMessage(message);
        }
    }

    private _getCatalogData(): Thenable<CatalogData> {
        const catalogData = CatalogData.instance;
        return Promise.resolve()
        .then(() => {
            if (!catalogData.isLoaded) {
                return catalogData.load();
            }
        })
        .then(() => {
            return catalogData;
        });
    }
}
