# hasokon-tools

https://tool.hasokon.com で公開する無料Webツール集。

## 技術構成

- Next.js (App Router) + TypeScript — `output: 'export'` による完全静的エクスポート
- Vitest — 計算ロジックの単体テスト
- ホスティング: AWS S3 + CloudFront（GitHub Actions でデプロイ）

## 開発

```bash
npm install
npm run dev    # http://localhost:3000
npm test       # 計算ロジックのテスト
npm run build  # out/ に静的出力
```

## ディレクトリ構成

```
app/
  layout.tsx        # 共通レイアウト（ヘッダ・フッタ・メタ情報）
  page.tsx          # トップページ（ツール一覧）
  {tool-slug}/      # 各ツール 1ページ = 1ディレクトリ
lib/
  registry.ts       # ツールレジストリ（一覧・sitemapの元データ）
  {tool-slug}.ts    # 各ツールの計算ロジック（純関数・UIから分離）
tests/
  {tool-slug}.test.ts
```

## ツールの追加手順

1. `lib/{slug}.ts` に計算ロジック（純関数）を実装
2. `tests/{slug}.test.ts` にテストを追加
3. `app/{slug}/page.tsx` にページを実装
4. `lib/registry.ts` の該当エントリを `ready: true` に変更
