///<reference path="../schemas/sketch.d.ts" />
import * as nls from "vscode-nls";
import * as path from "path";
import * as fse from "fs-extra";
import * as semver from "semver";
import * as CJSON from "comment-json";
import * as pify from "pify";
import { EventEmitter } from "events";
import * as chokidar from "chokidar";
import { RubicProcess, RubicQuickPickItem } from "./processes/rubicProcess";
import { BoardInformation } from "./boards/board";
import { Runtime } from "./runtimes/runtime";
require("promise.prototype.finally").shim();

// Declaration only
import vscode = require("vscode");
import { RubicDebugConfigProvider } from "./debug/rubicDebugConfigProvider";

const RUBIC_JSON  = "rubic.json";
const SKETCH_ENCODING = "utf8";
const LAUNCH_JSON = "launch.json";
const LAUNCH_ENCODING = "utf8";
const CONN_TEST_TIMEOUT_MS = 10000;
//const FW_WRITE_TIMEOUT_MS = 60000;

const localize = nls.loadMessageBundle(__filename);

export enum SketchLoadResult {
    LOAD_SUCCESS,
    LOAD_MIGRATED,
    LOAD_CANCELED,
    NO_SKETCH,
}

/**
 * Rubic configuration for each workspace
 * (.vscode/rubic.json)
 */
export class Sketch extends EventEmitter {
    private _rubicFile: string;
    private _launchFile: string;
    private _watcher: chokidar.FSWatcher;
    private _data: V1_0_x.Top;
    private _pending: V1_0_x.Top;
    private _invalid: boolean;
    private _runtimes: Runtime[];

    /**
     * Construct sketch instance
     * @param _workspaceRoot Root path of workspace
     * @param _window vscode window module (for extension host process)
     */
    constructor(private _workspaceRoot: string) {
        super();
        this._rubicFile = path.join(_workspaceRoot, ".vscode", RUBIC_JSON);
        this._launchFile = path.join(_workspaceRoot, ".vscode", LAUNCH_JSON);
        if (RubicProcess.self.isHost) {
            RubicProcess.self.registerDebugHook(this);
        }
    }

    /**
     * Load configuration (with migration when window argument passed)
     */
    load(convert: boolean = false, defaultResult: SketchLoadResult = SketchLoadResult.LOAD_SUCCESS): Promise<SketchLoadResult> {
        let result = defaultResult;
        this.unload();
        return Promise.resolve(
            RubicProcess.self.readTextFile(this._rubicFile, true, null, SKETCH_ENCODING)
        )
        .then((data) => {
            /* rubic.json found */
            this._data = this._migrateFromVSCode(data);
            this._invalid = false;
            this.emit("load");
            this._startWatcher();
            return result;
        }, (reason) => {
            /* rubic.json is not found / rubic.json is invalid */
            this._data = null;
            if (reason instanceof SyntaxError) {
                this._invalid = true;
                this.emit("invalid");
                this._startWatcher();
                throw reason;
            }
            this._invalid = false;
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
        this._runtimes = null;
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
        this.removeAllListeners();
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
    get boardClass() { return this._get<string>("hardware.boardClass"); }

    /** Set board class for write pending */
    set boardClass(value: string) { this._set("hardware.boardClass", value, true); }

    /** Get repository UUID */
    get repositoryUuid() { return this._get<string>("hardware.repositoryUuid"); }

    /** Set repository UUID for write pending */
    set repositoryUuid(value: string) { this._set("hardware.repositoryUuid", value, true); }

    /** Get release tag */
    get releaseTag() { return this._get<string>("hardware.releaseTag"); }

    /** Set release tag for write pending */
    set releaseTag(value: string) { this._set("hardware.releaseTag", value, true); }

    /** Get variation path */
    get variationPath() { return this._get<string>("hardware.variationPath"); }

    /** Set variation path for write pending */
    set variationPath(value: string) { this._set("hardware.variationPath", value, true); }

    /** Get board path */
    get boardPath() { return this._get<string>("hardware.boardPath"); }

    /** Set board path for write pending */
    set boardPath(value: string) { this._set("hardware.boardPath", value); }

    /** Get board data */
    get boardData() { return this._get<any>("hardware.boardData"); }

    /** Set board data */
    set boardData(value: any) { this._set("hardware.boardData", value); }

    /** Get transfer include patterns */
    get transfer_include() {
        return this._get<string[]>("transfer.include", ["*.mrb", "*.js", "boot.json"]);
    }

    /** Set transfer include patterns for write pending */
    set transfer_include(value: string[]) { this._set("transfer.include", value); }

    /** Get transfer exclude patterns */
    get transfer_exclude(): string[] {
        return this._get<string[]>("transfer.exclude", []);
    }

    /** Set transfer exclude patterns for write pending */
    set transfer_exclude(value: string[]) { this._set("transfer.exclude", value); }

    /**
     * Write pended changes
     */
    store(): Promise<void> {
        if (this._pending == null) {
            return Promise.resolve();
        }

        return Promise.resolve(
            RubicProcess.self.updateTextFile(this._rubicFile, (text: string) => {
                let data = this._migrateFromVSCode(CJSON.parse(text));

                // Update changes
                function assignRecursive(dest: any, src: any) {
                    if (src == null) {
                        return;
                    }
                    for (let key of Object.keys(src)) {
                        if (typeof(src[key]) !== "object") {
                            dest[key] = src[key];
                        } else {
                            if (dest[key] == null) {
                                dest[key] = {};
                            }
                            assignRecursive(dest[key], src[key]);
                        }
                    }
                }
                assignRecursive(data, this._pending);

                // Update version info
                function semver_each(method: string, ...versions: string[]): string {
                    versions = versions.filter((v) => semver.valid(v));
                    if (versions.length <= 1) {
                        return versions[0];
                    }
                    return versions.reduce((a, b) => semver[method](a, b) ? a : b);
                }
                let newVer = RubicProcess.self.version;
                if (data.rubicVersion == null) {
                    data.rubicVersion = <any>{};
                }
                data.rubicVersion.min = semver_each("lt", data.rubicVersion.min, data.rubicVersion.last, newVer);
                if (data.rubicVersion.min === newVer) {
                    delete data.rubicVersion.min;
                }
                data.rubicVersion.max = semver_each("gt", data.rubicVersion.max, data.rubicVersion.last, newVer);
                if (data.rubicVersion.max === newVer) {
                    delete data.rubicVersion.max;
                }
                data.rubicVersion.last = newVer;

                return CJSON.stringify(data, null, 4);
            }, "{}")
        ).then(() => {
            this._pending = null;
            this._startWatcher(true);
        });
    }

    /**
     * Execute connection test
     */
    testConnection(): Promise<boolean> {
        let rprocess = RubicProcess.self;
        if (!this.loaded) {
            return Promise.reject(new Error("No sketch loaded"));
        }
        if (this.boardClass == null) {
            return Promise.reject(new Error("No board class specified"));
        }
        if (this.boardPath == null) {
            return Promise.reject(new Error("No board path specified"));
        }
        return Promise.resolve(rprocess.startDebugProcess({
            type: "rubic",
            request: "attach"
        }, true))
        .then((debuggerId) => {
            return Promise.race([
                rprocess.sendDebugRequest(
                    debuggerId,
                    "board.getInfo",
                    {
                        boardClass: this.boardClass,
                        boardPath: this.boardPath
                    }
                ),
                new Promise((resolve, reject) => {
                    setTimeout(
                        reject, CONN_TEST_TIMEOUT_MS,
                        new Error("Timed out")
                    );
                })
            ])
            .finally(() => {
                return Promise.resolve(rprocess.stopDebugProcess(debuggerId));
            })
            .then((result: BoardInformation) => {
                return true;
            }, (reason) => {
                return false;
            });
        });
    }

    /**
     * Execute connection test
     */
    writeFirmware(fullPath: string): Promise<boolean> {
        let rprocess = RubicProcess.self;
        if (!this.loaded) {
            return Promise.reject(new Error("No sketch loaded"));
        }
        if (this.boardClass == null) {
            return Promise.reject(new Error("No board class specified"));
        }
        return Promise.resolve(rprocess.startDebugProcess({
            type: "rubic",
            request: "attach"
        }, true))
        .then((debuggerId) => {
            return Promise.race([
                rprocess.sendDebugRequest(
                    debuggerId,
                    "board.writeFirmware",
                    {
                        boardClass: this.boardClass,
                        boardPath: this.boardPath,
                        fullPath
                    }
                )/*,
                new Promise((resolve, reject) => {
                    setTimeout(
                        reject, FW_WRITE_TIMEOUT_MS,
                        new Error("Timed out")
                    );
                })*/
            ])
            .finally(() => {
                return Promise.resolve(rprocess.stopDebugProcess(debuggerId));
            });
        });
    }

    /**
     * Get runtimes for current hardware configuration
     */
    getRuntimes(): Promise<Runtime[]> {
        if (this._runtimes) {
            // Already cached
            return Promise.resolve(this._runtimes);
        }
        let { catalogData } = RubicProcess.self;
        let tryConstruct = () => {
            let variation = catalogData.getVariation(this.repositoryUuid, this.releaseTag, this.variationPath);
            if (variation == null) {
                return Promise.reject(new Error(
                    `No variation data for (${this.repositoryUuid}, ${this.releaseTag}, ${this.variationPath})`
                ));
            }
            let cache = (variation.runtimes || []).map((info) => Runtime.constructRuntime(info));
            this._runtimes = cache;
            return Promise.resolve(cache);
        };
        return Promise.resolve()
        .then(() => {
            if (!catalogData.loaded) {
                return catalogData.load();
            }
        })
        .then(() => {
            return tryConstruct()
            .catch(() => {
                return catalogData.fetch(true)
                .then(() => {
                    return tryConstruct();
                });
            });
        });
    }

    /**
     * Update debug configuration
     * @param config Debug configuration
     */
    onDebugStart(config: any): boolean | Thenable<boolean> {
        let sourceFile: string = config.program;
        return this.getRuntimes()
        .then((runtimes) => {
            let execFile: string;
            if (sourceFile != null) {
                for (let runtime of runtimes) {
                    execFile = runtime.getExecutableFile(sourceFile);
                    if (execFile != null) {
                        break;
                    }
                }
            }
            if (execFile != null) {
                return execFile;
            }
            return this._askDebugTarget(runtimes);
        })
        .then((execFile) => {
            if (execFile == null) {
                return false;
            }
            config.program = execFile;
            return true;
        });
    }

    /**
     * Ask user which file to run/debug
     * @param runtimes List of runtimes
     */
    private _askDebugTarget(runtimes: Runtime[]): Promise<string> {
        let { workspaceRoot } = RubicProcess.self;
        let items: RubicQuickPickItem[] = [];
        return runtimes.reduce((promise, runtime) => {
            return promise
            .then(() => {
                return runtime.enumerateExecutables(workspaceRoot);
            })
            .then((candidates) => {
                for (let cand of candidates) {
                    let item: RubicQuickPickItem = {
                        label: cand.relPath,
                        description: `(${runtime.name})`,
                    };
                    if (cand.relSource != null) {
                        item.detail = localize("compiled-from-x", "Compiled from {0}", cand.relSource);
                    }
                    items.push(item);
                }
            });
        }, Promise.resolve())
        .then(() => {
            items.sort((a, b) => a.label.localeCompare(b.label));
            return RubicProcess.self.showQuickPick(
                items, { placeHolder: localize("choose-run", "Choose file to run") }
            );
        })
        .then((item) => {
            return (item != null) ? path.join(workspaceRoot, item.label) : null;
        });
    }

    /**
     * Start watcher for sketch file
     */
    private _startWatcher(atSave?: boolean): void {
        if (this._watcher == null) {
            let listener = () => {
                this.emit("reload");
                this.load();
            };
            this._watcher = chokidar.watch(this._rubicFile).on("change", listener);
            if (atSave) {
                listener();
            }
        }
    }

    /**
     * Get current data
     * @param keyPath Full path of key
     * @param defaultValue Default value
     */
    private _get<T>(keyPath: string, defaultValue?: T): T {
        let keys = keyPath.split(".");
        let lastKey = keys.pop();
        let parent = this._data || {};
        for (let key of keys) {
            parent = parent[key] || {};
        }
        if (parent[lastKey] != null) {
            return parent[lastKey];
        }
        return defaultValue;
    }

    /**
     * Set write pending data
     * @param keyPath Full path of key
     * @param value Value
     */
    private _set<T>(keyPath: string, value: T, clearCache?: boolean): void {
        if (clearCache) {
            this._runtimes = null;
        }
        let keys = keyPath.split(".");
        let lastKey = keys.pop();
        let parent = this._pending;
        if (parent == null) {
            parent = this._pending = <any>{};
        }
        for (let key of keys) {
            let newParent = parent[key];
            if (newParent == null) {
                newParent = parent[key] = {};
            }
            parent = newParent;
        }
        parent[lastKey] = value;
    }

    /**
     * Migrate from VSCode Rubic
     */
    private _migrateFromVSCode(data: any): V1_0_x.Top {
        // v0.99.0x -> v1.0.x
        let v1_0_x: V1_0_x.Top = data;
        if (typeof(v1_0_x.rubicVersion) === "string") {
            let v0_99_x: V0_99_0x.Top = data;
            v1_0_x = {
                transfer: {
                    include: v0_99_x["transfer.include"],
                    exclude: v0_99_x["transfer.exclude"],
                },
                hardware: {
                    boardClass: v0_99_x.boardClass,
                    repositoryUuid: v0_99_x.repositoryUuid,
                    releaseTag: v0_99_x.releaseTag,
                    variationPath: v0_99_x.variationPath,
                    boardPath: v0_99_x.boardPath,
                },
                rubicVersion: {
                    last: v0_99_x.rubicVersion,
                    min: v0_99_x.minRubicVersion,
                    max: v0_99_x.maxRubicVersion,
                }
            };
        }

        // Latest
        return v1_0_x;
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
        if(!await RubicProcess.self.showInformationConfirm(
            localize(
                "convert-sketch-confirm",
                "This sketch was created by old version of Rubic. Are you sure to convert?"
            ),
        )) {
            return SketchLoadResult.LOAD_CANCELED;
        }

        // Confirm that the old files to be preserved?
        item = await RubicProcess.self.showWarningMessage(
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
                top.releaseTag = "v2.19";
                top.variationPath = "citrus_sketch.bin";
                break;
            case "WakayamaRbBoard":
                top.boardClass = "WakayamaRbBoard";
                top.repositoryUuid = "1ac3a112-1640-482f-8ca3-cf5afc181fe6";
                top.releaseTag = "v2.30";
                top.variationPath = "wrbb_sketch_128K.bin";
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

    private _mergeLaunchConfig(): Promise<void> {
        return Promise.resolve(
            RubicProcess.self.updateTextFile(
                this._launchFile,
                (jsonText) => {
                    let obj = CJSON.parse(jsonText);
                    let cfg = obj.configurations || (obj.configurations = []);
                    let initialConfig = <any>(new RubicDebugConfigProvider().resolveDebugConfiguration(undefined, <any>{}));
                    cfg.push(initialConfig);
                    return CJSON.stringify(obj, null, 4);
                },
                "{\"version\":\"0.2.0\",\"configurations\":[]}",
                LAUNCH_ENCODING
            )
        );
    }
}