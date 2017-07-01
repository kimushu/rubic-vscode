declare namespace V1_0_x {
    interface Top {
        /** Hardware configuration */
        hardware: {
            /** USE RUBIC CATALOG TO CHANGE THIS VALUE: The name of board class */
            boardClass: string;
            /** USE RUBIC CATALOG TO CHANGE THIS VALUE: UUID of repository */
            repositoryUuid: string;
            /** USE RUBIC CATALOG TO CHANGE THIS VALUE: The tag name of release */
            releaseTag: string;
            /** USE RUBIC CATALOG TO CHANGE THIS VALUE: The path name of variation */
            variationPath: string;
            /** The port name or path which is connected to the board */
            boardPath?: string;
            /** Board data override */
            boardData?: any;
        };
        /** File transfer settings */
        transfer?: {
            /** List of files or glob patterns to be transfered to the board */
            include?: string[];
            /** List of files or glob patterns not to be transfered to the board */
            exclude?: string[];
        }
        /** DO NOT EDIT: Version history */
        rubicVersion: {
            /** DO NOT EDIT: The version of Rubic which is used to save this workspace latest */
            last: string;
            /** DO NOT EDIT: The minimum version of Rubic which is used to save this workspace */
            min?: string;
            /** DO NOT EDIT: The maximum version of Rubic which is used to save this workspace */
            max?: string;
        }
    }
}

// Old version structures for migration
declare namespace V0_99_0x {
    interface Top {
        /** DO NOT EDIT: Version of Rubic which saved configuration latest */
        rubicVersion: string;
        /** DO NOT EDIT: Minimum version of Rubic which saved this configuration */
        minRubicVersion?: string;
        /** DO NOT EDIT: Maximum version of Rubic which saved this configuration */
        maxRubicVersion?: string;
        /** USE BOARD CATALOG TO EDIT THIS VALUE: Board class */
        boardClass: string;
        /** USE BOARD CATALOG TO EDIT THIS VALUE: Repository UUID */
        repositoryUuid: string;
        /** USE BOARD CATALOG TO EDIT THIS VALUE: Release tag */
        releaseTag: string;
        /** USE BOARD CATALOG TO EDIT THIS VALUE: Variation path */
        variationPath: string;
        /** Path or address of board */
        boardPath?: string;
        /** List of files (or wildcards) to be transfered */
        "transfer.include"?: string[];
        /** List of files (or wildcards) NOT to be transfered */
        "transfer.exclude"?: string[];
    }
}

declare namespace V0_9_x {
    interface Top {
        __class__: string;
        rubicVersion: string;
        items: Item[];
        bootPath: string;
        board: Board;
        workspace: Object;
    }

    interface Item {
        __class__: string;
        path: string;
        builder: Builder;
        fileType?: Object;
        sourcePath?: string;
        transfer: boolean;
    }

    interface Board {
        __class__: string;
        friendlyName?: Object;
        rubicVersion?: string;
        firmwareId?: string;
        firmRevisionId?: string;
    }

    interface Builder {
        __class__: string;
        debugInfo?: boolean;
        enableDump?: boolean;
        compileOptions?: string;
    }
}

// Old version structures for migration
declare namespace V0_2_x {
    interface Top {
        bootFile: string;
        sketch: Sketch;
        board?: Object;
    }

    interface Sketch {
        files: Object;
        downloadAll: boolean;
        rubicVersion: string;
        board: Board;
    }

    interface Board {
        class: string;
    }
}
