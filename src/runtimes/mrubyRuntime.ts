import { Runtime, ExecutableCandidate } from "./runtime";
import * as nls from "vscode-nls";
import { promisify } from "util";
import * as glob from "glob";
const localize = nls.loadMessageBundle(__filename);

export class MrubyRuntime extends Runtime {
    static readonly id = "mruby";

    enumerateExecutables(workspaceRoot: string): Thenable<ExecutableCandidate[]> {
        let globOptions = { cwd: workspaceRoot };
        return Promise.all([
            <Thenable<(string | null)[]>>promisify(glob)("**/*.mrb", globOptions),
            <Thenable<string[]>>promisify(glob)("**/*.rb", globOptions),
        ])
        .then(([mrbList, rbList]) => {
            let list: ExecutableCandidate[] = [];
            rbList.forEach((rb) => {
                let mrb = this.getExecutableFile(rb);
                if (mrb == null) {
                    return;
                }
                list.push({ relPath: mrb, relSource: rb });
                let i = mrbList.indexOf(mrb);
                if (i >= 0) {
                    mrbList[i] = null;
                }
            });
            mrbList.forEach((mrb) => {
                if (mrb != null) {
                    list.push({ relPath: mrb });
                }
            });
            return list;
        });
    }

    getExecutableFile(file: string): string | undefined {
        if (file.match(/\.mrb$/)) {
            return file;
        }
        if (file.match(/\.rb$/)) {
            return file.replace(/\.rb$/, ".mrb");
        }
    }

    getCatalogTopics(): CatalogTopicDescriptor[] {
        let info = <RubicCatalog.Runtime.Mruby>this.info;
        let topics: CatalogTopicDescriptor[] = [];
        topics.push({
            localizedTitle: "mruby",
            color: "red",
            localizedTooltip: (
                (info.version != null)
                ? `${Runtime.LOCALIZED_VERSION}: ${info.version}`
                : undefined
            )
        });
        for (let gem of (info.mrbgems || [])) {
            topics.push({
                localizedTitle: gem.name,
                color: "gray",
                localizedTooltip: gem.description
            });
        }
        return topics;
    }

    renderDetails(): string {
        let result: string[] = [];
        let info = <RubicCatalog.Runtime.Mruby>this.info;
        result.push(`## ${localize("mruby-desc", "mruby (Lightweight Ruby)")}`);
        result.push(`* ${Runtime.LOCALIZED_VERSION} : \`${info.version}\``);
        if (info.mrbgems) {
            result.push(`* ${localize("included-mrbgems", "Included mrbgems")} :`);
            for (let gem of info.mrbgems) {
                result.push(`  * \`${gem.name}\` : ${gem.description}`);
            }
        }
        return result.join("\n");
    }
}
Runtime.registerRuntime(MrubyRuntime);
