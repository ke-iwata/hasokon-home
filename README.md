# hasokon-home

[hasokon.com](https://hasokon.com/) のモノレポ。個人開発の無料Webツール・ミニゲームを公開しています。

| ディレクトリ | 公開先 | 内容 |
|---|---|---|
| `home/` | https://hasokon.com/ | ポータル（素の静的HTML） |
| `tools/` | https://hasokon.com/tools/ | 無料計算ツール集（Next.js 静的エクスポート） |
| `games/` | https://hasokon.com/games/ | 無料ミニゲーム集（Next.js 静的エクスポート） |

もとは3リポジトリに分かれていましたが、2026年8月に統合しました。
旧 hasokon-tools / hasokon-games の全履歴はこのリポジトリに取り込み済みです。

## 開発

```bash
cd tools   # または games
npm install
npm run dev    # tools: :3000 / games: :3001
npm test
npm run build  # out/ に静的出力
```

home/ はビルド不要。`open home/index.html` で直接確認できます。

## デプロイ

- main にマージ → テスト環境（test.hasokon.com、Basic認証つき）
- `v*` タグを push → 本番（hasokon.com）。1タグでサイト全体をリリース

ホスティングは S3 + CloudFront。AWSリソースは
[hasokon-infra](https://github.com/ke-iwata/hasokon-infra)（Terraform）で管理しています。
