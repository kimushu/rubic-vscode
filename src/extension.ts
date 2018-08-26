// vscode-nls should be configured before loading all other modules
import * as nls from "vscode-nls";
nls.config(process.env.VSCODE_NLS_CONFIG);

// Do not import other local modules here to avoid recursive module inclusion.
import vscode_types = require("vscode");
import { ExtensionContext } from "vscode";
import * as path from "path";

/**
 * Rubic extension entry point class.
 * This class is used for exporting with getter functions.
 */
module RubicExtension {
    let _extensionContext: vscode_types.ExtensionContext;

    /**
     * vscode module instance (This may be hooked when testing Rubic)
     */
    export let vscode: typeof vscode_types;
    Object.defineProperty(RubicExtension, "vscode", {
        get: () => {
            let value = (rubicTestContext && rubicTestContext.vscode) || require("vscode");
            Object.defineProperty(RubicExtension, "vscode", { value, configurable: false });
            return value;
        },
        configurable: true,
        enumerable: true,
    });

    /**
     * Extension context (This may be hooked when testing Rubic)
     */
    export let extensionContext: vscode_types.ExtensionContext;
    Object.defineProperty(RubicExtension, "extensionContext", {
        get: () => {
            return (rubicTestContext && rubicTestContext.extensionContext) || _extensionContext;
        },
        enumerable: true,
    });

    /**
     * For Rubic tests
     */
    export let rubicTestContext: {
        cacheDir?: string;
        vscode?: typeof vscode_types;
        extensionContext?: ExtensionContext;
    } | undefined;

    /**
     * Version string of Rubic
     */
    export const RUBIC_VERSION = require(path.join(__dirname, "..", "..", "package.json")).version;

    /**
     * VSCode context name that indicates whether Rubic is enabled in current window
     */
    export const RUBIC_ENABLED_CONTEXT = "rubic.isEnabled";

    /**
     * Update "Rubic enabled" context value for switching VSCode contribution points
     * @param value new context value
     */
    export function updateRubicEnabledContext(value: boolean) {
        vscode.commands.executeCommand("setContext", RUBIC_ENABLED_CONTEXT, value);
    }

    /**
     * Activate VSCode extension (Entry point of Rubic)
     * (Notice: This method is called by VSCode WITHOUT this binding)
     * @param context Extension context
     */
    export function activate(this: void, context: vscode_types.ExtensionContext): any {
        console.log(`Starting Rubic ${RUBIC_VERSION} from ${context.extensionPath}`);
        _extensionContext = context;
        const { Sketch } = require("./sketch");
        const { CatalogViewer } = require("./catalog/catalogViewer");
        const { StatusBar } = require("./catalog/statusBar");
        const { BoardDebugServer } = require("./debug/boardDebugServer");
        const { BoardFileExplorer } = require("./explorer");
        return Promise.all([
            Sketch.activateExtension(context),
            CatalogViewer.activateExtension(context),
            StatusBar.activateExtension(context),
            BoardDebugServer.activateExtension(context),
            BoardFileExplorer.activateExtension(context),
        ]);
    }

    /**
     * Deactivate VSCode extension
     */
    export function deactivate(this: void): any {
        RubicExtension.updateRubicEnabledContext(false);
    }
}

namespace RubicExtension {
    export interface ProgressReporter {
        report(localizedMessage: string): void;
        advance?(): void;
    }
}

export = RubicExtension;
