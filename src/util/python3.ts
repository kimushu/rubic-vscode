module python3 {

    /**
     * Convert Buffer to Python string representation (internal)
     * @param buffer Buffer to convert
     */
    function reprString(buffer: Buffer): string {
        let result = "'";
        buffer.forEach((byte) => {
            switch (byte) {
            case 0x09:
                result += "\\t";
                break;
            case 0x0a:
                result += "\\n";
                break;
            case 0x0d:
                result += "\\r";
                break;
            case 0x27:
                result += "\\'";
                break;
            default:
                if ((byte <= 0x1f) || (0x7f <= byte)) {
                    result += `\\x${("0"+byte.toString(16)).substr(-2)}`;
                } else {
                    result += String.fromCharCode(byte);
                }
                break;
            }
        });
        return result + "'";
    }

    /**
     * Convert JavaScript object to Python3 representation
     * @param object JavaScript object to convert
     */
    export function repr(object: any): string {
        if (typeof(object) === "number") {
            // int / float
            return `${object}`;
        } else if (object instanceof Array) {
            // list
            return `[${object.map((item) => repr(item)).join(", ")}]`;
        } else if (object instanceof Buffer) {
            // bytes
            return `b${reprString(object)}`;
        } else if (typeof(object) === "string") {
            // str
            return reprString(Buffer.from(object));
        }
        throw new TypeError(`Python3 repr error: ${object}`);
    }

    /**
     * Convert Python3 string representation to Buffer (internal)
     * @param repr Python3 string representation
     */
    function evalString(repr: Buffer): { length: number, object: Buffer } {
        let buffer = Buffer.alloc(repr.byteLength);
        let length = 0;
        if (repr[0] !== 0x27) {
            throw new TypeError("Invalid string quotation");
        }
        for (let offset = 1; offset < repr.byteLength;) {
            let byte = repr[offset++];
            if (byte === 0x27) {
                // End string
                return { length: offset, object: buffer.slice(0, length) };
            }
            if (byte === 0x5c) {
                // Escape
                byte = repr[offset++];
                switch (byte) {
                case 0x27:
                    // Single quotation
                    buffer[length++] = 0x27;
                    break;
                case 0x74:
                    // Tab
                    buffer[length++] = 0x09;
                    break;
                case 0x72:
                    // CR
                    buffer[length++] = 0x0d;
                    break;
                case 0x6e:
                    // LF
                    buffer[length++] = 0x0a;
                    break;
                case 0x78:
                    // Hex
                    buffer[length++] = parseInt(repr.slice(offset, offset + 2).toString(), 16);
                    offset += 2;
                    break;
                default:
                    // Invalid escape
                    throw new TypeError("Invalid escape in string");
                }
            }
            buffer[length++] = byte;
        }
        throw new TypeError("Non-terminated string");
    }

    /**
     * Convert Python3 representation to JavaScript object (internal)
     * @param repr Python3 representation
     */
    function evalBuffer(repr: Buffer): { length: number, object: any } {
        let byte = repr[0];
        if (byte === 0x27) {
            // str
            const { length, object } = evalString(repr);
            return { length, object: object.toString() };
        } else if ((byte === 0x62) && (repr[1] === 0x27)) {
            // bytes
            const { length, object } = evalString(repr.slice(1));
            return { length: length + 1, object };
        } else if ((byte === 0x2b) || (byte === 0x2d) || (byte === 0x2e) || ((byte >= 0x30) && (byte <= 0x39))) {
            // int, float
            const length = repr.findIndex((byte, offset) => {
                return (offset > 0) && (byte !== 0x2e) && ((byte < 0x30) || (byte > 0x39));
            });
            const expr = (length > 0) ? repr.slice(0, length) : repr;
            return { length: expr.length, object: parseFloat(expr.toString()) };
        } else if (byte === 0x5b) {
            // list
            let length = 1;
            const object: any[] = [];
            const skipSpaces = () => {
                for (;;) {
                    const byte = repr[length];
                    if ((byte !== 0x20) && (byte !== 0x0d) && (byte !== 0x0a) && (byte !== 0x09)) {
                        return byte;
                    }
                    ++length;
                }
            };
            for (;;) {
                let byte = skipSpaces();
                if (byte === 0x2c) {
                    if (object.length === 0) {
                        throw new TypeError("Invalid syntax");
                    }
                    ++length;
                    byte = skipSpaces();
                }
                if (byte === 0x5d) {
                    break;
                }

                // Evaluate item
                const item = evalBuffer(repr.slice(length));
                object.push(item.object);
                length += item.length;
            }
            return { length: length + 1, object };
        }
        throw new TypeError("Invalid expression");
    }

    /**
     * Convert Python3 representation to JavaScript object
     * @param repr Python3 representation
     */
    export function eval_<T>(repr: string): T {
        const buffer = Buffer.from(repr);
        const result = evalBuffer(buffer);
        if (result.length < buffer.byteLength) {
            throw new TypeError(`Junk at offset ${result.length}`);
        }
        return result.object;
    }
}

export = python3;
