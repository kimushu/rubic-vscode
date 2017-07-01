import { compile as mrbc } from "mruby-native";
import * as fs from "fs";
import * as pify from "pify";
import * as path from "path";
import * as glob from "glob";
import * as CJSON from "comment-json";
import * as nls from "vscode-nls";
import { window, OutputChannel, ExtensionContext } from "vscode";
import { RubicDebugHelper } from "../debug/rubicDebugHelper";
import { RubicProcess, RubicDebugHook } from "../processes/rubicProcess";

const localize = nls.loadMessageBundle(__filename);

const MRBCONFIG_FILE = "mrbconfig.json";
const MRBCONFIG_ENCODING = "utf8";
const DUMP_EXT = ".dump";
const DUMP_ENCODING = "utf8";
const CHANNEL_NAME = "mruby (Rubic)";

export class MrubyCompiler implements RubicDebugHook {
    private _channel: OutputChannel;
    private _config: MrbConfig;
    private _watch: boolean;
    
    constructor(context: ExtensionContext) {
        this._channel = window.createOutputChannel(CHANNEL_NAME);
        this._watch = true;
        RubicProcess.self.registerDebugHook(this);
    }

    /**
     * Dispose of this object
     */
    dispose() {
    }

    /**
     * Start watch mode
     */
    startWatch(): void {
        this._watch = true;
    }

    /**
     * Stop watch mode
     */
    stopWatch(): void {
        this._watch = false;
    }

    /**
     * Debug hook
     */
    onDebugStart(config: any): Promise<boolean> {
        if (!this._watch) {
            return Promise.resolve(true);
        }
        let { workspaceRoot } = RubicProcess.self;
        return this._reloadConfig(workspaceRoot)
        .then(() => {
            return this._compileFiles(workspaceRoot);
        })
        .then(() => {
            return true;
        }, (reason) => {
            RubicProcess.self.showErrorMessage(localize(
                "check-output-x",
                "mruby Compilation failed. Check \"{0}\" output for details",
                CHANNEL_NAME)
            );
        });
    }

    /**
     * Print message to channel
     * @param message Message to print (with newline if required)
     * @param activate Set true if channel should be activated
     */
    private _report(message: string, activate?: boolean): void {
        this._channel.append(message);
        if (activate) {
            this._channel.show(true);
        }
    }

    /**
     * Reload configuration
     * @param workspaceRoot Workspace root path
     */
    private _reloadConfig(workspaceRoot: string): Promise<MrbConfig> {
        return pify(fs.readFile)(
            path.join(workspaceRoot, MRBCONFIG_FILE),
            MRBCONFIG_ENCODING
        )
        .then((content: string) => {
            return CJSON.parse(content);
        }, () => {
            return {};
        })
        .then((content: MrbConfig) => {
            if (content.compilerOptions == null) {
                content.compilerOptions = {};
            }
            if (content.compilerOptions.debug == null) {
                content.compilerOptions.debug = true;
            }
            if (content.exclude == null) {
                content.exclude = [];
            }
            if (content.include == null) {
                content.include = ["**/*.rb"];
            }
            this._config = content;
        });
    }

    /**
     * Compile rb files
     * @param workspaceRoot Workspace root path
     */
    private _compileFiles(workspaceRoot: string): Promise<void> {
        let globOptions = {
            cwd: workspaceRoot
        };
        let files: string[] = [];
        return Promise.resolve()
        .then(() => {
            return this._config.include.reduce((promise, pattern) => {
                return promise
                .then(() => {
                    return pify(glob)(pattern, globOptions)
                    .then((found: string[]) => {
                        files.push(...found);
                    });
                });
            }, Promise.resolve());
        })
        .then(() => {
            return this._config.exclude.reduce((promise, pattern) => {
                return promise
                .then(() => {
                    return pify(glob)(pattern, globOptions)
                    .then((found: string[]) => {
                        files = files.filter((file) => (found.indexOf(file) < 0));
                    });
                });
            }, Promise.resolve());
        })
        .then(() => {
            let first = true;
            let compilerOptions: any = this._config.compilerOptions;
            compilerOptions.cwd = workspaceRoot;
            return files.reduce((promise, file) => {
                if (first) {
                    this._report(`> ${new Date().toLocaleTimeString()} - ${
                        localize("start-compile", "Starting compilation...")
                    }\n`);
                    first = false;
                }
                return promise
                .then(() => {
                    return new Promise<string>((resolve, reject) => {
                        mrbc(file, compilerOptions, (error, stdout, stderr) => {
                            if (stderr != null && stderr !== "") {
                                this._report(stderr);
                            }
                            if (error != null) {
                                reject(error);
                            } else {
                                resolve(stdout);
                            }
                        });
                    })
                    .then((stdout) => {
                        if (compilerOptions.verbose) {
                            let dumpPath = path.parse(file);
                            dumpPath.ext = DUMP_EXT;
                            return pify(fs.writeFile)(path.format(dumpPath), stdout, DUMP_ENCODING);
                        }
                    });
                });
            }, Promise.resolve())
            .then(() => {
                if (!first) {
                    this._report(`> ${localize("finish-compile", "Compilation complete")}\n\n`);
                }
            }, (reason) => {
                if (!first) {
                    this._report(`> ${localize("abort-compile", "Compilation aborted")}\n\n`, true);
                }
                throw reason;
            });
        });
    }
}
