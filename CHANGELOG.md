# Change Log

## 0.99.14

* Fix GR-CITRUS file I/O
* Add progress display for file writing
* Add catalog update button into editor title

## 0.99.13

Hotfix for Rubic 0.99.12

* Fix error on `launch.json` generation
* Add Lua support (experimental)

## 0.99.12

Hotfix for VSCode 1.18

* Add Piccolo olive support
* Drop Electron 1.6.6 support (VSCode 1.15 or earlier is no longer supported)
* Replace `node-ipc` with `DebugSessionCustomEvent` and remove deprecated contributions.

## 0.99.11

Hotfix for VSCode 1.16

* Add Electron 1.7.3 support
* Add x64 binary for Windows

## 0.99.10

* Add runtime information for each firmware
* Change behavior of debug start ([#14](https://github.com/kimushu/rubic-vscode/issues/14))
* Move mruby-specific options to `mrbconfig.json`
* Add localized message for JSON schema (`rubic.json` and `mrbconfig.json`)
* Improve catalog design (colors and configuration save messages)
* Change format of `rubic.json` (Rubic converts automatically to new version)

## 0.99.8

* Update readme (No change in Rubic extension)

## 0.99.7

* Fix `spawn EACCES` error on max/Linux environment
* Rebuild embedded mruby compiler for Windows: VC++ 2015 runtime no more required.
* Show port selector when starts debug session without port selection
* Fix saving configuration on some items in the catalog

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
