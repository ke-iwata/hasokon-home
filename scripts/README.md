# scripts — 運用の計測スクリプト

サイトには配信されません（`.github/workflows/deploy.yml` の同期対象から外してあります）。
依存パッケージはゼロで、Node.js 22 以降があれば動きます。

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

## テスト

```bash
node --test "scripts/test/*.test.mjs"
```

ネットワークもGoogleの認証情報も使いません（すべて差し替えて動かしています）。
`.github/workflows/test.yml` で push 時にも走ります。

`test/home-analytics.test.mjs` だけは scripts/ ではなく **`home/analytics.js`
（ポータルのアクセス解析）** のテストです。home/ はビルド工程を持たず
npm も vitest も無いので、リポジトリ唯一の `node --test` にここで相乗りしています。
仕様は [docs/features/measurement-hygiene.md](../docs/features/measurement-hygiene.md)。
