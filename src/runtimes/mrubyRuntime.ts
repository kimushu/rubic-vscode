import { Runtime, ExecutableCandidate } from "./runtime";
import * as nls from "vscode-nls";
import * as pify from "pify";
import * as glob from "glob";
const localize = nls.loadMessageBundle(__filename);

export class MrubyRuntime extends Runtime {
    static readonly id = "mruby";

    enumerateExecutables(workspaceRoot: string): Promise<ExecutableCandidate[]> {
        let globOptions = { cwd: workspaceRoot };
        return Promise.all([
            <Promise<string[]>>pify(glob)("**/*.mrb", globOptions),
            <Promise<string[]>>pify(glob)("**/*.rb", globOptions),
        ])
        .then(([mrbList, rbList]) => {
            let list: ExecutableCandidate[] = [];
            rbList.forEach((rb) => {
                let mrb = this.getExecutableFile(rb);
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

    getExecutableFile(file: string): string {
        if (file.match(/\.mrb$/)) {
            return file;
        }
        if (file.match(/\.rb$/)) {
            return file.replace(/\.rb$/, ".mrb");
        }
    }

    getCatalogTopics(): CatalogTemplateTopic[] {
        let info = <RubicCatalog.Runtime.Mruby>this.info;
        let topics: CatalogTemplateTopic[] = [];
        topics.push({
            title: "mruby",
            color: "red",
            tooltip: (
                (info.version != null)
                ? `${Runtime.LOCALIZED_VERSION}: ${info.version}`
                : null
            )
        });
        for (let gem of (info.mrbgems || [])) {
            topics.push({
                title: gem.name,
                color: "gray",
                tooltip: gem.description
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
