
// Define utility function for sending message to extension
const sendCommand = (() => {
    let element = <HTMLAnchorElement>document.getElementById("sendCommand");
    let base = element.href;
    return (param) => {
        element.href = base + encodeURI(JSON.stringify(param));
        element.click();
        return false;
    };
})();

// Register event handler for panel headers
(() => {
    let elements = document.getElementsByClassName("catalog-panel");
    for (let i = 0; i < elements.length; ++i) { ((i) => {
        let header = <HTMLDivElement>elements[i].getElementsByClassName("catalog-header")[0];
        header.onclick = (event) => {
            if (elements[i].classList.contains("catalog-panel-disabled")) {
                return;
            }
            for (let j = 0; j < elements.length; ++j) { ((j) => {
                let element = elements[j];
                if (i === j && !element.classList.contains("catalog-panel-opened")) {
                    element.parentElement.classList.add("disable-scroll");
                    let listener = () => {
                        element.parentElement.classList.remove("disable-scroll");
                        element.removeEventListener("transitionend", listener);
                    };
                    element.addEventListener("transitionend", listener);
                }
                (<any>element.classList[i === j ? "add" : "remove"])("catalog-panel-opened");
            })(j); }
        }
    })(i); }
})();

// Register event handler for items
(() => {
    let spinner = null;
    let elements = document.getElementsByClassName("catalog-item");
    function _getElement(element: HTMLElement, cls: string, prop: string): HTMLElement {
        let panel = element[prop];
        while (panel && !panel.classList.contains(cls)) {
            panel = panel[prop];
        }
        return panel;
    }
    function getParentElement(element: HTMLElement, cls: string): HTMLElement {
        return _getElement(element, cls, "parentElement");
    }
    function getNextElement(element: HTMLElement, cls: string): HTMLElement {
        return _getElement(element, cls, "nextElementSibling");
    }
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
                nextHeader && nextHeader.click();
            }
        });
    })(i); }
})();
