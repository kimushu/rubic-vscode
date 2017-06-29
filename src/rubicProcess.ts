import * as path from "path";
import * as fs from "fs";
import * as CJSON from "comment-json";

// Import declaration only
import vscode = require("vscode");
import vsdp = require("vscode-debugprotocol");
import SketchModule = require("./sketch");
import CatalogDataModule = require("./catalog/catalogData");

interface RubicMessageFunction {
    /**
     * Show message with simple items
     * @param message Message to show
     * @param items List of items to be shown as actions
     * @return Promise which resolves to a selected item or `undefined`
     */
    (message: string, ...items: string[]): Thenable<string | undefined>;

    /**
     * Show message with options and simple items
     * @param message Message to show
     * @param options Options of behavior
     * @param items List of items to be shown as actions
     * @return Promise which resolves to a selected item or `undefined`
     */
    (message: string, options: RubicMessageOptions, ...items: string[]): Thenable<string | undefined>;

    /**
     * Show message with customized items
     * @param message Message to show
     * @param items List of items to be shown as actions
     * @return Promise which resolves to a selected item or `undefined`
     */
    <T extends RubicMessageItem>(message: string, ...items: T[]): Thenable<T | undefined>;

    /**
     * Show message with options and customized items
     * @param message Message to show
     * @param options Options of behavior
     * @param items List of items to be shown as actions
     * @return Promise which resolves to a selected item or `undefined`
     */
    <T extends RubicMessageItem>(message: string, options: RubicMessageOptions, ...items: T[]): Thenable<T | undefined>;
}

interface RubicQuickPickFunction {
    /**
     * Show selection list with simple items
     * @param items List of items to be shown as selection list
     * @param options Options of behavior
     * @return Promise which resolves to a selected item or `undefined`
     */
    (items: string[] | Thenable<string[]>, options?: RubicQuickPickOptions): Thenable<string | undefined>;

    /**
     * Show selection list with customized items
     * @param items List of items to be shown as selection list
     * @param options Options of behavior
     * @return Promise which resolves to a selected item or `undefined`
     */
    <T extends RubicQuickPickItem>(items: T[] | Thenable<T[]>, options?: RubicQuickPickOptions): Thenable<string | undefined>;
}

interface RubicInputBoxFunction {
    /**
     * Show input box and ask the user for input
     * @param options Options of behavior
     * @return Promise which resolves to a string the user provided or `undefined`
     */
    (options?: RubicInputBoxOptions): Thenable<string | undefined>;
}

export interface RubicProgressOptions {
    location: number | {
        Window?: boolean;
        SourceControl?: boolean;
    };
    title: string;
}

interface RubicTextUpdaterFunction {
    /**
     * Update file with updater function
     * @param fullPath Full path of the file to edit
     * @param updator Contents updater function
     */
    (fullPath: string, updater: (value: string) => string | Thenable<string>, defaultValue?: string, encoding?: string): Thenable<void>;

    /**
     * Merge JSON file with values
     * @param fullPath Full path of the JSON file to edit
     * @param updatedValues Object to update
     * @param removedValues Object to remove
     */
    (fullPath: string, updatedValues: object, removedValues?: object, encoding?: string): Thenable<void>;
}

/**
 * Arguments for launch/attach by Rubic
 */
export interface RubicDebugRequestArguments extends vsdp.DebugProtocol.AttachRequestArguments, vsdp.DebugProtocol.LaunchRequestArguments {
    type: "rubic";
    request: "launch" | "attach";
    [key: string]: any;
}

/**
 * Interface for debug hooks
 */
export interface RubicDebugHook {
    onDebugStart(config: any): boolean | Thenable<boolean>;
}

/**
 * Process (Host/Debug) abstraction layer
 */
export class RubicProcess {
    /** Whether this process is extension-host side */
    readonly isHost: boolean;

    /** Whether this process is debug-adapter side */
    readonly isDebug: boolean;

    /** Workspace root path */
    readonly workspaceRoot: string;

    /** Extension root path */
    readonly extensionRoot: string;

    /** Sketch instance */
    readonly sketch: SketchModule.Sketch;

    /** Catalog data */
    readonly catalogData: CatalogDataModule.CatalogData;

    /** Debug configuration (for debug-side only) */
    readonly debugConfiguration: any;

    /** Version */
    readonly version: string;

    /**
     * Register hook for starting debug
     */
    readonly registerDebugHook: (listener: RubicDebugHook) => void;

    /**
     * Start a new debug process (for host-side only)
     * @param configuration Configuration data to be passed to debug-adapter
     * @return Promise with process ID
     */
    readonly startDebugProcess: (configuration: any, clearConsole?: boolean) => Thenable<string>;

    /**
     * Send Rubic custom request to existing debug process (for host-side only)
     * @param debugger_id The ID of the debugger process to wait
     */
    readonly sendDebugRequest: (debugger_id: string, request: string, args: any) => Thenable<any>;

    /**
     * Stop existing debug process (for host-side only)
     * @param debugger_id The ID of the debugger process to stop
     */
    readonly stopDebugProcess: (debugger_id: string) => Thenable<void>;

    /**
     * Get Rubic setting
     * @param path Path of setting (excludes "rubic." prefix)
     */
    readonly getRubicSetting: (path: string) => Thenable<any>;

    /**
     * Get Memento storage value
     */
    readonly getMementoValue: <T>(key: string, defaultValue?: T) => Thenable<T>;

    /**
     * Set Memento storage value
     */
    readonly setMementoValue: <T>(key: string, value: T) => Thenable<void>;

    /**
     * Read text file
     */
    readonly readTextFile = function(this: RubicProcess, fullPath: string, json?: boolean, defaultValue?: string | any, encoding?: string): Thenable<string | any> {
        if (!fs.existsSync(fullPath)) {
            if (defaultValue == null) {
                return Promise.reject(
                    new Error(`File "${fullPath} not found`)
                );
            }
            return Promise.resolve(defaultValue);
        }
        return Promise.resolve()
        .then(() => {
            let value = fs.readFileSync(fullPath, encoding || "utf8");
            if (json) {
                value = CJSON.parse(value);
            }
            return value;
        });
    };

    /**
     * Update text file
     */
    readonly updateTextFile: RubicTextUpdaterFunction;

    /**
     * Show information message
     */
    readonly showInformationMessage: RubicMessageFunction;

    /**
     * Show warning message
     */
    readonly showWarningMessage: RubicMessageFunction;

    /**
     * Show error message
     */
    readonly showErrorMessage: RubicMessageFunction;

    /**
     * Show selection list
     */
    readonly showQuickPick: RubicQuickPickFunction;

    /**
     * Show input box and ask the user for input
     * @param options Options of behavior
     * @return Promise which resolves to a string the user provided or `undefined`
     */
    readonly showInputBox: RubicInputBoxFunction;

    /**
     * Show progress message
     * @param options Options of behavior
     * @param task Progress task
     */
    readonly withProgress: (options: RubicProgressOptions, task: (progress: RubicProgress<{ message?: string }>) => Thenable<void>) => Thenable<void>;

    /**
     * Print text to Rubic output
     */
    readonly printOutput: (text: string, preserveFocus?: boolean) => Thenable<void>;

    /**
     * Clear text on Rubic output
     */
    readonly clearOutput: () => Thenable<void>;

    /**
     * Dispose object
     */
    readonly dispose: () => Thenable<void>;

    /** The instance of current process */
    static get self() { return this._self; }

    /**
     * Get unique ID
     * @param prefix Prefix string
     */
    protected getUniqueId(prefix: string): string {
        return `rubic-${prefix}-${Math.random().toString(36).substr(2)}`;
    }

    private static _self: RubicProcess;

    /**
     * Construct
     * @param force Allow multiple initialization (For debugging adapter side)
     */
    protected constructor(force?: boolean) {
        if (!force && (RubicProcess._self != null)) {
            throw new Error("RubicProcess must be instantiated once");
        }
        RubicProcess._self = this;
        this.version = require(path.join(__dirname, "..", "..", "package.json")).version;
    }
}

export type RubicQuickPickItem = vscode.QuickPickItem;
export type RubicQuickPickOptions = vscode.QuickPickOptions;
export type RubicMessageItem = vscode.MessageItem;
export type RubicMessageOptions = vscode.MessageOptions;
export type RubicInputBoxOptions = vscode.InputBoxOptions;
export type RubicProgress<T> = vscode.Progress<T>;
