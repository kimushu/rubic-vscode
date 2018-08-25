import { join } from "path";

module vscode {
    export module commands {

    }
    export module extensions {

    }
    export module window {

    }
    export module workspace {

    }
    export class Uri {
        static file(path: string): Uri {
            return this.parse(`file://${path.replace(/\\/g, "/")}`);
        }
        static parse(value: string): Uri {
            const match = value.match(/^([^:]+):\/\/([^\/]+)((?:\/[^?]*)?)(?:\?([^#]*))?(?:#(.*))?$/);
            if (match == null) {
                throw new Error(`Invalid URI string: ${value}`);
            }
            return new this(match[1], match[2], match[3], match[4], match[5]);
        }
        readonly fsPath: string;
		private constructor(readonly scheme: string, readonly authority: string, readonly path: string, readonly query: string, readonly fragment: string) {
            if (scheme === "file") {
                this.fsPath = join(authority, path);
            } else {
                this.fsPath = "";
            }
        }
    }
    export class Disposable {
        static from(...disposableLikes: { dispose: () => any }[]): Disposable {
            return new this(() => {
                disposableLikes.forEach((disposable) => disposable.dispose());
            });
        }
        constructor(private _callOnDispose: Function) {
        }
        dispose(): any {
            const { _callOnDispose } = this;
            this._callOnDispose = () => {};
            return _callOnDispose();
        }
    }
    export interface Event<T> {
        (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
    }
    export class EventEmitter<T> {
        event: Event<T>;
        fire(data?: T): void {
            for (const key in this._listeners) {
                const listener = this._listeners[key];
                try {
                    listener(data!);
                } catch (reason) {
                }
            }
        }
        dispose(): void {
            this._listeners = {};
        }
        private _listeners: {[key: string]: (e: T) => any} = {};
        constructor() {
            this.event = (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable => {
                const key = `L${Math.random().toString().substr(2)}`;
                if (thisArgs != null) {
                    listener = listener.bind(thisArgs);
                }
                const disposable = new Disposable(() => {
                    delete this._listeners[key];
                });
                this._listeners[key] = listener;
                if (disposables != null) {
                    disposables.push(disposable);
                }
                return disposable;
            };
        }
    }
}
export = vscode;