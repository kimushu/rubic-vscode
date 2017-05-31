- [English](#change-log-en)
- [日本語](#%E5%A4%89%E6%9B%B4%E3%83%AD%E3%82%B0-ja)

# Change Log (en)

## 0.99.7

* Fix `spawn EACCES` error on max/Linux environment
* Rebuild embedded mruby compiler for Windows: VC++ 2015 runtime no more required.

## 0.99.6

* Add auto detection of source file for debugging
* Changed catalog cache folder
  * New location is `%USERPROFILE%\.rubic` for Windows, `$HOME/.rubic` for Linux/mac.
  * Now cache data is preserved during Rubic extension update / re-install. 
* Improve device detection on mac

## 0.99.5

* Special release limited to firmware developers

## 0.99.4

* Update Canarium
* Remove debug code

## 0.99.3

* Replace serialport module for VSCode 1.12
* Improve catalog behavior when the work folder is not opened
* Implement connection test

## 0.99.2

* Release for firmware developers

## 0.99.1

* Initial release (alpha version) for [NT Kyoto 2017](http://j.nicotech.jp/ntkyoto2017)

----

# 変更ログ (ja)

## 0.99.7

* macやLinux環境において発生する `spawn EACCES` エラーを修正しました
* Rubicに内蔵されているWindows向けmrubyコンパイラを再ビルドしました。これにより、VC++ 2015 ランタイムをインストールする必要は無くなりました。

## 0.99.6

* デバッグにおける実行対象スクリプトの自動検出機能を追加
* カタログキャッシュの保存場所を変更
  * Windowsならば `%USERPROFILE%\.rubic`、Linux/macならば `$HOME/.rubic` となります
  * Rubic拡張機能のバージョン変更や再インストールをしても、キャッシュデータが引き継がれるようになりました
* macにおけるデバイス検出を改善

## 0.99.5

* ファームウェア開発者向け限定リリース

## 0.99.4

* Canariumを更新
* テストコードを削除

## 0.99.3

* serialportモジュールをVSCode 1.12向けに差し替え
* フォルダ未オープン時のカタログ挙動を改善
* 接続テスト機能を実装

## 0.99.2

* ファームウェア開発者向けリリース

## 0.99.1

* [NT京都2017](http://j.nicotech.jp/ntkyoto2017)向けのアルファ版リリース
