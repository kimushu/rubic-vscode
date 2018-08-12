import { Runtime, ExecutableCandidate } from "./runtime";
import * as pify from "pify";
import * as glob from "glob";

export class DuktapeRuntime extends Runtime {
    static readonly id = "duktape";

    initializeTasks(): Thenable<void> {
        // FIXME
        return Promise.resolve();
    }

    enumerateExecutables(workspaceRoot: string): Thenable<ExecutableCandidate[]> {
        let globOptions = { cwd: workspaceRoot };
        return Promise.all([
            <Thenable<string[]>>pify(glob)("**/*.js", globOptions),
            <Thenable<string[]>>pify(glob)("**/*.ts", globOptions),
        ])
        .then(([jsList, tsList]) => {
            let list: ExecutableCandidate[] = [];
            tsList.forEach((ts) => {
                let js = this.getExecutableFile(ts);
                list.push({ relPath: js, relSource: ts });
                let i = jsList.indexOf(js);
                if (i >= 0) {
                    jsList[i] = null;
                }
            });
            jsList.forEach((js) => {
                if (js != null) {
                    list.push({ relPath: js });
                }
            });
            return list;
        });
    }

    getExecutableFile(file: string): string {
        if (file.match(/\.js$/)) {
            return file;
        }
        if (file.match(/\.ts$/)) {
            return file.replace(/\.ts$/, ".js");
        }
    }

    getCatalogTopics(): CatalogTopicDescriptor[] {
        let info = <RubicCatalog.Runtime.Duktape>this.info;
        let topics: CatalogTopicDescriptor[] = [];
        let localizedTooltip = "Duktape";
        if (info.version != null) {
            localizedTooltip += ` (${Runtime.LOCALIZED_VERSION}: ${info.version})`;
        }
        topics.push({ localizedTitle: "JavaScript (ES5)", color: "yellow", localizedTooltip });
        topics.push({ localizedTitle: "TypeScript", color: "blue", localizedTooltip });
        return topics;
    }

    renderDetails(): string {
        let result: string[] = [];
        let info = <RubicCatalog.Runtime.Duktape>this.info;
        result.push("## Duktape");
        result.push(`* ${Runtime.LOCALIZED_VERSION} : \`${info.version}\``);
        result.push(`* ${Runtime.LOCALIZED_SUPPORT_LANGS} : ` +
            "JavaScript(ES5) / TypeScript"
        );
        return result.join("\n");
    }
}
Runtime.registerRuntime(DuktapeRuntime);
