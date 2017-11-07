import {
    CancellationToken,
    DebugConfiguration, DebugConfigurationProvider,
    ProviderResult,
    WorkspaceFolder
} from "vscode";
import * as path from "path";

/**
 * Debug configuration provider for "rubic" type debugger
 */
export class RubicDebugConfigProvider implements DebugConfigurationProvider {
    resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
        if (!config.type && !config.request && !config.name) {
            // launch.json is missing or empty
            const { debuggers } = require(path.join(__dirname, "..", "..", "package.json")).contributes;
            const { rubicDebugger } = (<any[]>debuggers).find((debug) => debug.type === "rubic");
            const { initialConfigurations } = rubicDebugger;
            Object.assign(config, initialConfigurations[0]);
        }
        return config;
    }
}
