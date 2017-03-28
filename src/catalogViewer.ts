'use strict';

import {
    StatusBarItem, StatusBarAlignment,
    Uri, CancellationToken,
    ViewColumn, ProviderResult,
    Disposable, TextDocumentContentProvider, QuickPickItem,
    commands, window, workspace
} from 'vscode';

import { RubicBoard, BoardClass } from "./rubicBoard";
import { BoardClassList } from "./boardClassList";
import * as path from 'path';
import * as util from 'util';
import * as Handlebars from 'handlebars';
import { readFileSync, watch, FSWatcher } from 'fs';
import * as nls from 'vscode-nls';

let localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

const CMD_SHOW_CATALOG = "extension.rubic.showCatalog";
const CMD_SELECT_PORT  = "extension.rubic.selectPort";

export class BoardCatalogViewer implements TextDocumentContentProvider {
    private _content: any; // TODO: add declaration from rubic-catalog
    private _sbiBoard: StatusBarItem;
    private _sbiPort: StatusBarItem;
    private _boardId: string;
    private _boardPath: string;
    private _boardClass: BoardClass;
    private _firmwareId: string;
    private _configFile: string;
    private _watcher: FSWatcher;
    private _errorPopupBarrier: string = null;

    private static _instance: BoardCatalogViewer;
    public static get instance(): BoardCatalogViewer {
        return this._instance;
    }

    private _disposable: Disposable;
    public dispose(): void {
        this._disposable.dispose();
        this._watcher && this._watcher.close();
    }

    public constructor(private _extensionPath: string) {
        super();

        if (BoardCatalogViewer._instance) {
            console.warn("Multiple BoardCatalog instances!");
            BoardCatalogViewer._instance.dispose();
        }
        BoardCatalogViewer._instance = this;

        let subscriptions: Disposable[] = [];

        // Register commands
        subscriptions.push(
            commands.registerCommand(CMD_SHOW_CATALOG, (param) => {
                this.showCatalog(param);
            })
        );
        subscriptions.push(
            commands.registerCommand(CMD_SELECT_PORT, (...args) => {
                this.selectPort(...args);
            })
        );

        subscriptions.push(
            workspace.registerTextDocumentContentProvider("rubic", this)
        );

        // Add status bar item
        this._sbiBoard = window.createStatusBarItem(StatusBarAlignment.Left);
        subscriptions.push(this._sbiBoard);
        this._sbiPort = window.createStatusBarItem(StatusBarAlignment.Left);
        subscriptions.push(this._sbiPort);

        this._sbiBoard.tooltip = localize("click-to-show-catalog", "Click here to show Rubic board catalog");
        this._sbiBoard.command = CMD_SHOW_CATALOG;
        this._sbiPort.tooltip = localize("click-to-select-port", "Click here to select port");
        this._sbiPort.command = CMD_SELECT_PORT;
        this._updateStatusBar();

        // Watch .rubic file to update status bar
        let {rootPath} = workspace;
        this._configFile = path.join(rootPath, ".vscode", "rubic.json");

        if (rootPath) {
            try {
                this._watcher = watch(
                    this._configFile, {}, this._configListener.bind(this)
                );
                this._configListener("change", null);
            } catch (error) {
                // Ignore errors
            }
        }

        this._disposable = Disposable.from(...subscriptions);
    }

    public showCatalog(param): void {
        console.log("TODO: show catalog:" + util.format(param));
        if (param) {
            return;
        }
        let active = window.activeTextEditor;
        commands.executeCommand("vscode.previewHtml",
            Uri.parse("rubic://catalog"),
            (active ? active.viewColumn : ViewColumn.One),
            localize("catalog-title", "Rubic board catalog")
        )
    }

    public selectPort(...args): void {
        console.log("TODO: selectPort:" + util.format(args));
        if (!this._boardClass) { return; }

        this._boardClass.list().then((ports) => {
            let list: QuickPickItem[] = [];
            ports.forEach((port) => {
                list.push({
                    label: port.path,
                    description: port.name
                });
            });
            list.push({
                description: "description",
                detail: "detail",
                label: "label"
            });
            if (list.length === 0) {
                window.showErrorMessage(
                    localize("board-not-connected", "No connected board")
                );
                return;
            }
            window.showQuickPick(list).then((selection) => {
                let index = list.indexOf(selection);
                if (index >= 0) {
                    this._boardPath = ports[index].path;
                    this._updateStatusBar();
                    console.warn("TODO: port change")
                    this._testOnExtensionHost();
                    return;
                }
            })
        });
    }

    /**
     * Load catalog
     */
    public load(update?: boolean, force?: boolean): Promise<void> {
        return Promise.resolve({
        }).then(() => {
            return update && this.updateCache(force);
        }).then(() => {
            return CacheStorage.readFile(CATALOG_JSON, "utf8");
        }).then((content: string) => {
            this._content = JSON.parse(content);
        });
    }

    /**
     * Update cache
     */
    public updateCache(force?: boolean): Promise<boolean> {
        let lastFetched = CacheStorage.getMementoData("lastFetched", 0);
        let nextFetch = lastFetched + (UPDATE_PERIOD_MINUTES * 60 * 1000);
        return CacheStorage.readFile(CATALOG_JSON, "utf8").then((content: string) => {
            JSON.parse(content);
            // JSON is valid
            if (!force && Date.now() < nextFetch) {
                return false;   // Success without update
            }
            // Too old. Try update
            return Promise.reject(null);
        }).catch(() => {
            // Reject reason is one of them
            //   1. Cache is not readable
            //   2. Cache is not valid JSON
            //   3. Cache is too old
            return readGithubFile(OFFICIAL_CATALOG, CATALOG_JSON).then((content) => {
                JSON.parse(content.toString());
                // JSON is valid
                return CacheStorage.writeFile(CATALOG_JSON, content);
            }).then(() => {
                return true;    // Success with update
            });
        });
    }

    private _configListener(eventType: string, filename: string): void {
        if (eventType !== "change") { return; }

        let suffix = " : " + localize(
            "rubic-cfg-file",
            "Rubic configuration file ({0})",
            path.relative(workspace.rootPath, this._configFile)
        );
        let cfg;
        try {
            cfg = JSON.parse(readFileSync(this._configFile, "utf8"));
        } catch (error) {
            if (this._errorPopupBarrier === "invalid-rubic-cfg") { return; }
            this._errorPopupBarrier = "invalid-rubic-cfg";
            window.showErrorMessage(error.toString()).then(() => {
            window.showErrorMessage(localize(
                "invalid-rubic-cfg",
                "Incorrect JSON format",
            ) + suffix).then(() => { this._errorPopupBarrier = null; });});
            return;
        }

        if (typeof(cfg.boardId) !== "string") {
            if (this._errorPopupBarrier === "invalid-board-id") { return; }
            this._errorPopupBarrier = "invalid-board-id";
            window.showErrorMessage(localize(
                "invalid-board-id",
                "'boardId' key with string value is required"
            ) + suffix).then(() => { this._errorPopupBarrier = null; });
            return;
        }

        let boardClass: BoardClass = BoardClassList.getClassFromBoardId(cfg.boardId);
        if (!boardClass) {
            window.showErrorMessage(localize(
                "unknown-board-id",
                "Unknown board ID '{0}'",
                cfg.boardId
            ));
            return;
        }
        this._boardId = cfg.boardId;
        this._boardPath = cfg.boardPath;
        this._boardClass = boardClass;
        this._updateStatusBar();
    }

    private _updateStatusBar(): void {
        if (!this._boardClass) {
            this._sbiBoard.text = "$(circuit-board) " + localize("no-board", "No board selected");
            this._sbiBoard.show();
            this._sbiPort.hide();
            return;
        }
        this._sbiBoard.text = "$(circuit-board) " + this._boardClass.getName(this._boardId);
        this._sbiBoard.show();
        this._sbiPort.text = "$(triangle-right) " + (
            this._boardPath || localize("no-port", "No port selected")
        );
        this._sbiPort.show();
    }

    public provideTextDocumentContent(uri: Uri, token: CancellationToken): Promise<string> {
        if (uri.scheme !== "rubic" || uri.authority !== "catalog") {
            return Promise.reject(Error("invalid URI for rubic catalog"));
        }
        console.log("provider> " + util.format(uri));
        return Promise.resolve(
        ).then(() => {
            let template: Function = Handlebars.compile(
                readFileSync(path.join(this._extensionPath, "catalog.hbs"), "utf8")
            );
            let context: any = {
                currentPage: uri.query,
                extensionPath: this._extensionPath,
                command: CMD_SHOW_CATALOG,
                localized: {
                    website: localize("website", "Website"),
                    settled: localize("settled", "Settled"),
                    not_selected: localize("not-selected", "Not selected"),
                    unselectable: localize("unselectable", "Unselectable")
                },
                panels: [{
                    label: "ボード",
                    decision: "GR-CITRUS",
                    active: true,
                    withIcons: true,
                    items: [{
                        icon: "boards/peridot_64x64.png",
                        title: "PERIDOT Classic",
                        preview: "プレビュー版",
                        description: "ハードウェア構成をカスタマイズできるFPGA搭載のArduino互換形状ボード。",
                        tags: [{
                            name: "FPGA"
                        },{
                            color: "red",
                            name: "Ruby"
                        },{
                            color: "orange",
                            name: "JavaScript"
                        }],
                        author: "J-7SYSTEM WORKS",
                        website: "http://hoge/bar"
                    },{
                        icon: "boards/grcitrus_64x64.png",
                        title: "GR-CITRUS",
                        description: "Rubyが気軽に使える小型マイコンボード。ルネサス製32ビットマイコンRX631グループMCUを搭載。",
                        tags: [{
                            name: "RXマイコン",
                        },{
                            color: "red",
                            name: "Ruby"
                        }],
                        author: "Wakayama.rb"
                    },{
                        icon: "boards/wrbb_64x64.png",
                        title: "Wakayama.rb ボード",
                        description: "mrubyを搭載した小型マイコンボード。",
                        tags: [{
                            name: "RXマイコン",
                        },{
                            color: "red",
                            name: "Ruby"
                        }],
                        author: "Minao Yamamoto"
                    }]
                },{
                    label: "ファームウェア",
                    disabled: true
                },{
                    label: "リリース"
                },{
                    label: "バリエーション"
                },{
                    label: "まとめ"
                }]
            };
            return template(context);
        });
    }

    private _testOnExtensionHost(): void {
        let board = new this._boardClass(this._boardId, this._boardPath);
        let wfile = "main.js";
        let written: Buffer = readFileSync(path.join(workspace.rootPath, wfile));
        Promise.resolve(
        ).then(() => {
            return board.connect();
        }).then(() => {/*
            return board.getInfo();
        }).then((info) => {
            window.showInformationMessage(util.format(info));
        }).then(() => {
            written = Buffer.alloc(123);
            for (let i = 0; i < written.byteLength; ++i) { written[i] = i & 255; }
            return board.writeFile(wfile, written);
        }).then(() => {
            return board.readFile(wfile);
        }).then((buf) => {
            if (buf.equals(written)) {
                return window.showInformationMessage(`verify OK! ${buf.length} bytes`);
            } else {
                return window.showErrorMessage(`verify NG! ${buf.length} bytes`);    
            }*/
        }).then(() => {
            //return board.formatStorage();
        }).then(() => {
            return board.readFile(wfile);
        }).then((cnt: Buffer) => {
            if (cnt.equals(written)) {
                console.log("write skip");
                return;
            }
            return board.writeFile(wfile, written);
        }).then(() => {
            return board.runSketch(wfile);
        }).then(() => {
            return window.showInformationMessage("running...");
        }).then(() => {
            return board.disconnect();
        }).then(() => {
            window.showInformationMessage("test done");
            board.dispose();
        }).catch((err) => {
            window.showErrorMessage(err.toString());
            board.dispose();
        })
    }
}
