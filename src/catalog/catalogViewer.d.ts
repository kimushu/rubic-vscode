
declare namespace WebViewCommunication {
    interface SetCacheCommand {
        command: "setCache";
        panelId: string;
        key: string[];
        data: any;
    }
    interface SetSelectionCommand {
        command: "setSelection";
        selection: string[];
        localizedTitles: string[];
    }
    interface SetSavedSelectionCommand {
        command: "setSavedSelection";
        selection: string[];
    }
    interface OpenPanelCommand {
        command: "openPanel";
        panelId: string;
    }
    type Command = SetCacheCommand | SetSelectionCommand | SetSavedSelectionCommand | OpenPanelCommand;

    interface ConsoleRequest {
        request: "console";
        level: string;
        messages: any[];
    }
    interface ReadyRequest {
        request: "ready";
    }
    interface GetCacheRequest {
        request: "getCache";
        panelId: string;
        key: string[];
    }
    interface SetSelectionRequest {
        request: "setSelection";
        selection: string[];
    }
    type Request = ConsoleRequest | ReadyRequest | GetCacheRequest | SetSelectionRequest;
}
