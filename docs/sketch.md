# スケッチ

VSCodeのワークスペースのうち、Rubicを有効にして組み込みボード向け開発をしているものをRubic内部ではスケッチと呼ぶ。
この「スケッチ」とはChrome版Rubicにおけるプロジェクト管理単位の呼称「スケッチ」にならった便宜上の呼び名であり、
VSCode版Rubicユーザーの目に見えるところには使わない。

## スケッチと一般ワークスペースの差

ワークスペースに、`.vscode/rubic.json` というファイルが存在するとき、そのワークスペースはスケッチであるとみなす。
これはRubic拡張機能のactivation要件にも含まれている。

## Sketchクラス

|項目|Host|Debug|説明|
|--|:--:|:--:|--|
|filePath|Yes|Yes|設定ファイル(`.vscode/rubic.json`)のフルパス|
|getHardwareConfigration()|Yes|Yes|ハードウェア構成の取得|
|setHardwareConfigration()|Yes|---|ハードウェア構成の設定|
|getTargetPort()|Yes|Yes|接続先ポートの取得|
|setTargetPort()|Yes|---|接続先ポートの設定|
|*Event* "load"|Yes|Yes|スケッチの読み込み完了後に発生するイベント(リロード時も含む)|
|*Event* "reload"|Yes|Yes|スケッチの変更を検知してリロードが開始される直前のイベント|
|*Event* "unload"|Yes|Yes|スケッチがアンロードされる直前に発生するイベント|
