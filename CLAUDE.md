# CLAUDE.md

hasokon.com のモノレポで作業するAIエージェント・開発者向けのガイドです。
2026年8月に hasokon-tools / hasokon-games を統合しました（旧リポジトリはアーカイブ済み。
全履歴はこのリポジトリに取り込んであります）。

## 構成

```
home/    hasokon.com のポータル（素の静的HTML。ビルドなし）
tools/   hasokon.com/tools/  無料計算ツール集（Next.js静的エクスポート）→ tools/CLAUDE.md
games/   hasokon.com/games/  無料ミニゲーム集（Next.js静的エクスポート）→ games/CLAUDE.md
docs/    サイト横断のドキュメント（tools/games 固有の docs は各ディレクトリ配下）
infra/   ポインタのみ。AWSは hasokon-infra リポジトリ（Terraform）で管理
```

- tools / games で作業するときは、それぞれの `CLAUDE.md` に従う。
  npmコマンドはすべて各ディレクトリ内で実行する（ルートに package.json はない）
- **home/ はS3バケット直下にそのまま同期される。** サイトの成果物以外
  （開発用ドキュメント・設定ファイル）を home/ に置かないこと

## デプロイ

`.github/workflows/deploy.yml` が home + tools + games をまとめて扱う:

- main にマージ → **test.hasokon.com**（Basic認証つきテスト環境）
- `v*` タグを push → **hasokon.com**（本番）。1つのタグでサイト全体がリリースされる

同期先は S3 バケット（hasokon-com / hasokon-com-test）で、
home/ → バケット直下、tools/out/ → tools/、games/out/ → games/。
CloudFront・証明書・IAMロールは [hasokon-infra](https://github.com/ke-iwata/hasokon-infra)
（Terraform）で一元管理。コンソールで直接いじらず、hasokon-infra にPRを出す。

## コミット・PRタイトルの約束

- `docs:` プレフィックスは、**変更が docs/ 配下（機能提案・実装の記録など）だけに
  収まる場合にのみ**使う。CLAUDE.md・コード内コメント・README の修正を含むときは
  `docs:` にしない（整理・雑務なら `chore:`、機能追加なら `feat:`、修正なら `fix:`）

## docs更新とコンフリクトの約束（並走ブランチ対策）

機能実装が並走しても docs がコンフリクトしないための運用。
詳細は [docs/README.md](./docs/README.md) の「並走ブランチとコンフリクトの約束」。

- **DECISIONS.md（ルート・tools・games）は union マージ**（`.gitattributes`）。
  新しいエントリは冒頭の `---` 直下に**1つの自己完結したブロック**として足し、
  **既存エントリの本文を同じPRで書き換えない**（unionは行単位で黙って統合するため）。
  マージ後にエントリの順序がずれていたら手で直してよい
- **docs/features/README.md に一覧・状態の表を復活させない**。状態は各仕様書冒頭の
  `**状態**：` 行だけで管理し、仕様書の追加・更新で README は触らない

## リリースの約束

**本番へのリリース（v* タグ）は運営者の承認が必要。AIエージェントは自発的にリリースしないこと。**

1. main への push（テスト環境への反映）までは自律的に行ってよい
2. テスト環境のURLと確認ポイントを運営者に提示する
3. 運営者の明示的な指示（「リリースして」等）を得てから、Actions の
   `release.yml` を起動する。バージョンを渡すと、タグ作成 → GitHub Release公開 →
   本番デプロイまで自動で行われる（運営者が自分でタグを打ってもよい）
4. AIエージェントのgit認証はブランチのpushのみでタグを直接pushできない。
   リリースは必ず `release.yml` か運営者の手で行う

テスト環境の Basic認証: hasokon / preview2026

## home/ の注意

- ads.txt は AdSense 用。tools/games 側の `lib/adsense.ts` と内容を揃えること
- GA4のタグは `index.html` / `404.html` の2枚に入っていて、中身は `analytics.js` に集約。
  測定IDと送信先ホスト（`hasokon.com`）は tools/games の `lib/analytics.ts` と揃えること
  （`scripts/test/home-analytics.test.mjs` がずれを検知する）。
  仕様は [docs/features/measurement-hygiene.md](./docs/features/measurement-hygiene.md)
- `index.html` / `404.html` のサイト一覧は、ツールやゲームを増やしたら両方更新する
- `sitemap.xml` はインデックス形式で home / tools / games の3本を指す。
  home のページを増やしたら `sitemap-home.xml` を更新する
- ファビコン（favicon.ico / icon.svg / apple-touch-icon.png）はドメイン直下に置いてあり、
  tools/games のページもブラウザのフォールバックでこれを使う
