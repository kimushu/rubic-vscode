'use strict';

import { ExtensionContext } from 'vscode';
import { BoardCatalog } from './boardCatalog'
import { DebugHelper } from './debugHelper'

export function activate(context: ExtensionContext) {
    context.subscriptions.push(new BoardCatalog(context.extensionPath));
    context.subscriptions.push(new DebugHelper(context.extensionPath));
}

export function deactivate() {
    // Nothing to do
    // (All objects are disposable and maintained by ExtensionContext)
}
