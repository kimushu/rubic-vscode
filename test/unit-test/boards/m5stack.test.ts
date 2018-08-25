import { Board } from "../../../src/boards/board";
import { M5Stack } from "../../../src/boards/m5stack";
import * as sp from "serialport";
import * as chai from "chai";
import * as dedent from "dedent";
chai.use(require("chai-as-promised"));
(chai.config as any).proxyExcludedKeys.push("catch");
const { assert } = chai;

const TEST_PY = Buffer.from(dedent`
from time import sleep_ms
print("TESTPROGRAM")
sleep_ms(1000)
print("CHECK1")
sleep_ms(1000)
print("CHECK2")
`);
const TEST_BIN = Buffer.from([0x00, 0x0a, 0x0d, 0xff]);

describe("M5Stack", function() {
    it("is registered in Board class list", function() {
        assert.strictEqual(Board.getConstructor("M5Stack"), M5Stack);
    });
    it("is a constructor function", function() {
        // tslint:disable-next-line:no-unused-expression
        new M5Stack();
    });
    describe("online test", function() {
        let path: string;
        before(function(done) {
            sp.list((err, ports) => {
                if (err) {
                    return done(err);
                }
                const port = ports.find((port) =>
                    (parseInt(port.vendorId, 16) === 0x10c4) &&
                    (parseInt(port.productId, 16) === 0xea60)
                );
                if (port != null) {
                    path = port.comName;
                }
                const suite = (<any>this).test.parent.suites.find((suite) => suite.title === "information");
                if (suite != null) {
                    const test = suite.tests.find((test) => test.title === "content");
                    if (test != null) {
                        test.title = `target path: ${path || "(not found)"}`;
                    }
                }
                if (path == null) {
                    this.skip();
                }
                return done();
            });
        });
        describe("information", function() {
            before(function () {
                if (path == null) {
                    this.skip();
                }
            });
            it("content", function() {});
        });
        describe("non-destructive tests", function() {
            let board: M5Stack;
            before(function () {
                if (path == null) {
                    this.skip();
                }
            });
            beforeEach(function() {
                board = new M5Stack();
            });
            afterEach(function(done) {
                if (!board.isConnected) {
                    return done();
                }
                board.disconnect().then(done, done);
                board = undefined as any;
            });
            it("static getBoardName() returns string", function() {
                return assert.isString(M5Stack.getBoardName());
            });
            it("getBoardName() returns the same string by static getBoardName()", function() {
                return assert.strictEqual(board.getBoardName(), M5Stack.getBoardName());
            });
            it("static list() returns device", function() {
                return assert.isFulfilled(
                    M5Stack.list()
                    .then((value) => {
                        assert.isArray(value);
                        const c = value.find((c) => c.path === path);
                        assert.isDefined(c);
                        assert.isNotOk(c!.unsupported);
                    })
                );
            });
            it("connect() succeeds", function() {
                return assert.isFulfilled(board.connect(path));
            });
            it("connect() fails when already connected", function() {
                return assert.isFulfilled(board.connect(path))
                .then(() => assert.isRejected(board.connect(path)));
            });
            it("disconnect() succeeds", function() {
                return assert.isFulfilled(
                    board.connect(path)
                    .then(() => board.disconnect())
                );
            });
            it("disconnect() fails when not connected", function() {
                return assert.isRejected(board.disconnect());
            });
            it("path equals to connected path", function() {
                return assert.isFulfilled(
                    board.connect(path)
                    .then(() => assert.strictEqual(board.path, path))
                );
            });
            it("path equals undefined when not connected", function() {
                assert.isUndefined(board.path);
                return assert.isFulfilled(
                    board.connect(path)
                    .then(() => board.disconnect())
                    .then(() => assert.isUndefined(board.path))
                );
            });
            it("getInfo() succeeds with firmwareId that starts with \"CITRUS-\"", function() {
                return assert.isFulfilled(
                    board.connect(path)
                    .then(() => board.getInfo())
                    .then((value) => {
                        assert.match((value || {}).firmwareId!, /^esp32_LoBo-micropython-/);
                    })
                );
            });
            it("getInfo() fails when not connected", function() {
                return assert.isRejected(board.getInfo());
            });
        });
        describe("file writing tests", function() {
            let board: M5Stack;
            let mountPoint: string;
            before(function() {
                if (path == null) {
                    this.skip();
                } else {
                    board = new M5Stack();
                }
            });
            after(function(done) {
                if (board != null) {
                    board.disconnect().then(done, done);
                    board = undefined as any;
                } else {
                    done();
                }
            });
            step("connect", function() {
                return assert.isFulfilled(board.connect(path));
            });
            step("getStorageInfo() succeeds", function() {
                return assert.isFulfilled(
                    board.getStorageInfo()
                    .then((info) => {
                        assert.isArray(info);
                        const storage = info.find((v) => (!v.external) && (!v.readOnly));
                        assert.isDefined(storage);
                        mountPoint = storage!.mountPoint;
                        assert.isString(mountPoint);
                    })
                );
            });
            xstep("formatStorage() succeeds", function() {
                return assert.isFulfilled(
                    board.formatStorage(mountPoint)
                );
            });
            xstep("enumerateFiles() succeeds with an empty array", function() {
                return assert.isFulfilled(
                    board.enumerateFiles(mountPoint, true)
                    .then((files) => {
                        assert.isArray(files);
                        assert.strictEqual(files.length, 0);
                    })
                );
            });
            step("readFile() fails", function() {
                this.slow(200);
                return assert.isRejected(
                    board.readFile(`${mountPoint}/notexist.py`),
                    Error
                );
            });
            step("writeFile() succeeds (1)", function() {
                this.slow(1000);
                this.timeout(4000);
                return assert.isFulfilled(
                    board.writeFile(`${mountPoint}/test.py`, TEST_PY)
                );
            });
            step("writeFile() succeeds (2)", function() {
                this.slow(500);
                return assert.isFulfilled(
                    board.writeFile(`${mountPoint}/test.bin`, TEST_BIN)
                );
            });
            step("enumerateFiles() returns two files", function() {
                return assert.isFulfilled(
                    board.enumerateFiles(mountPoint, true)
                    .then((files) => {
                        assert.isArray(files);
                        assert.include(files, "test.py");
                        assert.include(files, "test.bin");
                    })
                );
            });
            step("readFile() succeeds (1)", function() {
                this.slow(200);
                return assert.isFulfilled(
                    board.readFile(`${mountPoint}/test.py`)
                    .then((content) => {
                        assert.strictEqual(content.compare(TEST_PY), 0);
                    })
                );
            });
            step("readFile() succeeds (2)", function() {
                this.slow(200);
                return assert.isFulfilled(
                    board.readFile(`${mountPoint}/test.bin`)
                    .then((content) => {
                        assert.strictEqual(content.compare(TEST_BIN), 0);
                    })
                );
            });
            step("removeFile() succeeds", function() {
                this.slow(200);
                return assert.isFulfilled(
                    board.removeFile(`${mountPoint}/test.bin`)
                );
            });
            step("enumerateFiles() returns one file", function() {
                return assert.isFulfilled(
                    board.enumerateFiles(mountPoint, true)
                    .then((files) => {
                        assert.isArray(files);
                        assert.include(files, "test.py");
                        assert.notInclude(files, "test.bin");
                    })
                );
            });
        });
    });
});
