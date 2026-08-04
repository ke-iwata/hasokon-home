# hasokon-games

https://game.hasokon.com で公開する無料ミニゲーム集。

ナンプレ・リバーシ・ブロック崩しをブラウザだけで。
インストール不要・登録不要、すべてクライアントサイドで動作します。

## 開発

```bash
npm install
npm run dev    # http://localhost:3001
npm test       # ゲームロジックのテスト
npm run build  # out/ に静的出力
```

## 構成

- Next.js (App Router) + TypeScript — `output: 'export'` による完全静的エクスポート
- ゲームロジックは `lib/` の純関数（Vitestでテスト）、UIは `app/{slug}/Game.tsx`
- ホスティング: AWS S3 + CloudFront（`infra/`、GitHub Actions でデプロイ）

詳細は [CLAUDE.md](./CLAUDE.md) を参照。姉妹サイト: [無料計算ツール集](https://tool.hasokon.com/)
