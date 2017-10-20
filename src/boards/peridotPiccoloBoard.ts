import { BoardCandidate, Board, BoardInformation, BoardStdioStream, BoardDebugStream } from "./board";
import * as md5 from "md5";
import * as delay from "delay";
import * as path from "path";
import * as pify from "pify";
import * as fs from "fs";
import * as nls from "vscode-nls";
import * as decompress from "decompress";
import { RubicAgent } from "../util/rubicAgent";
import { CanariumGen1, CanariumGen2 } from "canarium";
import { loadNios2Elf, convertRpdToBytes } from "../util/altera";
require("promise.prototype.finally").shim();
const localize = nls.loadMessageBundle(__filename);

const O_RDONLY  = 0;
const O_WRONLY  = 1;
// const O_RDWR    = 2;
const O_CREAT   = 0x0200;
const O_TRUNC   = 0x0400;

const GEN1_OPEN_TIMEOUT = 5000;
const BOOT_CLASSID = 0x72a90000;
const BOOT_BITRATE = 115200;
const BOOT_SWI_BASE = 0x10000000;
const SWI_REG_CLASSID = 0;
const SWI_REG_RSTSTS = 4;
const SWI_REG_MESSAGE = 6;
const SWI_RSTSTS_KEY_VAL = (0xdead << 16);
const SWI_RSTSTS_RST_MSK = (1 << 8);
const WRITER_ELF_PATH = path.join(__dirname, "..", "..", "..", "lib", "peridot_piccolo_writer.elf");

const EPCS_FATFS_IOCTL_FORMAT = 0x4501;

const USER_BAUDRATE = 921600;
const USER_RPC_CHANNEL = 1;
const USER_RPC_SPLIT = 8192;
const USER_STDIN_CHANNEL = 2;
const USER_STDOUT_CHANNEL = USER_STDIN_CHANNEL;
const USER_STDERR_CHANNEL = 3;
const USER_DEBUG_CHANNEL = 4;

namespace RubicFwUp {
    const DEFAULT_TIMEOUT = 2000;
    const MESSAGE_SPLIT = 8 * 1024;
    const WRITE_TIMEOUT_PER_BYTE = 100 / 1024;  // 100ms/kB

    interface ResponseReader {
        (offset: number, length: number): Promise<Buffer>;
    }

    function issueCommand(canarium: CanariumGen1, message: Buffer, progress?: (percent: number) => void, responseTimeout?: number): Promise<ResponseReader> {
        if (progress == null) {
            progress = () => {};
        }
        let msgType = message.slice(0, 4).toString();
        let getAddress = (expire?: number): Promise<number> => {
            return canarium.avm.iord(BOOT_SWI_BASE, SWI_REG_MESSAGE)
            .then((value) => {
                if (value === 0) {
                    return delay(50).then(() => {
                        if ((expire != null) && (expire < Date.now())) {
                            throw new Error(`Timeout ('${msgType}' message)`);
                        }
                        return getAddress(expire);
                    });
                }
                return value;
            });
        };
        return Promise.resolve()
        .then(() => {
            // Get message buffer pointer
            progress(0);
            return getAddress(Date.now() + DEFAULT_TIMEOUT);
        })
        .then((address) => {
            // Check previous response and write new message
            progress(5);
            return canarium.avm.read(address, 8)
            .then((prevResponse) => {
                let signature = prevResponse.slice(0, 1).toString();
                if (!signature.match(/^[brhwe]$/)) {
                    throw new Error("invalid previous response");
                }
                let capacity = prevResponse.readUInt32LE(4);
                if (message.length > capacity) {
                    throw new Error("message is too large");
                }
            })
            .then(() => {
                // Write new message
                progress(10);
                let write = (offset: number) => {
                    let len = Math.min(message.length - offset, MESSAGE_SPLIT);
                    if (len === 0) {
                        return;
                    }
                    let end = offset + len;
                    return canarium.avm.write(address + offset, message.slice(offset, end))
                    .then(() => {
                        progress(10 + 80 * (end / message.length));
                        return write(end);
                    });
                };
                return write(0);
            });
        })
        .then(() => {
            // Notify new message
            return canarium.avm.iowr(BOOT_SWI_BASE, SWI_REG_MESSAGE, 0);
        })
        .then(() => {
            // Wait for response
            progress(90);
            return getAddress(Date.now() + ((responseTimeout != null) ? responseTimeout : DEFAULT_TIMEOUT));
        })
        .then((address) => {
            // Return response reader
            progress(100);
            return ((offset, length) => {
                return canarium.avm.read(address + offset, length);
            });
        });
    }

    export function writeMemory(canarium: CanariumGen1, name: string, data: Buffer, progress: (percent: number) => void): Promise<void> {
        let update: boolean[];
        let sectorSize: number;
        let sectors: number;
        return Promise.resolve()
        .then(() => {
            // Issue hash read message
            progress(0);
            let msg = Buffer.allocUnsafe(12);
            msg.write(`H${name}`, 0, 4);
            msg.writeInt32LE(data.length, 4);
            msg.writeUInt32LE(0, 8);
            return issueCommand(canarium, msg)
            .then((reader) => {
                return reader(0, 16)
                .then((resp) => {
                    let signature = resp.slice(0, 4).toString();
                    if (signature !== `h${name}`) {
                        throw new Error(`invalid response (${signature})`);
                    }
                    let length = resp.readUInt32LE(8);
                    sectorSize = resp.readUInt32LE(12);
                    sectors = length / sectorSize;
                    update = new Array(sectors);
                    data = Buffer.concat([data, Buffer.alloc(sectorSize, 0)], sectorSize * sectors);
                    return reader(16, 16 * sectors);
                })
                .then((hashes) => {
                    for (let i = 0; i < sectors; ++i) {
                        let expected = Buffer.from(md5(data.slice(i * sectorSize, (i + 1) * sectorSize)), "hex");
                        if (expected.compare(hashes, i * 16, (i + 1) * 16) !== 0) {
                            update[i] = true;
                        }
                    }
                });
            });
        })
        .then(() => {
            // Issue write message
            let entries: Buffer[] = [];
            let head = 0;
            for (let i = 0; i < sectors; ++i) {
                if (update[i]) {
                    if (head < 0) {
                        head = i;
                    }
                    if (update[i + 1]) {
                        // Concatinate sectors
                        continue;
                    }
                    let len = (i - head + 1) * sectorSize;
                    let entry = Buffer.allocUnsafe(24 + len);
                    let part = data.slice(head * sectorSize, (i + 1) * sectorSize);
                    let hash = Buffer.from(md5(part), "hex");
                    entry.writeUInt32LE(len, 0);
                    entry.writeUInt32LE(head * sectorSize, 4);
                    hash.copy(entry, 8);
                    part.copy(entry, 24);
                    entries.push(entry);
                    head = -1;
                }
            }
            let signature = Buffer.allocUnsafe(4);
            signature.write(`W${name}`, 0, 4);
            let msg = Buffer.concat([
                signature, ...entries, Buffer.alloc(4)
            ]);
            return issueCommand(canarium, msg, progress, data.length * WRITE_TIMEOUT_PER_BYTE)
            .then((reader) => {
                return reader(0, 16)
                .then((resp) => {
                    let result = resp.readInt32LE(8);
                    let address = resp.readUInt32LE(12);
                    if (result !== 0) {
                        throw new Error(`Write failed at 0x${address.toString(16)} (errno=${result})`);
                    }
                });
            });
        });
    }
}

export class PeridotPiccoloBoard extends Board {
    private _canarium: CanariumGen2;
    private _rpc: CanariumGen2.RpcClient;
    private _agentInfo: RubicAgent.InfoResponse;
    private _runningTid: number;
    
    constructor() {
        super();
    }

    /**
     * Get board internal file path
     * @param relativePath Relative path of file
     */
    private _getInternalPath(relativePath: string): string {
        return `${this._agentInfo.storages.internal}/${relativePath}`;
    }

    /**
     * Get localized board name
     * @return Board name
     */
    public static getBoardName(): string {
        return "PERIDOT Piccolo";
    }

    /**
     * Enumerate boards
     * @return An array of scanned boards
     */
    static list(): Promise<BoardCandidate[]> {
        return CanariumGen2.list()
        .then((ports) => {
            return ports.map((port) => {
                let candidate: BoardCandidate = {
                    boardClass: this.name,
                    name: port.path,
                    path: port.path,
                };
                return candidate;
            });
        });
    }

    /**
     * Connect to board
     * @param path Path of the board
     */
    connect(path: string): Promise<void> {
        this._canarium = new CanariumGen2(path, {baudRate: USER_BAUDRATE, disableTimeouts: true});
        this._rpc = this._canarium.createRpcClient(USER_RPC_CHANNEL);
        this._canarium.on("close", () => {
            this._rpc = null;
        });
        return this._canarium.open()
        .then(() => {
            let params: RubicAgent.InfoParameters = {};
            return this._rpc.call(RubicAgent.METHOD_INFO, params);
        })
        .then((info: RubicAgent.InfoResponse) => {
            this._agentInfo = info;
            return this._rpc.call("fs.cleanup", null);
        })
        .catch((reason) => {
            return this._canarium.close()
            .finally(() => {
                throw reason;
            });
        });
    }

    /**
     * Disconnect from board
     */
    disconnect(): Promise<void> {
        return this._canarium.close();
    }

    /**
     * Get board information
     */
    getInfo(): Promise<BoardInformation> {
        return this._canarium.getInfo()
        .then((info) => {
            return {
                path: this._canarium.path,
                serialNumber: `${info.id}-${info.serialCode}`,
            };
        });
    }

    /**
     * Write file
     * @param relativePath Relative path of the file to be stored
     * @param data Data to write
     */
    writeFile(relativePath: string, data: Buffer): Promise<void> {
        return this._rpc.call("fs.open", {
            path: this._getInternalPath(relativePath),
            flags: O_WRONLY | O_CREAT | O_TRUNC
        })
        .then(({fd}) => {
            let tryWrite = (offset: number): Promise<void> => {
                let nextOffset = Math.min(data.length, offset + USER_RPC_SPLIT);
                if (nextOffset === offset) {
                    // No more data
                    return;
                }
                return this._rpc.call("fs.write", {
                    fd,
                    data: data.slice(offset, nextOffset)
                })
                .then(({length}) => {
                    if (length === 0) {
                        throw new Error(`Cannot write more data to '${relativePath}' at ${offset}`);
                    }
                    return tryWrite(offset + length);
                });
            };
            return tryWrite(0)
            .finally(() => {
                return this._rpc.call("fs.close", {fd});
            });
        });
    }

    /**
     * Read file
     * @param relativePath Relative path of the file to be read
     * @return Read data
     */
    readFile(relativePath: string): Promise<Buffer> {
        return this._rpc.call("fs.open", {
            path: this._getInternalPath(relativePath),
            flags: O_RDONLY
        })
        .then(({fd}) => {
            let chunks: Buffer[] = [];
            let total: number = 0;
            let tryRead = (): Promise<Buffer> => {
                return this._rpc.call("fs.read", {
                    fd,
                    length: USER_RPC_SPLIT
                })
                .then(({data, length}) => {
                    if (length === 0) {
                        return Buffer.concat(chunks, total);
                    }
                    chunks.push(data);
                    total += data.length;
                    return tryRead();
                });
            };
            return tryRead()
            .finally(() => {
                return this._rpc.call("fs.close", {fd});
            });
        });
    }

    /**
     * Format internal storage
     */
    formatStorage(): Promise<void> {
        return this._rpc.call("fs.open", {
            path: this._agentInfo.storages.internal,
            flags: O_WRONLY
        })
        .then(({fd}) => {
            return this._rpc.call("fs.ioctl", {
                req: EPCS_FATFS_IOCTL_FORMAT
            })
            .then(({result}) => {
                if (result !== 0) {
                    throw new Error(`Error occured during format (result=${result})`);
                }
            })
            .finally(() => {
                return this._rpc.call("fs.close", {fd});
            });
        });
    }

    /**
     * Program firmware
     * @param filename Full path of firmware file
     * @param boardPath Board path
     * @param reporter Progress indication callback
     */
    writeFirmware(filename: string, boardPath: string, reporter: (message?: string) => void): Promise<boolean> {
        let writerElf: Buffer;
        let spiElf: Buffer;
        let img1Rpd: Buffer;
        let ufmRpd: Buffer;
        let canarium: CanariumGen1;

        let makePercentReporter = (text) => {
            return (percent: number) => {
                reporter(`${text} (${Math.floor(percent)}%)`);
            };
        };

        return Promise.all([
            pify(fs.readFile)(WRITER_ELF_PATH),
            pify(fs.readFile)(filename)
        ])
        .then((buffers) => {
            let zip: Buffer;
            [ writerElf, zip ] = buffers;
            // Extract firmware files
            return decompress(zip);
        })
        .then((files) => {
            spiElf = (files.find((file) => file.path === "spi.elf") || {}).data;
            img1Rpd = (files.find((file) => file.path === "image1.rpd") || {}).data;
            ufmRpd = (files.find((file) => file.path === "ufm.rpd") || {}).data;
        })
        .then(() => {
            // Connect to board
            canarium = new CanariumGen1();
            canarium.serialBitrate = BOOT_BITRATE;
            return Promise.race([
                canarium.open(boardPath),
                delay(GEN1_OPEN_TIMEOUT).then(() => {
                    canarium.close();
                    throw new Error("Timed out");
                })
            ]);
        })
        .then(() => {
            // Check current configuration image
            return canarium.avm.iord(BOOT_SWI_BASE, SWI_REG_CLASSID);
        })
        .then((classId) => {
            if (classId !== BOOT_CLASSID) {
                return Promise.reject(new Error(localize(
                    "not-boot-mode",
                    "PERIDOT Piccolo is not running in boot-loader mode"
                )));
            }
            reporter(
                localize("setup-writer", "Setting up writer program")
            );
            // Reset NiosII
            return canarium.avm.iowr(
                BOOT_SWI_BASE, SWI_REG_RSTSTS,
                SWI_RSTSTS_KEY_VAL | SWI_RSTSTS_RST_MSK
            );
        })
        .then(() => {
            // Reset message register
            return canarium.avm.iowr(BOOT_SWI_BASE, SWI_REG_MESSAGE, 0);
        })
        .then(() => {
            // Load ELF
            return loadNios2Elf(canarium, writerElf);
        })
        .then(() => {
            // Start NiosII
            return canarium.avm.iowr(BOOT_SWI_BASE, SWI_REG_RSTSTS, SWI_RSTSTS_KEY_VAL);
        })
        .then(() => {
            // Write Image1 (CFM1+CFM2)
            if (img1Rpd == null) {
                return;
            }
            return RubicFwUp.writeMemory(
                canarium, "img", convertRpdToBytes(img1Rpd),
                makePercentReporter(localize("write-img1", "Writing Image1 area"))
            );
        })
        .then(() => {
            // Write UFM
            if (ufmRpd == null) {
                return;
            }
            return RubicFwUp.writeMemory(
                canarium, "ufm", convertRpdToBytes(ufmRpd),
                makePercentReporter(localize("write-ufm", "Writing UFM area"))
            );
        })
        .then(() => {
            // Write SPI
            if (spiElf == null) {
                return;
            }
            return RubicFwUp.writeMemory(
                canarium, "spi", spiElf,
                makePercentReporter(localize("write-spi", "Writing SPI flash"))
            );
        })
        .finally(() => {
            // Disconnect
            canarium.close();
        })
        .then(() => {
            return true;
        });
    }

    /**
     * Run program
     * @param relativePath Relative path of the file to be executed
     */
    runProgram(relativePath: string): Promise<void> {
        return Promise.resolve()
        .then(() => {
            let params: RubicAgent.QueueStartParameters = {
                name: "start",
                file: this._getInternalPath(relativePath),
                //debug: true
            };
            return this._rpc.call(RubicAgent.METHOD_QUEUE, params);
        })
        .then((result: RubicAgent.QueueStartResponse) => {
            this._runningTid = result.tid;
            let params: RubicAgent.QueueCallbackParameters = {
                name: "callback",
                tid: result.tid
            };

            // Set callback
            this._rpc.call(RubicAgent.METHOD_QUEUE, params)
            .then((result: RubicAgent.QueueCallbackResponse) => {
                this.emit("stop", {result: result.result});
            });
        });
    }

    /**
     * Get program running state
     */
    isRunning(): Promise<boolean> {
        return Promise.reject(new Error("Not supported"));
    }

    /**
     * Stop program
     */
    stopProgram(): Promise<void> {
        if (this._runningTid == null) {
            return Promise.reject(new Error("Not running"));
        }
        let params: RubicAgent.QueueAbortParameters = {
            name: "abort",
            tid: this._runningTid
        };
        return this._rpc.call(RubicAgent.METHOD_QUEUE, params)
        .then((result: RubicAgent.QueueAbortResponse) => {
        });
    }

    /**
     * Get standard I/O streams
     */
    getStdioStream(): Promise<BoardStdioStream> {
        return Promise.resolve({
            stdin: this._canarium.createWriteStream(USER_STDIN_CHANNEL),
            stdout: this._canarium.createReadStream(USER_STDOUT_CHANNEL),
            stderr: this._canarium.createReadStream(USER_STDERR_CHANNEL),
        });
    }

    /**
     * Get debug streams
     */
    getDebugStream(): Promise<BoardDebugStream> {
        return Promise.resolve({
            tx: this._canarium.createWriteStream(USER_DEBUG_CHANNEL),
            rx: this._canarium.createReadStream(USER_DEBUG_CHANNEL),
        });
    }
}
Board.addConstructor(PeridotPiccoloBoard);
