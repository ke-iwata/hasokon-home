# 新ツール「JSON 整形・チェック」— 貼るだけで整形・1行に圧縮・構文チェック。エラーは「何行目の何文字目で、たぶんこれが原因」と日本語で示し、日本語の入力で起きやすい全角スペース・全角の引用符（“ ”）・全角コロン・全角カンマを見つけて直す。送らない・保存しない（ブラウザ内で完結）

**状態**：提案（2026-11-01 起票。セッション `session_012RoU2GJVsihSi9W9ySGfgJ`。定期の企画ルーティン）。
**公開の段階**：`wip` で入れ、テスト環境で操作を確かめてから `public` にする PR で home のカードと ToolPreview の絵を足す。
**期日のない恒常需要**なので期限は切らない（法改正ものの後ろでよい）。
**優先度：中。** 新しい客層（エンジニア・データを扱う事務職）への入口。法改正とは無関係で腐らない。
**対象**：`tools/`（`hasokon.com/tools/json-seikei/` を想定）
**起票**：2026-11-01
**関連**：[password-seisei.md](./password-seisei.md)・[qr-code-seisei.md](./qr-code-seisei.md)・[gazo-resize-asshuku.md](./gazo-resize-asshuku.md)（「ブラウザ内で完結」路線の先行3本）・
半角⇔全角（`tools/lib/hankaku-zenkaku.ts`。全角・半角の判定の考え方を流用）・
[thin-tool-content.md](./thin-tool-content.md)（本文の型）・[feature-flags.md](./feature-flags.md)

---

## 背景と根拠

### 計測値（GA4 プロパティ 548154955、2026-11-01 取得、直近 28 日）

| 指標 | 値 |
|---|---|
| セッション（全体） | 1,218。Organic 1,019 のうち **bing 846**・openai（Yahoo! の AI 検索）134・google 3 |
| `/tools/password` の着地 | **41**（直近 7 日で 32 に急増。ツール内で 4 位） |
| `/tools/aspect-ratio`・`/tools/hankaku-zenkaku`・`/tools/qr-code` | 14・12・9 |
| 端末 | desktop 980／mobile 226（**パソコンが 8 割**） |

- **Bing で来る客の 8 割はパソコン**で、「パスワード生成」のような作業用の小道具が税金系に混ざって上位に来ている。
  作業用ツールのいちばん大きな山である「JSON 整形」が当サイトに無い
- Search Console（`https://hasokon.com/`）の 10 月の表示は計 8 回で、Google からの流入はまだ無い
  （[google-index-recovery.md](./google-index-recovery.md) で追跡中）。**当面の集客は Bing と AI 回答**で、どちらも
  「〇〇 オンライン」型の作業用ツールを拾いやすい

### 競合の状況（2026-11-01 の Web 調査）

「JSON 整形」で上に出る日本語のツール（luft.co.jp・toolsbase.dev・miniwebtool.com・hostragons.com ほか）は、
整形・圧縮・行番号つきのエラーまでは揃っている。足りていないのは次の 2 点：

1. **エラーの原因の見当まで言わない。** パーサーは「間違えた場所」ではなく「気づいた場所」を返すので、
   カンマ忘れは 1 行下を指される（JSONLint 自身が解説している）。行番号だけでは初心者は直せない
2. **日本語の入力に特有の誤りを扱わない。** Excel や Word・チャットから貼った JSON には、
   全角スペース（U+3000）・全角の引用符（“ ” ‘ ’）・全角コロン（：）・全角カンマ（，、）・ノーブレークスペースが混ざる。
   `JSON.parse` は「Unexpected token」としか言わず、画面では見分けがつかない

**「どこに何が混ざっているかを色で見せ、1 ボタンで半角に直す」のは当サイトの半角⇔全角の資産をそのまま使える差別化**になる。
もう一つは「送らない」。社内の API の応答や個人情報入りのデータを貼る人が多いので、
パスワード生成と同じく「通信しない」を本文の最初に書き、実際に `fetch` を一切しない作りにする。

---

## 提案する仕様

### 入力

- テキスト欄 1 つ（貼り付け・ファイル選択・ドラッグ＆ドロップ。ファイルは `FileReader` で読むだけ）
- 上限は 5MB（それ以上は「重いのでブラウザが固まります」と出して止める）。2MB 超は入力が止まってから 300ms 後に処理

### 操作（ボタン）

| ボタン | 動き |
|---|---|
| 整形 | インデント 2／4／タブを選べる（既定 2）。`JSON.stringify(value, null, indent)` |
| 1行に圧縮 | `JSON.stringify(value)` |
| キーを並べ替え | オブジェクトのキーを再帰的に辞書順に（配列の順は変えない） |
| コピー | 結果をクリップボードへ。`navigator.clipboard` が使えないときは選択状態にする |
| 全角を直す | 下の「よくある混入」をまとめて半角に置き換える（文字列の**中身**は変えない。後述） |

### 構文チェックとエラーの出し方（`tools/lib/json-seikei.ts`。純関数）

`JSON.parse` の例外メッセージはブラウザごとに書式が違う（Chrome は `at position N`、
Firefox は `line L column C`、Safari は位置を出さないことがある）。**例外の文字列に頼らず、
自前の小さな走査器で位置を出す。** JSON の文法は小さい（RFC 8259）ので、
トークンを 1 つずつ読む関数を `lib` に置き、`JSON.parse` は成功・失敗の最終判定だけに使う。

返す形：

```ts
type JsonCheck =
  | { ok: true; value: unknown; stats: { depth: number; keys: number; bytes: number } }
  | { ok: false; line: number; column: number; message: string; hint?: string; fix?: Fix[] };
```

`hint`（原因の見当）として出すもの：

| 状況 | 出す文 |
|---|---|
| `}` `]` の直前にカンマ | 「最後の要素のあとにカンマがあります（JSON では使えません）」 |
| 値のあとに改行して次のキー | 「1 行上の行末にカンマが抜けていないか確かめてください」（**指された行の1行上を強調**） |
| `'` で囲った文字列 | 「文字列は " で囲みます（' は使えません）」 |
| キーが引用符なし | 「キーは " で囲みます」 |
| `//` `/* */` | 「JSON にはコメントを書けません」 |
| `NaN` `Infinity` `undefined` | 「JSON に無い値です。null か数値・文字列にしてください」 |
| 全角の記号・空白（下表） | 「全角の ○○ が混ざっています」＋「全角を直す」ボタン |
| 先頭に BOM | 黙って取り除き、注記を 1 行出す |

### よくある混入（「全角を直す」で直すもの）

| 文字 | 直し先 | 直す場所 |
|---|---|---|
| 全角スペース U+3000・ノーブレークスペース U+00A0 | 半角スペース | **文字列の外だけ** |
| “ ” ＂ | `"` | 文字列の区切りとして使われている位置だけ |
| ： ， 、 ｛ ｝ ［ ］ | `:` `,` `,` `{` `}` `[` `]` | 文字列の外だけ |
| 全角数字（０〜９）・全角マイナス | 半角 | 文字列の外の数値だけ |

**文字列の中身（"東京都　港区" の全角スペースなど）は変えない。** データを壊さないため。
置き換えた件数と最初の 3 か所の行・列を出し、元に戻すボタンを置く。

### 結果の出し方

- 成功：緑の帯で「正しい JSON です（階層 4・キー 37・1.2KB）」。整形結果を等幅で、行番号つき
- 失敗：赤の帯で「3 行目 15 文字目」＋ `hint`。入力欄の該当行に印を付け、そこへスクロール
- 全角の混入：該当文字に下線と薄い背景（色だけに頼らず、行頭に「全角」バッジも付ける）

### 画面（360px 幅でも 1 列で使える）

入力欄 → ボタン列（横スクロールさせず 2 段に折る）→ 結果。パソコン幅では左右 2 列。
ハイライトのために重いエディタ（Monaco・CodeMirror）は入れない（`textarea` と `pre` の重ね合わせで足りる。
バンドルを増やさないため。[mobile-lighthouse-third-party.md](./mobile-lighthouse-third-party.md) の方針）。

### ページの本文（thin-tool-content.md の型）

1. 冒頭：「貼った JSON はこのページの中だけで処理し、どこにも送りません」（パスワード生成と同じ書き方）
2. 使い方（3 手順）
3. **よくあるエラーと直し方**（上の `hint` の表を読み物として。ここが「JSON エラー 原因」「Unexpected token」系の検索の受け皿）
4. Excel・Word・チャットから貼ったときの全角の混入（当サイト独自の節）
5. FAQ 5 問：「JSON にコメントは書ける？」「末尾のカンマは？」「' と " の違いは？」
   「大きいファイルは？」「入力したデータは送信される？」

### registry・SEO

```ts
{
  slug: 'json-seikei',
  icon: 'Braces',           // 既存のアイコン集合にあるかを実装時に確認。無ければ Code
  name: 'JSON 整形・チェック',
  description: 'JSONを貼るだけで整形・圧縮・構文チェック。エラーは行と原因を日本語で表示し、全角スペースや全角の引用符の混入も見つけて直します。送信・保存はしません。',
  category: '計算・変換',
  stage: 'wip',
  updatedAt: '（実装日）',
}
```

- title：`JSON 整形・チェック（オンライン）｜エラーの行と原因を日本語で表示`
- `robots: robotsFor('json-seikei')`・JSON-LD は既存の `WebApplication` と `FAQPage` の型どおり
- llms.txt は registry から自動生成なので手で足さない

### テスト（`tools/tests/json-seikei.test.ts`）

- 正しい JSON の整形・圧縮・キーの並べ替え（配列の順が変わらないこと）
- `hint` の表の 8 状況それぞれで、行・列と文が期待どおり
- 「カンマ忘れ」で強調する行が、`JSON.parse` の指す行の 1 行上であること
- 全角の直しが**文字列の中身を変えない**こと（`{"a"：“東京　港区”}` → `{"a":"東京　港区"}`）
- 5MB 超で処理しないこと・BOM の除去
- ページのソースに `fetch(` `XMLHttpRequest` `navigator.sendBeacon` が無いこと（「送らない」の約束をテストで守る。
  GA4 のタグは共通部品なので対象外）

---

## やらないこと

- JSON ⇔ YAML・CSV・XML の変換、JSON Schema の検証、JSONPath（需要はあるが 1 本の範囲を超える。反応を見て別の提案にする）
- 「壊れた JSON を推測で直して整形」（miniwebtool の「修復」）。全角の置き換え以外の自動修正は、
  データを黙って変えるので入れない。直し方は `hint` で言うだけ
- 入力の保存（`localStorage` にも残さない）

## 期待される効果

- **新しい客層の入口。** 当サイトの客は「税金・社会保険を調べる人」に偏っている。パソコン 8 割・Bing 中心の
  いまの流入と作業用ツールの相性は、パスワード生成（28 日で 41 着地、直近 7 日で 32）が示している
- **腐らない。** 法改正の追随が要らず、`updatedAt` を上げる理由が少ない常緑のページ
- 「全角が混ざっている」は他の日本語ツールが拾っていない検索（「JSON 全角スペース エラー」「Unexpected token “」）の受け皿になる
- 判定：公開後 8 週で着地 30／28 日（パスワード生成の 7 割）を下限の目安にする。届かなければ
  本文の「よくあるエラー」の節の厚みを見直す

## 工数の見積り（消費トークン数）

| 作業 | 見積り |
|---|---|
| `lib/json-seikei.ts`（走査器・hint・全角の直し） | 約 45k |
| 画面（`Calculator.tsx`・ハイライト・ファイル読み込み） | 約 40k |
| `page.tsx`（本文・FAQ・メタ）と registry | 約 20k |
| テスト | 約 25k |
| 確認（ビルド・360px・大きい入力） | 約 15k |
| **合計** | **約 145k** |

`public` に上げる PR（home のカード・ToolPreview の絵・`sync-home-card-art`）は別に約 25k。

## 実装時に確かめること

- アイコン名（`Braces` か `Code`）が `tools/app/` のアイコン集合にあるか
- 5MB の入力で 360px のスマホ（Chromium の低速 CPU エミュレーション）が固まらないか。固まるなら上限を 2MB に下げる
- `textarea` と `pre` の重ね合わせで、行の折り返しとスクロールがずれないか（ずれるなら折り返しを切る）

## 出典（2026-11-01 に確認）

- RFC 8259「The JavaScript Object Notation (JSON) Data Interchange Format」 https://www.rfc-editor.org/rfc/rfc8259
- ECMA-404 The JSON data interchange syntax https://ecma-international.org/publications-and-standards/standards/ecma-404/
- JSONLint「JSON Error Analyzer」（パーサーは気づいた場所を返す、の説明） https://jsonlint.com/json-error-analyzer
- 競合：https://www.luft.co.jp/cgi/json-formatting.php ・ https://toolsbase.dev/ja/developer/json-formatter ・ https://miniwebtool.com/ja/jsonフォーマッターバリデーター/
