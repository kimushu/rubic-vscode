import * as nls from 'vscode-nls';
import * as path from 'path';
import * as fse from 'fs-extra';
import * as semver from 'semver';
import { RUBIC_VERSION } from './rubicVersion';
import * as CJSON from 'comment-json';
import * as pify from 'pify';
import * as glob from 'glob';
///<reference path="../schema/sketch.d.ts" />

// Declaration only
import vscode = require("vscode");

const SKETCH_ENCODING = "utf8";
const LAUNCH_ENCODING = "utf8";
const localize = nls.loadMessageBundle(__filename);

export enum SketchLoadResult {
    LOAD_SUCCESS,
    LOAD_MIGRATED,
    LOAD_CANCELED,
    NO_SKETCH,
};

export async function generateDebugConfiguration(workspaceRoot: string): Promise<any> {
    let mainPath = "${command:GuessProgramName}";
    if (workspaceRoot) {
        let matches: string[] = await pify(glob)("main.*", {cwd: workspaceRoot});
        matches.some((file) => {
            if (file.match(/\.rb$/)) {
                mainPath = file.replace(/\.rb$/, ".mrb");
                return true;
            }
            if (file.match(/\.ts$/)) {
                mainPath = file.replace(/\.ts$/, ".js");
                return true;
            }
            if (file.match(/\.js$/)) {
                mainPath = file;
                return true;
            }
            return false;
        });
    }
    return {
        type: "rubic",
        request: "launch",
        name: "Launch on target board",
        workspaceRoot: "${workspaceRoot}",
        program: "${workspaceRoot}/" + mainPath
    };
}

/**
 * Rubic configuration for each workspace
 * (.vscode/rubic.json)
 */
export class Sketch implements vscode.Disposable {
    private _rubicFile: string;
    private _launchFile: string;
    private _watcher: fse.FSWatcher;
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
    async load(convert: boolean = false): Promise<SketchLoadResult> {
        let result = SketchLoadResult.LOAD_SUCCESS;
        this.close();
        let jsonText;
        try {
            jsonText = await pify(fse.readFile)(this._rubicFile, SKETCH_ENCODING);
        } catch (error) {
            if (!convert || !this._window) {
                result = SketchLoadResult.NO_SKETCH;
                return null;
            }
            // Try migration from Rubic 0.9.x or earlier
            result = await this._migrateFromChrome();
            if (result === SketchLoadResult.LOAD_MIGRATED) {
                // Read migrated data again
                jsonText = await pify(fse.readFile)(this._rubicFile, SKETCH_ENCODING);
            }
        }
        if (jsonText) {
            this._data = JSON.parse(jsonText);
            this._watcher = fse.watch(this._rubicFile);
        }
        return result;
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

    async update(obj): Promise<void> {
        await this._ensureSaved(this._rubicFile);
        await this.load();
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
        await pify(fse.ensureDir)(path.dirname(this._rubicFile));
        await pify(fse.writeFile)(this._rubicFile, JSON.stringify(this._data, null, 4), SKETCH_ENCODING);
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
                throw Error(
                    localize("unknown-board-x", "Unknown board name: {0}", v09x.board.__class__)
                );
        }
        top.rubicVersion = RUBIC_VERSION;
        top.minRubicVersion = v09x.rubicVersion;

        await pify(fse.ensureDir)(path.dirname(this._rubicFile));
        await pify(fse.writeFile)(this._rubicFile, JSON.stringify(top, null, 4));
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
            jsonText = '{"version":"0.2.0","configurations":[]}';
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