# カタログ

カタログ全体の説明は https://github.com/kimushu/rubic-catalog#readme へ。

このドキュメントでは、Rubic内部との関わりについてのみ記述する。

## ボード向けデータ

カタログ内の以下の項目には、ボードクラスへ伝達されるデータを含むことができる。

1. リポジトリ (`RepositoryDetail`)
1. リリース (`ReleaseDetail`)
1. バリエーション (`Variation`)
1. ランタイム情報 (`Runtime.Common`)
1. スケッチ上の設定

これらのデータは末端側を優先してマージされ(下記疑似コード参照)、ボード情報としてボードクラスに渡される。

```typescript
function mergeBoardData(
    repo: RepositoryDetail,
    release: ReleaseDetail,
    variation: Variation,
    runtime: Runtime.Common,
    sketch: V1_0_x.Top
): any {
    return Object.assign(
        {},
        repo.boardData,
        release.boardData,
        variation.boardData,
        runtime.boardData,
        sketch.hardwareConfiguration.boardData
    );
}
```
