<a name="en"></a>
# Rubic

* [Japanese explanation is here / 日本語の説明はこちら](https://github.com/kimushu/rubic-vscode#ja)

Provides embedded-board development support for following boards:
* [PERIDOT board](http://osafune.github.io/peridot.html)
* [GR-CITRUS](http://gadget.renesas.com/en/product/citrus.html)
* [Wakayama.rb board](https://github.com/wakayamarb/wrbb-v2lib-firm)

Supported programming language:
* Ruby (mruby engine)
* JavaScript (Duktape engine)

## Quick Start

1. Open a folder to place files in VSCode
1. Press F1 and type "Rubic"
1. Select "Show Rubic board catalog"
1. Select the board which you want to use
1. Select the firmware which has features what you want to use
1. Select the release. Normally, you can use the newest one which is located at the top of the release list.
1. Select the variation if the chosen firmware has multiple varations.
1. Save your board configuration
1. Write your code in main.rb (for mruby engine) or main.js (for Duktape engine)
1. Press F5 and select "Rubic Debugger" to create debug configuration.
1. Press F5 again to launch your program on the board!

## Features

* Compiling Ruby source (\*.rb) into mruby binary (\*.mrb)
* Communicate with boards via VCP (Serial port)
* Reading and writing files on internal storage of the board
* Launching program on the board

## Extension Settings

* rubic.catalog.showPreview (Default value: false)
  * If true, preview versions will be listed in Rubic board catalog.
  * This is for Rubic maintainers and firmware developers.
  * Preview version firmwares may not be well-tested.

## Known Issues

Because this extension includes executable binary of mruby compiler (*mrbc.exe* on Windows, *mrbc* on mac/Linux), some anti-virus software may detect it as a suspicious program. Please configure that binary is safe.

## Feedback

* File a bug in [GitHub issues](https://github.com/kimushu/rubic-vscode/issues)
* [Tweet me](https://twitter.com/kimu_shu) with other feedback

## Release Notes

### 0.99.2

Release for firmware developers

### 0.99.1

Initial release (alpha version) for [NT Kyoto 2017](http://j.nicotech.jp/ntkyoto2017)

## License

MIT

<a name="ja"></a>
# Rubic (日本語説明)

* [English explanation is here / 英語の説明はこちら](https://github.com/kimushu/rubic-vscode#en)

この拡張機能は、下記の組み込みボードをVSCode上で開発するためのものです。
* [PERIDOT board](http://osafune.github.io/peridot.html)
* [GR-CITRUS](http://gadget.renesas.com/ja/product/citrus.html)
* [Wakayama.rb board](https://github.com/wakayamarb/wrbb-v2lib-firm)

以下のプログラミング言語に対応しています。
* Ruby (mruby engine)
* JavaScript (Duktape engine)

## クイックスタート

1. VSCodeで、作業するフォルダを開きます。
1. F1を押し、「Rubic」と入力します。
1. 「Rubicボードカタログを表示」を選びます。
1. 使用したいボードをカタログ内のリストから選択してください。
1. 使用したい機能を持つファームウェアをカタログ内のリストから選択してください。
1. リリースを選択してください。通常はリストの一番上にある最新版を使うとよいでしょう。
1. 選んだファームウェアが複数のバリエーションを持つ場合、使用するバリエーションを選んでください。
1. ボード設定を保存してください。
1. 実行したいコードを、main.rb(mrubyの場合)/main.js(Duktapeの場合)に記述してください。
1. F5を押し、「Rubicデバッガ」を選ぶと、デバッグ設定が作成されます。
1. もう一度F5を押すと、あなたの書いたプログラムがボードに転送され、実行されます。

## 機能

* Rubyソースコード(\*.rb)をmrubyバイナリ(\*.mrb)に変換する機能
* シリアルポート(VCP)経由でボードと通信する機能
* ボード内のストレージにファイルを読み書きする機能
* ボード上でプログラムを実行する機能

## 拡張機能の設定

* rubic.catalog.showPreview (デフォルト値: false)
  * プレビュー版を表示するか否か。trueにすると、一般向け公開していないファームウェアがカタログに列挙されます。
  * Rubic自体の開発者ならびにファームウェア開発者向けの機能です。
  * プレビュー版のファームウェアは十分なテストがされてない場合があります。

## 既知の問題

この拡張機能はmrubyコンパイラのバイナリファイル(Windowsの場合*mrbc.exe*、mac/Linuxの場合*mrbc*)を含んでいるため、一部のアンチウイルスソフトウェアが疑わしいプログラムとして検出する場合があります。その場合、これらのバイナリファイルは安全であると例外設定してください。

## フィードバック

* 不具合報告は[GitHub issues](https://github.com/kimushu/rubic-vscode/issues)までお願いします。
* その他の報告は[作者のTwitter](https://twitter.com/kimu_shu)までどうぞ。

## Release Notes

### 0.99.2

ファームウェア開発者向けリリース

### 0.99.1

[NT京都2017](http://j.nicotech.jp/ntkyoto2017)向けのアルファ版リリース

## ライセンス

MIT
