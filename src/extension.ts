// Import this first to configure vscode-nls
import * as nls from "vscode-nls";
const localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

import { ExtensionContext, window, workspace } from "vscode";
import { commands, ProgressOptions, ProgressLocation, Progress } from "vscode";
import { Sketch, SketchLoadResult } from "./sketch";
import { CatalogViewer } from "./catalog/catalogViewer";
import { DebugHelper } from "./debugHelper";
import * as path from "path";
import { CatalogData } from "./catalog/catalogData";
import { RubicHostProcess } from "./rubicHostProcess";
import { RubicStatusBar } from "./catalog/rubicStatusBar";

export class RubicExtension {
    /**
     * Instance of RubicExtension (singleton)
     */
    static get instance() { return this._instance; }
    private static _instance: RubicExtension;

    /**
     * Rubic version
     */
    static get version() { return this._version; }
    private static _version: string;

    /**
     * CatalogViewer instance
     */
    get catalogViewer() { return this._catalogViewer; }
    private _catalogViewer: CatalogViewer;

    /**
     * DebugHelper instance
     */
    get debugHelper() { return this._debugHelper; }
    private _debugHelper: DebugHelper;

    /**
     * Sketch instance
     */
    get sketch() { return this._sketch; }
    private _sketch: Sketch;

    /**
     * Extension context
     */
    get context() { return this._context; }

    /**
     * CatalogData instance
     */
    get catalogData() { return this._catalogData; }
    private _catalogData: CatalogData;

    private constructor(private _context: ExtensionContext) {
        let noWorkspace = (workspace.rootPath == null);
        RubicExtension._instance = this;
        RubicExtension._version = require(path.join(__dirname, "..", "..", "package.json")).version;
        if (noWorkspace) {
            return;
        }

        this._debugHelper = new DebugHelper(_context);
        this._sketch = new Sketch(workspace.rootPath, window);
        this._catalogData = new CatalogData();
        _context.subscriptions.push(this._sketch, this._catalogData);

        // Load sketch & catalog (background)
        Promise.resolve(
        ).then(() => {
            // Load sketch (without migration)
            return this._sketch.load(false).then((result) => {
                if (result !== SketchLoadResult.LOAD_SUCCESS) {
                    return Promise.reject(Error(localize("no-sketch", "No sketch")));
                }
            });
        }).then(() => {
            // Load catalog (with auto update)
            return this._catalogViewer.loadCache();
        }).catch((error) => {
            // Ignore errors
            console.log("Rubic ignored background error", error);
        });
    }

    public static start(context: ExtensionContext) {
        // tslint:disable-next-line:no-unused-expression
        new this(context);
    }
}

/**
 * Activate VSCode extension (Entry point of Rubic)
 * @param context Extension context
 */
export function activate(context: ExtensionContext): any {
    console.log(`Loading Rubic from "${context.extensionPath}"`);
    context.subscriptions.push(new RubicHostProcess(context));
    context.subscriptions.push(new CatalogViewer(context));
    context.subscriptions.push(new RubicStatusBar(context));
}

/**
 * Deactivate VSCode extension
 */
export function deactivate(): any {
    // Nothing to do
}
