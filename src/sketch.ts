///<reference path="../schemas/sketch.d.ts" />
import * as nls from "vscode-nls";
import * as path from "path";
import * as fse from "fs-extra";
import * as semver from "semver";
import * as CJSON from "comment-json";
import * as chokidar from "chokidar";
import { EventEmitter, WorkspaceFolder, Uri, Disposable, ExtensionContext, CancellationToken, WorkspaceFoldersChangeEvent } from "vscode";
import { vscode, RUBIC_VERSION, updateRubicEnabledContext, ProgressReporter } from "./extension";
import { SystemComposition } from "./util/systemComposition";
import { CatalogViewer } from "./catalog/catalogViewer";
import { Board } from "./boards/board";
import * as glob from "glob";
import { promisify } from "util";

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
    private static _sketches: Sketch[] = [];
    private static _onDidChange = new EventEmitter<void>();

    /**
     * Activate sketch-related features
     * @param context
     */
    static activateExtension(context: ExtensionContext): Thenable<void> {
        context.subscriptions.push(
            this,
            vscode.workspace.onDidChangeWorkspaceFolders(this.scanWorkspaces, this),
        );
        return this.scanWorkspaces({
            added: vscode.workspace.workspaceFolders || [],
            removed: [],
        });
    }

    /**
     * Dispose all sketches
     */
    static async dispose(): Promise<void> {
        const sketches = this._sketches;
        this._sketches = [];
        await Promise.all(
            sketches.map((sketch) => sketch.dispose())
        );
    }

    /**
     * Scan workspaces
     * @param event
     */
    static async scanWorkspaces(event: WorkspaceFoldersChangeEvent): Promise<void> {
        for (const workspaceFolder of event.removed) {
            const sketch = this._sketches.find((sketch) => sketch.folderUri === workspaceFolder.uri);
            if (sketch != null) {
                sketch.dispose();
            }
        }
        for (const workspaceFolder of event.added) {
            try {
                await this.find(workspaceFolder);
            } catch (reason) {
                vscode.window.showErrorMessage(localize(
                    "cannot-handle-x-from-rubic",
                    "Cannot handle {0} from Rubic",
                    workspaceFolder.uri.fsPath
                ) + ": " + reason);
            }
        }
    }

    /**
     * An event to signal managed sketch list has been changed.
     */
    static get onDidChange() { return this._onDidChange.event; }

    /**
     * A list of opened sketches
     */
    static get list() { return this._sketches.concat(); }

    /**
     * Find or create sketch instance
     * @param workspaceFolder
     * @param createNew
     */
    static async find(workspaceFolder: WorkspaceFolder, createNew: boolean = false): Promise<Sketch | undefined> {
        const fsPathToFind = workspaceFolder.uri.fsPath;
        const sketch = this._sketches.find((sketch) => {
            return (sketch.folderUri.fsPath === fsPathToFind);
        });
        if (sketch != null) {
            return sketch;
        }
        const newSketch = new this(workspaceFolder);
        await newSketch._load();
        if ((!newSketch.hasConfig) && (!createNew)) {
            newSketch.dispose();
            return undefined;
        }
        this._sketches.push(newSketch);
        return newSketch;
    }

    private _onDidOpen = new EventEmitter<Sketch>();
    private _onDidChange = new EventEmitter<Sketch>();
    private _onDidReload = new EventEmitter<Sketch>();
    private _onDidClose = new EventEmitter<Sketch>();
    private _onDidBoardChange = new EventEmitter<Sketch>();
    private _rubicFile: string;
    private _launchFile: string;
    private _disposables: Disposable[] = [];
    private _watcher: chokidar.FSWatcher;
    private _state: SketchState;
    private _modified: boolean;
    private _data?: V1_0_x.Top & {"//^": string[]};
    private _catViewer?: CatalogViewer;
    private _board?: Board;

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
     * An event to signal a board has been changed
     */
    get onDidBoardChange() { return this._onDidBoardChange.event; }

    /**
     * Catalog viewer for this sketch (may be undefined)
     */
    get catalogViewer() { return this._catViewer; }

    /**
     * Construct sketch instance
     * @param workspaceFolder Workspace folder to be associated
     */
    private constructor(workspaceFolder: WorkspaceFolder) {
        this.folderName = workspaceFolder.name;
        this.folderUri = workspaceFolder.uri;
        const { fsPath } = this.folderUri;
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
     * Close managed sketch (Never fails even if already closed)
     */
    async close(): Promise<void> {
        if (this._catViewer != null) {
            await this._catViewer.close();
        }
        if (this._board != null) {
            await this._board.disconnect();
        }
        this._state = SketchState.SKETCH_NOT_LOADED;
        this._data = undefined;
        this._onDidClose.fire(this);
    }

    /**
     * Dispose object
     */
    dispose(): void {
        const catViewer = this._catViewer;
        if (catViewer != null) {
            this._catViewer = undefined;
            catViewer.dispose();
        }
        const board = this._board;
        if (board != null) {
            this._board = undefined;
            board.dispose();
        }
        this.close();
        const disposables = this._disposables;
        this._disposables = [];
        disposables.forEach((disposable) => Promise.resolve(disposable.dispose()));
    }

    /**
     * Show catalog for this sketch
     */
    showCatalog(): CatalogViewer {
        if (this._catViewer == null) {
            this._catViewer = new CatalogViewer(this);
            const disposable = this._catViewer.onDidClose(() => {
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
        const currentComposition = new SystemComposition();
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
        this._data!.hardware.boardClass = newComposition.boardClassName!;
        this._data!.hardware.repositoryUuid = newComposition.repositoryUuid!;
        this._data!.hardware.releaseTag = newComposition.releaseTag!;
        this._data!.hardware.variationPath = newComposition.variationPath!;
        this._setModified();
        this._updateBoardInstance();
    }

    /**
     * Get board instance
     */
    get board(): Board | undefined {
        return this._board;
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
     * Get constant connection flag
     */
    get constantConnect(): boolean | undefined {
        if (this._data != null) {
            return this._data.constantConnection;
        }
        return undefined;
    }

    /**
     * Set constant connection flag
     */
    set constantConnection(newValue: boolean) {
        if (this._data == null) {
            this._data = {} as any;
        }
        if (this._data!.constantConnection !== newValue) {
            this._data!.constantConnection = newValue;
            this._setModified();
        }
    }

    /**
     * Get latest saved Rubic version
     */
    getLatestSaved(): string | undefined {
        return (this._data && this._data.rubicVersion && this._data.rubicVersion.last) || undefined;
    }

    /**
     * Synchronize files
     */
    async syncFiles(progress?: ProgressReporter, token?: CancellationToken): Promise<number> {
        const { board } = this;
        if (board == null) {
            throw new Error("No board instance");
        }
        if (!board.isConnected) {
            throw new Error("Board not connected");
        }
        const storages = await board.getStorageInfo();
        if (storages.length < 1) {
            throw new Error("No storage on this board");
        }

        const data = this._data! || {};
        const transfer = data.transfer! || {};
        const include = transfer.include || ["**/*.mrb", "**/*.js", "**/*.py"];
        const exclude = transfer.exclude || [];
        const targets: string[] = [];
        const globopt: glob.IOptions = { cwd: this.folderUri.fsPath };

        // Enumerate target files
        for (let pattern of include) {
            targets.push(...await promisify(glob)(pattern, globopt));
        }
        for (let pattern of exclude) {
            (await promisify(glob)(pattern, globopt)).forEach((file) => {
                const index = targets.indexOf(file);
                if (index >= 0) {
                    targets.splice(index, 1);
                }
            });
        }

        // Synchronize files
        let skipped = 0;
        for (let file of targets) {
            const filePath = `${storages[0].mountPoint}/${file.replace(/\\/g, "/")}`;
            const content = await promisify(fse.readFile)(path.join(this.folderUri.fsPath, file)) as Buffer;
            if (!transfer.writeAlways) {
                try {
                    const digest = await board.readFileDigest(filePath, token);
                    if (digest.match(content)) {
                        ++skipped;
                        continue;
                    }
                } catch (reason) {
                    // Ignore error
                }
            }
            if (progress != null) {
                progress.report(localize("writing-file-x", "Writing file {0}", file));
            }
            await board.writeFile(filePath, content, progress, token);
        }

        if ((progress != null)) {
            if (skipped >= 2) {
                progress.report(localize("skipped-n-files", "Skipped {0} files", skipped));
            } else if (skipped === 1) {
                progress.report(localize("skipped-1-file", "Skipped {0} file", skipped));
            }
        }

        return targets.length;
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
            this._updateBoardInstance();
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

    private _updateBoardInstance(): void {
        const { boardClass } = this.getSystemComposition();
        if ((this._board != null) &&
            (boardClass != null) &&
            (this._board.constructor.name === boardClass.name)) {
            /* No change */
            return;
        }
        if (this._board != null) {
            /* Dispose old board instance */
            this._board.dispose();
            this._board = undefined;
        }
        if (boardClass == null) {
            /* No board */
            return;
        }
        /* Construct new board instance */
        this._board = new boardClass();
        this._onDidBoardChange.fire(this);
    }
}
