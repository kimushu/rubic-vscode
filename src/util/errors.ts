export class NotSupportedError extends Error {
    constructor(message?: string) {
        super(message);
        Object.setPrototypeOf(this, NotSupportedError.prototype);
    }
}

export class FileTransferError extends Error {
    constructor(message?: string) {
        super(message);
        Object.setPrototypeOf(this, FileTransferError.prototype);
    }
}

export class TimeoutError extends Error {
    constructor(message?: string) {
        super(message);
        Object.setPrototypeOf(this, TimeoutError.prototype);
    }
}
