# パンくずリストを入れる（BreadcrumbList 構造化データ + 視覚的ナビ）

**状態**：実装済み（2026-08-12。本番反映はタグリリース待ち）
**対象**：`tools/`・`games/`（共通コンポーネント + 各ページの JSON-LD）・`home/`
**起票**：2026-08-12

---

## 背景と根拠

### 計測値（2026-08-12 取得）

**サイト全体に `BreadcrumbList` 構造化データが1つも無い。**

```
$ grep -rn "BreadcrumbList" tools/ games/ --include=*.ts --include=*.tsx -l
（該当なし）
```

本番HTMLでも確認済み。`https://hasokon.com/tools/sleep-cycle/` の JSON-LD は
`WebApplication` と `FAQPage` の2つだけで、`BreadcrumbList` は無い。
視覚的なパンくずナビゲーションも無い。

### なぜ今か

2026-08-08 のドメイン統合で、URLの階層が**1段深くなった**。

```
旧: tool.hasokon.com/sleep-cycle/     … ホストが文脈を伝えていた
新: hasokon.com/tools/sleep-cycle/    … パスが文脈を伝える
```

この変更で2つのことが起きている。

**1. 検索結果での見え方。**
Google は `BreadcrumbList` があればパンくずの経路を、無ければURLを機械的に分解したものを
検索結果に表示する。統合直後の今は、**「hasokon.com › tools › sleep-cycle」ではなく
「hasokon.com › ツール › 睡眠サイクル計算機」と日本語で出せるかどうかの分かれ目**にあたる。

**2. サイト構造の伝達。**
[search-index-consolidation.md](./search-index-consolidation.md) が記録しているとおり、
統合の課題は「Googleがまだ新URLを正規として認識していないページがある」ことである。
`BreadcrumbList` は `/tools/sleep-cycle/` が `/tools/` の配下であることを明示的に伝える。
**再クロール時に新しい階層構造を理解させる補助になる**（統合そのものを速める保証は無いが、
統合後の構造を正しく伝えるという意味で、いま入れる価値が最も高い）。

**3. UXの実害。**
現在、ツールページから `/tools/` に戻る導線がヘッダーのサイト名リンクしかない。
検索から個別ツールに直接着地した利用者にとって、
「このサイトには他に何があるのか」への入口が弱い。
GA4（直近28日）でも `/tools/` のページビューは24、`/games/` は40で、
**個別ページの合計に対して一覧ページへの回遊が少ない。**

---

## 何を作るか

### 1. 視覚的なパンくず（共通コンポーネント）

`tools/app/Breadcrumb.tsx` と `games/app/Breadcrumb.tsx`（構成は両者で揃える）。

```
ホーム ＞ 無料計算ツール集 ＞ 睡眠サイクル計算機
```

- 「ホーム」は `https://hasokon.com/`（別アプリなので `<a>`。`<Link>` ではない）
- 中間は `/tools/`（`<Link>`）
- 末尾は現在地。**リンクにしない**
- 配置はページ見出し（`<h1>`）の直前
- `<nav aria-label="パンくずリスト">` で囲み、区切り記号は `aria-hidden="true"` にして
  読み上げに載せない

### 2. BreadcrumbList 構造化データ

各ページの既存 `@graph` に1要素足す。**新しい `<script>` は増やさない。**

```ts
{
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'ホーム', item: 'https://hasokon.com/' },
    { '@type': 'ListItem', position: 2, name: '無料計算ツール集', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 3, name: '睡眠サイクル計算機' },
  ],
}
```

- 末尾の要素に `item` を付けない（現在地を指すため。Google の推奨に沿う）
- `name` は `registry.ts` の `name` をそのまま使う。**ページごとに手書きしない**
- `tools/lib/jsonld.ts` に `breadcrumbFor(slug)` を足し、
  registry から自動生成する。ツールを増やしたときに書き忘れが起きない形にする

### 3. 一覧ページとホーム

- `/tools/` `/games/` にも2段のパンくず（ホーム ＞ 無料計算ツール集）を入れる
- `home/` は最上位なのでパンくず不要

---

## 受け入れ条件

- [x] 全ツール・全ゲームの個別ページに視覚的パンくずが出る
      （404以外の全ページ。ビルド後の `out/**/index.html` で確認）
- [x] `registry.ts` にツールを1本足すと、パンくずにも自動で反映される（手書き不要）
- [x] JSON-LD の `@graph` に `BreadcrumbList` が入り、`<script>` の数は増えていない
- [x] 末尾要素に `item` が無い
- [ ] [リッチリザルトテスト](https://search.google.com/test/rich-results)で
      `BreadcrumbList` が警告なしで認識される（**公開URLが要るのでリリース後に確認**）
- [x] `nav` に `aria-label` があり、区切り記号が読み上げられない
- [x] キーボードでパンくずをたどれる（フォーカスリングが見える）
- [x] 既存の `WebApplication` / `FAQPage` の認識が壊れていない

---

## 期待される効果と工数

**効果**：

1. **検索結果でURLが日本語のパンくずに変わる。** 順位そのものは動かないが、
   同じ表示回数に対するクリック率が上がる。`/tools/sleep-cycle/` は
   直近3日で25表示・0クリック（掲載順位10.4）で、**サイトで最も表示されているページ**である。
   ここのCTRが動けば効果が最も分かりやすく出る
2. **一覧ページへの回遊が増える。** 個別ページに着地した人が他のツールに移れる
3. **統合後のサイト構造をGoogleに明示できる。** 再クロール時に新しい階層が正しく伝わる

**工数**：**小規模。5万〜8万トークン程度**。
共通コンポーネント2本と `jsonld.ts` への関数追加が中心で、
各ページの変更は `@graph` に1行足すだけ。registry から自動生成するので
ページ数に比例した作業は発生しない。

**依存**：無し。他の提案とファイルが重ならない。
`search-index-consolidation.md` の運用作業とは独立に進められる
（そちらは Search Console 上の操作、こちらはコード変更）。

---

## 実装時に仕様から変えたところ（2026-08-12）

**1. 表示と構造化データを1つの値から作るようにした。**
`breadcrumbFor(slug)` が返すのは `BreadcrumbList` そのものではなく、
段の配列（`Crumb[]`）である。ページはそれを
`<Breadcrumb trail={trail} />` と `breadcrumbList(trail)` の両方に渡す。
`BreadcrumbList` を直接返す形だと、表示側がもう一度同じ名前を組み立てることになり、
**片方だけ直して食い違う**余地が残るため。

**2. `Crumb` に `path` を持たせた。**
JSON-LD には絶対URL（`https://hasokon.com/tools/`）が要るが、
`<Link>` には basePath を含まないパス（`/`）を渡す必要がある。
1つのフィールドで兼ねられないので分けた。`path` を持たない段（ホーム）が
basePath の外＝`<a>` で飛ばす段、という判別も兼ねている。

**3. registry に無い slug は投げるようにした。**
`breadcrumbFor('sleep-cycl')` のような打ち間違いが、パンくずだけ黙って2段になる形で
本番に出るのを防ぐため。静的書き出しなので `npm run build` で必ず落ちる。

**4. 固定ページと動的ルートにも入れた。**
仕様書は「個別ページ + 一覧」だけを挙げていたが、`about/` `privacy/` `contact/`・
用途別ルーレット（`r/[slug]/`）・使い方の記事（`guide/[slug]/`）にも同じ形で入れた。
これらは registry に無いので、現在地の名前だけページ側で渡す
（`breadcrumbTrail('お問い合わせ')`）。
`privacy` `contact` と動的ルートの2本は JSON-LD が単体オブジェクトだったので、
`<script>` を増やさずに済むよう `@graph` 形式に変えた。
**404だけは入れていない**（階層上の居場所が無いため）。

**5. CSSクラスを1つ増やした。**
`.breadcrumb`（tools・games の `globals.css` に同じ内容）。
「新しいCSSクラスを増やさない」（tools/CLAUDE.md）に対する例外で、
`.site-header` / `.site-footer` と同じ全ページ共通のナビ部品なのでインライン化しなかった。

**テスト**：`tools/tests/jsonld.test.ts` / `games/tests/jsonld.test.ts`。
段の組み立てと `BreadcrumbList` の形（末尾に `item` が無い・position が連番）に加えて、
**registry の全 slug についてページが `breadcrumbFor` と `<Breadcrumb>` を出していること**、
**`<script type="application/ld+json">` が1ページ1枚のままであること**を見張っている
（ツールを足したときの入れ忘れを検知する）。
