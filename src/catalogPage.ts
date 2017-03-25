
// Define utility function for sending message to extension
const sendCommand = (() => {
    var element = <HTMLAnchorElement>document.getElementById("sendCommand");
    var base = element.href;
    return (param) => {
        element.href = base + encodeURI(JSON.stringify(param));
        element.click();
        return false;
    };
})();

// Register event handler for panel headers
(() => {
    var elements = document.getElementsByClassName("catalog-panel");
    for (var i = 0; i < elements.length; ++i) {
        ((i) => {
            var header = <HTMLDivElement>elements[i].getElementsByClassName("catalog-header")[0];
            header.onclick = (event) => {
                if (elements[i].classList.contains("catalog-panel-disabled")) {
                    return;
                }
                for (var j = 0; j < elements.length; ++j) {
                    var element = elements[j];
                    element.classList[i === j ? "add" : "remove"]("catalog-panel-opened");
                    if (j === i) {
                        ((element) => {
                            element.parentElement.classList.add("disable-scroll");
                            let listener = () => {
                                element.parentElement.classList.remove("disable-scroll");
                                element.removeEventListener("transitionend", listener);
                            };
                            element.addEventListener("transitionend", listener);
                        })(element);
                    }
                }
            }
        })(i);
    }
})();
