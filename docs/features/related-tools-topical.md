# 関連ツールを「話題」でつなぐ — ページ下の「他のツール」が registry の並び順の先頭6本で、ふるさと納税のページに「青色申告特別控除」「減価償却」「在職老齢年金」が出ている。ツールごとに「次に使うもの」を registry に持たせ、クリックを `related_click` で測る

**状態**：提案（2026-11-23 起票。セッション `session_012RoU2FbbFK6VBzzN6VxcXm`。定期の企画ルーティン。**同日の企画レビュー（#541、`session_012RoU2ESMqyydAoKPkENkuq`）の必須3点・推奨3点を反映**：パラメータ名を `from_tool`・`to_tool`・`link_source` に／`transport_type: 'beacon'`／見出しを「あわせて確認したいツール」に／`next/link` のまま `onClick` を足す／重複なしのテスト／本文リンクとの重なりは可）。**このPRは仕様書だけで、コードは触っていない。**
**いつ `public` にするか**：フラグの対象外（既存ページの下部の差し替え）。**年末調整・確定申告の山（12月〜3月）の前**、12月上旬までに本番へ出したい
**優先度：高。** 着地の上位ページがそのまま「1ページ見て帰る」になっている
**対象**：`tools/`（`tools/app/RelatedTools.tsx`・`tools/lib/registry.ts` に `related?: string[]` を追加・`tools/lib/analytics.ts` に `related_click`・`tools/tests/related.test.ts`（新規））。games は対象外（後述）
**起票**：2026-11-23
**関連**：[tool-use-coverage.md](./tool-use-coverage.md)（イベントの命名）・[breadcrumbs.md](./breadcrumbs.md)・[home-findability.md](./home-findability.md)・[feature-flags.md](./feature-flags.md)（`publicTools` を通す約束）・[thin-tool-content.md](./thin-tool-content.md)・[google-index-recovery.md](./google-index-recovery.md)（内部リンクがクロールの入口になる）

---

## 背景と根拠

### 計測値（GA4 Data API・プロパティ 548154955、2026-11-23 取得。直近 28 日＝10-26〜11-22）

| 着地ページ | セッション | エンゲージメント率 | **ページ/セッション** |
|---|---|---|---|
| `/tools/furusato-nozei` | 299 | 78% | **1.15** |
| `/tools/yoikuhi-keisan` | 178 | 84% | **1.17** |
| `/tools/nenrei-keisan` | 138 | 79% | **1.07** |
| `/tools/tabako-zei-neage` | 63 | 81% | 1.14 |
| `/tools/hatarakizon` | 57 | 93% | 1.39 |
| `/tools/shuzei-kaisei` | 47 | 70% | 1.11 |
| `/tools/shichigosan` | 38 | 79% | **1.00** |

- 流入の 78%（1,068 / 1,377）は Bing の自然検索。Google は Search Console 上で表示がほぼ無い（[google-index-recovery.md](./google-index-recovery.md) と #481 で扱い中）
- **エンゲージメント率は高い（計算はしている）のに、2ページ目へ進む人が1〜2割しかいない。** 着地したツールで用を済ませて帰っている
- イベントは `tool_use` 3,436・`page_view` 1,527・`portal_click` 13。**ツールページから別のツールへのクリックは計測していない**ので、下部の「他のツール」が押されているかどうか自体が分からない

### いまの「他のツール」が出しているもの（`tools/app/RelatedTools.tsx`）

同じカテゴリの `publicTools` を **registry の並び順で先頭から** 6 本。カテゴリは4つしかなく、「お金・社会保険」は公開中だけで約 50 本ある。そのため、お金のツールはどれを開いても**ほぼ同じ6本**が出る：

| 開いたページ | いま下に出る6本 | その人が次に知りたそうなもの |
|---|---|---|
| ふるさと納税 | 子育て支援金・年末調整・生命保険料控除・在職老齢年金・青色申告特別控除・減価償却 | 年末調整・医療費控除・確定申告が必要か・手取り・住民税非課税・年収の壁 |
| 養育費 | 子育て支援金・ふるさと納税・年末調整・生命保険料控除・在職老齢年金・青色申告特別控除 | 子育て支援金（児童手当）・高校授業料無償化・手取り・年収の壁・年齢計算 |
| 年齢計算（計算・変換） | 割引率・七五三・厄年・連休・日数・文字数 | 七五三・厄年は良い。日数計算・和暦は良い。**割引率・文字数は関係が薄い** |
| たばこ税の値上げ | 子育て支援金・ふるさと納税・年末調整… | 所得税の改正早見表（防衛特別所得税）・消費税計算 |

- 本文中の手書きリンクは、ふるさと納税→年収の壁の1本、養育費→高校授業料・子育て支援金・年収の壁の3本だけ
- 同じ6本に全ページのリンクが集まるので、**クロールの評価もその6本に偏る**。50本近いお金のツールの後ろ半分は、どのツールページからもリンクされていない

### 世の中の作り

計算サイトや金融機関の試算ページでは、結果の下に「この計算をした人はこちらも」「次の手続き」として話題の近い数本を出す作りをよく見かける（網羅的に調べたわけではない。実装時に keisan.casio.jp などの現物で見せ方を確かめる）

---

## 提案する仕様

### 1. registry に「次に使うもの」を持たせる

`tools/lib/registry.ts` の各ツールに任意の欄を足す：

```ts
/** 「次に使うもの」。並べた順に下部の先頭へ出す。slug のみ。公開前のものは書いてよい（出すときに publicTools で落とす） */
related?: string[];
```

- **手で書くのは3〜5本。** 6本に満たないぶんは、いままでどおり同カテゴリ → 他カテゴリの順で埋める（`related` の無いツールの見え方は変わらない）
- `related` に書いた slug が `public` でなければ**出さない**（`publicTools` で落とす。CLAUDE.md の約束どおり `tools` を直に `filter` しない）。公開した日から自動で出る
- 初版で書くのは、着地上位と年末〜春の山に当たるツール。下の表を初期値にする（実装時に公開状況で並びを確認）

| ツール | `related`（並び順） |
|---|---|
| `furusato-nozei` | `nenmatsu-chosei`・`kakutei-shinkoku-hantei`・`iryohi-kojo`・`tedori-keisan`・`juminzei-hikazei` |
| `nenmatsu-chosei` | `furusato-nozei`・`seimei-hokenryo-kojo`・`kakutei-shinkoku-hantei`・`iryohi-kojo`・`nenshu-kabe` |
| `yoikuhi-keisan` | `kosodate-shienkin`・`koko-jugyoryo`・`tedori-keisan`・`nenshu-kabe`・`nenrei-keisan` |
| `nenrei-keisan` | `shichigosan`・`yakudoshi`・`nissu-keisan`・`mynumber-kigen` |
| `shichigosan` | `nenrei-keisan`・`yakudoshi`・`shussan-teate`・`kosodate-shienkin` |
| `tabako-zei-neage` | `shuzei-kaisei`・`boei-tokubetsu-shotokuzei`・`shohizei-keisan` |
| `hatarakizon` | `nenshu-kabe`・`tedori-keisan`・`shoyo-tedori`・`juminzei-hikazei` |
| `shuzei-kaisei` | `boei-tokubetsu-shotokuzei`・`nenshu-kabe`・`tedori-keisan`・`tabako-zei-neage` |
| `juminzei-hikazei` | `nenkin-shien-kyufukin`・`nenshu-kabe`・`furusato-nozei`・`kogaku-ryoyohi` |
| `kosodate-shienkin` | `yoikuhi-keisan`・`koko-jugyoryo`・`shussan-teate`・`ikuji-kyugyo-kyufu` |
| `password` | `qr-code`・`hankaku-zenkaku`・`mojisu-count`（公開後は `hash-keisan`・`base64` を前へ） |

- 相互リンクにするかはツールごとに決める（片方向でよい。ふるさと納税→医療費控除はあるが、医療費控除→ふるさと納税は順位が低い、など）

### 2. 見出しと並び

- 見出しは `related` が1本でもあれば **「あわせて確認したいツール」**、無ければいままでの「◯◯の他のツール」
  - 「あわせて使われる計算」は利用実績があるように読める（中身は手で選んだもの）うえ、`password` → `qr-code` のように計算でないものもあるので使わない
- `related` 由来のカードと、埋め草のカードの見た目は変えない（区別は計測で付ける）
- 出す本数は6本のまま（`limit` の既定値を変えない）。モバイルで縦に長くなりすぎないため
- **最終的な6本に同じ slug を2回出さない。** 埋め草（同カテゴリ・他カテゴリ）を作るときに、`related` で先に出したツールを除く
- **ツール本文中の手書きリンク（ふるさと納税→年収の壁 など）と、下部の `related` が重なってもかまわない。** 本文は文脈の中の案内、下部は「次に使うもの」の一覧で、役割が違う。重複を消すための突き合わせはしない

### 3. クリックを測る（`related_click`）

- `tools/lib/analytics.ts` に `trackRelatedClick(fromTool, toTool, linkSource)` を足し、`related_click` を送る
  - パラメータ名は **`from_tool`**（今いるページの slug）／**`to_tool`**（押したカードの slug）／**`link_source`**（`'related'`＝手書き か `'category'`＝埋め草）
  - GA4 のカスタムディメンションはプロパティ全体で共有されるので、`from`・`to`・`source` のような汎用名は使わない（`source` は標準ディメンション「参照元」とも紛らわしい）。既存の `tool_use` の `tool`、`web_vitals` の `metric_*` と同じ流儀
  - **`transport_type: 'beacon'` を付ける。** 押すと同時にページを離れるので、付けないと送信が落ちて `related_click` が実際より少なく出る（`web_vitals` と同じ理由。`tools/lib/analytics.ts` の `trackWebVital` を参照）
- 送るのは slug だけ。入力値・計算結果は送らない（[measurement-hygiene.md](./measurement-hygiene.md)）
- GA4 側でカスタムディメンションを3つ（イベントスコープ。`from_tool`・`to_tool`・`link_source`、表示名も同じ）登録する作業は**運営者の手作業**（管理画面）。登録前でもイベント数は取れる
- `RelatedTools` はサーバーコンポーネントなので、クリックの送信は小さなクライアント部品（`RelatedToolLink`）に分ける。**リンクは `next/link`（`<a href>` として出力される）のまま、`onClick` で送信だけ足す。** 素の `<a>` に置き換えない（クライアント側の遷移が壊れる）。出力が `<a href>` なので、JS が無くても遷移し、クローラーも辿れる

### 4. テスト（`tools/tests/related.test.ts`）

- `related` の slug はすべて registry に存在する（綴り間違いで黙ってカードが消えないように）
- 自分自身を `related` に入れていない・重複が無い
- `related` に書いた `wip` / `preview` のツールは出ない（`publicTools` を通す）
- `related` の無いツールの出力が、いまの「同カテゴリ先頭から6本」と一致する（見え方を変えていないことの確認）
- **最終的な一覧に同じ slug が2回出ない**（`related` のツールが同カテゴリの埋め草に再び現れるのが一番ありがちなバグ）
- `trackRelatedClick` が `from_tool`・`to_tool`・`link_source`・`transport_type: 'beacon'` を送る
- 着地上位7本（上の計測表）に `related` が書かれている

### やらないこと

- **自動推薦（共起やGA4からの学習）**：計測がまだ無く、静的エクスポートでビルド時に引けるデータも無い。`related_click` が貯まってから検討
- **games**：`/games/` の着地は reversi・freecell・daifugo に偏っていて、遊び終わったあとの導線は別の仕様で考える
- **learn との相互リンク**：章ごとの関連ツールは `learn/lib/curriculum.ts` の側で扱う（別仕様）
- カテゴリの細分化（「税金」「社会保険」「子育て」…への分割）：一覧・パンくず・sitemap まで波及するので、この仕様では触らない

---

## 期待される効果

- 着地上位のツールの**ページ/セッションを 1.1 → 1.3 前後**へ（2ページ目へ進む人を1割→3割）。28日で着地 1,000 セッション規模なら、月 +150〜200 PV
- 年末調整（11〜12月）・確定申告（2〜3月）の山で、**ふるさと納税 → 年末調整 → 医療費控除 → 確定申告が必要か**の順に回る導線ができる
- 内部リンクが「先頭の6本」から各ツールへ散るので、**どのツールページからもリンクされていないツールが無くなる**。Bing・Google のクロールの入口が増える（[google-index-recovery.md](./google-index-recovery.md) の後押し）
- `related_click` で、どの組み合わせが押されるかが初めて分かる。並びの見直しを数字でできる

## 工数の見積り（消費トークン数）

| 作業 | 目安 |
|---|---|
| registry の型と `related` の初期値（11本前後） | 約 40k トークン |
| `RelatedTools` の並び替え・見出し・クリック送信の部品 | 約 50k トークン |
| `related.test.ts` と既存テストの調整 | 約 40k トークン |
| ビルド・スクリーンショットでの確認 | 約 30k トークン |
| **合計** | **約 160k トークン（PR 1 本）** |

## 確認ポイント（テスト環境）

1. `https://test.hasokon.com/tools/furusato-nozei/` の下部が「あわせて確認したいツール」で、年末調整・確定申告が必要か・医療費控除…の順
2. `related` の無いツール（例：`/tools/aspect-ratio/`）の下部が今と同じ
3. カードを押すと GA4 の DebugView に `related_click`（`from_tool`・`to_tool`・`link_source`）が出る
4. `wip` のツール（例：`hash-keisan`）を `related` に書いたページで、そのカードが出ていない
