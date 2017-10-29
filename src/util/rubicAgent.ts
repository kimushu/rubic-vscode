
export namespace RubicAgent {
    /**
     * Method name for firmware information
     */
    export const METHOD_INFO = "rubic.info";

    /**
     * Parameters for METHOD_INFO
     */
    export interface InfoParameters {
    }

    /**
     * Response of METHOD_INFO
     */
    export interface InfoResponse {
        rubicVersion: string;
        runtimes: {
            name: string,
            version?: string
        }[];
        storages: {
            [name: string]: string;
        };
    }

    /**
     * Method name for request queueing
     */
    export const METHOD_QUEUE = "rubic.queue";

    /**
     * Parameters for METHOD_QUEUE (Start program)
     */
    export interface QueueStartParameters {
        name: "start";
        runtime?: string;
        file?: string;
        source?: string;
        debug?: boolean;
    }

    /**
     * Response of METHOD_QUEUE (Start program)
     */
    export interface QueueStartResponse {
        tid: number;
    }

    /**
     * Parameters for METHOD_QUEUE (Abort program)
     */
    export interface QueueAbortParameters {
        name: "abort";
        tid: number;
    }

    /**
     * Response of METHOD_QUEUE (Abort program)
     */
    export interface QueueAbortResponse {
    }

    /**
     * Parameters for METHOD_QUEUE (Set callback)
     */
    export interface QueueCallbackParameters {
        name: "callback";
        tid: number;
    }

    /**
     * Response of METHOD_QUEUE (Set callback)
     */
    export interface QueueCallbackResponse {
        result: number;
    }

    /**
     * Method name for query status
     */
    export const METHOD_STATUS = "rubic.status";

    /**
     * Parameters for METHOD_STATUS
     */
    export interface StatusParameters {
    }

    /**
     * Response of METHOD_STATUS
     */
    export interface StatusResponse {
        threads: {
            running: boolean;
        }[];
    }
}
