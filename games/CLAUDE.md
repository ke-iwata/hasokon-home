# CLAUDE.md（games）

hasokon.com モノレポの `games/` で作業するAIエージェント・開発者向けのガイドです。
npmコマンドはすべて `games/` ディレクトリ内で実行します。

## プロジェクト概要

`https://hasokon.com/games/` で公開する無料ミニゲーム集。
同じモノレポの `tools/` と技術構成・運用方針はすべて共通。
**迷ったら tools/CLAUDE.md に従う。**

- 完全静的サイト（Next.js App Router + `output: 'export'`、TypeScriptは6系に固定）
- ゲームはすべてクライアントサイドで動く。サーバーもDBもない
- ホスティングは S3 + CloudFront。mainへのpushでGitHub Actionsがデプロイ

## 設計上の約束

1. **ゲームロジックとUIを分離する** — ロジックは `lib/{slug}.ts` の純関数
   （ブロック崩しの物理も含む）。`Game.tsx` は入力と描画だけ。
   これによりロジックがテストできる（現在111件）
2. **`lib/registry.ts` が単一の情報源** — トップ一覧・sitemapはここから生成
3. **CSSは `app/globals.css` だけ** — 新しいファイルを増やさない
4. **名称の商標に注意する**（このリポジトリ固有の約束）
   - 「数独」はニコリの登録商標 → **ナンプレ**と呼ぶ
   - 「オセロ」は登録商標（リバーシと呼ぶ）。「ソリティア」「スパイダーソリティア」
     「マインスイーパー」「2048」はジャンルの一般名称として広く使われている
   - 「テトリス」も商標。ゲームのルール自体は著作権で保護されないが、
     名称・ロゴ・固有のビジュアル表現の模倣は避ける。
     新しいゲームを足すときは必ず名称の商標を確認すること

## ゲームの追加手順

1. `lib/{slug}.ts` — ロジックを純関数で実装（乱数は注入できる形にしてテスト可能に）
2. `tests/{slug}.test.ts` — 境界値・進行・終了条件を必ず入れる
3. `app/{slug}/Game.tsx`（'use client'）と `app/{slug}/page.tsx`
   （metadata / JSON-LD(VideoGame + FAQPage) / 遊び方 / FAQ / AdUnit×2 / 他のゲーム一覧）
4. `lib/registry.ts` にエントリを追加
5. `npm test && npm run build` が通ることを確認

## AdSense / アクセス解析

- `lib/adsense.ts`（tools と同じパブリッシャーID・配信中）。
  **AdSense管理画面に hasokon.com/games/ のサイト追加が必要**
- `lib/analytics.ts` の `GA_MEASUREMENT_ID` は未設定。
  tools とは**別のデータストリーム**を作って測定IDを入れる（サイト別に集計するため）
- 主要な操作で `trackToolUse(slug, action)` を呼ぶ（開始・クリア・勝敗など実装済み）

## インフラ

AWSリソース（S3 / CloudFront / Route53 / IAM）は
[hasokon-infra](https://github.com/ke-iwata/hasokon-infra)（Terraform）で管理。

デプロイはリポジトリルートの `.github/workflows/deploy.yml` が
home + tools + games をまとめて行う:
- main にマージ → test.hasokon.com/games/（Basic認証つきテスト環境）
- `v*` タグ → hasokon.com/games/（本番。1タグでサイト全体）

**AWSはコンソールで直接いじらない**。hasokon-infra（Terraform）にPRを出す

## コマンド

```bash
npm install
npm run dev      # http://localhost:3001（tools と同時起動できるよう3001）
npm test         # ゲームロジックのテスト
npm run build    # out/ に静的出力
```

## リリースの約束

ルートの CLAUDE.md を参照。**本番タグは運営者の承認必須**（mainへのpushまでが自律範囲）。
