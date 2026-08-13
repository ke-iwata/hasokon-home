# 自己参照canonicalの網羅（セクショントップとプライバシーの4ページ）

**状態**：実装済み（2026-08-13。本番反映はタグリリース待ち）
**対象**：`tools/app/page.tsx` / `games/app/page.tsx` / `tools/app/privacy/page.tsx` / `games/app/privacy/page.tsx`
**起票**：2026-08-13

---

## 背景と根拠

[search-index-consolidation.md](./search-index-consolidation.md) に、次の1行が書かれたまま残っている。

> `/games/` が「検出 - インデックス未登録」のままである件は、セクショントップに
> 自己参照 canonical が無いことも一因と見ている。こちらは各リポジトリで対応する。
>
> - hasokon-tools: `docs/features/section-index-canonical.md`
> - hasokon-games: `docs/features/section-index-canonical.md`

**この2つのリポジトリは、その後モノレポに統合されてアーカイブされた。**
移送先として書かれた `section-index-canonical.md` はどちらにも存在せず、
統合作業のときにこの申し送りだけが落ちた。3日経っても直っていないので、
この仕様書で引き取る。

### 計測値1：canonical が出ていないページ（2026-08-13 取得）

`app/` 配下の `page.tsx` を走査して `canonical` を含まないものを数えた。

```
tools: page.tsx 22件 / canonical無し 2件
    tools/app/page.tsx
    tools/app/privacy/page.tsx
games: page.tsx 12件 / canonical無し 2件
    games/app/page.tsx
    games/app/privacy/page.tsx
```

**34ページのうち4ページだけが例外**という状態で、残り30ページはすべて
`alternates: { canonical: ... }` を持っている。つまり方針としては
「全ページに自己参照canonicalを置く」で揃っていて、この4ページが取りこぼしである。

本番のHTMLでも確認した（同日）。

```console
$ for u in tools/ games/ tools/privacy/ games/privacy/ tools/sleep-cycle/; do
    printf '%-16s ' "$u"; curl -sS "https://hasokon.com/$u" \
      | grep -o '<link rel="canonical"[^>]*>' | head -1; echo
  done
tools/
games/
tools/privacy/
games/privacy/
tools/sleep-cycle/ <link rel="canonical" href="https://hasokon.com/tools/sleep-cycle/"/>
```

`layout.tsx` は `metadataBase` を持つが `alternates` を持たないため、
**ページ側が書かないと `<link rel="canonical">` は1つも出力されない。**

### 計測値2：Google側から見た同じ4ページ（2026-08-13 取得）

`node scripts/gsc-canonical-audit.mjs` を全46URLに対して実行した結果から抜粋。
`userCanonical`（＝Googleが読み取ったページ側のcanonical）が、上の実測と一致している。

| URL | カバレッジ | userCanonical |
|---|---|---|
| `/tools/` | 送信して登録されました | **null** |
| `/games/` | 検出 - インデックス未登録 | **null** |
| `/tools/privacy/` | 検出 - インデックス未登録 | **null** |
| `/games/privacy/` | URLが不明（未検出） | **null** |
| （参考）`/tools/sleep-cycle/` | 送信して登録されました | `https://hasokon.com/tools/sleep-cycle/` |

ソース・本番HTML・Googleの読み取り結果の3つが一致しているので、**事実として確定している。**

### 計測値3：インデックス統合の全体状況（2026-08-13 取得）

同じ実行の集計。ベースライン（2026-08-10）から3日後にあたる。

| 状態 | 件数 |
|---|---|
| 新URLが正規URL（consolidated） | 9 |
| 旧サブドメインが正規URL（legacy） | 6 |
| **インデックス未登録（unindexed）** | **31** |
| 検査に失敗 | 0 |
| 合計 | 46 |

旧サブドメインを指したまま残っている6件：
`/tools/roulette/`・`/tools/kosodate-shienkin/`・`/tools/nenshu-kabe/`・
`/tools/shobyo-teate/`・`/tools/aircon-denkidai/`・`/games/minesweeper/`。

**Search Analytics API で見ると、検索の実績はまだ旧サブドメイン側にある**
（2026-07-17〜2026-08-11、`dataState: all`）。

| プロパティ | クリック | 表示回数 |
|---|---|---|
| `tool.hasokon.com` | 10 | 264 |
| `game.hasokon.com` | 6 | 71 |
| `roulette.hasokon.com` | 2 | 26 |
| **`hasokon.com`** | **3** | **10** |

### ここで誤解しないこと

**31件がインデックス未登録である主因は、この canonical 欠落ではない。**
新URL構成に切り替えたのは 2026-08-08 で、まだ5日しか経っていない。
新規ドメインのクロール頻度は低く、5日で31件が未登録なのはごく普通の状態である。
canonical を足したところで、この31件が一気に登録されるわけではない。

それでも直す理由は2つ。

1. **4ページのうち3ページが未登録**で、そのうち `/games/` は
   ゲーム9本を束ねるハブページである。ハブが登録されないと配下も辿られにくい
2. **重複が起きたときに、こちら側の主張が無い。** 旧サブドメインが正規URLとして
   選ばれている6件は、いずれもページ側の canonical が新URLを指していた
   （`userCanonical` が入っている）。つまり canonical は「Googleに必ず従わせるもの」
   ではないが、**主張が無いページは主張の勝ち負けにすら参加できない。**
   `/tools/` は運良く登録されたが、これは canonical が効いた結果ではない

**工数がほぼゼロなので、効果の大小を議論するより先に埋めてしまうのが安い。**

---

## 現状の再現手順

```bash
# ソース側（canonical を書いていない page.tsx を数える）
node -e '
const {readdirSync,readFileSync}=require("fs"),{join}=require("path");
function pages(d){return readdirSync(d,{withFileTypes:true}).flatMap(e=>{
  const p=join(d,e.name);
  return e.isDirectory()?pages(p):/^page\.tsx$/.test(e.name)?[p]:[]})}
for(const site of ["tools","games"]){
  const all=pages(site+"/app");
  const missing=all.filter(p=>!readFileSync(p,"utf8").includes("canonical"));
  console.log(site, all.length, missing.length, missing);
}'

# Google側（要 GOOGLE_SERVICE_ACCOUNT_JSON）
node scripts/gsc-canonical-audit.mjs --out baseline-2026-08-13.json
```

---

## 提案する仕様

### 1. 4ページに `alternates.canonical` を足す

既存30ページとまったく同じ書き方に揃えるだけ。`SITE_URL` は
`tools/lib/registry.ts` / `games/lib/registry.ts` の定義
（`https://hasokon.com/tools` / `https://hasokon.com/games`）をそのまま使う。

セクショントップ（`tools/app/page.tsx` / `games/app/page.tsx`）は
**いま `metadata` の export そのものが無い**ので、新しく足す。
title / description は `layout.tsx` の既定値がそのまま使われている状態なので、
**それを変えないために `alternates` だけを持つ `metadata` にする。**

```ts
// tools/app/page.tsx — layout.tsx の title.default / description を維持したいので
// alternates だけを持たせる。title を書くと template: '%s' に流れて既定値が消える
export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/` },
};
```

```ts
// games/app/page.tsx（同じ形）
export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/` },
};
```

プライバシーの2ページは既に `metadata` があるので1行足すだけ。

```ts
// tools/app/privacy/page.tsx / games/app/privacy/page.tsx
export const metadata: Metadata = {
  title: 'プライバシーポリシー',
  description: `${SITE_NAME}の…`,
  alternates: { canonical: `${SITE_URL}/privacy/` },   // ← この行を足す
};
```

**末尾スラッシュを付けること。** CloudFront Function がスラッシュ無しのURLを
301で寄せているので（`hasokon-infra/functions/hasokon-home-site-rewrite.js`）、
canonical がスラッシュ無しだと「canonicalがリダイレクトを指す」状態になる。

### 2. 回帰テストを足す（これが本体）

同じ取りこぼしが起きないよう、`app/` を走査して全ページに canonical が
あることを見張る。**既に同じ形のテストがある**ので、その隣に置く。

- `tools/tests/ogp.test.ts` … `pageFiles()` で `app/` を走査し、
  `openGraph` を書いたページが `images` を持つかを見ている
- `tools/tests/jsonld.test.ts` … registry の全slugがパンくずを出しているかを見ている

`tools/tests/canonical.test.ts` と `games/tests/canonical.test.ts` を新設し、
`ogp.test.ts` の `pageFiles()` と同じ走査で次の2つを確かめる。

1. `not-found.tsx` を除く全 `page.tsx` が `alternates` と `canonical` を含む
2. canonical の値が `SITE_URL` から始まり、末尾がスラッシュである

**除外は `not-found.tsx` だけ。** 404は `robots: { index: false }` を持っており、
canonical を持たせる対象ではない（現状もそうなっている）。

動的ルート（`app/r/[slug]/page.tsx`・`app/guide/[slug]/page.tsx`）は
`generateMetadata` の中で canonical を組み立てているので、
文字列の走査でそのまま引っかかる。特別扱いは要らない。

### 3. 実施後にもう一度測る

`node scripts/gsc-canonical-audit.mjs` を本番反映の1週間後に回して、
`userCanonical` が null のURLが0件になったことを確かめる。
**`unindexed` の31件が減るかどうかは、この変更とは切り離して見る**
（減る要因はクロールの進行とアドレス変更ツールのほうが大きい）。

---

## 期待される効果

| 項目 | 期待 |
|---|---|
| `userCanonical` が null のページ | 4件 → **0件**（確実に起きる。HTMLの出力の話なので） |
| 重複判定でのこちら側の主張 | 無し → 有り（`/games/` を含む4ページ） |
| 同じ取りこぼしの再発 | テストで落ちるようになる |

**順位が上がる効果は見込んでいない。** これは「主張が無い状態を消す」変更で、
順位を動かすのは中身の仕事である（[search-index-consolidation.md](./search-index-consolidation.md)
の末尾と同じ立場）。

**効果の測り方**：`scripts/gsc-canonical-audit.mjs` の出力で
`userCanonical` が null の件数を数える。今日の値は4件（`/tools/`・`/games/`・
`/tools/privacy/`・`/games/privacy/`）。

## 工数の見積り

| 作業 | 目安 | 消費トークン |
|---|---|---|
| 4ページに `alternates` を足す | 15分 | 〜5k |
| `canonical.test.ts` × 2サイト | 45分 | 〜25k |
| ビルドとテストの確認 | 15分 | 〜10k |
| **合計** | **約1時間15分** | **〜40k** |

テストのほうが本体より重いが、この取りこぼしは「モノレポ統合で申し送りが落ちた」
という経路で起きたので、人間の注意力ではなくテストで止めるのが正しい。

## やらないこと

- **`layout.tsx` に既定の canonical を置く**

  一見これで4ページとも解決するように見えるが、`metadataBase` と
  `alternates.canonical: '/'` を layout に書くと、**ページ側が `alternates` を
  書き忘れたときに全ページがセクショントップを正規URLとして主張する。**
  取りこぼしが「canonicalが無い」から「canonicalが間違っている」に変わり、
  後者のほうがはるかに危険（OGPで踏んだ浅い上書きの落とし穴と同じ構造）。
  ページごとに書いてテストで見張る、という現在の方針を崩さない。

- **セクショントップに title / description を書く**

  `layout.tsx` の `title.template` が `'%s'` なので、ページ側に `title` を書くと
  `title.default`（`無料計算ツール集｜年収の壁・支援金・電気代などをすぐ計算`）が
  そのまま置き換わる。いま出ている文言を変える意図は無いので触らない。
  文言を見直すなら独立したPRで、変更前後を並べて判断する。

- **`unindexed` の31件を手動でインデックス登録申請する**

  [search-index-consolidation.md](./search-index-consolidation.md) の「やらないこと」に
  同じ判断が書かれている。1日あたりの送信上限があり、46URLには現実的でない。
  ハブ（`/`・`/tools/`・`/games/`）の3つだけは手動送信の価値があるが、
  それは運営者の操作で、この仕様書の範囲外。

- **旧サブドメインのプロパティ追加とアドレス変更ツール**

  [search-index-consolidation.md](./search-index-consolidation.md) の担当。
  なお**プロパティ追加（手順1）とサービスアカウントへの権限付与（手順3）は
  完了している**（2026-08-13 に API で確認。`tool` / `game` / `roulette` の
  3プロパティが `siteFullUser` で見えており、本仕様書の計測値もそこから取った）。
  アドレス変更ツール（手順2）の実施状況は API から確認できないため不明。
