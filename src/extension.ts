// vscode-nls should be configured before loading all other modules
import * as nls from "vscode-nls";
nls.config(process.env.VSCODE_NLS_CONFIG);

import { ExtensionContext } from "vscode";
import { RubicHostProcess } from "./processes/rubicHostProcess";
import { CatalogViewer } from "./catalog/catalogViewer";
import { RubicStatusBar } from "./catalog/rubicStatusBar";
import { RubicDebugHelper } from "./debug/rubicDebugHelper";
import { MrubyCompiler } from "./util/mrubyCompiler";

/**
 * Activate VSCode extension (Entry point of Rubic)
 * @param context Extension context
 */
export function activate(context: ExtensionContext): any {
    console.log(`Loading Rubic from "${context.extensionPath}"`);
    context.subscriptions.push(new RubicHostProcess(context));
    context.subscriptions.push(new CatalogViewer(context));
    context.subscriptions.push(new RubicStatusBar(context));
    context.subscriptions.push(new MrubyCompiler(context));
    context.subscriptions.push(new RubicDebugHelper(context));
}

/**
 * Deactivate VSCode extension
 */
export function deactivate(): any {
    // Nothing to do
}
