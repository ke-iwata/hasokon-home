# hasokon-home

`https://hasokon.com`（apex）に置く1枚だけのランディングページ。
ここから各ツールサイトへ案内する。

## なぜ別リポジトリなのか

中身は静的HTML 1枚だけで、ビルドもテストも要らない。
ツール本体（[hasokon-tools](https://github.com/ke-iwata/hasokon-tools)）は
Next.js + S3 + CloudFront で動いており、ビルドもデプロイ先も別物なので、
同じリポジトリに入れると設定が二重になる。

## 構成

| ファイル | 役割 |
|---|---|
| `index.html` | ページ本体。CSSもインラインで持つ |
| `CNAME` | AWS S3 + CloudFront に独自ドメインを伝える |
| `.github/workflows/deploy.yml` | main への push で AWS S3 + CloudFront にデプロイ |

## リンク先

- `https://tool.hasokon.com/` — 無料計算ツール集（計算機・ルーレットなど）

## 公開までの設定

1. GitHub でリポジトリを作り push する
2. Settings → Pages → Source を **GitHub Actions** にする
3. Route 53 の `hasokon.com` の A レコードを AWS S3 + CloudFront に向ける
   （もしくは既存の CloudFront のオリジンを差し替える）

## 動作確認

ビルド不要なのでブラウザで直接開ける。

```bash
open index.html
```
