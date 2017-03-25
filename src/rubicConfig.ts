'use strict';

import * as nls from 'vscode-nls';
import * as path from 'path';
import * as fs from 'fs';
import * as semver from 'semver';

// Declaration only
import vscode = require("vscode");

let localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

namespace V1_0_x {
    export interface Top {
        /** Version of Rubic which saved configuration latest */
        rubicVersion: string;
        /** Minimum version of Rubic which saved this configuration */
        minRubicVersion?: string;
        /** Maximum version of Rubic which saved this configuration */
        maxRubicVersion?: string;
        /** Identifier of board */
        boardId: string;
        /** Path or address of board */
        boardPath?: string;
        /** Firmware information */
        firmware: Firm_GitHub;
        /** Use workspace local cache */
        localCache?: boolean;
    }

    interface Firm_GitHub {
        /** Owner of repository */
        owner: string;
        /** Name of repository */
        repo: string;
        /** Release name */
        release?: string;
        /** Blob sha value */
        blob?: string;
        /** Name of firmware */
        name?: string;
    }
}

// Old version structures for migration
namespace V0_9_x {
    export interface Top {
        __class__: string;
        rubicVersion: string;
        items: Item[];
        bootPath: string;
        board: Board;
        workspace: Object;
    }

    interface Item {
        __class__: string;
        path: string;
        builder: Builder;
        fileType?: Object;
        sourcePath?: string;
        transfer: boolean;
    }

    interface Board {
        __class__: string;
        friendlyName?: Object;
        rubicVersion?: string;
        firmwareId?: string;
        firmRevisionId?: string;
    }

    interface Builder {
        __class__: string;
        debugInfo?: boolean;
        enableDump?: boolean;
        compileOptions?: string;
    }
}

// Old version structures for migration
namespace V0_2_x {
    export interface Top {
        bootFile: string;
        sketch: Sketch;
        board?: Object;
    }

    interface Sketch {
        files: Object;
        downloadAll: boolean;
        rubicVersion: string;
        board: Board;
    }

    interface Board {
        class: string;
    }
}

/** Get filename of Rubic configration */
export function getRubicConfigFilename(workspaceRoot: string): string {
    return path.join(workspaceRoot, ".vscode", "rubic.json");
}

/** Version of this Rubic */
let _selfVersion: string;

export class RubicConfig {

    public get workspaceRoot(): string { return this._workspaceRoot; }

    public get boardId(): string { return this._get("boardId"); }
    public get boardPath(): string { return this._get("boardPath"); }
    public get firmwareId(): string { return this._get("firmwareId"); }

    public get transfer_include(): string[] {
        return this._get("transfer.include", ["*.mrb", "*.js"]);
    }
    public get transfer_exclude(): string[] {
        return this._get("transfer.exclude", []);
    }

    public get compile_include(): string[] {
        return this._get("compile.include", ["*.rb", "*.ts"]);
    }
    public get compile_exclude(): string[] {
        return this._get("compile.exclude", []);
    }

    private constructor(private _workspaceRoot: string, private _file: string, private _data: V1_0_x.Top) {
        if (!_selfVersion) {
            _selfVersion = require(path.join(__dirname, "..", "..", "package.json")).version;
        }
    }

    private _get(key: string, def?: any): any {
        if (this._data.hasOwnProperty(key)) {
            return this._data[key];            
        }
        return def;
    }

    /** Load configuration (with migrate when window argument passed) and construct instance */
    static load(workspaceRoot: string, window?: typeof vscode.window): Promise<RubicConfig> {
        let file = getRubicConfigFilename(workspaceRoot);
        return Promise.resolve(
        ).then(() => {
            return fs.readFileSync(file, "utf8");
        }).catch((reason) => {
            if (!window) { return Promise.reject(reason); }
            // Try migration from Rubic 0.9.x or earlier
            return this._migrateFromChrome(workspaceRoot, window);
        }).then((content) => {
            return new RubicConfig(workspaceRoot, file, content && JSON.parse(content));
        });
    }

    /** Reload configuration from file (All modifications will be discarded) */
    reload(): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            return fs.readFileSync(this._file, "utf8");
        }).then((jsonText) => {
            return JSON.parse(jsonText);
        }).then((content) => {
            this._data = content;
        });
    }

    /** Save configuration to file */
    save(): Promise<void> {
        return Promise.resolve(
        ).then(() => {
            // Update version history
            let minVer = this._data.minRubicVersion;
            let lastVer = this._data.rubicVersion;
            let maxVer = this._data.maxRubicVersion;
            
            if (minVer && semver.lt(_selfVersion, minVer)) {
                this._data.minRubicVersion = _selfVersion;
            } else if (lastVer && semver.lt(lastVer, _selfVersion)) {
                this._data.minRubicVersion = lastVer;
            }

            if (maxVer && semver.gt(_selfVersion, maxVer)) {
                this._data.maxRubicVersion = _selfVersion;
            } else if (lastVer && semver.gt(lastVer, _selfVersion)) {
                this._data.maxRubicVersion = lastVer;
            }

            this._data.rubicVersion = _selfVersion;

            return fs.writeFileSync(this._file, JSON.stringify(this._data));
        });
    }

    /** An event which fires when configuration file has been changed */
    onDidChangeConfiguration(listener: (e: RubicConfig) => any, thisArgs?: any, disposables?: vscode.Disposable[]): vscode.Disposable {
        let watcher = fs.watch(this._file, (event) => {
            if (event === "change") {
                listener.call(thisArgs, this);
            }
        });
        let disposable = {
            dispose: function(): any { watcher.close(); }
        };
        disposables && disposables.push(disposable);
        return <any>disposable;
    }

    /** Migrate from Chrome App Rubic (<= 0.9.x) */
    private static _migrateFromChrome(workspaceRoot: string, window: typeof vscode.window): Promise<void> {
        let oldFile = path.join(workspaceRoot, "sketch.json");
        let v09x: V0_9_x.Top;
        return Promise.resolve(
        ).then(() => {
            let content = JSON.parse(fs.readFileSync(oldFile, "utf8"));
            if (content.rubicVersion == null) {
                // 0.2.x -> 0.9.x
                let v02x = <V0_2_x.Top>content;
                v09x = {
                    __class__: "Sketch",
                    rubicVersion: v02x.sketch.rubicVersion,
                    items: [{
                        __class__: "SketchItem",
                        path: "main.rb", transfer: false,
                        builder: {
                            __class__: "MrubyBuilder",
                            debugInfo: true, enableDump: false, compileOptions: ""
                        }
                    }],
                    bootPath: "main.mrb",
                    board: {__class__: v02x.sketch.board.class},
                    workspace: {}
                };
            } else {
                v09x = <V0_9_x.Top>content;
            }

            // Confirm to user
            let items: vscode.QuickPickItem[] = [{
                label: localize("migrate-from-old-x", "Migrate settings from old Rubic {0}", v09x.rubicVersion),
                description: localize("migrate-desc", "Convert settings and generate files for new Rubic. This cannot be undone.")
            },{
                label: localize("cancel-migrate", "Cancel migration"),
                description: localize("cancel-migrate-desc", "Cancel migration. All files will be kept untouched.")
            }];
            return window.showQuickPick(items).then((choose) => {
                if (choose !== items[0]) {
                    return Promise.reject(Error(localize("canceled", "Operation cancelled")));
                }
            });
        }).then(() => {
            let rubic: V1_0_x.Top = <any>{};

            // Convert board information
            switch (v09x.board.__class__) {
            case "PeridotBoard":
                rubic.firmware = <any>{
                    // TODO
                };
                break;
            case "GrCitrusBoard":
                rubic.firmware = {
                    owner: "wakayamarb",
                    repo: "wrbb-v2lib-firm",
                    name: "2.12(2016/9/28)f3(256KB)",
                    // tree: dd174d9293dc11f7209c84a14930d2d6ffa077c2
                    // path: firmware/citrus_sketch.bin
                    blob: "db920d5a573558b88ee1a7b96460a2a622dc3a20"
                };
                break;
            case "WakayamaRbBoard":
                rubic.firmware = <any>{
                    owner: ""
                };
                break;
            default:
                return Promise.reject(Error(
                    localize("unknown-board-x", "Unknown board name: {0}", v09x.board.__class__)
                ));
            }
            rubic.boardId = v09x.board.__class__;
            return;
        });
    }
}