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

## リリースの約束

**本番へのリリース（v* タグのpush）は運営者の承認が必要。AIエージェントは勝手にタグを打たないこと。**

1. main への push（テスト環境への反映）までは自律的に行ってよい
2. テスト環境のURLと確認ポイントを運営者に提示する
3. 運営者の承認を得てからタグを打つ（運営者が自分で打つ場合もある）
4. タグを打ってからリリースもpublishする

テスト環境の Basic認証: hasokon / preview2026

## home/ の注意

- ads.txt は AdSense 用。tools/games 側の `lib/adsense.ts` と内容を揃えること
- `index.html` / `404.html` のサイト一覧は、ツールやゲームを増やしたら両方更新する
- `sitemap.xml` はインデックス形式で home / tools / games の3本を指す。
  home のページを増やしたら `sitemap-home.xml` を更新する
- ファビコン（favicon.ico / icon.svg / apple-touch-icon.png）はドメイン直下に置いてあり、
  tools/games のページもブラウザのフォールバックでこれを使う
