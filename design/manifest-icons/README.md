# design/manifest-icons — 「ホーム画面に追加」用アイコン

仕様: [docs/features/games-pwa-manifest.md](../../docs/features/games-pwa-manifest.md)

スマホのホーム画面に置いたときのアイコンの原典です。
`gen-manifest-icons.mjs` が headless Chromium でPNGを4枚書き出します。

| 書き出し先 | 公開URL | 用途 |
|---|---|---|
| `games/public/icons/icon-192.png` | `/games/icons/icon-192.png` | `any`・ホーム画面 |
| `games/public/icons/icon-512.png` | `/games/icons/icon-512.png` | `any`・スプラッシュ／アプリ一覧 |
| `games/public/icons/icon-maskable-192.png` | `/games/icons/icon-maskable-192.png` | `maskable` |
| `games/public/icons/icon-maskable-512.png` | `/games/icons/icon-maskable-512.png` | `maskable` |

絵は `games/app/icon.svg`（ブラウザのタブに出るファビコン）と同じで、
青緑→藍のグラデーションに白い `h` です。

## any と maskable を1枚で兼ねない

Android は端末ごとに違う形（円・角丸四角・雫）でアイコンを切り抜きます。
`maskable` は「中心80%の円の中に絵が収まっている」ことが前提で、
そのぶんの余白が要ります。

- **`any`** … `icon.svg` と同じ。角丸の外は透過
- **`maskable`** … 角丸をやめてグラデーションを縁まで塗り、文字を 80% に縮める

1枚に `purpose: "any maskable"` と書いて兼ねさせると、切り抜かない環境
（iOS・デスクトップ）で余白のぶんアイコンが小さく見えるので分けています。

## 生成物はコミットする

`design/ogp/` と同じ流儀です。4枚しかなく、`registry.ts` を触っても増えません。
**PNGを直接編集せず、スクリプトを回して差し替えてください。**

## 作り直しかた

ふだんは動かす必要がありません。`games/app/icon.svg` を変えたときだけ回します。

```bash
npm install --no-save playwright   # このリポジトリは playwright を常設していない
node design/manifest-icons/gen-manifest-icons.mjs
```

OGP画像と違って日本語を使わない（`h` のラテン1文字だけ）ので、
実行環境の日本語フォントの有無に左右されません。

## テスト

`scripts/test/manifest-icons.test.mjs`（`node --test`）が見ています。

- PNGが4枚存在し、宣言どおりの寸法であること（PNGのIHDRを直接読んでいます）
- 4枚が別々の絵であること（コピーで済ませると maskable の余白が消えるため）
- `games/app/manifest.ts` の `src` が実ファイルを指し、basePath（`/games`）が付いていること
- スクリプトの絵の定義が `games/app/icon.svg` と揃っていること（Chromium は起こしません）

マニフェストの中身（`start_url` / `scope` / `display`）は
`games/tests/manifest.test.ts`（vitest）です。
