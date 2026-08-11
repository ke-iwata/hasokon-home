# ポータル（hasokon.com/）の計測欠落と、開発トラフィックの混入を直す

**状態**：実装済み（2026-08-11。本番反映はタグリリース待ち）
**対象**：`home/index.html`・`home/404.html`・`home/analytics.js`・
`tools/lib/analytics.ts`・`games/lib/analytics.ts`
**起票**：2026-08-11

> **実装時の変更点（2026-08-11）**
>
> 1. **ホスト条件は `isAnalyticsEnabled()` ではなく新しい `shouldTrack()` に入れた。**
>    `isAnalyticsEnabled()` は `app/layout.tsx` が gtag.js の `<script>` を出すかどうかの
>    判定に使っており、静的書き出しの**ビルド時**（`window` が無い）に評価される。
>    下の「2. 送信先ホストを1か所で判定する」のとおりに書くとビルド時に false になり、
>    本番のHTMLからも gtag.js のタグごと消えて計測できなくなる。
>    判定は「タグを出すか（ビルド時）」と「送ってよいか（実行時）」に分けてある
> 2. **ポータルの実装はインラインではなく `home/analytics.js` に置いた。**
>    同じ処理が `index.html` と `404.html` の2枚に必要で、直接書くと片方だけずれるため。
>    ビルド工程は要らないまま（素のJSを `<script defer src>` で読むだけ）
> 3. `portal_click` はリンクごとの `onclick` ではなく document 側で1回受けている。
>    カードを増やしたときに計測用の記述を足し忘れる壊れ方をしないため

---

## 背景と根拠

改善の判断はすべてGA4とSearch Consoleの数字に頼っている。
その数字がいま **2つの理由で使えない状態**になっている。

### 1. サイトの入口が1件も計測されていない

`home/` に計測タグが1つも無い。

```console
$ grep -rn "gtag\|googletagmanager\|G-2Z0K6Y2FX0" home/
$ echo $?
1
```

`tools/lib/analytics.ts` の冒頭コメントにも
「ルートドメイン側（home/index.html・404.html）にはまだタグを入れていない」と明記されている。

`hasokon.com/` は**スマホアプリ・ツール・ゲームの3つへの唯一の分岐点**であり、
サイト全体の入口である。ここが未計測なので、次のことが一切分からない。

- ポータルに何人来ているか
- 来た人のうち何%が tools / games / App Store のどれに進んだか（**離脱率が分からない**）
- ポータル経由と検索直接流入の比率

### 2. GA4のデータの約3割が開発・テスト環境

GA4 Data API（`properties/548154955`、`fullPageUrl` × `screenPageViews`、
2026-07-12〜2026-08-10、上位60URL、2026-08-11取得）の内訳。

| ホスト | page_view | 割合 |
|---|---|---|
| `game.test.hasokon.com` | 50 | 16.8% |
| `localhost` | 29 | 9.8% |
| `test.hasokon.com` | 9 | 3.0% |
| `tool.test.hasokon.com` | 3 | 1.0% |
| **開発・テスト 小計** | **91** | **30.6%** |
| `tool.hasokon.com`（旧・301元） | 100 | 33.7% |
| `game.hasokon.com`（旧・301元） | 56 | 18.9% |
| **`hasokon.com`（本番）** | **39** | **13.1%** |
| 上位60URLの合計 | 297 | 100% |

**本番ドメインの実測は30日で39 page_view しかなく、その2.3倍のノイズが同じプロパティに混ざっている。**
上位URLのランキング（`game.test.hasokon.com/` が全体3位）も、流入元レポートの
`Referral | localhost:8090` も、平均エンゲージメント時間も、すべてこの混入で歪んでいる。

`isAnalyticsEnabled()` は測定IDの形式しか見ておらず、ホスト名を見ていない。

```ts
// tools/lib/analytics.ts:20
export function isAnalyticsEnabled(): boolean {
  return GA_MEASUREMENT_ID.startsWith('G-');
}
```

ローカル開発（`npm run dev`）でもテスト環境（`test.hasokon.com`）でも、
本番と同じ測定IDでそのまま送信される。

---

## 現状

| 場所 | 計測 | 送信先 |
|---|---|---|
| `hasokon.com/`（ポータル） | **なし** | — |
| `hasokon.com/404.html` | **なし** | — |
| `hasokon.com/tools/*` | あり | `G-2Z0K6Y2FX0` |
| `hasokon.com/games/*` | あり | `G-2Z0K6Y2FX0` |
| `test.hasokon.com/**` | あり | **`G-2Z0K6Y2FX0`（本番と同じ）** |
| `localhost:3000/**` | あり | **`G-2Z0K6Y2FX0`（本番と同じ）** |

GA4の `hasokon.com/` に3 page_view が記録されているが、これはポータルではない。
`docs/features/ga4-page-path.md` にあるとおり、修正前の `/tools/` のトップページが
basePath を落として `hasokon.com/` として記録されたものである（この修正は実装済みだが本番未反映）。
**ポータルの実測は0件。**

---

## 提案する仕様

### 1. `home/` に計測タグを入れる

`home/` はビルド工程を持たない素の静的HTMLなので、gtag の標準スニペットを
`index.html` と `404.html` の `<head>` に直接置く。

```html
<!-- Google Analytics 4。測定IDは tools/games と同じ（1プロパティで全体を見る） -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-2Z0K6Y2FX0"></script>
<script>
  // 本番ドメイン以外（test.hasokon.com・localhost）では送らない
  if (location.hostname === 'hasokon.com') {
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-2Z0K6Y2FX0');
  }
</script>
```

tools / games と違い React のハイドレーションが無いので、
`tools/lib/analytics.ts` が避けている「インラインscriptの食い違い」問題は起きない。
`send_page_view` も既定のままでよい（クライアント側ルーティングが無いため）。

`404.html` にも同じものを入れる。**どのURLで404が出ているかは、
旧サブドメインからの移行が終わったか判断する材料になる。**

### 2. 送信先ホストを1か所で判定する

`tools/lib/analytics.ts`・`games/lib/analytics.ts` の `isAnalyticsEnabled()` に
ホスト条件を足す。2ファイルの内容は同一なので、同じ差分を両方に当てる。

```ts
/** 計測を送ってよいホスト。ここ以外（test.*・localhost・プレビュー）では送らない */
const MEASURED_HOST = 'hasokon.com';

export function isAnalyticsEnabled(): boolean {
  if (!GA_MEASUREMENT_ID.startsWith('G-')) return false;
  // SSG のビルド時（window なし）は false。実際の送信はブラウザでしか起きない
  if (typeof window === 'undefined') return false;
  return window.location.hostname === MEASURED_HOST;
}
```

`initAnalytics()`・`trackPageView()`・`trackEvent()` はすでに
`isAnalyticsEnabled()` を通っているので、この1か所で全経路が止まる。

### 3. ポータルからの遷移をイベントで測る

`home/index.html` の各カードのリンクに、遷移先の種別を送る `click` ハンドラを付ける。

| イベント名 | パラメータ | 何が分かるか |
|---|---|---|
| `portal_click` | `destination`: `tools` / `games` / `appstore` / `tool-<slug>` / `game-<slug>` | ポータルのどのカードが押されているか。押されないカードは並び順か文言が悪い |

これがあると、**トップの並び替えを勘ではなく数字で決められる**ようになる。

---

## 期待される効果

| 効果 | 測り方 |
|---|---|
| ポータルの実数（訪問・離脱・遷移先）が初めて見える | GA4「ページとスクリーン」に `hasokon.com/` が現れ、`portal_click` の件数が出ること |
| GA4のレポートが本番だけになり、以降の改善判断の土台が信用できるものになる | `fullPageUrl` に `localhost` と `test.` が1件も出ないこと（実装の翌日に確認） |
| 404の発生URLが分かり、旧サブドメインからの移行漏れを見つけられる | `hasokon.com/404.html` の page_view と参照元 |

**この提案自体は集客を増やさない。** 増やすための判断材料を作るもので、
先にこれを直さないと以降の提案の効果測定がすべて怪しくなる、という位置づけ。

---

## 工数の見積り

| 作業 | 目安 | 消費トークン（目安） |
|---|---|---|
| `home/index.html`・`home/404.html` にタグ追加 | 0.5時間 | 15k |
| `isAnalyticsEnabled()` のホスト判定（tools/games 2ファイル） | 0.5時間 | 15k |
| `portal_click` イベントの実装 | 1時間 | 25k |
| テスト環境で「送られないこと」を DevTools で確認 | 0.5時間 | 10k |
| **合計** | **約2.5時間** | **約65k** |

---

## やらないこと

- **GA4側でフィルタ（内部トラフィック除外）を設定して済ませる。**
  管理画面での手作業になり、リポジトリに残らない。IPも固定ではない。
  ホスト名で送信そのものを止めるほうが確実で、コードに履歴が残る
- **テスト環境用に別の測定IDを用意する。**
  テスト環境の数字を見たい場面が今のところ無い。IDが2つに増えると
  取り違えのリスクだけが増える。必要になってから足す
- **Google Tag Manager の導入。**
  ページ数もイベント数も少なく、管理画面という「リポジトリの外」が増える割に合わない
- **`home/` に Next.js を持ち込んで tools/games と実装を共通化する。**
  `docs/DECISIONS.md`（2026-08-01）の判断を覆すことになる。タグ2枚のために覆さない
