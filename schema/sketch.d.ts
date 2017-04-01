declare namespace V1_0_x {
    interface Top {
        /** DO NOT EDIT: Version of Rubic which saved configuration latest */
        rubicVersion: string;
        /** DO NOT EDIT: Minimum version of Rubic which saved this configuration */
        minRubicVersion?: string;
        /** DO NOT EDIT: Maximum version of Rubic which saved this configuration */
        maxRubicVersion?: string;
        /** USE BOARD CATALOG TO EDIT THIS VALUE: Board class */
        boardClass: string;
        /** USE BOARD CATALOG TO EDIT THIS VALUE: Firmware UUID */
        firmwareUuid: string;
        /** USE BOARD CATALOG TO EDIT THIS VALUE: Release tag */
        releaseTag: string;
        /** USE BOARD CATALOG TO EDIT THIS VALUE: Variation path */
        variationPath: string;
        /** Path or address of board */
        boardPath?: string;
        /** List of files (or wildcards) to be transfered */
        "transfer.include": string[];
        /** List of files (or wildcards) NOT to be transfered */
        "transfer.exclude": string[];
    }
}

// Old version structures for migration
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
