/*
 * This code runs in WebView by chromium browser for catalog viewer.
 * Do not use require() nor exports in this source!
 */
///<reference path="../catalogViewer.d.ts" />
declare function acquireVsCodeApi(): { postMessage(message: any): any };
declare interface Spinner {
    spin(element: HTMLElement): Spinner;
    stop(): Spinner;
}

const PANEL_SWITCH_DELAY = 200;

const vscode = acquireVsCodeApi();

/**
 * Send request to extension host
 * @param request Request data
 */
function postRequest(request: WebViewCommunication.Request): void {
    vscode.postMessage(request);
}

interface IRemoteConsole {
    debug(...messages): void;
    log(...messages): void;
    info(...messages): void;
    warn(...messages): void;
    error(...messages): void;
}
const rconsole: IRemoteConsole = <any>{};
["debug", "log", "info", "warn", "error"].forEach((level) => {
    rconsole[level] = (...messages) => {
        postRequest({ request: "console", level, messages });
    };
});

/**
 * Provides panel in catalog viewer webview
 */
class CatalogViewerPanel {
    /** A link to next panel */
    private _nextPanel?: CatalogViewerPanel;

    /** jQuery object for this panel <div> */
    private readonly _panel: JQuery<HTMLDivElement>;

    /** true if this panel uses page-view */
    private readonly _withPages: boolean;

    /** true if this panel is opened */
    private _opened: boolean = false;

    /** true if DOM elements needs update */
    private _needsElementUpdate: boolean = false;

    /** Active page index (only for panels with pages) */
    private _pageIndex?: number;

    /** Current selection */
    private _selection: string[];

    /** Saved selection */
    private _savedSelection: string[];

    /** Cached data */
    private _cacheData: any;

    /** Cached key */
    private _cacheKey: string[];

    /** Localized title */
    private _localizedTitle: string;

    /** Spinner object for this panel */
    private readonly _spinner: Spinner = new (<any>window).Spinner({
        lines: 11,
        length: 4,
        width: 5,
        radius: 15,
        color: "#888"
    });

    /**
     * Construct panel instance
     * @param panelId ID of panel
     * @param _selectDepth An number of items used in selection array for this panel
     * @param _prevPanel A link to previous panel
     */
    constructor(readonly panelId: string, readonly _selectDepth: number, readonly _prevPanel?: CatalogViewerPanel) {
        if (_prevPanel != null) {
            _prevPanel._nextPanel = this;
        }
        this._panel = $(`#catalog-panel-${panelId}`);
        this._withPages = this._panel.hasClass("catalog-panel-with-pages");
        this._panel.click((event) => {
            event.stopPropagation();
            if (!this._panel.hasClass("catalog-panel-disabled")) {
                this.open();
            }
        });
        this._panel.on("panelClosing", () => {
            if (this._panel.hasClass("catalog-panel-opened")) {
                this._onClosing();
            }
        });
    }

    /**
     * Send report to remote console
     * @param level Report leve
     * @param func A name of sender function
     * @param messages Messages
     */
    report(level: "debug" | "log" | "info" | "warn" | "error", func: string, ...messages): void {
        rconsole[level](`[${this.constructor.name}(${this.panelId}).${func}]`, ...messages);
    }

    /**
     * Open panel (Other panels will be automatically closed)
     */
    open(): void {
        const klass = "catalog-panel-opened";
        this._createElements();
        this._panel.siblings().trigger("panelClosing").removeClass(klass);
        this._panel.addClass(klass);
        this._opened = true;
    }

    /**
     * Event handler for panel closing
     */
    private _onClosing(): void {
        this._opened = false;
        this._setLoading(false);
    }

    /**
     * Is opened
     */
    get opened() { return this._opened; }

    /**
     * Message handler
     * @param message Message data
     */
    processCommand(message: WebViewCommunication.Command): void {
        switch (message.command) {
        case "setCache":
            if (message.panelId === this.panelId) {
                this._cacheKey = message.key;
                this._cacheData = message.data;
                this._createElements(false);
            }
            break;
        case "setSelection":    
            this._selection = message.selection.slice(0, this._selectDepth + 1);
            this._localizedTitle = message.localizedTitles[this._selectDepth];
            this._updateElementStates();
            break;
        case "setSavedSelection":    
            this._savedSelection = message.selection.slice(0, this._selectDepth + 1);
            this._updateElementStates();
            break;
        case "openPanel":
            if (message.panelId === this.panelId) {
                this.open();
            }
            break;
        default:
            this.report("warn", "processCommand", "Unknown command:", (<any>message).command);
            break;
        }
    }

    private _setLoading(state: boolean): void {
        this._panel.toggleClass("catalog-panel-loading", state);
        if (state) {
            this._spinner.spin(this._panel[0]);
        } else {
            this._spinner.stop();
        }
    }

    /**
     * Remove all DOM elements in this panel
     */
    private _removeElements(): void {
        if (this._withPages) {
            const templTab = $("#template-page-tab");
            const tabs = this._panel.find(".catalog-pages-nav li");
            tabs.not(templTab).remove();
            const templPage = $("#template-page-content");
            const pages = this._panel.find(".catalog-page-container");
            pages.not(templPage).remove();
        } else {
            const templ = $("#template-list-item");
            const list = this._panel.find(".catalog-list");
            list.find(".catalog-item").not(templ).remove();
        }
    }

    /**
     * Create DOM elements in this panel
     */
    private _createElements(request: boolean = true): void {
        const key = this._selection.slice(0, -1);
        const keyDiffer = (this._cacheKey == null) || key.some((value, index) => {
            return value !== this._cacheKey[index];
        });
        if (keyDiffer || (this._cacheData == null)){
            this._removeElements();
            this._needsElementUpdate = true;
            this._pageIndex = undefined;
            if (request) {
                postRequest({
                    request: "getCache",
                    panelId: this.panelId,
                    key
                });
                this._setLoading(true);
            } else if (this._cacheData == null) {
                this.report("warn", "_updateElements", "No cache data");
            } else {
                this.report("warn", "_updateElements",
                    `Unexpected cache key: expected = ${JSON.stringify(key)}, ` +
                    `actual = ${JSON.stringify(this._cacheKey)}`
                );
            }
            return;
        }
        if (!this._needsElementUpdate && !keyDiffer) {
            return;
        }
        this._removeElements();
        if (this._withPages) {
            this._createPageElements();
        } else {
            this._createListElements();
        }
        this._setLoading(false);
        this._needsElementUpdate = false;
    }

    /**
     * Create DOM elements for lists
     */
    private _createListElements(): void {
        const items = <CatalogItemDescriptor[] | undefined>this._cacheData;
        const templ = $("#template-list-item");
        const list = this._panel.find(".catalog-list");
        if (items == null) {
            this.report("warn", "_createListElements", "No cache data");
            return;
        }
        /* Add items */
        this.report("debug", "_createListElements", `Constructing ${items.length} item(s)`);
        items.forEach((item) => {
            const newItem = < JQuery<HTMLDivElement> >templ.clone().prop("id", "");
            newItem[0].dataset.panelId = this.panelId;
            newItem[0].dataset.itemId = item.itemId;
            newItem.toggleClass("catalog-item-official", !!item.official);
            newItem.toggleClass("catalog-item-preview", !!item.preview);
            newItem.toggleClass("catalog-item-obsolete", !!item.obsolete);
            newItem.find(".catalog-item-title").text(item.localizedTitle);
            newItem.find(".catalog-item-description").text(item.localizedDescription!);
            newItem.find(".catalog-item-details").text(item.localizedDetails!);
            if (item.icon != null) {
                newItem.find(".catalog-item-icon > img").attr("src", item.icon);
            }
            const topics = newItem.find(".catalog-item-topics");
            const topicTempl = topics.find(".catalog-item-topic").first();
            (item.topics || []).forEach((topic) => {
                const newTopic = topicTempl.clone();
                newTopic.addClass(`catalog-badge-${topic.color}`);
                newTopic.prop("title", topic.localizedTooltip);
                newTopic.text(topic.localizedTitle);
                topics.append(newTopic);
                newTopic.show();
            });
            list.append(newItem);
            newItem.click((event) => this._itemClickHandler(event));
            newItem.show();
        });
        this._updateListElementStates();
    }

    /**
     * Handler for item click
     * @param event Event data
     */
    private _itemClickHandler(event: JQuery.Event<HTMLDivElement>): void {
        postRequest({
            request: "setSelection",
            selection: this._cacheKey.concat(event.currentTarget.dataset.itemId!),
        });
        setTimeout(() => {
            if (this._nextPanel != null) {
                this._nextPanel.open();
            }
        }, PANEL_SWITCH_DELAY);
    }

    /**
     * Create DOM elements for pages
     */
    private _createPageElements(): void {
        const pages = <CatalogPageDescriptor[] | undefined>this._cacheData;
        const templTab = $("#template-page-tab");
        const templPage = $("#template-page-content");
        const nav = this._panel.find(".catalog-pages-nav > ul");
        const container = this._panel.find(".catalog-pages");
        if (pages == null) {
            this.report("warn", "_createPageElements", "No cache data");
            return;
        }
        /* Add pages */
        this.report("debug", "_createPageElements", `Constructing ${pages.length} page(s)`);
        pages.forEach((page, index) => {
            /* Add tab */
            const newTab = < JQuery<HTMLLIElement> >templTab.clone().prop("id", "");
            newTab[0].dataset.pageIndex = index.toString();
            const link = newTab.find("a");
            link[0].title = "";
            link.text(page.localizedTitle).click((event) => {
                event.stopPropagation();
                return this._tabClickHandler(event);
            });
            nav.append(newTab);
            newTab.show();

            /* Add content */
            const newPage = < JQuery<HTMLDivElement> >templPage.clone().prop("id", "");
            newPage[0].dataset.pageIndex = index.toString();
            newPage.find(".markdown").html(page.content);
            container.append(newPage);
        });
        /* Add button actions */
        (< JQuery<HTMLButtonElement> >$(".catalog-page-button"))
        .unbind("click").click((event) => {
            event.stopPropagation();
            return this._buttonClickHandler(event);
        });
        this._updatePageElementStates();
    }

    /**
     * Handler for page tab click
     * @param event Event data
     */
    private _tabClickHandler(event: JQuery.Event<HTMLLIElement>): void {
        const { parentElement } = event.currentTarget;
        const pageIndexString = (parentElement != null) ? parentElement.dataset.pageIndex : undefined;
        if (pageIndexString == null) {
            this.report("warn", "_tabClickHandler", "Page index not found");
            return;
        }
        const pageIndex = parseInt(pageIndexString);
        if (isNaN(pageIndex)) {
            this.report("warn", "_tabClickHandler", "Invalid page index:", pageIndexString);
            return;
        }
        this._pageIndex = pageIndex;
        this._updatePageElementStates();
    }

    /**
     * Handler for page button click
     * @param event Event data
     */
    private _buttonClickHandler(event: JQuery.Event<HTMLButtonElement>): void {
        const { buttonId, buttonData } = event.currentTarget.dataset;
        if (buttonId == null) {
            this.report("warn", "_buttonClickHandler", "Button ID not found", event);
            return;
        }
        postRequest({ request: "button", buttonId, buttonData });
    }

    /**
     * Update DOM element states
     */
    private _updateElementStates(): void {
        const disabled = (this._selection || []).slice(0, this._selectDepth).some((value) => value == null);
        this._panel.toggleClass("catalog-panel-disabled", disabled);
        const selected = ((this._selection || [])[this._selectDepth] != null);
        this._panel.toggleClass("catalog-panel-not-selected", !selected);
        const changed = (this._savedSelection == null) || this._selection.slice(0, this._selectDepth + 1).some((value, index) => {
            return this._savedSelection[index] !== value;
        });
        this._panel.toggleClass("catalog-panel-changed", (selected && changed));
        if (selected) {
            this._panel.find(".catalog-header-selection").text(this._localizedTitle);
        }
        if (this._withPages) {
            this._updatePageElementStates();
        } else {
            this._updateListElementStates();
        }
    }

    private _updateListElementStates(): void {
        const selectedId = this._selection[this._selectDepth];
        this._panel.find(".catalog-item").each((index, element) => {
            const item = $(element);
            item.toggleClass("catalog-item-settled", (element.dataset.itemId === selectedId));
        });
    }

    private _updatePageElementStates(): void {
        const tabs = this._panel.find(".catalog-pages-nav li");
        const pages = this._panel.find(".catalog-page-container");

        if (this._pageIndex == null) {
            this._pageIndex = 0;
        } else if (this._pageIndex >= pages.length) {
            this.report("warn", "_updatePageElementStates", `Page index is out of range: ${this._pageIndex}`);
            this._pageIndex = 0;
        }
        const currentTab = tabs.filter(`[data-page-index=${this._pageIndex}]`);
        tabs.not(currentTab).find("a").removeClass("disabled");
        currentTab.find("a").addClass("disabled");
        const currentPage = pages.filter(`[data-page-index=${this._pageIndex}]`);
        pages.not(currentPage).removeClass("active");
        currentPage.addClass("active");
    }
}

class CatalogViewerWebview {
    private static _instance: CatalogViewerWebview;

    /**
     * Get singleton instance of CatalogViewerWebview
     */
    static get instance() {
        if (this._instance == null) {
            this._instance = new CatalogViewerWebview();
        }
        return this._instance;
    }

    private readonly _panelIdList = $(".catalog-panel").toArray().map((e) => e.dataset.panelId!);
    private readonly _panels: { [panelId: string]: CatalogViewerPanel } = {};

    private constructor() {
        // Construct panels
        let lastPanel: CatalogViewerPanel | undefined;
        this._panelIdList.forEach((panelId, index) => {
            lastPanel = new CatalogViewerPanel(panelId, index, lastPanel);
            this._panels[panelId] = lastPanel;
        });

        // Add message listeners
        window.addEventListener("message", (event) => {
            const message: WebViewCommunication.Command = event.data;
            for (let panelId in this._panels) {
                this._panels[panelId].processCommand(message);
            }
        });

        // Notify initialization finished
        postRequest({ request: "ready" });
    }
}

console.debug("instance:", CatalogViewerWebview.instance);
