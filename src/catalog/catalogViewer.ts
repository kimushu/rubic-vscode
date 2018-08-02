///<reference path="catalogViewer.d.ts" />
import * as nls from "vscode-nls";
import { Board } from "../boards/board";
import {
    Disposable,
    EventEmitter, ExtensionContext,
    Uri, ViewColumn,
    WebviewPanel
} from "vscode";
import { CatalogData, toLocalizedString } from "./catalogData";
import { Sketch } from "../sketch";
import * as MarkdownIt from "markdown-it";
import { Runtime } from "../runtimes/runtime";
import { SystemComposition } from "../util/systemComposition";
require("promise.prototype.finally").shim();

import HandlebarsType = require("handlebars");
import { extensionContext, vscode } from "../extension";
const handlebars: typeof HandlebarsType = require("./handlebars");
require("./webview/catalog.hbs");
const localize = nls.loadMessageBundle(__filename);

export const CMD_SHOW_CATALOG = "extension.rubic.showCatalog";
export const CMD_SELECT_PORT  = "extension.rubic.selectPort";

export class CatalogViewer implements Disposable {
    /**
     * Activate sketch-related features
     */
    static activateExtension(context: ExtensionContext): any {
        context.subscriptions.push(
            vscode.commands.registerCommand(CMD_SHOW_CATALOG, this._showCatalog, this)
        );
    }

    private static _showCatalog(): void {
        const func_name = "CatalogViewer._showCatalog";
        let sketch: Sketch;
        Promise.resolve()
        .then(() => {
            const workspaces = (vscode.workspace.workspaceFolders || []).length;
            if (workspaces === 0) {
                /* TODO */
                throw new Error("not implemented");
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
            if (workspaceFolder == null) {
                return false;
            }
            sketch = new Sketch(workspaceFolder);
            return sketch.open(true);
        })
        .then((opened) => {
            if (opened && sketch != null) {
                return sketch.showCatalog();
            }
        })
        .catch((reason) => {
            console.warn(`[${func_name}] unexpected rejection:`, reason);
        });
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
        }, disposables);
        this._webview.webview.html = handlebars.templates["catalog.hbs"](this._renderDescriptor);
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
                case "debug":
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
                break;
            case "getCache":
                return this._getCacheHandler(message);
                break;
            case "setSelection":
                return this._setSelectionHandler(message);
                break;
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
        .then((catalogData) => {
            const items: CatalogItemDescriptor[] = [];
            if (message.panelId === "board") {
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
            key.push(message.key[0]);
            const board = catalogData.getBoard(message.key[0]);
            if (board == null) {
                return;
            }
            if (message.panelId === "repository") {
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
            key.push(message.key[1]);
            const repo = board.getRepository(message.key[1]);
            if ((repo == null) || (repo.cache == null) || (repo.cache.releases == null)) {
                return;
            }
            if (message.panelId === "release") {
                repo.cache.releases.forEach((rel) => {
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
                        localizedDetails: `${tagTitle} : ${rel.tag} / ${relDateTitle} : ${
                            new Date(rel.published_at).toLocaleDateString()}`,
                        official: false,
                        preview: !!rel.preview,
                        obsolete: false,
                    });
                });
                return items;
            }
            key.push(message.key[2]);
            const rel = repo.getRelease(message.key[2]);
            if (rel == null) {
                return;
            }
            if (message.panelId === "variation") {
                rel.cache.variations.forEach((vari) => {
                    let topics: CatalogTopicDescriptor[] = [];
                    for (let runtimeInfo of (vari.runtimes || [])) {
                        try {
                            let runtime = Runtime.constructRuntime(runtimeInfo);
                            if (runtime != null) {
                                topics.push(...runtime.getCatalogTopics());
                            }
                        } catch (error) {
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
            key.push(message.key[3]);
            const vari = rel.getVariation(message.key[3]);
            if (vari == null) {
                return;
            }
            // TODO
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
        console.debug(
            `[${this.constructor.name}.prototype._setSelectionHandler]`,
            JSON.stringify(message.selection)
        );
        return this._syncSelections(true);
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
