# scripts — 運用の計測スクリプトとデプロイ時の生成

サイトには配信されません（`.github/workflows/deploy.yml` が同期するのは `home/` の中身だけ）。
依存パッケージはゼロで、Node.js 22 以降があれば動きます。

registry（`tools` / `games` の `lib/registry.ts`）の読み取りは
`lib/registry.mjs` に集約してあります。TypeScript をそのまま import できないので
字面から拾っていますが、**同じ読み取りを2か所に書かない**ためのものです。

## gsc-canonical-audit.mjs

旧サブドメイン（`tool` / `game` / `roulette.hasokon.com`）からの
**検索インデックス統合が、どこまで進んだかを数える**スクリプトです。

仕様: [docs/features/search-index-consolidation.md](../docs/features/search-index-consolidation.md)

`/sitemap.xml` に載っている全URLを Search Console の URL検査API にかけ、
Googleが選んだ正規URL（`googleCanonical`）がまだ旧サブドメインを指しているページを数えます。
**この件数が0になったら統合完了**、という仕様書の判定をそのまま機械にやらせるものです。

```bash
# 対象URLの一覧だけ見る（APIを叩かないので認証も不要）
node scripts/gsc-canonical-audit.mjs --dry-run

# 計測する。--out を付けると結果をJSONで残せる
export GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"
node scripts/gsc-canonical-audit.mjs --out baseline-2026-08-10.json
```

出力の例:

```
検査したURL: 86 件

  旧サブドメインが正規URL (legacy) : 12
  新URLが正規URL (consolidated)    : 61
  インデックス未登録 (unindexed)   : 13
  想定外のホスト (foreign)         : 0
  検査に失敗 (error)               : 0

旧サブドメインを指したままのURL:
  https://hasokon.com/tools/nenshu-kabe/
    → https://tool.hasokon.com/nenshu-kabe/（最終クロール: 2026-08-07T00:00:00Z）
  ...

統合は未完了。残り 12 件
```

### 終了コード

| コード | 意味 |
|---|---|
| 0 | 旧サブドメインを指すURLが0件（統合完了）。`--dry-run` の成功も0 |
| 1 | 旧サブドメインを指すURLが残っている、または検査に失敗したURLがある |
| 2 | 実行できなかった（認証の失敗、サイトマップを読めない、など） |

「1件でも失敗したら完了とは言わない」ようにしてあります。
403（権限不足）を「legacy 0件」と読み違えると、統合が終わったと誤解するためです。

### いつ回すか

仕様書の「効果の測り方」に沿って、次の3回です。

1. **アドレス変更ツールの実施前**（ベースライン）
2. 実施の **1週間後**
3. 実施の **4週間後**

`--out` で残したJSONの `counts.legacy` を並べれば、減り方が分かります。

### 認証

環境変数 `GOOGLE_SERVICE_ACCOUNT_JSON` に、Search Console の閲覧権限を持つ
サービスアカウントのJSONを入れてください（生のJSONでも、base64で包んだものでも読みます）。
使うスコープは `https://www.googleapis.com/auth/webmasters.readonly` の読み取りのみです。

現状 `claude@hasokon-site.iam.gserviceaccount.com` は `https://hasokon.com/` プロパティの
権限しか持っていません。旧サブドメインのプロパティを追加したら、
仕様書の手順3のとおりサービスアカウントにも閲覧権限を付けてください。

### 注意

URL検査APIには **1日2000件 / 1分600件** の上限があります。
86URLなら余裕がありますが、何度も回すときは日をまたいでください。
`--concurrency` の既定値（4）は上限に当てないための値です。

## build-test-home.mjs

**テスト環境に配るときだけ**、トップ（`home/index.html`）の一覧に
公開前（`stage` が `public` 以外）のツール・ゲームを足すスクリプトです。

仕様: [docs/features/test-home-unreleased.md](../docs/features/test-home-unreleased.md)

`home/` にはビルド工程が無く `stage` が効かないため、公開前のものを見るには
URLを直接打つしかありませんでした。デプロイ時に差し込むことで、
テスト環境のトップからも辿れるようにしています。

```bash
# 手元で結果を見る（コピーに対してかける。home/index.html を直接書き換えない）
cp home/index.html /tmp/index.html && node scripts/build-test-home.mjs --file /tmp/index.html
```

- 未公開のカードは**破線の枠・フラスコのアイコン・「本番未公開」の印**が付きます
- `.quicknav` の件数は差し込み後の枚数で数え直します
- 同じファイルに2回かけても増えません

**生成結果を `home/index.html` にcommitしないでください。** 本番のトップから
`noindex` のページへリンクすることになります（`test/build-test-home.test.mjs` が落とします）。

## テスト

```bash
node --test "scripts/test/*.test.mjs"
```

ネットワークもGoogleの認証情報も使いません（すべて差し替えて動かしています）。
`.github/workflows/test.yml` で push 時にも走ります。

次の4つだけは scripts/ 自身のテストではありません。home/ とリポジトリ直下の
生成物はビルド工程を持たず npm も vitest も無いので、
リポジトリ唯一の `node --test` にここで相乗りしています。

- `test/home-analytics.test.mjs` … **`home/analytics.js`（ポータルのアクセス解析）**。
  仕様は [docs/features/measurement-hygiene.md](../docs/features/measurement-hygiene.md)
- `test/ogp.test.mjs` … **OGP画像の実ファイルと home のOGPタグ**。
  仕様は [docs/features/ogp-image.md](../docs/features/ogp-image.md)、
  生成スクリプトは [design/ogp/](../design/ogp/)
- `test/llms-txt.test.mjs` … **`home/llms.txt`（AIアシスタント向けのサイト案内）**。
  tools / games の registry と突き合わせて、載せ忘れとリンク切れを見張ります。
  仕様は [docs/features/llms-txt.md](../docs/features/llms-txt.md)
- `test/manifest-icons.test.mjs` … **「ホーム画面に追加」用アイコンの実ファイル**と
  生成スクリプト。仕様は
  [docs/features/games-pwa-manifest.md](../docs/features/games-pwa-manifest.md)、
  生成スクリプトは [design/manifest-icons/](../design/manifest-icons/)
