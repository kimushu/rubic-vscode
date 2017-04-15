'use strict';

// Import this first to configure vscode-nls
import * as nls from 'vscode-nls';
const localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

import { ExtensionContext, Disposable, window, workspace } from 'vscode';
import { Sketch, SketchLoadResult } from './sketch';
import { CatalogViewer } from './catalogViewer';
import { DebugHelper } from './debugHelper';
import * as path from 'path';
import { CatalogData } from './catalogData';

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
        RubicExtension._instance = this;
        RubicExtension._version = require(path.join(__dirname, "..", "..", "package.json")).version;
        this._catalogViewer = new CatalogViewer(_context);
        this._debugHelper = new DebugHelper(_context);

        this._sketch = new Sketch(workspace.rootPath, window);
        this._catalogData = new CatalogData();
        _context.subscriptions.push(this._sketch, this._catalogData);

        // Load sketch & catalog (background)
        Promise.resolve(
        ).then(() => {
            // Load sketch (without migration)
            return this._sketch.load().then((result) => {
                if (result !== SketchLoadResult.LOAD_SUCCESS) {
                    return Promise.reject(Error(localize("no-sketch", "No sketch")));
                }
            });
        }).then(() => {
            // Load catalog (with auto update)
            return this._catalogViewer.loadCache();
        }).then(() => {
            // Update status bar
            return this._catalogViewer.updateStatusBar();
        }).catch((error) => {
            // Ignore errors
            console.log("Rubic ignored background error", error);
        });
    }

    public static start(context: ExtensionContext) {
        new this(context);
    }
}

export function activate(context: ExtensionContext) {
    RubicExtension.start(context);
}

export function deactivate() {
    // Nothing to do
    // (All objects are disposable and maintained by ExtensionContext)
}
