let files = [];

// Enumerate files (.schema.json)
const glob = require("glob");
let patterns = process.argv.slice(2);
if (patterns.length === 0) {
    patterns = ["**/*.schema.json"];
}
for (let pattern of patterns) {
    files.push(...glob.sync(pattern));
}

// Check files
let errors = 0;
let langs = {};
const path = require("path");
const fs = require("fs");
for (let file of files) {
    let p = path.parse(file);
    p.name += ".*";
    p.base = null;
    let lpattern = path.format(p);
    console.log(`Checking ${file} ...`);
    let src1 = JSON.parse(fs.readFileSync(file));
    for (let lfile of glob.sync(lpattern)) {
        let lang = path.extname(path.basename(lfile, ".json"));
        if (langs[lang] == null) {
            langs[lang] = [];
        }
        langs[lang].push(file);
        let src2 = JSON.parse(fs.readFileSync(lfile));
        errors += checkInvalidSchemaJson(file, src1, lfile, src2);
    }
}

// Language check
let langNames = Object.keys(langs);
for (let file of files) {
    for (let lang of langNames) {
        if (langs[lang].indexOf(file) < 0) {
            console.log(`${file} does not have "${lang}" translation`);
            ++errors;
        }
    }
}

if (errors > 0) {
    console.error(`Detected ${errors} errors`);
    process.exit(1);
} else {
    console.info("No error");
    process.exit();
}

function checkInvalidSchemaJson(file1, src1, file2, src2) {
    let errors = 0;
    function recursiveCheck(path, obj1, obj2) {
        if (typeof(obj1) !== typeof(obj2)) {
            console.log(`Type mismatch (${path.join(".")}) between ${file1} and ${file2}`);
            ++errors;
        } else if (typeof(obj1) === "object") {
            for (let key of Object.keys(obj1)) {
                recursiveCheck(path.concat(key), obj1[key], obj2[key]);
            }
        } else if (obj1 !== obj2) {
            if (path[path.length - 1] !== "description") {
                console.log(`Value mismatch (${path.join(".")}) between ${file1} and ${file2}`);
                ++errors;
            }
        }
    }
    recursiveCheck([], src1, src2);
    return errors;
}
