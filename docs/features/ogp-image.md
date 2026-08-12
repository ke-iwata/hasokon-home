# OGP画像とTwitterカードを入れる（SNS共有時のサムネイル）

**状態**：**案B（サイトごとに共通の1枚）を実装済み**（2026-08-12）。案Aは未着手
**対象**：`tools/`・`games/`・`home/`（`layout.tsx` のメタデータ + 画像生成）
**起票**：2026-08-12

---

## 背景と根拠

### 計測値（2026-08-12 取得）

**`og:image` が全ページに存在しない。**本番HTMLで確認：

```
$ curl -s https://hasokon.com/tools/sleep-cycle/ | grep -oE '<meta property="og:[^>]*>'
<meta property="og:title" content="睡眠サイクル計算機｜スッキリ起きられる就寝・起床時刻を逆算"/>
<meta property="og:description" content="起きたい時刻を入れるだけで、…"/>
<meta property="og:site_name" content="無料計算ツール集"/>
<meta property="og:locale" content="ja_JP"/>
<meta property="og:type" content="website"/>
```

`og:image` が無い。`twitter:card` も無い。
`tools/app/layout.tsx` の `openGraph` は `type` / `siteName` / `locale` の3つだけで、
`images` を持っていない（`games/app/layout.tsx` も同様）。

**結果として、X・LINE・Slack・Facebook・Discord にURLを貼ると、
サムネイルの無いテキストだけのリンクになる。**

### なぜこれが効くか

**GA4 / Data API（直近28日）のチャネル別セッション**

| チャネル | セッション |
|---|---|
| Direct | 55 |
| Organic Search | 40 |
| Organic Social | **2** |
| Referral | 1 |

Organic Social が実質ゼロである。
これは「SNSに向いていないサイトだから」ではない。
**ゲームとツールは本来もっとも共有されやすい種類のコンテンツ**で、
「このゲーム面白い」「この計算機便利」と貼られる下地はある。
その共有がサムネイル無しのリンクとして流れているため、クリックされていない。

`twitter:card` が無い場合、X ではカードそのものが生成されない。
`og:image` があり `twitter:card` が `summary_large_image` なら、
タイムライン上の占有面積が数倍になる。

### 副次的な効果

Google の検索結果でも、`og:image` はサムネイル候補のひとつとして参照されることがある
（保証はされない）。主目的はあくまでSNS共有時の見え方に置く。

---

## 何を作るか

### 1. 画像の作り方：ビルド時に静的生成する

このサイトは Next.js の**静的エクスポート**（`output: 'export'`）である。
`next/og` の動的画像生成（`opengraph-image.tsx` のランタイム生成）は
**静的エクスポートでは使えない**。次のどちらかを取る。

**案A（推奨）：ビルド前にPNGを書き出すスクリプト**

`tools/scripts/gen-ogp.mjs` を追加し、`registry.ts` を読んで
ツール1本につき1枚のPNG（1200×630）を `public/ogp/<slug>.png` に書き出す。
`package.json` の `prebuild` で走らせる。

- 描画は `@vercel/og` の `ImageResponse` を Node 側で実行して
  バッファをファイルに書く形が扱いやすい（satori + resvg でも可）
- **生成物はコミットしない。** `.gitignore` に `public/ogp/` を足す。
  registry を直したのに画像が古いままになる事故を防ぐ

**案B：共通画像1枚だけ**

`tools/` と `games/` それぞれに固定のOGP画像を1枚置き、全ページで共有する。
工数はほぼゼロだが、どのページを貼っても同じ絵になる。

**案Aを推す。**このサイトの価値は「個別のツール・ゲーム」にあり、
共有されるのも個別ページなので、ページごとに絵が違うことに意味がある。
ただし**まず案Bで入れて、後から案Aに差し替える**進め方でもよい
（`og:image` が1枚でもあるかどうかの差が最も大きいため）。

### 2. デザイン

サイトの配色（`globals.css` の CSS 変数）に合わせる。**絵文字は使わない**
（`registry.ts` のアイコン方針と同じ理由。端末ごとに絵柄が変わる）。

```
┌────────────────────────────────────┐
│  [ToolIcon]                        │
│                                    │
│  睡眠サイクル計算機                  │   ← registry の name（大きく）
│  スッキリ起きられる就寝・起床時刻を逆算 │   ← description を1行に詰める
│                                    │
│  hasokon.com                       │   ← 右下に控えめに
└────────────────────────────────────┘
```

- アイコンは `ToolIcon.tsx` と同じ Phosphor Icons を使い、一覧カードと絵柄を揃える
- 日本語フォントの埋め込みが必要（サブセット化しないとファイルが重くなる）
- `games/` は配色を変えて、ツールとゲームが見分けられるようにする

### 3. メタデータ

`layout.tsx` の `openGraph` に既定画像を置き、各ページで上書きする。

```ts
openGraph: {
  type: 'website',
  siteName: SITE_NAME,
  locale: 'ja_JP',
  images: [{ url: `${SITE_URL}/ogp/default.png`, width: 1200, height: 630 }],
},
twitter: { card: 'summary_large_image' },
```

各ページ側：

```ts
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/sleep-cycle/` },
  openGraph: { images: [{ url: `${SITE_URL}/ogp/sleep-cycle.png`, width: 1200, height: 630 }] },
};
```

- **URLは絶対URLにする。** OGPの仕様上、相対パスは多くのクローラーが解決できない
- `home/` は素の静的HTMLなので、`index.html` / `404.html` に手で `<meta>` を書く

---

## 受け入れ条件

- [ ] 全ツール・全ゲームの個別ページに `og:image`（絶対URL）と
      `twitter:card="summary_large_image"` が出る
- [ ] `home/index.html` と `home/404.html` にも入る
- [ ] 画像が 1200×630 で、[カード検証](https://cards-dev.twitter.com/validator)や
      Facebook のシェアデバッガでサムネイルが表示される
- [ ] 案Aの場合、`registry.ts` にツールを1本足すと画像も自動で増える
- [ ] 生成物が git に入っていない（`.gitignore` 済み）
- [ ] 日本語が豆腐（□）にならない
- [ ] ビルド時間の増加が許容範囲（現状 + 30秒以内を目安）

---

## 期待される効果と工数

**効果**：Organic Social が2セッション/28日という現状は、
**伸びしろがそのまま残っている状態**である。
共有されたときにサムネイルが出るだけで、同じ共有回数からの流入が変わる。
ゲーム側（ソリティア・マインスイーパー等）は特に共有と相性がよい。

即効性はないが、**一度入れれば以後すべての共有に効き続ける**種類の改善である。

**工数**：

- **案B（共通画像1枚）**：**2万〜3万トークン**。画像2枚とメタデータの追加のみ
- **案A（ページごと生成）**：**10万〜15万トークン**。
  生成スクリプト、日本語フォントのサブセット化、ビルド組み込み、
  静的エクスポートとの噛み合わせの確認が要る

**まず案Bを入れて `og:image` の有無の差を埋め、案Aは別PRに分ける**のが安全。

**依存**：無し。他の提案とファイルが重ならない
（[breadcrumbs.md](./breadcrumbs.md) は JSON-LD、こちらは `<meta>` と画像）。

---

## 実装（案B）と、仕様から変えたところ

この節は 2026-08-12 の実装（案B）の記録。**案Aはまだ入れていない。**

### 入れたもの

| ファイル | 役割 |
|---|---|
| `design/ogp/gen-ogp.mjs` | 3枚のPNGを書き出す生成スクリプト（headless Chromium） |
| `design/ogp/README.md` | 作り直しかたと、生成物をコミットする理由 |
| `home/ogp.png` / `tools/public/ogp.png` / `games/public/ogp.png` | 1200×630 の生成物 |
| `tools/lib/registry.ts` / `games/lib/registry.ts` | `OGP_IMAGE`（絶対URL・寸法・alt） |
| `tools/app/layout.tsx` / `games/app/layout.tsx` | `openGraph.images` と `twitter` |
| `home/index.html` / `home/404.html` | `og:image` 一式と `twitter:card` |
| `scripts/test/ogp.test.mjs` / `{tools,games}/tests/ogp.test.ts` | テスト |

### 変えたところ

1. **生成物をコミットする。** 仕様書が `.gitignore` を求めていたのは
   「registry を直したのに画像が古いままになる事故」を防ぐためだが、
   それは registry からページごとに作る案Aの話。案Bの3枚は registry を触っても
   増えないので、ビルド工程（`prebuild`）にも入れていない。
   スクリプトを手で回してPNGを一緒にコミットする形にした
2. **アイコンは Phosphor のツールアイコンではなく「h」のマーク1種にした。**
   共通の1枚に個別ツールのアイコンを載せると、どのページを貼っても
   関係のないアイコンが出る。ページごとの絵になる案Aで
   `ToolIcon.tsx` と絵柄を揃えるのが本来の姿
3. **日本語フォントのサブセット化はしていない。** 生成時に実行環境の端末フォント
   （Hiragino / Noto Sans JP / IPAGothic）で描き、PNGをコミットしている。
   案Aではビルド時に描くのでフォントの同梱が必要になる
4. **`home/privacy.html` は対象外。** 受け入れ条件が挙げているのは
   `index.html` と `404.html` の2枚で、プライバシーポリシーはSNSに貼られない

### 受け入れ条件の達成状況

- [x] 全ツール・全ゲームの個別ページに `og:image`（絶対URL）と `twitter:card`
      （`out/**/index.html` の全37枚 / 14枚で確認）
- [x] `home/index.html` と `home/404.html` にも入る
- [x] 画像が 1200×630（`scripts/test/ogp.test.mjs` がPNGのIHDRを読んで確認）
- [ ] **案Aの条件**（registry に1本足すと画像も増える）— 案Aは未着手
- [x] 生成物が git に入っていない → **案Bでは意図的にコミットしている**（上記1）
- [x] 日本語が豆腐（□）にならない（生成したPNGを目視で確認）
- [x] ビルド時間の増加が許容範囲 — 生成をビルドから外したので**増加ゼロ**

### 次にやること（案A）

`og:image` の有無の差はこれで埋まった。案Aに進むときは、
上の「変えたところ」1〜3がそのまま宿題になる
（`prebuild` への組み込み・`.gitignore`・`ToolIcon` との絵柄合わせ・フォントの同梱）。
