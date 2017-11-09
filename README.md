# <a id="en"></a>Rubic

[![Build Status (for OSX/Linux)](https://travis-ci.org/kimushu/rubic-vscode.svg?branch=master)](https://travis-ci.org/kimushu/rubic-vscode)
[![Build status (for Windows)](https://ci.appveyor.com/api/projects/status/jxu1mf0d3ke1o0a3?svg=true)](https://ci.appveyor.com/project/kimushu/rubic-vscode)

* [Japanese explanation is here / 日本語の説明はこちら](#ja)

This extension makes it easy to develop embedded-board such as PERIDOT and GR-CITRUS from VSCode.<br>
To start development with Rubic, open the work folder in VSCode, press `F1` to open command palette and type "rubic". Find "Show Rubic board catalog" in command pallete and select it. See [Quick Start](#quick-start) for detail.

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
* Updating firmware of the board
* Launching program on the board

## Supported boards and programming languages

* Supported embedded-boards
  * [PERIDOT board](http://osafune.github.io/peridot.html)
  * [GR-CITRUS](http://gadget.renesas.com/en/product/citrus.html)
  * [Wakayama.rb board](https://github.com/wakayamarb/wrbb-v2lib-firm)

* Supported programming language:
  * Ruby (mruby engine)
  * JavaScript (Duktape engine)

## Known Issues

Because this extension includes executable binary of mruby compiler (*mrbc.exe* on Windows, *mrbc* on mac/Linux), some anti-virus software may detect it as a suspicious program. Please configure that binary is safe.

## Extension Settings

* rubic.catalog.showPreview (Default value: false)
  * If true, preview versions will be listed in Rubic board catalog.
  * This is for Rubic maintainers and firmware developers.
  * Preview version firmwares may not be well-tested.

## Feedback

* File a bug in [GitHub issues](https://github.com/kimushu/rubic-vscode/issues)
* [Tweet me](https://twitter.com/kimu_shu) with other feedback

## License

MIT

----

# <a id="ja"></a>Rubic (日本語)

* [English explanation is here / 英語の説明はこちら](#en)

この拡張機能は、PERIDOTやGR-CITRUSなどの組み込みボードをVSCode上で開発するためのものです。<br>
Rubicを使った開発を始めるには、作業用のフォルダをVSCodeで開き、`F1`でコマンドパレットを開いて「rubic」と入力します。そして「Rubicのボードカタログを開く」を選択してください。詳しい手順については[クイックスタート](#quick-start-ja)をご覧下さい。

## <a id="quick-start-ja"></a>クイックスタート

1. VSCodeで、作業するフォルダを開きます。
1. F1を押し、「Rubic」と入力します。
1. 「Rubicのボードカタログを開く」を選びます。
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
* ボードのファームウェアを書き換える機能
* ボード上でプログラムを実行する機能

## 対応しているボードおよびプログラミング言語

* 組み込みボード
  * [PERIDOT board](http://osafune.github.io/peridot.html)
  * [GR-CITRUS](http://gadget.renesas.com/ja/product/citrus.html)
  * [Wakayama.rb board](https://github.com/wakayamarb/wrbb-v2lib-firm)

* プログラミング言語 (ボードにより対応言語は異なります)
  * Ruby (mruby engine)
  * JavaScript (Duktape engine)

## 既知の問題

この拡張機能はmrubyコンパイラのバイナリファイル(Windowsの場合*mrbc.exe*、mac/Linuxの場合*mrbc*)を含んでいるため、一部のアンチウイルスソフトウェアが疑わしいプログラムとして検出する場合があります。その場合、これらのバイナリファイルは安全であると例外設定してください。

## 拡張機能の設定

* rubic.catalog.showPreview (デフォルト値: false)
  * プレビュー版を表示するか否か。trueにすると、一般向け公開していないファームウェアがカタログに列挙されます。
  * Rubic自体の開発者ならびにファームウェア開発者向けの機能です。
  * プレビュー版のファームウェアは十分なテストがされてない場合があります。

## フィードバック

* 不具合報告は[GitHub issues](https://github.com/kimushu/rubic-vscode/issues)までお願いします。
* その他の報告は[作者のTwitter](https://twitter.com/kimu_shu)までどうぞ。

## ライセンス

MIT
