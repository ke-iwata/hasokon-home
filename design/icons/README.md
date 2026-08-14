# design/icons — 「ホーム画面に追加」用のアイコン

仕様: [docs/features/games-pwa-manifest.md](../../docs/features/games-pwa-manifest.md)

スマホでゲームをホーム画面に追加したときに出るアイコンの原典です。
`gen-app-icons.mjs` が headless Chromium でPNGを4枚書き出します。

**絵の原典は [`games/app/icon.svg`](../../games/app/icon.svg)**
（ブラウザのタブに出ているファビコンそのもの）で、配色・角丸・字は
このSVGから読み取っています。**PNGを直接編集しないでください。**

| 書き出し先 | 公開URL | 用途 |
|---|---|---|
| `games/public/icon-192.png` | `https://hasokon.com/games/icon-192.png` | ホーム画面のアイコン |
| `games/public/icon-512.png` | `https://hasokon.com/games/icon-512.png` | スプラッシュ画面・インストール時のプレビュー |
| `games/public/icon-maskable-192.png` | 同上 `-maskable-192` | Android のランチャー（マスクされる） |
| `games/public/icon-maskable-512.png` | 同上 `-maskable-512` | 同上 |

`app/` ではなく `public/` に置いているのは、Next.js が `app/` 配下で扱うのは
`icon.svg` などメタデータ規約のファイル名だけで、それ以外のPNGは配信されないためです
（`ogp.png` と同じ置き場所）。

## any と maskable を分けている理由

Android のランチャーは端末ごとに違う形（円・角丸四角・しずく）でアイコンを
切り抜きます。角丸のアイコンをそのまま渡すと**角が二重に落ち**、
角の外の透明部分が黒く出ることがあります。

- `any` … 原典のSVGと同じ見た目（角丸・角の外は透明）
- `maskable` … 角丸を外して地を全面に敷き、字を安全領域（中央80%）まで縮める

## 生成物はコミットする

`design/ogp/` と同じ扱いです。4枚しかなく、`games/app/icon.svg` を触らない限り
増えも変わりもしないので、そのままコミットしています。

## 作り直しかた

ふだんは動かす必要がありません。`games/app/icon.svg` を変えたときだけ回して、
出てきたPNGを一緒にコミットします。

```bash
npm install --no-save playwright   # このリポジトリは playwright を常設していない
node design/icons/gen-app-icons.mjs
```

## テスト

- `scripts/test/pwa-manifest.test.mjs`（`node --test`）… PNG4枚が宣言どおりの
  寸法で実在すること、`games/app/manifest.ts` の参照と書き出し先が一致すること、
  生成スクリプトの角丸・安全領域の出し分け（Chromium は起こしません）
- `games/tests/manifest.test.ts`（vitest）… マニフェストの中身
  （`start_url` / `scope` / 配色 / アイコンの `purpose`）
