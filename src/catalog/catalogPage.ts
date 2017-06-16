
interface PanelElement extends HTMLDivElement {
    dataset: {
        selectedItemId: string;
        initialItemId: string;
        savedItemId: string;
        panelId: string;
    };
}
interface ItemElement extends HTMLDivElement {
    dataset: {
        itemId: string;
    };
}

// Define utility function for sending message to extension
const sendCommand = (() => {
    let element = <HTMLAnchorElement>document.getElementById("sendCommand");
    let base = element.href;
    return (param: any): false => {
        element.href = base + encodeURI(JSON.stringify(param));
        element.click();
        return false;
    };
})();

(() => {
    let panels = Array.from(document.getElementsByClassName("catalog-panel"));
    let requesting = false;
    let lastChanged = false;
    panels.forEach((panel: PanelElement) => {
        // Register event handler for panel headers
        let header = <HTMLDivElement>panel.getElementsByClassName("catalog-header")[0];
        panel.classList.toggle("catalog-panel-changed",
            (!lastChanged && panel.dataset.selectedItemId !== "" &&
                panel.dataset.savedItemId !== panel.dataset.selectedItemId));
        if (panel.dataset.savedItemId !== panel.dataset.selectedItemId) {
            panel.classList.toggle("catalog-panel-changed", (panel.dataset.selectedItemId !== "") || !lastChanged);
            lastChanged = true;
        } else {
            panel.classList.remove("catalog-panel-changed");
        }
        panel.classList.toggle("catalog-panel-not-selected",
            panel.dataset.selectedItemId === "");
        header.onclick = (event) => {
            event.preventDefault();
            if (panel.classList.contains("catalog-panel-disabled") ||
                panel.classList.contains("catalog-panel-opened")) {
                // No UI change
                return;
            }

            // Disable scroll during animation
            panel.parentElement.classList.add("disable-scroll");
            panel.addEventListener("transitionend", () => {
                panel.parentElement.classList.remove("disable-scroll");
            }, <any>{once: true});

            // Change "opened" state of panels
            panels.forEach((aPanel: HTMLDivElement) => {
                aPanel.classList.toggle("catalog-panel-opened", panel === aPanel);
            });
        };

        let panelSelection = panel.getElementsByClassName("catalog-header-selection")[0];

        // Register event handler for items
        let items = Array.from(panel.getElementsByClassName("catalog-item"));
        items.forEach((item: ItemElement) => {
            let { itemId } = item.dataset;
            let itemTitle = item.getElementsByClassName("catalog-item-title")[0];
            if (panel.dataset.initialItemId === itemId) {
                panelSelection.innerHTML = itemTitle.innerHTML;
            }
            item.onclick = (event) => {
                event.preventDefault();
                if (requesting) {
                    return;
                }
                let nextPanels = <PanelElement[]>getNextElements(panel, "catalog-panel");

                if (panel.dataset.selectedItemId !== itemId) {
                    // Select item
                    panelSelection.innerHTML = itemTitle.innerHTML;
                    panel.dataset.selectedItemId = itemId;
                    panel.classList.toggle("catalog-panel-changed", panel.dataset.savedItemId !== itemId);
                    panel.classList.remove("catalog-panel-not-selected");
                    items.forEach((anItem: HTMLDivElement) => {
                        anItem.classList.toggle("catalog-item-settled", anItem.dataset.itemId === itemId);
                    });

                    // Update succession panels
                    let changed = (panel.dataset.initialItemId !== itemId);
                    if (nextPanels.length >= 1) {
                        nextPanels[0].classList.toggle("catalog-panel-loading", changed);
                        nextPanels[0].classList.remove("catalog-panel-not-selected");
                        nextPanels.slice(1).forEach((aPanel) => {
                            aPanel.classList.toggle("catalog-panel-disabled", changed);
                        });
                    }

                    // Request update
                    if (changed) {
                        requesting = true;
                        setTimeout(() => {
                            sendCommand({
                                panelId: panel.dataset.panelId,
                                itemId: itemId
                            });
                        }, 500);
                    }
                }

                if (nextPanels[0] != null) {
                    // Open next panel
                    (<HTMLDivElement>nextPanels[0].getElementsByClassName("catalog-header")[0]).click();
                }
            };
        });
    });
    function _getElement(baseElement: HTMLElement, className: string, prop: string): HTMLElement {
        let newElement = baseElement[prop];
        while (newElement && !newElement.classList.contains(className)) {
            newElement = newElement[prop];
        }
        return newElement;
    }
    function getParentElement(element: HTMLElement, className: string): HTMLElement {
        return _getElement(element, className, "parentElement");
    }
    function getNextElement(element: HTMLElement, className: string): HTMLElement {
        return _getElement(element, className, "nextElementSibling");
    }
    function getNextElements(element: HTMLElement, className: string): HTMLElement[] {
        let elements: HTMLElement[] = [];
        while ((element = getNextElement(element, className)) != null) {
            elements.push(element);
        }
        return elements;
    }
/*
    let spinner = null;
    let elements = document.getElementsByClassName("catalog-item");
    function getChildElement(element: HTMLElement, cls: string): HTMLElement {
        return <HTMLElement>element.getElementsByClassName(cls)[0];
    }
    function getParentPanel(element: HTMLElement): HTMLElement {
        return getParentElement(element, "catalog-panel");
    }
    function getNextPanel(element: HTMLElement): HTMLElement {
        return getNextElement(element, "catalog-panel");
    }
    function getParentItem(element: HTMLElement): HTMLElement {
        if (element.classList.contains("catalog-item")) { return element; }
        return getParentElement(element, "catalog-item");
    }
    for (let i = 0; i < elements.length; ++i) { ((i) => {
        let element = <HTMLDivElement>elements[i];
        element.addEventListener("click", (event: MouseEvent) => {
            event.preventDefault();
            if (spinner) { return; }

            let item = getParentItem(<HTMLElement>event.target);
            if (!item) { return; }
            let panel = getParentPanel(item);
            if (!panel) { return; }
            let nextPanel = getNextPanel(panel);

            if (!item.classList.contains("catalog-item-settled")) {
                // When selection changed, page update is required
                let siblings = panel.getElementsByClassName("catalog-item");
                for (let i = 0; i < siblings.length; ++i) {
                    siblings[i].classList.remove("catalog-item-settled");
                }
                item.classList.add("catalog-item-settled");
                panel.getElementsByClassName("catalog-header-decision")[0].innerHTML =
                    item.getElementsByClassName("catalog-item-title")[0].innerHTML;
                panel.classList.remove("catalog-panel-not-selected");
                // panel.classList.add("catalog-panel-changed");
                setTimeout(() => {
                    sendCommand({
                        panel: panel.dataset.id,
                        item: item.dataset.id
                    });
                }, 500);
                if (nextPanel) {
                    nextPanel.classList.remove("catalog-panel-disabled", "catalog-panel-not-selected");
                    nextPanel.classList.add("catalog-panel-loading");
                    spinner = new (<any>window).Spinner({
                        lines: 11,
                        length: 4,
                        width: 5,
                        radius: 15,
                        color: "#888"
                    }).spin(nextPanel.getElementsByClassName("catalog-content-loading")[0]);

                    // Disabled successor panels
                    let childPanel = nextPanel;
                    while ((childPanel = getNextPanel(childPanel)) != null) {
                        childPanel.classList.remove("catalog-panel-not-selected", "catalog-panel-loading");
                        childPanel.classList.add("catalog-panel-disabled");
                    }
                }
            }

            // Open next panel
            if (nextPanel) {
                let nextHeader = getChildElement(nextPanel, "catalog-header");
                if (nextHeader) {
                    nextHeader.click();
                }
            }
        });
    })(i); }
    */
})();

// Register event handler for page navs
(() => {
    function getArray(className: string) {
        return Array.from(document.getElementsByClassName(className));
    }
    for (let link of <HTMLAnchorElement[]>getArray("catalog-page-link")) {
        let pidx = link.dataset.pidx;
        link.addEventListener("click", () => {
            for (let page of <HTMLDivElement[]>getArray("catalog-page-container")) {
                page.classList.toggle("active", page.dataset.pidx === pidx);
            }
            for (let a_link of <HTMLAnchorElement[]>getArray("catalog-page-link")) {
                a_link.classList.toggle("disabled", a_link.dataset.pidx === pidx);
            }
            link.blur();
        });
    }    
})();
