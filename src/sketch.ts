'use strict';

import * as nls from 'vscode-nls';
import * as path from 'path';
import * as fs from 'fs';
import * as semver from 'semver';
import { RUBIC_VERSION } from './rubicVersion';
import * as CJSON from 'comment-json';
///<reference path="../schema/sketch.d.ts" />

// Declaration only
import vscode = require("vscode");

const SKETCH_ENCODING = "utf8";
const LAUNCH_ENCODING = "utf8";
let localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

export enum SketchLoadResult {
    LOAD_SUCCESS,
    LOAD_MIGRATED,
    LOAD_CANCELED,
    NO_SKETCH,
};

/**
 * Rubic configuration for each workspace
 * (.vscode/rubic.json)
 */
export class Sketch implements vscode.Disposable {
    private _rubicFile: string;
    private _launchFile: string;
    private _watcher: fs.FSWatcher;
    private _data: V1_0_x.Top;

    /**
     * Construct sketch instance
     * @param _workspaceRoot Root path of workspace
     * @param _window vscode window module (for extension host process)
     */
    constructor(private _workspaceRoot: string, private _window?: typeof vscode.window) {
        this._rubicFile = path.join(_workspaceRoot, ".vscode", "rubic.json");
        this._launchFile = path.join(_workspaceRoot, ".vscode", "launch.json");
    }

    /**
     * Load configuration (with migration when window argument passed)
     */
    load(convert: boolean = false): Promise<SketchLoadResult> {
        let result = SketchLoadResult.LOAD_SUCCESS;
        this.close();
        return Promise.resolve(
        ).then(() => {
            // Read sketch data
            return fs.readFileSync(this._rubicFile, SKETCH_ENCODING);
        }).catch((reason) => {
            if (!convert || !this._window) {
                result = SketchLoadResult.NO_SKETCH;
                return null;
            }
            // Try migration from Rubic 0.9.x or earlier
            return this._migrateFromChrome().then((migrateResult) => {
                result = migrateResult;
                if (result === SketchLoadResult.LOAD_MIGRATED) {
                    // Read migrated data again
                    return fs.readFileSync(this._rubicFile, SKETCH_ENCODING);
                }
            })
        }).then((jsonText: string) => {
            if (jsonText) {
                this._data = JSON.parse(jsonText);
                this._watcher = fs.watch(this._rubicFile);
            }
            return result;
        });
    }

    /** Close sketch */
    close() {
        this._watcher && this._watcher.close();
        this._watcher = null;
        this._data = null;
    }

    /** Dispose this instance */
    dispose() {
        this.close();
    }

    /** Path of workspace */
    get workspaceRoot() { return this._workspaceRoot; }

    /** Filename of sketch data */
    get filename() { return this._rubicFile; }

    /** Check if sketch is loaded */
    get loaded() { return (this._data != null); }

    /** Get watcher */
    get watcher() { return this._watcher; }

    /** Get board class */
    get boardClass() { return this._data && this._data.boardClass; }

    /** Get board path */
    get boardPath() { return this._data && this._data.boardPath; }

    /** Get repository UUID */
    get repositoryUuid() { return this._data && this._data.repositoryUuid; }

    /** Get release tag */
    get releaseTag() { return this._data && this._data.releaseTag; }

    /** Get variation path */
    get variationPath() { return this._data && this._data.variationPath; }

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

    update(obj): Promise<void> {
        return Promise.resolve({
        }).then(() => {
            return this._ensureSaved(this._rubicFile);
        }).then(() => {
            return this.load();
        }).then(() => {
            if (this._data == null) {
                this._data = <any>{};
            }
            if (!semver.valid(this._data.rubicVersion)) {
                this._data.rubicVersion = RUBIC_VERSION;
            } else if (semver.lt(this._data.rubicVersion, RUBIC_VERSION)) {
                if (this._data.minRubicVersion == null) {
                    this._data.minRubicVersion = this._data.rubicVersion;
                }
            } else if (semver.gt(this._data.rubicVersion, RUBIC_VERSION)) {
                if (this._data.maxRubicVersion == null) {
                    this._data.maxRubicVersion = this._data.rubicVersion;
                }
            }
            for (let key in obj) {
                this._data[key] = obj[key];
            }
            fs.writeFileSync(this._rubicFile, JSON.stringify(this._data, null, 4), SKETCH_ENCODING);
        });
    }

    private _get(key: string, def?: any): any {
        if (this._data.hasOwnProperty(key)) {
            return this._data[key];            
        }
        return def;
    }

    /**
     * Migrate from Chrome App Rubic (<= 0.9.x)
     */
    private _migrateFromChrome(): Promise<SketchLoadResult> {
        let oldFile = path.join(this._workspaceRoot, "sketch.json");
        return Promise.resolve({
        }).then(() => {
            return JSON.parse(fs.readFileSync(oldFile, SKETCH_ENCODING));
        }).catch(() => {
            return Promise.reject(SketchLoadResult.NO_SKETCH);
        }).then((content) => {
            let v09x: V0_9_x.Top;
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
            return v09x;
        }).then((v09x: V0_9_x.Top) => {
            let items: vscode.MessageItem[] = [
                { title: localize("cancel", "Cancel"), isCloseAffordance: true },
                { title: localize("convert", "Convert") },
                { title: localize("yes", "Yes") },
                { title: localize("no-keep", "No (Keep old settings)") }
            ];

            // Confirm to user
            return Promise.resolve(
            ).then(() => {
                return this._window.showInformationMessage(
                    localize(
                        "convert-sketch-confirm",
                        "This sketch was created by old version of Rubic. Are you sure to convert?"
                    ),
                    items[1], items[0]
                );
            }).then((item) => {
                if (item.isCloseAffordance) { return Promise.reject(SketchLoadResult.LOAD_CANCELED); }
                return this._window.showWarningMessage(
                    localize(
                        "convertion-warning",
                        "Are you sure to delete old settings? (This cannot be undone)"
                    ),
                    items[2], items[3], items[0],
                );
            }).then((item) => {
                if (item.isCloseAffordance) { return <any>Promise.reject(SketchLoadResult.LOAD_CANCELED); }
                if (item === items[2]) {
                    return true;
                }
                return false;
            }).then((keepOld: boolean) => {
                let top: V1_0_x.Top = <any>{};

                // Convert board information
                switch (v09x.board.__class__) {
                    case "PeridotBoard":
                        top.boardClass = "PeridotClassicBoard";
                        top.repositoryUuid = "d0a9b0f1-ff57-4f3b-b121-d8e5ad173725";
                        top.releaseTag = "v0.1.x";
                        top.variationPath = "plain_plain_epcs4_auto.rpd";
                        break;
                    case "GrCitrusBoard":
                        top.boardClass = "GrCitrusBoard";
                        top.repositoryUuid = "809d1206-8cd8-46f6-a657-2f60c050d7c9";
                        top.releaseTag = "v2.12";
                        top.variationPath = "citrus_sketch.bin";
                        break;
                    case "WakayamaRbBoard":
                        top.boardClass = "WakayamaRbBoard";
                        top.repositoryUuid = "1ac3a112-1640-482f-8ca3-cf5afc181fe6";
                        // top.releaseTag = "";
                        // top.variationPath = "";
                        break;
                    default:
                        return Promise.reject(Error(
                            localize("unknown-board-x", "Unknown board name: {0}", v09x.board.__class__)
                        ));
                }
                top.rubicVersion = RUBIC_VERSION;
                top.minRubicVersion = v09x.rubicVersion;

                fs.writeFileSync(this._rubicFile, JSON.stringify(top));
                if (!keepOld) {
                    fs.unlink(oldFile);
                }

                return this._mergeLaunchConfig();
            }).then(() => {
                return SketchLoadResult.LOAD_MIGRATED;
            });
        }).catch((error) => {
            switch (error) {
                case SketchLoadResult.LOAD_CANCELED:
                case SketchLoadResult.NO_SKETCH:
                    return <SketchLoadResult>error;
            }
            return Promise.reject(error);
        });
    }

    private _mergeLaunchConfig(): Promise<void> {
        return Promise.resolve({
        }).then(() => {
            return this._ensureSaved(this._launchFile);
        }).then(() => {
            try {
                return fs.readFileSync(this._launchFile, LAUNCH_ENCODING);
            } catch (error) {
                // Ignore error here
                return '{"version":"0.1.0","configurations":[]}';
            }
        }).then((jsonText: string) => {
            return CJSON.parse(jsonText);
        }).then((obj: any) => {
            let cfg = obj.configurations || (obj.configurations = []);
            cfg.push({
                type: "rubic",
                request: "launch",
                name: "Launch on target board",
                workspaceRoot: "${workspaceRoot}",
                program: "${workspaceRoot}/${command:GuessProgramName}"
            });
            fs.writeFileSync(this._launchFile, CJSON.stringify(cfg, null, 4), LAUNCH_ENCODING);
        });
    }

    private _ensureSaved(fileName: string, confirm: boolean = true): Promise<void> {
        let name = path.relative(fileName, this._workspaceRoot);
        let editor = this._window.visibleTextEditors.find((editor) => {
            return path.relative(editor.document.fileName, fileName) === "";
        });
        if (!editor || !editor.document.isDirty) {
            return Promise.resolve();
        }
        if (!confirm) {
            return Promise.reject(Error(
                localize(
                    "file-x-not-saved",
                    "File \"{0}\" is modified and not saved",
                    name
                )
            ));
        }
        return Promise.resolve(this._window.showInformationMessage(
            localize(
                "save-close-x-to-continue",
                "Save or close editor of \"{0}\" to continue",
                name
            )
        )).then(() => {
            return this._ensureSaved(fileName, false);
        })
    }
}