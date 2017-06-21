import { Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, window } from "vscode";
import * as nls from "vscode-nls";
import { CMD_SHOW_CATALOG, CMD_SELECT_PORT } from "./catalogViewer";
import { RubicProcess } from "../rubicProcess";
import { Board } from "../boards/board";

const localize = nls.loadMessageBundle(__filename);

export class RubicStatusBar implements Disposable {
    private _sbiBoard: StatusBarItem;
    private _sbiPort: StatusBarItem;

    /**
     * Construct Rubic status bar items
     * @param context Extension context
     */
    constructor(context: ExtensionContext) {
        this._sbiBoard = window.createStatusBarItem(StatusBarAlignment.Left);
        this._sbiBoard.tooltip = localize("click-to-show-catalog", "Click here to show Rubic board catalog");
        this._sbiBoard.command = CMD_SHOW_CATALOG;
        context.subscriptions.push(this._sbiBoard);
        this._sbiPort = window.createStatusBarItem(StatusBarAlignment.Left);
        this._sbiPort.tooltip = localize("click-to-select-port", "Click here to select port");
        this._sbiPort.command = CMD_SELECT_PORT;
        context.subscriptions.push(this._sbiPort);

        // Register event handlers
        let { sketch } = RubicProcess.self;
        sketch.on("load", () => this._update());
        sketch.on("unload", () => this._update());
        sketch.on("invalid", () => this._update());
    }

    dispose() {
    }

    private _update() {
        let { sketch } = RubicProcess.self;
        if (sketch == null || (!sketch.loaded && !sketch.invalid)) {
            // No sketch (Rubic is disabled)
            this._sbiBoard.hide();
            this._sbiPort.hide();
        } else if (sketch.invalid) {
            // Sketch is invalid
            this._sbiBoard.text = "$(circuit-board) $(alert) " + localize("invalid-sketch", "Invalid Rubic Setting");
            this._sbiBoard.show();
            this._sbiPort.hide();
        } else if (sketch.boardClass == null) {
            // No board selected
            this._sbiBoard.text = "$(circuit-board) " + localize("no-board", "No board selected");
            this._sbiBoard.show();
            this._sbiPort.hide();
        } else {
            let boardConstructor = Board.getConstructor(sketch.boardClass);
            if (!boardConstructor) {
                this._sbiBoard.text = "$(circuit-board) $(alert) " + localize("no-catalog", "No catalog");
                this._sbiBoard.show();
                this._sbiPort.hide();
            } else {
                this._sbiBoard.text = "$(circuit-board) " + boardConstructor.getBoardName();
                this._sbiBoard.show();
                this._sbiPort.text = "$(triangle-right) " + (
                    sketch.boardPath || localize("no-port", "No port selected")
                );
                this._sbiPort.show();
            }
        }
    }
}
