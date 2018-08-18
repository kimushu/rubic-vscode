import { Disposable } from "vscode";

export module vscode_stub {

    export interface Event<T> {
        (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
    }

    export class EventEmitter<T> {
        private _listeners: {
            [key: string]: (e: T) => any;
        };

        readonly event: Event<T>;

        fire(data?: T): void {
            for (let key in this._listeners) {
                this._listeners[key](data!);
            }
        }

        dispose(): void {
            this._listeners = {};
        }

        constructor() {
            this.event = (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable => {
                const key = Math.random().toString(36).substr(2);
                if (thisArgs != null) {
                    listener = listener.bind(thisArgs);
                }
                this._listeners[key] = listener;
                const disposable = {
                    dispose: (): void => {
                        delete this._listeners[key];
                    }
                };
                if (disposables != null) {
                    disposables.push(disposable);
                }
                return disposable;
            };
        }
    }

    export namespace commands {
        export function executeCommand<T>(command: string, ...rest: any[]): Thenable<T | undefined> {
            console.log("[vscode-stub]", "executeCommand:", command, ...rest);
            return Promise.resolve(undefined);
        }
    }
}
