import { Board } from "./board";
import { Pyboard } from "./pyboard";

/**
 * M5Stack
 */
export class M5Stack extends Pyboard {
    /**
     * A list of USB serial VendorID / ProductID list
     */
    protected static usbSerialIdList = [
        { vendorId: 0x10c4, productId: 0xea60 },    // Silicon Labs CP210x family
    ];

    /**
     * Get localized board name
     * @return Board name
     */
    public static getBoardName(): string {
        return "M5Stack";
    }

    /**
     * Construct board instance
     */
    public constructor() {
        super();
    }
}

Board.addConstructor(M5Stack);
