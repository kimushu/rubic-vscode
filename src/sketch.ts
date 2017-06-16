import * as nls from "vscode-nls";
import * as path from "path";
import * as fse from "fs-extra";
import * as semver from "semver";
import * as CJSON from "comment-json";
import * as pify from "pify";
import { EventEmitter } from "events";
import * as chokidar from "chokidar";
///<reference path="../schema/sketch.d.ts" />

// Declaration only
import vscode = require("vscode");
import { RubicProcess } from "./rubicProcess";

const RUBIC_JSON  = "rubic.json";
const SKETCH_ENCODING = "utf8";
const LAUNCH_JSON = "launch.json";
const LAUNCH_ENCODING = "utf8";
const localize = nls.loadMessageBundle(__filename);

export enum SketchLoadResult {
    LOAD_SUCCESS,
    LOAD_MIGRATED,
    LOAD_CANCELED,
    NO_SKETCH,
}

/**
 * Generate debug configuration
 */
export async function generateDebugConfiguration(workspaceRoot: string): Promise<any> {
    return {
        type: "rubic",
        request: "launch",
        name: "Launch on target board",
        workspaceRoot: "${workspaceRoot}",
        program: "${file}"
    };
}

/**
 * Rubic configuration for each workspace
 * (.vscode/rubic.json)
 */
export class Sketch extends EventEmitter {
    private _rubicFile: string;
    private _launchFile: string;
    private _watcher: chokidar.FSWatcher;
    private _data: V0_99_0x.Top;
    private _invalid: boolean;

    /**
     * Construct sketch instance
     * @param _workspaceRoot Root path of workspace
     * @param _window vscode window module (for extension host process)
     */
    constructor(private _workspaceRoot: string, private _window?: typeof vscode.window) {
        super();
        this._rubicFile = path.join(_workspaceRoot, ".vscode", RUBIC_JSON);
        this._launchFile = path.join(_workspaceRoot, ".vscode", LAUNCH_JSON);
    }

    /**
     * Load configuration (with migration when window argument passed)
     */
    load(convert: boolean = false, defaultResult: SketchLoadResult = SketchLoadResult.LOAD_SUCCESS): Promise<SketchLoadResult> {
        let result = defaultResult;
        this.unload();
        return Promise.resolve(
            RubicProcess.self.readTextFile(this._rubicFile, true, {}, SKETCH_ENCODING)
        )
        .then((data) => {
            /* rubic.json found */
            this._data = data;
            this._invalid = false;
            this.emit("load");
            if (this._watcher == null) {
                this._watcher = chokidar.watch(this._rubicFile).on("change", () => {
                    this.emit("reload");
                    this.load();
                });
            }
            return result;
        }, (reason) => {
            /* rubic.json is not found / rubic.json is invalid */
            this._data = null;
            this._invalid = true;
            if (reason instanceof SyntaxError) {
                throw reason;
            }
            if (!convert) {
                return SketchLoadResult.NO_SKETCH;
            }
            return this._migrateFromChrome()
            .then((result) => {
                if (result === SketchLoadResult.LOAD_MIGRATED) {
                    return this.load(false, result);
                }
                return result;
            });
        });
    }

    /** Unload sketch */
    unload() {
        if (this._watcher) {
            this._watcher.close();
            this._watcher = null;
        }
        if (this._data != null) {
            this.emit("unload");
            this._data = null;
            this._invalid = true;
        }
    }

    /** Dispose this instance */
    dispose() {
        this.unload();
    }

    /** Path of workspace */
    get workspaceRoot() { return this._workspaceRoot; }

    /** Filename of sketch data */
    get filename() { return this._rubicFile; }

    /** Check if sketch is successfully loaded */
    get loaded() { return (this._data != null); }

    /** Check if current sketch is invalid */
    get invalid() { return this._invalid; }

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

    async update(obj): Promise<void> {
        await this._ensureSaved(this._rubicFile);
        await this.load();
        if (this._data == null) {
            this._data = <any>{};
        }
        if (!semver.valid(this._data.rubicVersion)) {
            this._data.rubicVersion = RubicProcess.self.version;
        } else if (semver.lt(this._data.rubicVersion, RubicProcess.self.version)) {
            if (this._data.minRubicVersion == null) {
                this._data.minRubicVersion = this._data.rubicVersion;
            }
        } else if (semver.gt(this._data.rubicVersion, RubicProcess.self.version)) {
            if (this._data.maxRubicVersion == null) {
                this._data.maxRubicVersion = this._data.rubicVersion;
            }
        }
        for (let key in obj) {
            this._data[key] = obj[key];
        }
        await pify(fse.ensureDir)(path.dirname(this._rubicFile));
        await pify(fse.writeFile)(this._rubicFile, CJSON.stringify(this._data, null, 4), SKETCH_ENCODING);
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
    private async _migrateFromChrome(): Promise<SketchLoadResult> {
        let oldFile = path.join(this._workspaceRoot, "sketch.json");
        let content;
        try {
            content = JSON.parse(await pify(fse.readFile)(oldFile, SKETCH_ENCODING));
        } catch (error) {
            return SketchLoadResult.NO_SKETCH;
        }

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

        let items = {
            cancel: { title: localize("cancel", "Cancel"), isCloseAffordance: true },
            yes: { title: localize("yes", "Yes") },
            keepOld: { title: localize("no-keep", "No (Keep old settings)") }
        };
        let item: vscode.MessageItem;

        // Confirm to user
        item = await this._window.showInformationMessage(
            localize(
                "convert-sketch-confirm",
                "This sketch was created by old version of Rubic. Are you sure to convert?"
            ),
            items.yes, items.cancel
        );
        if (item.isCloseAffordance) {
            return SketchLoadResult.LOAD_CANCELED;
        }

        // Confirm that the old files to be preserved?
        item = await this._window.showWarningMessage(
            localize(
                "convertion-warning",
                "Are you sure to delete old settings? (This cannot be undone)"
            ),
            items.yes, items.keepOld, items.cancel
        );
        if (item.isCloseAffordance) {
            return SketchLoadResult.LOAD_CANCELED;
        }
        let keepOld = (item === items.keepOld);

        let top: V0_99_0x.Top = <any>{};

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
                throw Error(
                    localize("unknown-board-x", "Unknown board name: {0}", v09x.board.__class__)
                );
        }
        top.rubicVersion = RubicProcess.self.version;
        top.minRubicVersion = v09x.rubicVersion;

        await pify(fse.ensureDir)(path.dirname(this._rubicFile));
        await pify(fse.writeFile)(this._rubicFile, CJSON.stringify(top, null, 4));
        if (!keepOld) {
            fse.unlink(oldFile);
        }

        await this._mergeLaunchConfig();

        return SketchLoadResult.LOAD_MIGRATED;
    }

    private async _mergeLaunchConfig(): Promise<void> {
        await this._ensureSaved(this._launchFile);
        let jsonText;
        try {
            jsonText = await pify(fse.readFile)(this._launchFile, LAUNCH_ENCODING);
        } catch (error) {
            // Ignore error here
            jsonText = "{\"version\":\"0.2.0\",\"configurations\":[]}";
        }
        let obj = CJSON.parse(jsonText);
        let cfg = obj.configurations || (obj.configurations = []);
        cfg.push(await generateDebugConfiguration(this._workspaceRoot));

        await pify(fse.ensureDir)(path.dirname(this._launchFile));
        await pify(fse.writeFile)(this._launchFile, CJSON.stringify(obj, null, 4), LAUNCH_ENCODING);
    }

    private async _ensureSaved(fileName: string, confirm: boolean = true): Promise<void> {
        let name = path.relative(fileName, this._workspaceRoot);
        let editor = this._window.visibleTextEditors.find((editor) => {
            return path.relative(editor.document.fileName, fileName) === "";
        });
        if (!editor || !editor.document.isDirty) {
            return;
        }
        if (!confirm) {
            throw Error(
                localize(
                    "file-x-not-saved",
                    "File \"{0}\" is modified and not saved",
                    name
                )
            );
        }
        await this._window.showInformationMessage(
            localize(
                "save-close-x-to-continue",
                "Save or close editor of \"{0}\" to continue",
                name
            )
        );
        return this._ensureSaved(fileName, false);
    }
}