///<reference path="../schemas/sketch.d.ts" />
import * as nls from "vscode-nls";
import * as path from "path";
import * as fse from "fs-extra";
import * as semver from "semver";
import * as CJSON from "comment-json";
import * as chokidar from "chokidar";
import { EventEmitter, workspace, WorkspaceFolder, Uri, Disposable, ExtensionContext } from "vscode";
import { RUBIC_VERSION, updateRubicEnabledContext } from "./extension";
import { SystemComposition } from "./util/systemComposition";
import { CatalogViewer } from "./catalog/catalogViewer";

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

enum SketchState {
    SKETCH_NOT_LOADED,
    SKETCH_NOT_EXISTS,
    SKETCH_INVALID,
    SKETCH_VALID,
    SKETCH_MIGRATED,
}

/**
 * Rubic configuration for each workspace
 * (.vscode/rubic.json)
 */
export class Sketch implements Disposable {
    private static _managedSketches: Sketch[] = [];
    private static _onDidChange = new EventEmitter<void>();

    /**
     * Activate sketch-related features
     */
    static activateExtension(context: ExtensionContext): Thenable<void> {
        if (workspace.workspaceFolders == null) {
            return Promise.resolve();
        }
        return workspace.workspaceFolders.reduce((promise, workspaceFolder) => {
            return promise.then(() => {
                let sketch = new Sketch(workspaceFolder);
                return sketch.open().then((opened) => {
                    if (!opened) {
                        return sketch.dispose();
                    } else {
                        context.subscriptions.push(sketch);
                    }
                });
            });
        }, Promise.resolve());
    }

    /**
     * An event to signal managed sketch list has been changed.
     */
    static get onDidChange() { return this._onDidChange.event; }

    /**
     * A number of managed sketches
     */
    static get managedSketches() { return this._managedSketches.concat(); }

    /**
     * Find sketch instance from managed sketch list
     */
    static find(workspaceFolder: WorkspaceFolder): Sketch | undefined {
        let fsPathToFind = workspaceFolder.uri.fsPath;
        return this._managedSketches.find((sketch) => {
            return (sketch.folderUri.fsPath === fsPathToFind);
        });
    }

    /**
     * Dispose all managed sketches
     */
    static disposeAll(): any {
        let sketches = this._managedSketches.concat();
        this._managedSketches = [];
        return sketches.reduce(
            (promise, sketch) => promise.then(() => sketch.dispose()),
            Promise.resolve()
        );
    }

    private _onDidOpen = new EventEmitter<Sketch>();
    private _onDidChange = new EventEmitter<Sketch>();
    private _onDidReload = new EventEmitter<Sketch>();
    private _onDidClose = new EventEmitter<Sketch>();
    private _rubicFile: string;
    private _launchFile: string;
    private _disposables: Disposable[] = [];
    private _watcher: chokidar.FSWatcher;
    private _state: SketchState;
    private _modified: boolean;
    private _data?: V1_0_x.Top & {"//^": string[]};
    private _catViewer?: CatalogViewer;

    /**
     * Name of folder
     */
    public readonly folderName: string;

    /**
     * Uri of folder
     */
    public readonly folderUri: Uri;

    /**
     * An event to signal a sketch has been opened.
     */
    get onDidOpen() { return this._onDidOpen.event; }

    /**
     * An event to signal a current configuration has been changed.
     */
    get onDidChange() { return this._onDidChange.event; }

    /**
     * An event to signal a new configuration has been (re)loaded.
     */
    get onDidReload() { return this._onDidReload.event; }

    /**
     * An event to signal a sketch has been closed.
     */
    get onDidClose() { return this._onDidClose.event; }

    /**
     * Catalog viewer for this sketch (may be undefined)
     */
    get catalogViewer() { return this._catViewer; }

    /**
     * Construct sketch instance
     * @param workspaceFolder Workspace folder to be associated
     */
    constructor(workspaceFolder: WorkspaceFolder) {
        this.folderName = workspaceFolder.name;
        this.folderUri = workspaceFolder.uri;
        let { fsPath } = this.folderUri;
        this._rubicFile = path.join(fsPath, ".vscode", RUBIC_JSON);
        this._launchFile = path.join(fsPath, ".vscode", LAUNCH_JSON);
        this._watcher = chokidar.watch(this._rubicFile);
        ["add", "change", "unlink"].forEach((event) => {
            this._watcher.on(event, (path) => this._watchHandler(event, path));
        });
        this._state = SketchState.SKETCH_NOT_LOADED;
    }

    /**
     * `true` if this sketch has configuration file (regardless of validity of its content)
     */
    get hasConfig(): boolean {
        return (this._state > SketchState.SKETCH_NOT_EXISTS);
    }

    /**
     * `true` if this sketch has valid configuration
     */
    get isValid(): boolean {
        return (this._state >= SketchState.SKETCH_VALID);
    }

    /**
     * `true` if the sketch needs (inreversible) migration
     */
    get needsMigration(): boolean {
        return (this._state >= SketchState.SKETCH_MIGRATED);
    }

    /**
     * `true` if this sketch has been modified and not saved yet.
     */
    get isModified(): boolean {
        return !!this.isModified;
    }

    /**
     * Open sketch as managed
     * @param createNew Accept a new folder for Rubic
     * @return A thenable that resolves to a boolean value (`true` if loaded)
     */
    open(createNew?: boolean): Thenable<boolean> {
        if (Sketch._managedSketches.indexOf(this) >= 0) {
            /* Already opened */
            return Promise.resolve(true);
        }
        return this._load()
        .then(() => {
            if (!this.hasConfig && !createNew) {
                this.close();
                return false;
            }
            /* Register as managed sketch */
            Sketch._managedSketches.push(this);
            Sketch._onDidChange.fire();
            workspace.onDidChangeWorkspaceFolders((event) => this.dispose(), this, this._disposables);
            this._onDidOpen.fire(this);
            return true;
        });
    }

    /**
     * Close managed sketch (Never fails even if already closed)
     */
    close(): void {
        this._state = SketchState.SKETCH_NOT_LOADED;
        this._data = undefined;
        let position = Sketch._managedSketches.indexOf(this);
        if (position >= 0) {
            /* Unregister from managed sketch list */
            Sketch._managedSketches.splice(position, 1);
            Sketch._onDidChange.fire();
        }
        this._onDidClose.fire(this);
    }

    /**
     * Dispose object
     */
    dispose(): any {
        this.close();
        let disposables = this._disposables;
        this._disposables = [];
        return disposables.reduce(
            (promise, disposable) => promise.then(() => disposable.dispose()),
            Promise.resolve()
        );
    }

    /**
     * Show catalog for this sketch
     */
    showCatalog(): CatalogViewer {
        if (this._catViewer == null) {
            this._catViewer = new CatalogViewer(this);
            let disposable = this._catViewer.onDidClose(() => {
                this._catViewer = undefined;
                disposable.dispose();
            });
        }
        this._catViewer.open();
        return this._catViewer;
    }

    /**
     * Get system composition
     */
    getSystemComposition(): SystemComposition {
        let currentComposition = new SystemComposition();
        if ((this._data != null) && (this._data.hardware != null)) {
            currentComposition.boardClassName = this._data.hardware.boardClass;
            currentComposition.repositoryUuid = this._data.hardware.repositoryUuid;
            currentComposition.releaseTag = this._data.hardware.releaseTag;
            currentComposition.variationPath = this._data.hardware.variationPath;
        }
        return currentComposition;
    }

    /**
     * Set system composition
     */
    setSystemComposition(newComposition: SystemComposition): void {
        if (this._data == null) {
            this._data = {} as any;
        }
        if (this._data!.hardware == null) {
            this._data!.hardware = {} as any;
        }
        this._data!.hardware!.boardClass = newComposition.boardClassName!;
        this._data!.hardware!.repositoryUuid = newComposition.repositoryUuid!;
        this._data!.hardware!.releaseTag = newComposition.releaseTag!;
        this._data!.hardware!.variationPath = newComposition.variationPath!;
        this._setModified();
    }

    /**
     * Get board path
     */
    get boardPath(): string | undefined {
        if ((this._data != null) && (this._data.hardware != null)) {
            return this._data.hardware.boardPath;
        }
    }

    /**
     * Set board path
     */
    set boardPath(newPath: string | undefined) {
        if (this._data == null) {
            this._data = {} as any;
        }
        if (this._data!.hardware == null) {
            this._data!.hardware = {} as any;
        }
        if (this._data!.hardware!.boardPath !== newPath) {
            if (newPath != null) {
                this._data!.hardware!.boardPath = newPath;
            } else {
                delete this._data!.hardware!.boardPath;
            }
            this._setModified();
        }
    }

    /**
     * Get board data
     */
    get boardData(): any {
        if ((this._data != null) && (this._data.hardware != null)) {
            return this._data.hardware.boardData;
        }
    }

    /**
     * Get latest saved Rubic version
     */
    getLatestSaved(): string | undefined {
        return (this._data && this._data.rubicVersion && this._data.rubicVersion.last) || undefined;
    }

    /**
     * Save configuration
     */
    save(): Thenable<void> {
        if (this._data == null) {
            this._data = <any>{};
        }
        this._data!.rubicVersion.last = RUBIC_VERSION;
        if (semver.lt(RUBIC_VERSION, this._data!.rubicVersion.min!)) {
            this._data!.rubicVersion.min = RUBIC_VERSION;
        }
        if (semver.gt(RUBIC_VERSION, this._data!.rubicVersion.max!)) {
            this._data!.rubicVersion.max = RUBIC_VERSION;
        }
        if (this._data!["//^"] == null) {
            this._data!["//^"] = ["// Rubic configuration file"];
        }
        return fse.writeFile(this._rubicFile, CJSON.stringify(this._data), SKETCH_ENCODING);
    }

    private _watchHandler(event: string, path: string): void {
        this._load()
        .then(() => {
            this._onDidReload.fire(this);
        });
    }

    private _load(): Thenable<void> {
        return fse.readFile(this._rubicFile, SKETCH_ENCODING)
        .then((content) => {
            this._data = CJSON.parse(content);
            this._modified = false;
            this._state = SketchState.SKETCH_VALID;
            updateRubicEnabledContext(true);
        }, () => {
            this._state = SketchState.SKETCH_NOT_EXISTS;
        })
        .catch(() => {
            this._state = SketchState.SKETCH_INVALID;
            updateRubicEnabledContext(true);
        });
    }

    private _setModified(): void {
        if (!this._modified) {
            this._modified = true;
            this._onDidChange.fire(this);
        }
    }
}
