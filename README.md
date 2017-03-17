# Rubic

Provides embedded-board development support for following boards:
* [PERIDOT board](http://osafune.github.io/peridot.html)
* [GR-CITRUS](http://gadget.renesas.com/en/product/citrus.html)
* [Wakayama.rb board](https://github.com/wakayamarb/wrbb-v2lib-firm)

Supported programming language:
* Ruby (mruby engine)
* JavaScript (Duktape engine)

## Quick Start

This extension is *alpha* version. Currently, there is setup command and you are required to
make ".vscode/rubic.json" and ".vscode/launch.json" files manually to start Rubic extension. Sorry.

## Features

* Compiling Ruby source (\*.rb) into mruby binary (\*.mrb)
* Communicate with boards via VCP (Serial port)
* Reading and writing files on internal storage of the board
* Launching program on the board

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Currently, no extension settings are implemented.

## Known Issues

## Feedback

* File a bug in [GitHub issues](https://github.com/kimushu/vsce-rubic/issues)
* [Tweet me](https://twitter.com/kimu_shu) with other feedback

## Release Notes

### 0.99.1

Initial release (alpha version) for [NT Kyoto 2017](http://j.nicotech.jp/ntkyoto2017)

## License

MIT
