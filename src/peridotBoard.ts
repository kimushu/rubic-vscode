'use strict';

import { RubicBoard, BoardCandidate, BoardStdio } from './rubicBoard';
import * as stream from 'stream';
import { Canarium } from 'canarium';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
let localize = nls.config(process.env.VSCODE_NLS_CONFIG)(__filename);

export class PeridotBoard extends RubicBoard {
    private _canarium: Canarium;
    private _stdio: BoardStdio;

    private static _localizedNames: any = {
        "peridot_classic": localize("classic.name", "PERIDOT Classic"),
        "peridot_newgen": localize("newgen.name", "PERIDOT NewGen")
    };

    public constructor(private _boardId: string, private _path: string) {
        super();
        this._canarium = new Canarium();
        this._stdio = null;
        this._canarium.onClosed(this.onClosed.bind(this))
    }

    static getIdList(): string[] {
        return Object.keys(this._localizedNames)
    }

    static getName(boardId: string): string {
        return this._localizedNames[boardId];
    }

    static list(): Promise<BoardCandidate[]> {
        return Canarium.enumerate().then((boards: any[]) => {
            return boards.map((board) => {
                let candidate: BoardCandidate = {
                    boardId: "peridot_classic", // TODO
                    name: board.name,
                    path: board.path,
                    boardClass: this
                };
                if (board.vendorId) { candidate.vendorId = parseInt(board.vendorId, 16); }
                if (board.productId) { candidate.productId = parseInt(board.productId, 16); }
                return candidate;
            });
        })
    }

    connect(): Promise<void> {
        return this._canarium.open(this._path);
    }

    disconnect(): Promise<void> {
        return this._canarium.close();
    }

    getStdio(options?: {stdin?: string, stdout?: string, stderr?:string}): Promise<BoardStdio> {
        if (this._stdio) {
            return Promise.resolve(this._stdio);
        }
        if (!options) {
            options = {}
        }
        let stdin, stdout, stderr;
        return Promise.resolve(
        ).then(() => {
            return this._canarium.openRemoteFile(
                options.stdin ? options.stdin : "/dev/stdin",
                {O_WRONLY: true}
            ).then(
                (file) => { stdin = new CanariumWritableStream(file); },
                (error) => { console.error(error); }
            )
        }).then(() => {
            return this._canarium.openRemoteFile(
                options.stdout ? options.stdout : "/dev/stdout",
                {O_RDONLY: true}
            ).then(
                (file) => { stdout = new CanariumReadableStream(file); }
            )
        }).then(() => {
            return this._canarium.openRemoteFile(
                options.stderr ? options.stderr : "/dev/stderr",
                {O_RDONLY: true}
            ).then(
                (file) => { stderr = new CanariumReadableStream(file); },
                (error) => { console.error(error); }
            )
        }).then(() => {
            this._stdio = <BoardStdio>{stdin, stdout, stderr};
            return this._stdio;
        })  // return Promise.resolve().then()...
    }

    private onClosed() {
        this._stdio = null;
    }
}

class CanariumWritableStream extends stream.Writable {
    constructor(private _file: any) {
        super({decodeStrings: true});
    }

    protected _write(chunk: Buffer, encoding: string, callback: Function) {
        let ab: ArrayBuffer;
        ab = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
        this._file.write(ab, true).then(
            () => { callback(); },
            (error) => { callback(error); }
        );
    }
}

class CanariumReadableStream extends stream.Readable {
    constructor(private _file: any) {
        super({encoding: null});
    }

    protected _read(size: number) {
        this._file.read(size).then((arrayBuffer: ArrayBuffer) => {
            this.push(Buffer.from(arrayBuffer))
        })
    }
}
