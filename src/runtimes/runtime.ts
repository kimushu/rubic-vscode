import * as nls from "vscode-nls";
const localize = nls.loadMessageBundle(__filename);

export interface RuntimeConstructor {
    /**
     * Constructor
     */
    new (info: RubicCatalog.Runtime.Common);

    /**
     * Runtime name (ID)
     */
    id: string;
}

export interface ExecutableCandidate {
    /**
     * Relative path of executable file
     */
    relPath: string;

    /**
     * Relative path of source file (If available)
     */
    relSource?: string;
}

export class Runtime {
    /** Map of subclasses */
    private static _subclasses: { [id: string]: RuntimeConstructor } = {};

    /* Common localization */
    protected static LOCALIZED_VERSION = localize("version", "Version");
    protected static LOCALIZED_SUPPORT_LANGS = localize("support-langs", "Supported languages");

    /**
     * Name of runtime
     */
    get name() { return this.info.name; }

    /**
     * Construct class
     * @param info Runtime information from catalog
     */
    constructor(protected info: RubicCatalog.Runtime.Common) {
    }

    /**
     * Initialize VSCode tasks for this runtime
     */
    initializeTasks(): Thenable<void> {
        return Promise.resolve();
    }

    /**
     * Enumerate executables
     * @param workspaceRoot Root path of workspace
     */
    enumerateExecutables(workspaceRoot: string): Promise<ExecutableCandidate[]> {
        return Promise.resolve([]);
    }

    /**
     * Get executable file name
     * @param filename File name of source
     */
    getExecutableFile(filename: string): string {
        return null;
    }

    /**
     * Get catalog topics of this runtime
     */
    getCatalogTopics(): CatalogTemplateTopic[] {
        return [];
    }

    /**
     * Get template path
     */
    getTemplatePath(): string {
        return this.info.template;
    }

    /**
     * Render details for catalog
     */
    renderDetails(): string {
        return `## ${this.info.name}\n* No detail available for this runtime`;
    }

    /**
     * Register runtime subclass
     */
    static registerRuntime(subclass: RuntimeConstructor): void {
        Runtime._subclasses[subclass.id] = subclass;
    }

    /**
     * Construct instance from info
     * @param info Runtime information from catalog
     */
    static constructRuntime(info: RubicCatalog.Runtime.Common): Runtime {
        let constructor = Runtime._subclasses[info.name];
        if (constructor == null) {
            throw new Error(`No runtime class found for "${info.name}"`);
        }
        return new constructor(info);
    }
}

require("./mrubyRuntime");
require("./duktapeRuntime");
require("./luaRuntime");
