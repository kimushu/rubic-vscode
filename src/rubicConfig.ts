'use strict';

import * as path from 'path';
import { readFileSync } from 'fs';

export function getRubicConfigFilename(workspaceRoot: string): string {
    return path.join(workspaceRoot, ".vscode", "rubic.json");
}

export class RubicConfig {

    public get workspaceRoot(): string { return this._workspaceRoot; }

    public get boardId(): string { return this._get("boardId"); }
    public get boardPath(): string { return this._get("boardPath"); }
    public get firmwareId(): string { return this._get("firmwareId"); }

    public get transfer_include(): string[] {
        return this._get("transfer.include", ["*.mrb", "*.js"]);
    }
    public get transfer_exclude(): string[] {
        return this._get("transfer.exclude", []);
    }

    public get compile_include(): string[] {
        return this._get("compile.include", ["*.rb", "*.ts"]);
    }
    public get compile_exclude(): string[] {
        return this._get("compile.exclude", []);
    }

    private constructor(private _workspaceRoot: string, private _file: string, private _data: any) {
    }

    private _get(key: string, def?: any): any {
        if (this._data.hasOwnProperty(key)) {
            return this._data[key];            
        }
        if (typeof(def) !== "undefined") {
            this._data[key] = def;
        }
        return def;
    }

    static load(workspaceRoot: string): Promise<RubicConfig> {
        return Promise.resolve(
        ).then(() => {
            let file = getRubicConfigFilename(workspaceRoot);
            let content = readFileSync(file, "utf8");
            return new RubicConfig(workspaceRoot, file, JSON.parse(content));
        });
    }
}