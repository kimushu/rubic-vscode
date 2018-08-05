import * as nls from "vscode-nls";
import { CMD_SHOW_CATALOG, CMD_SELECT_PORT } from "./catalogViewer";
import { Disposable, ExtensionContext, StatusBarItem } from "vscode";
import { vscode } from "../extension";
import { Sketch } from "../sketch";

const localize = nls.loadMessageBundle(__filename);

export class StatusBar implements Disposable {
    private static _instance?: StatusBar;   /** Singleton instance */

    /**
     * Activate catalog viewer related features
     */
    static activateExtension(context: ExtensionContext): any {
        this._instance = new StatusBar(context);
        Sketch.onDidChange(() => this._instance!._changeSketches());
        this._instance._changeSketches();
    }

    private _sbiBoard: StatusBarItem;
    private _sbiPort: StatusBarItem;
    private _sketchWatcher?: Disposable;

    /**
     * Construct Rubic status bar items
     * @param context Extension context
     */
    constructor(context: ExtensionContext) {
        this._sbiBoard = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this._sbiBoard.tooltip = localize("click-to-show-catalog", "Click here to show Rubic board catalog");
        this._sbiBoard.command = CMD_SHOW_CATALOG;
        this._sbiPort = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this._sbiPort.tooltip = localize("click-to-select-port", "Click here to select port");
        this._sbiPort.command = CMD_SELECT_PORT;
        context.subscriptions.push(this);
    }

    dispose() {
        this._sbiBoard.dispose();
        this._sbiPort.dispose();
    }

    private _changeSketches(): void {
        let count = Sketch.managedSketches.length;
        if (count === 0) {
            this._updateSketch();
        } else if (count === 1) {
            if (this._sketchWatcher != null) {
                this._sketchWatcher.dispose();
            }
            const sketch = Sketch.managedSketches[0];
            this._sketchWatcher = sketch.onDidChange((sketch) => {
                this._updateSketch(sketch);
            });
            this._updateSketch(sketch);
        } else {
            this._updateSketch(undefined, true);
        }
    }

    private _updateSketch(sketch?: Sketch, multiple?: boolean): void {
        if (multiple) {
            // Multiple sketches
            this._sbiBoard.text = "$(circuit-board) " + localize("rubic-enabled", "Rubic Enabled");
            this._sbiBoard.show();
            this._sbiPort.hide();
            return;
        }
        if (sketch == null) {
            // No sketch
            this._sbiBoard.hide();
            this._sbiPort.hide();
            return;
        }
        if (!sketch.isValid) {
            // Sketch is invalid
            this._sbiBoard.text = "$(circuit-board) $(alert) " +
                localize("invalid-sketch", "Invalid Rubic Setting");
            this._sbiBoard.show();
            this._sbiPort.hide();
            return;
        }
        const { boardClass } = sketch.getSystemComposition();
        if (boardClass == null) {
            // No board selected
            this._sbiBoard.text = "$(circuit-board) $(alert) " +
                localize("no-board", "No board selected");
            this._sbiBoard.show();
            this._sbiPort.hide();
            return;
        }
        this._sbiBoard.text = "$(circuit-board) " + boardClass.getBoardName();
        this._sbiBoard.show();
        this._sbiPort.text = "$(triangle-right) " + (
            sketch.boardPath || localize("no-port", "No port selected")
        );
        this._sbiPort.show();
    }
}
