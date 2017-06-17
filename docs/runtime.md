# ランタイム

ランタイムとは、組み込みボード上に搭載されたプログラム実行環境を指す。
Rubicでは主にスクリプト言語のインタープリタまたはVMを想定している。

## ランタイムクラスの役割

ランタイムのクラスは、言語名ではなく実行エンジンそのものの名前を冠する。
つまりRubyではなくmruby、JavaScriptではなくDuktapeということになる。

* Runtime
  * MrubyRuntime - 軽量Rubyのランタイム
  * DuktapeRuntime - 組み込みJavaScriptのランタイム

|項目|Host|Debug|説明|
|--|:--:|:--:|--|
|*constructor()*|Yes|Yes|インスタンスの生成|
|initializeTasks()|Yes|---|VSCodeタスクの設定|
|getExecutableFile()|Yes|---|実行可能ファイルパスの取得|
|build()|Yes|---|ビルドの実行|
