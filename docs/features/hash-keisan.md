# 新ツール「ハッシュ値 計算（SHA-256・MD5）」— 文字列やファイルの SHA-256・SHA-1・MD5・SHA-384・SHA-512 をその場で出し、配布元が公開している値を貼ると一致を判定。「改行コード・末尾の改行・BOM・文字コードで値が変わった」を見つけて教える。何GBのファイルでも送信せずブラウザの中で

**状態**：提案（2026-11-20 起票。セッション `session_012RoU2ETTZj3bsuykNpuM2h`。定期の企画ルーティン）。**このPRは仕様書だけで、コードは触っていない。**
**いつ `public` にするか**：期日のない恒常需要。開発者向けの小道具（Base64・JSON 整形・正規表現・URL デコード・UNIX 時間）を `public` にする波に**同じ時期に並べる**のがよい
**優先度：中。** 法改正ものの後ろでよい。開発者向けの品ぞろえの穴を埋める1本
**対象**：`tools/`（`hasokon.com/tools/hash-keisan/` を想定。category は `計算・変換`。`tools/lib/hash/`（新規）・`tools/app/hash-keisan/`・`tools/tests/hash.test.ts`）
**起票**：2026-11-20
**関連**：[base64-henkan.md](./base64-henkan.md)（文字コードの判別 `charset-guess.ts` を共有。Base64 出力の相互リンク）・[seiki-hyogen-checker.md](./seiki-hyogen-checker.md)（Web Worker で重い処理を逃がす型）・
[password-seisei.md](./password-seisei.md)（「パスワードの保存にハッシュをそのまま使わない」の相互リンク）・[json-seikei.md](./json-seikei.md)・[url-decode-encode.md](./url-decode-encode.md)・
[thin-tool-content.md](./thin-tool-content.md)（本文の型）・[feature-flags.md](./feature-flags.md)・[tool-use-coverage.md](./tool-use-coverage.md)・[card-illustrations.md](./card-illustrations.md)

---

## 背景と根拠

### 計測値（GA4 Data API・プロパティ 548154955、2026-11-20 取得。直近 28 日＝10-23〜11-19）

| ページ | 着地セッション | 備考 |
|---|---|---|
| `/tools/password` | 49（Unassigned 35・Direct 9・Organic 5） | エンゲージメント率 86%（Unassigned）。**ブックマークから繰り返し使われている**形 |
| `/tools/qr-code` | 9 | |
| `/tools/aspect-ratio` | 9 | |

- 開発者・事務向けの小道具は「税・社会保険」の 58 本に比べて少なく、`base64`・`json-seikei`・`seiki-hyogen`・`url-decode`・`unix-jikan`・`text-hikaku` を `wip` で揃えている最中
- パスワード生成が**ブックマークされて繰り返し使われている**のは、この種の道具が「一度気に入ると毎回戻ってくる」型であることを示す。ハッシュ値計算も同じ型（ダウンロードのたびに使う）
- `tools/docs/CONCEPT.md` の「1ページ1機能・送信なし・登録不要」にそのまま当てはまる

### 世の中の需要と競合（2026-11-20 の Web 調査）

- 日本語のハッシュ計算サイトは多い（luft.co.jp・miniwebtool・toolsbase・coddy・mecanik など）。**どれも「値を出す」「期待値と比べる」まで**で、次の3つが弱い：
  1. **値が合わないときに理由を教えない**：いちばん多い原因は「末尾の改行（`echo` が足す `\n`）」「Windows の改行（CRLF）」「BOM」「Shift_JIS と UTF-8」。どのサイトも「一致しません」で終わる
  2. **大きなファイル**：Web Crypto（`crypto.subtle.digest`）は**ファイル全体をメモリに読んでから**計算するので、数GBの ISO・動画でブラウザが落ちる。MD5 は Web Crypto に無い
  3. **配布元の `SHA256SUMS`（「値␣␣ファイル名」の行の並び）をそのまま貼れない**
- 使われる場面：OS の ISO・ソフトのインストーラーの改ざん確認（配布元が SHA-256 を載せている）、データ受け渡しの同一性確認、Web 開発の SRI（`integrity="sha384-…"`）、Webhook の検証の下調べ
- OS 標準のコマンド（`certutil -hashfile`・`Get-FileHash`・`shasum`・`sha256sum`）を知らない人が多く、**「コマンドならこう打つ」を一緒に出す**と事務の人にも役立つ

---

## 提案する仕様

### 入力（タブ2つ）

| タブ | 入力 | 既定 |
|---|---|---|
| **文字列** | テキスト欄（入力するたびに再計算） | 文字コード UTF-8・改行はそのまま |
| **ファイル** | ドラッグ＆ドロップ／選択（**複数可**） | 4MB ずつ読みながら計算、進み具合のバーと「中止」 |

- 文字列タブの切り替え：文字コード（UTF-8／UTF-8 BOM つき／Shift_JIS）・改行（そのまま／LF にそろえる／CRLF にそろえる）・「末尾の改行を1つ足す（`echo` と同じ）」
- 出すアルゴリズム：**SHA-256（既定で一番上）・SHA-1・MD5・SHA-384・SHA-512 を全部同時に**（選ばせない。比べたい値がどれか分からない人が多い）

### 結果

- 1行1アルゴリズムで、16進（小文字）とコピーのボタン。「大文字で」「Base64 で」の切り替え
- **SRI の行**：SHA-384 を Base64 にして `sha384-…` の形で（`<script integrity>` にそのまま貼れる）
- MD5・SHA-1 の行には小さく「改ざん対策には使わない（衝突が見つかっている）。同じファイルかどうかの確認には使える」
- **コマンドの欄**：選んだファイル名を入れた形で、Windows（`certutil -hashfile 名前 SHA256`／PowerShell `Get-FileHash 名前 -Algorithm SHA256`）・macOS（`shasum -a 256 名前`）・Linux（`sha256sum 名前`）

### 一致の確認（「比べる値」欄）

- 貼った値の**長さでアルゴリズムを自動判定**（32 桁＝MD5・40＝SHA-1・64＝SHA-256・96＝SHA-384・128＝SHA-512。Base64 の `sha384-…` も受ける）。大文字小文字・空白・`:` 区切りは無視
- **`SHA256SUMS` 形式**（`値␣␣ファイル名` または `値␣*ファイル名` の行の並び）を貼ったら、ファイル名で突き合わせて**ファイルごとに ✓／✗**
- 一致：緑で「一致しました（SHA-256）」。不一致：赤で「一致しません」**に加えて、文字列タブでは次を自動で試し、当たったものを教える**：
  - 末尾の改行を足す／外す・LF⇔CRLF・BOM の有無・Shift_JIS⇔UTF-8・前後の空白を外す
  - 例：「**末尾に改行を1つ足すと一致します**（`echo` で作った値ではありませんか？ `echo -n` を使うと改行が入りません）」
- ファイルタブで不一致なら「ダウンロードが途中で切れた・別の版を落とした可能性」と、ファイルの大きさ（バイト数）を並べて出す（配布元がサイズも載せていることが多い）

### 計算の約束（`tools/lib/hash/`。純関数＋ Worker）

- **MD5・SHA-1・SHA-256・SHA-512（SHA-384 は SHA-512 の初期値と切り詰め）を自前の逐次計算（`update(chunk)`／`digest()`）で書く**。依存パッケージは足さない
  - 理由：Web Crypto には逐次計算と MD5 が無く、大きなファイルでメモリが足りなくなるため。1 本のコードで文字列もファイルも同じ経路にする
- ファイルは Web Worker で `File.slice()` 4MB ずつ読み、5つのアルゴリズムに同じ塊を流す。メインのスレッドは固めない
- 文字列の Shift_JIS 化は既存の `tools/lib/charset-guess.ts`／Base64 の実装で使っている変換表を共有する（同じ表を2つ持たない）
- 送信・保存はしない（`localStorage` にも残さない。入力が秘密の文字列のことがあるため）

### ページの構成（`thin-tool-content.md` の型）

- `h1`「ハッシュ値 計算（SHA-256・MD5）」。`title`「ハッシュ値 計算｜SHA-256・MD5・SHA-1をファイルも文字列も（一致の確認・送信なし）」
- 本文：ハッシュ値とは（指紋のたとえ）・ダウンロードしたファイルの確かめ方（3手順）・**値が合わないときの原因5つ**・SRI の書き方
- FAQ（5問。`FAQPage` の JSON-LD）：
  - 「MD5 は元の文字列に戻せますか？」→ 戻せない（暗号化ではない）。短い文字列は総当たりや既知の表で推測されうる
  - 「パスワードの保存に SHA-256 を使ってよい？」→ そのままは不可。bcrypt・Argon2 などの遅いハッシュとソルトを使う（[password-seisei.md](./password-seisei.md) へ）
  - 「ファイルはサーバーに送られますか？」→ 送らない。通信を切っても動く
  - 「同じ文字列なのに他のサイトと値が違う」→ 改行・BOM・文字コード（上の自動判定へ）
  - 「何GBまで計算できますか？」→ 上限は設けない。目安の速さ（実測値を実装時に書く）
- `metadata.robots: robotsFor('hash-keisan')`、`RelatedTools` に base64・password・url-decode・json-seikei
- 計測：`trackToolUse('hash-keisan', ...)` で `text`（初回の入力）／`file`（ファイル計算の完了）／`compare-match`／`compare-mismatch`／`compare-hint`（不一致の原因を当てた）

---

## 確かめること（テストとテスト環境）

- `tools/tests/hash.test.ts`：
  - 既知の値：空文字・`abc`・`abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq`（FIPS 180 の例）・`The quick brown fox jumps over the lazy dog`（MD5）
  - **塊の境目**：長さ 0・1・55・56・63・64・65・111・112・127・128・129 バイトと 4MB±1 を、**`node:crypto` の `createHash` と突き合わせる**（ランダムな入力 200 通り）
  - 塊の切り方を変えても（1 バイトずつ・7 バイトずつ・一括）値が同じ
  - 日本語：`テスト` の UTF-8／UTF-8 BOM／Shift_JIS で値が別になり、それぞれ `node:crypto` と一致
  - 一致の判定：長さでのアルゴリズム判定、`SHA256SUMS` 形式の読み取り（`␣␣` と `␣*`）、「末尾の改行を足すと一致」を当てる
- テスト環境：1GB 程度のファイルでブラウザが落ちずに進み具合が動くこと、中止できること（パソコン Chrome・Edge と iPhone Safari）

---

## 決めること（実装前に運営者と）

1. slug：推しは `hash-keisan`（ほかの `*-keisan` と同じ並び）
2. 名前に「MD5」を入れるか：推しは**入れる**（「md5 計算」で探す人が多く、注意書きで安全側に案内できる）

---

## やらないこと

- **HMAC（鍵つきハッシュ）**：Webhook 検証で需要はあるが、鍵を貼らせる画面になるため注意書きの設計が別に要る。この1本の反応を見てから別の仕様書で
- **bcrypt・Argon2 の生成**：パスワード保存用で、ブラウザで作る用途が薄く誤用を招く
- **CRC32・SHA-3・BLAKE**：需要が小さい。逐次計算の型ができれば後から足せる
- **「MD5 の逆引き（復号）」**：できないものをできるように見せる。FAQ で説明するだけにする
- **入力の保存・共有 URL**：秘密の文字列が URL・履歴に残る

---

## 期待される効果

- 開発者・情シス・事務の「ダウンロードしたファイルの確認」の検索（「ハッシュ値 計算」「sha256 確認」「certutil hashfile」「md5 計算」）で着地を作る。季節に左右されない恒常需要
- 「値が合わない理由を教える」はほかに無い差で、ブックマークされて繰り返し使われる（パスワード生成と同じ型）
- **測り方**：公開後 8 週の着地セッションと Unassigned／Direct の割合（ブックマークの再訪）、`compare-hint` の件数（差の価値が使われているか）

---

## 工数（消費トークンの見積もり）

| 作業 | 見積もり |
|---|---|
| `lib/hash/`（MD5・SHA-1・SHA-256・SHA-512/384 の逐次計算）＋テスト | 約 5〜6 万トークン |
| Worker・ファイルの分割読み・進み具合・中止 | 約 2〜3 万トークン |
| 一致の判定・不一致の原因探し・`SHA256SUMS` の読み取り＋テスト | 約 2〜3 万トークン |
| ページ（2タブ・結果・コマンド欄・本文・FAQ・JSON-LD） | 約 4〜5 万トークン |
| `public` にする PR（home のカード・ToolPreview の絵・`sync-home-card-art`） | 約 3 万トークン |
| **合計** | **約 16〜20 万トークン**（実装 PR 1 本＋公開 PR 1 本、どちらも `feat:`） |

---

## 出典

- NIST FIPS 180-4 Secure Hash Standard（SHA-1・SHA-2 の定義と例） https://csrc.nist.gov/pubs/fips/180-4/upd1/final
- RFC 1321 The MD5 Message-Digest Algorithm https://www.rfc-editor.org/rfc/rfc1321
- RFC 6151（MD5 の安全性についての更新）・RFC 6194（SHA-1） https://www.rfc-editor.org/rfc/rfc6151 ・ https://www.rfc-editor.org/rfc/rfc6194
- W3C Subresource Integrity https://www.w3.org/TR/SRI/
- MDN `SubtleCrypto.digest()`（MD5 が無いこと・逐次計算が無いこと） https://developer.mozilla.org/ja/docs/Web/API/SubtleCrypto/digest
- Microsoft Learn `Get-FileHash`・`certutil` https://learn.microsoft.com/ja-jp/powershell/module/microsoft.powershell.utility/get-filehash
- 競合（2026-11-20 確認。機能の確認のみ）：luft.co.jp ハッシュ値生成・miniwebtool SHA256 ハッシュジェネレーター・toolsbase ハッシュ生成
