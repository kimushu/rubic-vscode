import { Board } from "../../../src/boards/board";
import { GrCitrusBoard } from "../../../src/boards/grCitrusBoard";
import * as sp from "serialport";
import * as chai from "chai";
chai.use(require("chai-as-promised"));
(chai.config as any).proxyExcludedKeys.push("catch");
const { assert } = chai;

const TEST_MRB = Buffer.from([
    /*
    puts("TESTPROGRAM")
    delay(1000)
    puts("CHECK1")
    delay(1000)
    puts("CHECK2")
    */
    0x52, 0x49, 0x54, 0x45, 0x30, 0x30, 0x30, 0x34, 0xab, 0x2d, 0x00, 0x00,
    0x00, 0xaf, 0x4d, 0x41, 0x54, 0x5a, 0x30, 0x30, 0x30, 0x30, 0x49, 0x52,
    0x45, 0x50, 0x00, 0x00, 0x00, 0x91, 0x30, 0x30, 0x30, 0x30, 0x00, 0x00,
    0x00, 0x89, 0x00, 0x01, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
    0x00, 0x80, 0x00, 0x06, 0x01, 0x00, 0x00, 0x3d, 0x00, 0x80, 0x00, 0xa0,
    0x00, 0x80, 0x00, 0x06, 0x01, 0x41, 0xf3, 0x83, 0x00, 0x80, 0x40, 0xa0,
    0x00, 0x80, 0x00, 0x06, 0x01, 0x00, 0x00, 0xbd, 0x00, 0x80, 0x00, 0xa0,
    0x00, 0x80, 0x00, 0x06, 0x01, 0x41, 0xf3, 0x83, 0x00, 0x80, 0x40, 0xa0,
    0x00, 0x80, 0x00, 0x06, 0x01, 0x00, 0x01, 0x3d, 0x00, 0x80, 0x00, 0xa0,
    0x00, 0x00, 0x00, 0x4a, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x0b, 0x54,
    0x45, 0x53, 0x54, 0x50, 0x52, 0x4f, 0x47, 0x52, 0x41, 0x4d, 0x00, 0x00,
    0x06, 0x43, 0x48, 0x45, 0x43, 0x4b, 0x31, 0x00, 0x00, 0x06, 0x43, 0x48,
    0x45, 0x43, 0x4b, 0x32, 0x00, 0x00, 0x00, 0x02, 0x00, 0x04, 0x70, 0x75,
    0x74, 0x73, 0x00, 0x00, 0x05, 0x64, 0x65, 0x6c, 0x61, 0x79, 0x00, 0x45,
    0x4e, 0x44, 0x00, 0x00, 0x00, 0x00, 0x08
]);
const TEST_BIN = Buffer.from([0x00, 0x0a, 0x0d, 0xff]);

describe("GrCitrusBoard", function() {
    it("is registered in Board class list", function() {
        assert.strictEqual(Board.getConstructor("GrCitrusBoard"), GrCitrusBoard);
    });
    it("is a constructor function", function() {
        // tslint:disable-next-line:no-unused-expression
        new GrCitrusBoard();
    });
    describe("online test", function() {
        let path: string;
        before(function(done) {
            sp.list((err, ports) => {
                if (err) {
                    return done(err);
                }
                const port = ports.find((port) =>
                    (parseInt(port.vendorId, 16) === 0x2a50) &&
                    (parseInt(port.productId, 16) === 0x0277)
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
            let board: GrCitrusBoard;
            before(function () {
                if (path == null) {
                    this.skip();
                }
            });
            beforeEach(function() {
                board = new GrCitrusBoard();
            });
            afterEach(function(done) {
                if (!board.isConnected) {
                    return done();
                }
                board.disconnect().then(done, done);
                board = undefined as any;
            });
            it("static getBoardName() returns string", function() {
                return assert.isString(GrCitrusBoard.getBoardName());
            });
            it("getBoardName() returns the same string by static getBoardName()", function() {
                return assert.strictEqual(board.getBoardName(), GrCitrusBoard.getBoardName());
            });
            it("static list() returns device", function() {
                return assert.isFulfilled(
                    GrCitrusBoard.list()
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
                        assert.match((value || {}).firmwareId!, /^CITRUS-/);
                    })
                );
            });
            it("getInfo() fails when not connected", function() {
                return assert.isRejected(board.getInfo());
            });
        });
        describe("file writing tests", function() {
            let board: GrCitrusBoard;
            let mountPoint: string;
            before(function() {
                if (path == null) {
                    this.skip();
                } else {
                    board = new GrCitrusBoard();
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
            step("formatStorage() succeeds", function() {
                return assert.isFulfilled(
                    board.formatStorage(mountPoint)
                );
            });
            step("enumerateFiles() succeeds with an empty array", function() {
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
                    board.readFile(`${mountPoint}/test.mrb`),
                    Error
                );
            });
            step("writeFile() succeeds", function() {
                this.slow(1000);
                this.timeout(4000);
                return assert.isFulfilled(
                    board.writeFile(`${mountPoint}/test.mrb`, TEST_MRB)
                );
            });
            step("writeFile() with useHexForWriting succeeds", function() {
                this.slow(500);
                board.boardData = {useHexForWriting: true};
                return assert.isFulfilled(
                    board.writeFile(`${mountPoint}/test.bin`, TEST_BIN)
                    .then(() => board.boardData = undefined)
                );
            });
            step("enumerateFiles() returns two files", function() {
                return assert.isFulfilled(
                    board.enumerateFiles(mountPoint, true)
                    .then((files) => {
                        assert.isArray(files);
                        assert.strictEqual(files.length, 2);
                        assert.include(files, "test.mrb");
                        assert.include(files, "test.bin");
                    })
                );
            });
            step("readFile() succeeds (1)", function() {
                this.slow(200);
                return assert.isFulfilled(
                    board.readFile(`${mountPoint}/test.mrb`)
                    .then((content) => {
                        assert.strictEqual(content.compare(TEST_MRB), 0);
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
                        assert.strictEqual(files.length, 1);
                        assert.include(files, "test.mrb");
                    })
                );
            });
        });
    });
});
