declare namespace V1_0_x {
    interface Top {
        /** Version of Rubic which saved configuration latest */
        rubicVersion: string;
        /** Minimum version of Rubic which saved this configuration */
        minRubicVersion?: string;
        /** Maximum version of Rubic which saved this configuration */
        maxRubicVersion?: string;
        /** Board class */
        boardClass: string;
        /** Firmware UUID */
        firmwareUuid: string;
        /** Release tag */
        releaseTag: string;
        /** Variation path */
        variationPath: string;
        /** Path or address of board */
        boardPath?: string;
        /** List of files to be transfered */
        "transfer.include": string[];
        /** List of files to be NOT transfered */
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
