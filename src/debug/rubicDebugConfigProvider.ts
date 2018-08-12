import {
    CancellationToken,
    DebugConfiguration, DebugConfigurationProvider,
    ProviderResult,
    WorkspaceFolder,
    commands, window, workspace
} from "vscode";
import * as path from "path";
// import { RubicDebugHook, RubicProcess } from "../processes/rubicProcess";
import * as nls from "vscode-nls";
import { CMD_SHOW_CATALOG } from "../catalog/catalogViewer";
import { DebugServer } from "./debugServer";

const localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);
const { RUBIC_DEBUG_SERVER_PORT } = process.env;

/**
 * Substitute variables for VSCode
 * @param input Input string
 */
function substituteVariables(input: string): string {
    let editor = window.activeTextEditor;
    let fileName = (editor != null) ? editor.document.fileName : null;
    return input.replace(/\$\{(\w+)\}/g, (match, name) => {
        switch (name) {
            case "workspaceRoot":
                return workspace.workspaceFolders![0].uri.fsPath;
            case "workspaceRootFolderName":
                return path.basename(workspace.workspaceFolders![0].name);
            case "file":
                if (fileName != null) {
                    return fileName;
                }
                break;
            case "relativeFile":
                if (fileName != null) {
                    return path.relative(workspace.rootPath!, fileName);
                }
                break;
            case "fileBasename":
                if (fileName != null) {
                    return path.basename(fileName);
                }
                break;
            case "fileBasenameNoExtension":
                if (fileName != null) {
                    return path.basename(fileName, ".*");
                }
                break;
            case "fileDirname":
                if (fileName != null) {
                    return path.dirname(fileName);
                }
                break;
            case "fileExtname":
                if (fileName != null) {
                    return path.extname(fileName);
                }
                break;
            default:
                return "${" + name + "}";
        }
        return "";
    });
}

/**
 * Debug configuration provider for "rubic" type debugger
 */
export class RubicDebugConfigProvider implements DebugConfigurationProvider {
    constructor() {
    }

    resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
        DebugServer
/*        let { sketch, catalogData } = RubicProcess.self;
        if (!sketch.isHardwareFixed) {
            let openMsg = localize("open-catalog", "Open catalog");
            RubicProcess.self.showInformationMessage(
                localize("choose-cfg-before-debug", "Before debugging, choose your board and firmware from Rubic catalog"),
                openMsg
            )
            .then((choice) => {
                if (choice === openMsg) {
                    commands.executeCommand(CMD_SHOW_CATALOG);
                }
            });
            throw new Error(localize("hw-cfg-not-set", "Hardware configuration is not set"));
        }

        if (!config.type || !config.request || !config.name) {
            // launch.json is missing or empty
            const { debuggers } = RubicProcess.self.packageJson.contributes;
            const rubicDebugger = (<any[]>debuggers).find((debug) => debug.type === "rubic");
            const { initialConfigurations } = rubicDebugger;
            Object.assign(config, initialConfigurations[0]);
            RubicProcess.self.showInformationMessage(
                localize("launch-json-created", "Debug configuration has been created. Open file which you want to run and start debug again")
            );
            return undefined;
        }

        // Add private data to debug adapter process
        let { workspaceRoot, extensionRoot } = RubicProcess.self;
        config.__private = { workspaceRoot, extensionRoot };
        if (RUBIC_DEBUG_SERVER_PORT != null) {
            config.debugServer = RUBIC_DEBUG_SERVER_PORT;
        }

        // Merge boardData
        let repo = catalogData.getRepository(sketch.repositoryUuid);
        let release = catalogData.getRelease(sketch.repositoryUuid, sketch.releaseTag);
        let variation = catalogData.getVariation(sketch.repositoryUuid, sketch.releaseTag, sketch.variationPath);
        config.boardData = Object.assign(
            {},
            (repo ? repo.cache.boardData : null),
            (release ? release.cache.boardData : null),
            (variation ? variation.boardData : null),
            sketch.boardData,
            config.boardData
        );

        if ((this._debugHooks == null) || (config.request === "attach")) {
            return config;
        }

        // Substitute variables
        if (config.program != null) {
            config.program = substituteVariables(config.program);
        }

        // Invoke hooks
        return this._debugHooks.reduce((promise, hook) => {
            return promise
            .then((continueDebug) => {
                return hook.onDebugStart(config);
            });
        }, Promise.resolve(true))
        .then((continueDebug) => {
            if (continueDebug) {
                return config;
            }
            // Abort debugging
            return undefined;
        });
        */
    }
}
