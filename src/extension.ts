// vscode-nls should be configured before loading all other modules
import * as nls from "vscode-nls";
nls.config(process.env.VSCODE_NLS_CONFIG);

import { ExtensionContext } from "vscode";
import { RubicHostProcess } from "./processes/rubicHostProcess";
import { CatalogViewer } from "./catalog/catalogViewer";
import { RubicStatusBar } from "./catalog/rubicStatusBar";
import { MrubyCompiler } from "./util/mrubyCompiler";

export interface RubicTestContext {
    workspaceSettings?: {
        [path: string]: any;
    };
    mementoValues?: {
        [key: string]: any;
    };
    cacheBaseDir?: string;
}

/**
 * Hooks for integration tests
 */
export let rubicTest: RubicTestContext = {};

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
}

/**
 * Deactivate VSCode extension
 */
export function deactivate(): any {
    // Nothing to do
}
