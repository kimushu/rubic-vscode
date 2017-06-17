# ボード

## ボードクラスの役割

各組み込みボードとの通信、ボードの情報提供を行う。

|項目|Host|Debug|要接続|説明|
|--|:--:|:--:|:--:|--|
|static getConstructor()|Yes|Yes|---|クラス名からコンストラクタを取得|
|static enumerateBoards()|Yes|Yes|---|接続されたボードを列挙|
|static getBoardName()|Yes|Yes|---|翻訳されたボード名を取得|
|*constructor()*|Yes|Yes|---|インスタンスを生成|
|connect()|---|Yes|N/A|ボードに接続|
|disconnect()|---|Yes|Yes|ボードから切断|
|getInfo()|---|Yes|Yes|ボードの情報取得|
|writeFile()|---|Yes|Yes|ボードにファイルを書き込み|
|readFile()|---|Yes|Yes|ボードからファイルを読み込み|
|enumerateFiles()|---|Yes|Yes|ボード上のファイル一覧を取得|
|formatStorage()|---|Yes|Yes|ボード上のすべてのファイルを削除|
|writeFirmware()|---|Yes|No<sup>*1</sup>|ボードにファームウェアを書き込み|
|runProgram()|---|Yes|Yes|プログラムの実行を開始|
|isRunning()|---|Yes|Yes|プログラムの実行状態を取得|
|stopProgram()|---|Yes|Yes|プログラムの実行を停止|
|getStdioStream()|---|Yes|Yes|標準入出力ストリームの取得|
|getDebugStream()|---|Yes|Yes|デバッグ通信用ストリームを取得|
|reset()|---|Yes|Yes|ボードのリセット|
|getAutoStartProgram()|Yes|---|No|自動起動プログラム指定の取得<sup>*2</sup>|
|setAutoStartProgram()|Yes|---|No|自動起動プログラム指定の設定<sup>*2</sup>|

*1) ファームウェアが不定のとき、接続自体が出来ないケースもあることから、ファームウェア書き込みは未接続状態で開始する。<br>
*2) 実際にボードに書き込まれた設定ではなく、設定ファイル内の情報。

## クラス階層

* `Board` < `EventEmitter` (pure)
  * `PeridotBoard` (pure)
    * `PeridotClassicBoard` - 第1世代PERIDOT (J-7SYSTEM WORKS製作)
    * `PeridotPiccoloBoard` - 第2世代PERIDOT Piccoloタイプ (J-7SYSTEM WORKS製作)
  * `WakayamaRbBoard` - Wakayama.rbボード (山本氏頒布)
    * `GrCitrusBoard` - GR-CITRUS (秋月電子販売)
