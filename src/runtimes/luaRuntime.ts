import { Runtime } from "./runtime";

export class LuaRuntime extends Runtime {
    static readonly id = "lua";

    getExecutableFile(file: string): string {
        if (file.match(/\.lua$/)) {
            return file;
        }
    }

    getCatalogTopics(): CatalogTemplateTopic[] {
        //let info = <RubicCatalog.Runtime.Lua>this.info;
        let topics: CatalogTemplateTopic[] = [];
        topics.push({ title: "Lua", color: "blue" });
        return topics;
    }
}
Runtime.registerRuntime(LuaRuntime);
