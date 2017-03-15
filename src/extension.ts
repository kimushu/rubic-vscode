'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "rubic" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    context.subscriptions.push(vscode.commands.registerCommand('extension.rubic.setup', () => {
        // The code you place here will be executed every time your command is executed
        console.log("------");
        // Display a message box to the user
        try {
            let sp = require("serialport");
            console.log(sp.SerialPort);
            console.log("ok");
        }
        catch (e)
        {
            console.error(e);
            console.log("ng");
        }
        vscode.window.showInformationMessage('Hello World!');
        let bi = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        bi.text = "Hoge";
        bi.tooltip = "Hi!";
        bi.show();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('extension.rubic.provideConfigurationSnippets', () => {
        return [
        ];
    }));
}

// this method is called when your extension is deactivated
export function deactivate() {
}