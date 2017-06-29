let files = [];

// Enumerate files (.nls.json)
const glob = require("glob");
let patterns = process.argv.slice(2);
if (patterns.length === 0) {
    patterns = ["**/*.nls.json"];
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
        errors += checkInvalidNlsJson(file, src1, lfile, src2);
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

function checkInvalidNlsJson(file1, src1, file2, src2) {
    let errors = 0;
    if (src1.messages != null && src1.keys != null) {
        // Array type
        let key1 = src1.keys;
        let msg1 = src1.messages;
        let key2 = src2.keys;
        let msg2 = src2.messages;
        if (key2 == null) {
            console.log(`${file2} does not have "keys" property`);
            ++errors;
        } else if (msg2 == null) {
            console.log(`${file2} does not have "messages" property`);
            ++errors;
        } else if (key1.length != key2.length) {
            console.log(`${file2} has different keys`);
            ++errors;
        } else if (key2.length != msg2.length) {
            console.log(`The number of messages of ${file2} is invalid`);
            ++errors;
        } else {
            for (let i in key1) {
                if (key2[i] !== key1[i]) {
                    console.log(`Key "${key2[i]}" at ${i} is different`);
                    ++errors;
                    break;
                }
            }
        }
    } else {
        // Object type
        let key1 = Object.keys(src1);
        let key2 = Object.keys(src2);
        for (let key of key1) {
            if (key2.indexOf(key) < 0) {
                console.log(`Required key "${key}" does not exist in ${file2}`);
                ++errors;
            }
        }
        for (let key of key2) {
            if (key1.indexOf(key) < 0) {
                console.log(`Invalid key "${key}" exists in ${file2}`);
                ++errors;
            }
        }
    }
    return errors;
}
