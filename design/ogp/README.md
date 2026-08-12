# design/ogp — SNS共有時のサムネイル（OGP画像）

仕様: [docs/features/ogp-image.md](../../docs/features/ogp-image.md)

X・LINE・Slack・Facebook・Discord にURLを貼ったときに出るサムネイルの原典です。
`gen-ogp.mjs` が headless Chromium で 1200×630 のPNGを3枚書き出します。

| 書き出し先 | 公開URL | 見た目 |
|---|---|---|
| `home/ogp.png` | `https://hasokon.com/ogp.png` | 地は warm stone（明） |
| `tools/public/ogp.png` | `https://hasokon.com/tools/ogp.png` | 地は warm stone（明） |
| `games/public/ogp.png` | `https://hasokon.com/games/ogp.png` | 地は forest green（暗） |

tools と games で地の色を反転させているのは、ツールとゲームを見分けられるように
するためです（アクセントは1色のままなので、サイト全体の配色からは外れません）。

## 生成物はコミットする

仕様書の案A（ページごとに1枚を自動生成）では生成物を `.gitignore` に入れますが、
いま入れているのは**案B（サイトごとに共通の1枚）**です。3枚しかなく
`registry.ts` を触っても増えないので、そのままコミットしています。
案Aに進むときに、あわせて `.gitignore` の扱いを見直してください。

## 作り直しかた

ふだんは動かす必要がありません。デザイントークン（[../tokens.css](../tokens.css)）や
サイト名・説明文を変えたときだけ回して、出てきたPNGを一緒にコミットします。

```bash
npm install --no-save playwright   # このリポジトリは playwright を常設していない
node design/ogp/gen-ogp.mjs
```

日本語のWebフォントは埋め込まず、実行環境の端末フォント
（Hiragino Sans → Noto Sans JP → IPAGothic の順）で描いています。
数MBのフォントをリポジトリに置かずに済ませるためで、PNGはコミットするので
実行環境ごとの字面の差が本番に出ることはありません。
**作り直したら、日本語が豆腐（□）になっていないか必ず目で見て確かめてください。**

## テスト

`scripts/test/ogp.test.mjs`（`node --test`）が見ています。

- 3枚のPNGが存在し、1200×630 であること（PNGのIHDRを直接読んでいます）
- 3枚が別々の絵であること（コピーで済ませると tools / games の区別が消えるため）
- `home/index.html` と `home/404.html` の `og:image` が絶対URLで実ファイルを指し、
  `twitter:card` が `summary_large_image` であること
- `gen-ogp.mjs` の書き出し先・サイズ・配色の出し分け（Chromium は起こしません）

tools / games のメタデータ側は各ディレクトリの `tests/ogp.test.ts`（vitest）です。
