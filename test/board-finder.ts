import * as SerialPort from "serialport";

export type NumberJudge = number | ((value: number) => boolean);

export function findBoard(vendorId: NumberJudge, productId: NumberJudge, callback: (err: Error, path?: string) => void): void {
    SerialPort.list((err, ports) => {
        if (err) {
            return callback(err);
        }
        let port = ports.find((port) => {
            let vid = parseInt(port.vendorId, 16);
            let pid = parseInt(port.productId, 16);
            let judge = true;
            if (vendorId != null) {
                if (typeof(vendorId) === "function") {
                    judge = judge && vendorId(vid);
                } else {
                    judge = judge && (vid === vendorId);
                }
            }
            if (productId != null) {
                if (typeof(productId) === "function") {
                    judge = judge && productId(pid);
                } else {
                    judge = judge && (pid === productId);
                }
            }
            return judge;
        });
        if (!port) {
            return callback(new Error("Board not found"));
        }
        return callback(undefined, port.comName);
    });
}
