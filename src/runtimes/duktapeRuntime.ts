import { Runtime, ExecutableCandidate } from "./runtime";
import * as pify from "pify";
import * as glob from "glob";

export class DuktapeRuntime extends Runtime {
    static readonly id = "duktape";

    initializeTasks(): Promise<void> {
        // FIXME
        return Promise.resolve();
    }

    enumerateExecutables(workspaceRoot: string): Promise<ExecutableCandidate[]> {
        let globOptions = { cwd: workspaceRoot };
        return Promise.all([
            <Promise<string[]>>pify(glob)("**/*.js", globOptions),
            <Promise<string[]>>pify(glob)("**/*.ts", globOptions),
        ])
        .then(([jsList, tsList]) => {
            let list: ExecutableCandidate[] = [];
            let jsWithTs = tsList.map((ts) => this.getExecutableFile(ts));
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

    getCatalogTopics(): CatalogTemplateTopic[] {
        let info = <RubicCatalog.Runtime.Duktape>this.info;
        let topics: CatalogTemplateTopic[] = [];
        let tooltip = "Duktape";
        if (info.version != null) {
            tooltip += ` (${Runtime.LOCALIZED_VERSION}: ${info.version})`;
        }
        topics.push({ title: "JavaScript (ES5)", color: "yellow", tooltip });
        topics.push({ title: "TypeScript", color: "blue", tooltip });
        return topics;
    }

    renderDetails(): string {
        let result: string[] = [];
        let info = <RubicCatalog.Runtime.Duktape>this.info;
        result.push(`* ${Runtime.LOCALIZED_VERSION} : \`${info.version}\``);
        result.push(`* ${Runtime.LOCALIZED_SUPPORT_LANGS} : ` +
            "JavaScript(ES5) / TypeScript"
        );
        return result.join("\n");
    }
}
Runtime.registerRuntime(DuktapeRuntime);
