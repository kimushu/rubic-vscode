declare namespace RubicCatalog {
    /**
     * ja: カタログ情報ルート (公式カタログサイトのcatalog.jsonそのもの)
     * en: Root structure of catalog information
     */
    interface Root {
        /**
         * ja: 対応するRubicのバージョンの範囲 (これを満たさないRubic利用者はカタログ更新不可)
         * en: Range of version of Rubic which supports this catalog
         */
        rubicVersion: string;

        /**
         * ja: このJSONの最終更新時刻 (Date.now()の値)
         * en: Timestamp of last modified (by Date.now() value)
         */
        lastModified: number;

        /**
         * ja: ボード一覧 (この配列の順番が原則としてカタログ上の表示順序となる)
         * en: List of board definitions (The order of this array will be used as the order of catalog list)
         */
        boards: Board[];
    }

    /**
     * ja: 多言語対応文字列 (英語は必須)
     * en: Multiligual string (English is always required. Other languages are optional)
     */
    interface LocalizedString {
        en:  string;        /** English (always required) */
        de?: string;        /** German   */
        es?: string;        /** Spanish  */
        fr?: string;        /** French   */
        it?: string;        /** Italian  */
        ja?: string;        /** Japanese */
        ko?: string;        /** Korean   */
        ru?: string;        /** Russian  */
        "zh-cn"?: string;   /** Chinese (China)  */
        "zh-tw"?: string;   /** Chinese (Taiwan) */
    }

    /**
     * ja: トピック定義
     * en: Topic definition
     */
    interface Topic {
        /**
         * ja: トピックの名前
         * en: Name of topic
         */
        name: LocalizedString;

        /**
         * ja: 色
         * en: Color of topic
         */
        color: null|"gray"|"blue"|"green"|"lightblue"|"orange"|"red";
    }

    /**
     * ja: ボード定義 (catalog.jsonの一部)
     * en: Board definition
     */
    interface Board {
        /**
         * ja: ボードクラス名 (Rubic内部実装と合わせる)
         * (分かりやすさのためCamelCaseで書いているが、実際には
         *  大文字小文字は区別されない)
         * ※ワークスペースのボード指定に使用されるIDであり、公開後の変更禁止。
         */
        class: string;

        /**
         * ja: 無効化して表示対象から除外するかどうか
         * en: Is disabled (Disabled board is excluded from list)
         */
        disabled?: boolean;

        /** ボード名称 */
        name: LocalizedString;

        /** 説明文 */
        description: LocalizedString;

        /** アイコン画像(Rubic相対パス or URL) */
        icon: string;

        /** 作者名 */
        author: LocalizedString;

        /** WEBサイト URL */
        website: LocalizedString;

        /** プレビュー版か否か(省略時=false) */
        preview?: boolean;

        /** トピック一覧 */
        topics: Topic[];

        /**
         * リポジトリ一覧
         * この配列の順番が原則としてカタログ上の表示順序となる。
         */
        repositories: RepositorySummary[];
    }

    /**
     * リポジトリ概要情報 (catalog.jsonの一部)
     */
    interface RepositorySummary {
        /**
         * UUID
         * ※ワークスペースのファーム指定に使用されるIDであり、公開後の変更禁止。
         */
        uuid: string;

        /** 無効化されているか否か(省略時=false) */
        disabled?: boolean;

        /** ボードベンダーの公式ファームか否か(省略時=false) */
        official?: boolean;

        /** カスタムリポジトリか否か(省略時=false) */
        custom?: boolean;

        /** ホスティングサイト */
        host: "github";

        /** 所有者 */
        owner: string;

        /** リポジトリ名 */
        repo: string;

        /** ブランチ名(省略時=master) */
        branch?: string;

        /** 詳細情報(rubic-repository.jsonの中身) */
        cache?: RepositoryDetail;
    }

    /**
     * リポジトリ詳細定義 (rubic-repository.json)
     */
    interface RepositoryDetail {
        /** 名前 */
        name: LocalizedString;

        /** 説明 */
        description: LocalizedString;

        /** プレビュー版か否か(省略時=false) */
        preview?: boolean;

        /** リリース一覧 */
        releases?: ReleaseSummary[];
    }

    /**
     * リリース概要定義 (catalog.jsonの一部)
     */
    interface ReleaseSummary {
        /**
         * リリースのタグ名
         * ※ワークスペースのファーム指定に使用されるIDであり、公開後の変更禁止。
         */
        tag: string;

        /** リリースの名称 (GitHubリリース名、英語のみ) */
        name: string;

        /** リリースの説明 (GitHubリリース説明、英語のみ) */
        description: string;

        /** プレビュー版か否か(省略時=false) */
        preview?: boolean;

        /** 公開日 (GitHubのリリース情報 published_at より。ただし値は Date.now() フォーマット) */
        published_at: number;

        /** 更新日 (assetのupdated_atより) */
        updated_at: number;

        /** 作者名 (GitHubのauthorのログインID) */
        author: string;

        /** zip assetのURL */
        url: string;

        /** zipに格納された release.json のキャッシュ */
        cache: ReleaseDetail;
    }

    /**
     * リリース詳細定義 (release.jsonの中身そのもの)
     */
    interface ReleaseDetail {
        /** リリースの名称 (存在しない場合、Summaryのnameから引用) */
        name?: LocalizedString;

        /** リリースの説明文 (存在しない場合、Summaryのdescriptionから引用) */
        description?: LocalizedString;

        /** バリエーション一覧 */
        variations: Variation[];
    }

    /**
     * バリエーション定義 (release.jsonの一部)
     */
    interface Variation {
        /**
         * アーカイブ(zip)内のパス
         * ※ワークスペースのファーム指定に使用されるIDであり、公開後の変更禁止。
         */
        path: string;

        /** バリエーションの名前 */
        name: LocalizedString;

        /** バリエーションの説明文 */
        description: LocalizedString;

        /** ファームウェアの識別ID */
        firmwareId?: string;

        /** ランタイムの一覧 */
        runtimes: (Runtime.Common|Runtime.Mruby|Runtime.Duktape)[];

        /** ドキュメントのアーカイブ内パス */
        document?: LocalizedString;
    }

    /**
     * ランタイム情報
     */
    namespace Runtime {
        /** ランタイム共通定義 */
        interface Common {
            /** ランタイムの名前 */
            name: string;
        }

        /** Rubyランタイム(name=mruby) */
        interface Mruby extends Common {
            /** バージョン(x.x.x) */
            version: string;
        }

        /** JavaScript(ES5)ランタイム(name=duktape) */
        interface Duktape extends Common{
            /** バージョン(x.x.x) */
            version: string;
        }
    }
}