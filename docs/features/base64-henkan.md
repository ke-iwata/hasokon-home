# 新ツール「Base64 エンコード・デコード」— 貼るだけで向きを自動判定し、日本語も文字化けさせずに戻す（UTF-8・Shift_JIS 自動判別）。メールの件名の `=?UTF-8?B?…?=`・`=?ISO-2022-JP?B?…?=`、URL 用の base64url、JWT の中身（署名は検証しないと明記）、`data:` の画像のプレビューとファイル化まで。送信なし

**状態**：`wip` で実装（2026-11-12。文字コードの判別は `tools/lib/charset-guess.ts` に切り出して URLデコードと共有）。提案（2026-11-12 起票。セッション `session_012RoU2ENShHxTdDwM6kgFGm`。**同日の企画レビュー（#495）の必須 5 点と軽微 3 点を反映**：判別は `tools/lib/charset-guess.ts` に切り出して共有／Shift_JIS でエンコードしない理由を直す／保存は `<a download>` だけで開かない／デコード側の入力の上限／MIME のテストケース）
**着手条件**：なし（[URLデコード・エンコード](./url-decode-encode.md)〈`wip`〉が持つ文字コードの判別を共有できるなら共有する。下「デコードの約束」3）
**いつ `public` にするか**：期日のない通年の需要なので期限は切らない。`wip` で入れ、テスト環境で
下「デコードの約束」1〜9・「エンコードの約束」1〜5 と 1366×768・390×844 を確かめてから、`public` にする PR で home のカードと ToolPreview の絵を足す。
**季節もの（お年玉 計算機・#494）・法改正ものの後ろでよい。**
**優先度：中。** URLデコード（#473）の仕様書「やらないこと」で**「Base64 は別の需要。別ツールとして考える」**と残した続き。
作業用の小道具（JSON 整形・UNIX時間・テキスト比較・URLデコード）の5本目。
**対象**：`tools/`（`hasokon.com/tools/base64/` を想定。category は `計算・変換`）
**起票**：2026-11-12
**関連**：[url-decode-encode.md](./url-decode-encode.md)（文字コードの自動判別・「送信しない／開かない」の約束）・[json-seikei.md](./json-seikei.md)（JWT の中身を JSON として整形する導線）・
[unix-jikan-excel-serial.md](./unix-jikan-excel-serial.md)（JWT の `exp`・`iat` を日本時間で出す）・[gazo-resize-asshuku.md](./gazo-resize-asshuku.md)（画像の扱い）・
`tools/lib/invisible-chars.ts`（見えない文字の印）・[thin-tool-content.md](./thin-tool-content.md)・[tool-use-coverage.md](./tool-use-coverage.md)・[feature-flags.md](./feature-flags.md)・[card-illustrations.md](./card-illustrations.md)

---

## 背景と根拠

### 計測値（GA4 Data API・プロパティ 548154955、2026-11-12 取得。直近 28 日＝10-15〜11-11）

| 指標 | 値 |
|---|---|
| セッションの入口 | `bing` 955・`openai` 152・`(direct)` 130・`chatgpt.com` 54・`duckduckgo` 29・`google` 1 |
| 端末 | desktop 1,106（**83%**）／mobile 227／tablet 7 |
| 作業用ツールの PV（28 日） | `password` 60（**着地の入口は `openai` 40**）・`aspect-ratio` 11・`qr-code` 8 |
| Search Console（`https://hasokon.com/`、10-13〜11-10） | ページ表示 5・クリック 0（[#481](https://github.com/ke-iwata/hasokon-home/pull/481)） |

- 客の大半は**パソコンで Bing から**来る前提は 11-07（URLデコード）の提案から変わっていない
- パスワード生成が `openai`（Yahoo! の AI 回答）から 40 着地しているのは、**「やり方を聞く質問」の答えにツールが引かれる**形。
  Base64 は「Base64 デコード やり方」「base64 日本語 文字化け」で同じ形になりやすい

### 需要と競合の状況（2026-11-12 の Web 調査）

「base64 デコード」「base64 エンコード」「base64 変換」「base64 画像 変換」は通年の定番。エンジニアだけでなく、
**事務・総務の「メールの件名が `=?ISO-2022-JP?B?GyRC…?=` になって読めない」**「CSV やログに入っていた長い英数字を読みたい」がある。
上位は単機能のフォームで、調べた範囲で足りていないのは：

1. **日本語が文字化けする。** ブラウザの `btoa()` / `atob()` は Latin-1 しか扱えず、そのまま使うと日本語で例外か文字化けになる
   （UTF-8 にしてからバイト列で扱うのが正しい）。さらに **Shift_JIS・ISO-2022-JP で作られた Base64**（古いシステム・メール）は UTF-8 決め打ちでは読めない
2. **メールの件名・差出人の「MIME エンコード」（RFC 2047 の encoded-word）をほどくものが少ない。** `=?UTF-8?B?…?=` と `=?ISO-2022-JP?B?…?=`、Q エンコード（`=?…?Q?…?=`）
3. **base64url（`-` と `_`、`=` 無し）を区別しない。** JWT・URL 内のトークンは base64url で、通常の Base64 として読むと壊れる
4. **JWT を貼ると、サーバーに送るツールがある。** トークンは認証情報そのもの。当サイトはブラウザ内だけで読み、**署名は検証しない**（できない）と明記する
5. **`data:image/png;base64,…` を画像として見せ、ファイルに戻すものが別のツールに分かれている**

**本文には競合の名前を出さない**（JSON 整形の企画レビュー #444 の約束と同じ）。

---

## 提案する仕様

### 入力と出力

- テキスト欄1つ。**貼った中身から向きを自動判定**（Base64 らしければデコード、そうでなければエンコード）。「デコード／エンコード」の切り替えで上書きできる
- **「ファイルを選ぶ」ボタンを主にする**（画像・PDF など）→ Base64 と `data:` URI を出す（エンコード）。パソコンではドラッグ＆ドロップも受けるが、スマホでは使えないので補助の扱い
- 出力：結果の文字列（コピーのボタン）・判定した形式（標準 Base64／base64url／MIME encoded-word／JWT／`data:` URI）・文字コード・バイト数

### 判定の約束

1. 前後の空白・改行（76 文字ごとの折り返し、RFC 2045）は取り除いてから判定する
2. `=?…?B?…?=` / `=?…?Q?…?=` を含む → **MIME encoded-word**（RFC 2047）。1行に複数あれば並べて全部ほどき、間の空白は規則どおり詰める
3. `xxx.yyy.zzz` の3つに分かれ、先頭が `eyJ`（`{"` の base64url）→ **JWT**
4. `data:<type>;base64,` で始まる → **data URI**
5. `A–Z a–z 0–9 + /`（末尾 `=` 0〜2 個）だけで長さが 4 の倍数 → 標準 Base64。`-` `_` を含み `+` `/` を含まない → base64url
6. どれにも当たらない（日本語・記号を含むなど）→ **エンコード**として扱う。判定は画面に必ず出す（「Base64 として読みました」）
7. 「Base64 として読めるが、デコードした結果が意味のある文字にならない」（短い英単語 `test` `abcd` など）は、**デコード結果とエンコード結果を両方出す**

### デコードの約束（テストで固定する）

1. `atob()` を直接使わない。Base64 → バイト列（`Uint8Array`）→ `TextDecoder` で文字にする
2. 既定の文字コードは UTF-8（`fatal: true` で試す）。失敗したら Shift_JIS・EUC-JP・ISO-2022-JP を順に試し、**選んだ文字コードを画面に出す**。手で切り替えられる
3. 文字コードの判別・採点は、[URLデコード](./url-decode-encode.md) と**同じ関数を使う**。ただし main の `tools/lib/url-decode.ts` の `guessCharset(input, plus)` は
   **パーセントエンコードの文字列**を受け取る関数で、Base64 のバイト列はそのまま渡せない。そこで：
   - **バイト列から判別・採点する部分（`japaneseScore` を含む）を `tools/lib/charset-guess.ts` に切り出し**、`url-decode.ts` の `guessCharset` もそれを呼ぶ形にする
     （`url-decode.ts` 側は「文字列 → バイト列に分ける」までを持つ）
   - **切り出しても `tools/tests/url-decode.test.ts` の既存テストは書き換えずに通ること**（書き換えが要るなら、切り出し方が間違っている）
   - `base64.ts` は Base64 → バイト列にしてから `charset-guess.ts` を呼ぶ。**判別・採点の式を `base64.ts` に書かない**（企画レビュー #495 の必須 1）
4. MIME encoded-word は、宣言された charset（`UTF-8`・`ISO-2022-JP`・`Shift_JIS`）でデコードする。charset の大文字小文字は区別しない。
   B エンコードは Base64、**Q エンコードは `_` を空白、`=XX` を1バイトとして読む**（RFC 2047 4.2）。テストケース：
   - `=?ISO-2022-JP?B?GyRCJCIbKEI=?=` → `あ`
   - `=?UTF-8?Q?=E3=81=82?=` → `あ`、`=?UTF-8?Q?a_b?=` → `a b`
   - `=?UTF-8?B?44GC?= =?UTF-8?B?44GE?=` → `あい`（**隣り合う encoded-word の間の空白は詰める**。RFC 2047 6.2）
   - `件名: =?UTF-8?B?44GC?= です` → `件名: あ です`（**encoded-word とふつうの文字の間の空白は残す**）
   - charset が小文字（`=?utf-8?b?44GC?=`）でも `あ`
5. JWT は header と payload を base64url でデコードし、**JSON として整形**して出す。`exp`・`iat`・`nbf` は日本時間（`Asia/Tokyo`）に直して並べる
   （[UNIX時間](./unix-jikan-excel-serial.md) の関数を使う）。`exp` には**「期限切れ」／「あと◯時間◯分」**も添える（閲覧者の端末の今の時刻と比べる）。**「署名は検証していません。中身が読めても、本物のトークンとは限りません」**を結果の上に必ず出す
6. data URI の画像（`image/png`・`image/jpeg`・`image/gif`・`image/webp`）は `<img>` でプレビュー。**`image/svg+xml` もプレビューは `<img>` だけ**で行い、
   `innerHTML`・`<object>`・`<iframe>` には入れない（SVG 内のスクリプトを動かさない）。
   **画像でない data URI（`text/html`・`application/javascript` など）はプレビューしない**（種類とバイト数と保存のボタンだけ）
7. 文字にならないバイナリ（PDF・ZIP など）は先頭のバイトから種類を推定して表示（`%PDF` → PDF など）し、「ファイルとして保存」のボタンを出す。テキスト欄には出さない。
   **保存は `<a download>` で落とすだけ**にする。Blob URL・data URL を**新しいタブで開かない・`window.open` しない・`location` を移さない**
   （Blob URL は hasokon.com と同じオリジンになるので、`text/html`・`image/svg+xml` を開くとスクリプトが hasokon.com の上で動く。企画レビュー #495 の必須 3）。
   保存した後は `URL.revokeObjectURL` で片づける
8. 壊れた入力（長さが合わない・不正な文字）は、**何文字目が不正か**を出す。`=` の補完で読めるものは補って読み、「末尾の `=` を補いました」と出す
9. デコード結果に見えない文字（ゼロ幅スペース・BOM・制御文字）があれば、`tools/lib/invisible-chars.ts` で印を付ける
10. **入力の上限**（デコードもエンコードも、貼り付けた文字列に効く）：
    - **自動で変換するのは 100,000 文字まで**（URLデコードの `MAX_AUTO_CHARS = 100_000` と揃える。共有できるなら同じ定数を使う）。
      超えたら自動の変換を止め、「長いので『変換』を押してください」とボタンで変換する（スマホが打つたびに固まらないため）
    - **貼り付けで受けるのは 8,000,000 文字まで**（5MB のファイルの data URI ≒ 約 700 万文字が入る大きさ）。超えたら受けずに「大きすぎます」と出す
    - テストケース：100,000 文字ちょうどは自動、100,001 文字はボタン、8,000,001 文字は断る

### エンコードの約束（テストで固定する）

1. 文字は UTF-8 でバイト列にしてから Base64 にする（`btoa(unescape(encodeURIComponent(…)))` の古い書き方は使わない）。Shift_JIS は**エンコードの選択肢に出さない**
   （**需要が薄いので初版では出さない**。Base64 を Shift_JIS で作りたい場面は少ない。仕組みは `tools/lib/url-decode.ts` の `reverseTable()`・`ENCODE_CHARSETS` に
   もうあるので、要望が来たらそれを使って足す。企画レビュー #495 の必須 2）
2. 出力の形式を選べる：標準 Base64／base64url（`=` 無し）／76 文字で折り返す（メール本文用）／`data:` URI（ファイルのとき）
3. テストケース：`あ` → `44GC`、`hasokon` → `aGFzb2tvbg==`、バイト列 `FB FF` → 標準 `+/8=`・base64url `-_8`、空文字は空文字
4. ファイルのエンコードは**上限 5MB**（それ以上は「大きすぎて画面が固まるため」と断る）。読み込みは `FileReader` ではなく `arrayBuffer()` で行う
5. 改行の扱い：入力の改行は `\n` のまま（Windows から貼ったときの `\r\n` を勝手に変えない）。「改行を CRLF にする」切り替えを付ける

### 安全の約束

- **貼った中身・ファイルを送信しない**（`fetch` しない。`tool_use` には形式と文字コードとバイト数の帯だけを付ける。中身は付けない）
- デコード結果に URL があっても**リンクにしない**（URLデコードと同じ約束）
- 入力・結果を `localStorage` に保存しない（トークン・個人情報が入りうる）
- 本文の冒頭に「この画面の中だけで変換し、どこにも送りません」を1行

### スマホ（直近28日で約17%）での画面

- 入力と結果を縦に積む。コピーのボタンは 44px 以上。JWT の表は横スクロールさせず、キーと値を2段にする
- ファイルは「ファイルを選ぶ」ボタンで受ける（ドラッグ＆ドロップはスマホで使えない）

### 本文（[thin-tool-content.md](./thin-tool-content.md) の型）

- **タイトル・見出し・説明文の主語は Base64 と「日本語の文字化け」。JWT は機能の説明と FAQ 4 に留め、タイトルに入れない**（主役をぼかさないため。企画レビュー #495 の SEO の観点）
- 使い方・Base64 とは（3バイトを4文字に。サイズが約 4/3 倍になる）・base64url との違い・出典（RFC 4648・RFC 2045・RFC 2047・RFC 7519、WHATWG Encoding Standard）
- **FAQ（4問。JSON-LD の FAQPage）**
  1. デコードしたら日本語が文字化けする → 文字コード（UTF-8／Shift_JIS）の違い。自動で判別している
  2. メールの件名が `=?ISO-2022-JP?B?…?=` になっている → MIME encoded-word。貼れば読める
  3. Base64 は暗号化？ → **暗号化ではない。誰でも元に戻せる**。パスワードの保存に使わない（[パスワード生成](/tools/password/) へ）
  4. JWT の中身を見ても安全？ → 見るだけなら送信しないので安全。ただし署名は検証していない・他人に貼らない

### 計測

- `tool_use` に `format`（base64／base64url／mime／jwt／datauri／encode）・`charset`・`bytes_band`（〜1KB／〜100KB／〜5MB）を付ける。中身は付けない

### 実装のファイル（想定）

| ファイル | 内容 |
|---|---|
| `tools/lib/base64.ts` | 判定・デコード・エンコード・MIME・JWT・data URI（文字コードの判別は共有のものを呼ぶ） |
| `tools/lib/charset-guess.ts` | バイト列からの文字コードの判別・採点（`japaneseScore` を含む）を `url-decode.ts` から切り出す |
| `tools/lib/url-decode.ts` | `guessCharset` を `charset-guess.ts` を呼ぶ形に（**既存テストは書き換えない**） |
| `tools/tests/base64.test.ts` | 判定 1〜7・デコード 1〜10・エンコード 1〜5 |
| `tools/app/base64/page.tsx`・`Converter.tsx` | 画面・本文・FAQ・JSON-LD。`robots: robotsFor('base64')` |
| `tools/lib/registry.ts` | `stage: 'wip'` で追加、`updatedAt` |

---

## 期待される効果

- 「base64 デコード」「base64 エンコード」「base64 日本語 文字化け」「base64 画像 変換」「jwt デコード」「=?ISO-2022-JP?B? 読めない」の
  **通年の定番クエリへの新規参入**。Bing の客層（パソコン 83%・仕事中）と合う
- **日本語の文字化けを正しく直す（Shift_JIS・ISO-2022-JP）**・**MIME の件名**・**送信しない JWT** の3点で単機能のツールと差がつく。
  事務職の「メールが読めない」は困って検索する場面で、FAQ 2 が着地になる
- JSON 整形・UNIX時間・URLデコード・パスワード生成との回遊（JWT → JSON → UNIX時間、の流れ）
- 腐らない（法改正と無関係）。一度作れば手入れがほぼ要らない

## 工数（消費トークンの見積もり）

| 作業 | 目安 |
|---|---|
| `lib/base64.ts` ＋ テスト（判定・文字コード・MIME・JWT・data URI・壊れた入力） | 約 60k トークン |
| `charset-guess.ts` の切り出し（`url-decode.ts` の既存テストを書き換えずに通す） | 約 15k トークン |
| 画面（自動判定・ファイル・プレビュー・JWT の表）・本文・FAQ・JSON-LD・registry | 約 45k トークン |
| テスト環境での確認（1366×768・390×844・5MB のファイル） | 約 10k トークン |
| `public` にする PR（home のカード・ToolPreview の絵・sync） | 約 20k トークン |
| **合計** | **約 150k トークン**（2 PR） |

## やらないこと

- JWT の署名の検証（秘密鍵・公開鍵を貼らせることになる。鍵を扱うツールは別に考える）
- 暗号化・復号（AES など。Base64 と混同させないため、FAQ 3 で「暗号化ではない」と書くのに留める）
- Shift_JIS・ISO-2022-JP での**エンコード**（需要が薄いので初版では出さない。仕組みは `reverseTable()` がある。上「エンコードの約束」1）
- HTML エンティティ・Unicode エスケープ（`\u3042`）・16進ダンプの変換（別の需要。利用の計測を見てから）
- 5MB を超えるファイル（Web Worker と分割処理が要る）
