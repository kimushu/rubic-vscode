# プロセス

拡張機能は、VSCodeのデバッグ拡張機能の構造(下記参考サイト参照)に従い、2つのプロセスから構成される。

> 参考: https://code.visualstudio.com/docs/extensions/example-debuggers

* 拡張機能ホストプロセス
  * 他の拡張機能と同様、VSCodeの拡張機能activate～deactivate期間中に生存し、拡張機能の主機能を提供するプロセス
  * VSCode本体と強い結びつきをもち、各種APIの使用が可能。
* デバッグアダプタプロセス
  * 拡張機能が提供するデバッグ機能の使用中(デバッグ中)のみに存在し、デバッガまたはデバッグ対象との通信してVSCode本体へ伝達するプロセス。
  * VSCode本体との結びつきは**本来は**DebugSessionのみである。

## Rubicにおける役割

Rubicでは、前述のプロセスを以下の目的で使用する。

* 拡張機能ホストプロセス
  * シリアルポートの列挙
  * 各種UIの拡張(カタログの提供)およびカタログキャッシュ管理
  * ワークスペース設定(rubic.json)の管理
* デバッグアダプタプロセス
  * シリアルポートのオープンおよびボードと通信して行う一切の行為
  * ボードのファームウェア書き込み

なおこの構造は、シリアルポートの操作が、意図しないプロセスの異常終了を引き起こしやすいことを鑑み、
**VSCodeを巻き込んで異常終了するリスクを減らす**ためのものである。

ただしシリアルポートの「列挙」についてはプロセス分離が難しいことと、実際のポートを開く操作ではないことからリスクが小さいと判断し、拡張機能ホストプロセス側で動作させる。

# プロセス周辺の実装

Rubicでは、VSCodeの制限により2種類のプロセスで出来ることの違いを独自のレイヤを挟むことで吸収する。そのためのクラスが `RubicProcess` クラスであり、VSCodeの機能(vscode namespace API)を利用する際には、原則として`RubicProcess`のメソッドを用いて利用する。

```typescript
// 基底仮想クラス
class RubicProcess {
    static self: RubicProcess;
    protected constructor(...) {}
}

// 拡張機能ホストプロセス用
class RubicHostProcess extends RubicProcess {}

// デバッグアダプタプロセス用
class RubicDebugProcess extends RubicProcess {}
```

## RubicProcessの生存期間
|種類|生存期間|同時に存在する個数|
|--|--|--|
|Host|VSCodeがRubicをactivateしてからdeactivateするまで|最大1|
|Debug|type=rubicのデバッグセッションが開始してから終了するまで|0～制限なし|

## RubicProcessの機能

どちら側のプロセスかによって、使用できる項目が異なる。使用できない項目が使用された場合は例外をスローする。

|項目|Host|Debug|説明|
|--|:--:|:--:|--|
|`workspaceRoot`|Yes|Yes|ワークスペースの絶対パス<br>(ワークスペースが開かれていない場合は`undefined`)|
|`extensionRoot`|Yes|Yes|拡張機能の絶対パス|
|`isHost`|Yes|Yes|Host側のみtrue|
|`isDebug`|Yes|Yes|Debug側のみtrue|
|`sketch`|Yes|Yes|スケッチのインスタンス|
|`catalogData`|Yes|---|カタログ情報(キャッシュ)|
|`debugConfiguration`|---|Yes|デバッグ開始時に引き渡されたオブジェクト|
|`registerDebugHook()`|Yes|---|デバッグ開始時のフックを登録する|
|`startDebugProcess()`|Yes|---|デバッグプロセスを生成する|
|`sendDebugRequest()`|Yes|---|デバッグプロセスへ要求を送信する|
|`stopDebugProcess()`|Yes|---|デバッグプロセスを強制終了する|
|`getRubicSetting()`|Yes|Yes|Rubicの設定項目を取得|
|`getMementoValue()`|Yes|---|Mementoストレージの値を取得|
|`setMementoValue()`|Yes|---|Mementoストレージの値を設定|
|`readTextFile()`|Yes|Yes|テキストファイルの内容を取得する|
|`updateTextFile()`|Yes|---|テキストファイルを内容を更新する|
|`showInformationMessage()`<sup>*1</sup>|Yes|Yes|情報レベルのメッセージ(+選択肢)を表示し、ユーザーの応答を待つ|
|`showWarningMessage()`<sup>*1</sup>|Yes|Yes|警告レベルのメッセージ(+選択肢)を表示し、ユーザーの応答を待つ|
|`showErrorMessage()`<sup>*1</sup>|Yes|Yes|エラーレベルのメッセージ(+選択肢)を表示し、ユーザーの応答を待つ|
|`showQuickPick()`<sup>*1</sup>|Yes|Yes|選択肢を表示し、ユーザーの応答を待つ|
|`showInputBox()`<sup>*1</sup>|Yes|Yes|テキスト入力欄を表示し、ユーザーの応答を待つ|
|`withProgress()`<sup>*2</sup>|Yes|Yes|進行中メッセージを表示する|
|`printOutput()`|Yes|Yes|出力ウィンドウの「Rubic」にテキストを追記する|
|`clearOutput()`|Yes|Yes|出力ウィンドウの「Rubic」の中身をクリアする|

<sup>*1</sup>) API仕様はCancellationTokenが無いことを除きvscode namespace APIに同じとする。(`vscode.window.` → `RubicProcess.self.`に変更するのみ)<br>
<sup>*2</sup>) API仕様は原則vscode namespace APIと同じとするが、ProgressOptionsのlocationのみ、独自の型を受け付けるものとする。
