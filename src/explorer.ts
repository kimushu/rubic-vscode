import { TreeDataProvider, TreeItem, ProviderResult, ExtensionContext, TreeItemCollapsibleState } from "vscode";
import { vscode } from "./extension";
import { Sketch } from "./sketch";
import { BoardStorageInfo, Board } from "./boards/board";

interface TreeElement {
    sketch: Sketch;
    storage?: BoardStorageInfo;
    parentPath?: string;
    path?: string;
}

export class BoardFileExplorer implements TreeDataProvider<TreeElement> {
    private static _instance: BoardFileExplorer;
    private static _boardIconPath: string;
    private static _storageIconPath: string;
    private static _fileIconPath: string;
    private static _folderIconPath: string;

    static activateExtension(context: ExtensionContext): void {
        this._boardIconPath = context.asAbsolutePath("images/circuit-board.svg");
        this._storageIconPath = context.asAbsolutePath("images/database.svg");
        this._fileIconPath = context.asAbsolutePath("images/file.svg");
        this._folderIconPath = context.asAbsolutePath("images/file-directory.svg");

        context.subscriptions.push(
            vscode.window.registerTreeDataProvider("rubicFileExplorer", this.instance)
        );
    }

    static get instance() {
        if (this._instance == null) {
            this._instance = new this();
        }
        return this._instance;
    }

    getTreeItem(element: TreeElement): TreeItem | Thenable<TreeItem> {
        const { sketch, storage } = element;
        const { board } = sketch;
        if (board == null) {
            return {
                label: "ERROR"
            };
        }
        if (storage == null) {
            return {
                collapsibleState: TreeItemCollapsibleState.Collapsed,
                label: `${sketch.folderName} (${board.getBoardName()})`,
                iconPath: BoardFileExplorer._boardIconPath,
                contextValue: "board"
            };
        }
        if (element.path == null) {
            return {
                collapsibleState: TreeItemCollapsibleState.Collapsed,
                label: storage.localizedName,
                id: storage.mountPoint,
                iconPath: BoardFileExplorer._storageIconPath,
                contextValue: "storage"
            };
        }
        if (element.path.endsWith("/")) {
            return {
                collapsibleState: TreeItemCollapsibleState.Collapsed,
                label: element.path.replace(/\/$/, ""),
                iconPath: BoardFileExplorer._folderIconPath,
                contextValue: "folder"
            }
        }
        return {
            label: element.path,
            iconPath: BoardFileExplorer._fileIconPath,
            contextValue: "file"
        }
    }

    async getChildren(element?: TreeElement): Promise<TreeElement[]> {
        if (element == null) {
            return Sketch.list.map((sketch) => {
                return { sketch };
            });
        }
        const { sketch } = element;
        const { board, boardPath } = sketch;
        if ((board == null) || (!sketch.constantConnection) || (boardPath == null) ) {
            return [];
        }
        if (!board.isConnected) {
            await board.connect(boardPath);
        }
        const { storage } = element;
        if (storage == null) {
            return (await board.getStorageInfo()).map((storage) => {
                return { sketch, storage };
            });
        }
        const prefix = (element.path || "") + (element.parentPath || "");
        const files = await board.enumerateFiles(`${storage.mountPoint}/${prefix}`);
        return files.map((file) => {
            return {
                sketch, storage, path: prefix + file, parentPath: prefix
            };
        });
    }

}
