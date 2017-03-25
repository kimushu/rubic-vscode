///<reference path='../node_modules/typescript/lib/lib.dom.d.ts' />
///<reference path='../node_modules/typescript/lib/lib.es5.d.ts' />

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
                for (var j = 0; j < elements.length; ++j) {
                    elements[j].classList[i === j ? "add" : "remove"]("catalog-panel-opened");
                }
            }
        })(i);
    }
})();
