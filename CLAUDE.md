# CLAUDE.md

hasokon.com（ルートドメイン）の案内ページ。ビルド工程のない素の静的HTML。
インフラと運用は [hasokon-tools](https://github.com/ke-iwata/hasokon-tools) と同じ方式
（S3 + CloudFront、main→テスト環境 / v*タグ→本番）。

## リリースの約束

**本番へのリリース（v* タグのpush）は運営者の承認が必要。AIエージェントは勝手にタグを打たないこと。**

1. main への push（テスト環境への反映）までは自律的に行ってよい
2. テスト環境のURL（https://test.hasokon.com/）と確認ポイントを運営者に提示する
3. 運営者の承認を得てからタグを打つ（運営者が自分で打つ場合もある）

テスト環境の Basic認証: hasokon / preview2026

## 注意

- ads.txt は AdSense 用。tool/game 側の lib/adsense.ts と内容を揃えること
- index.html / 404.html のサイト一覧は、サイトを増やしたら両方更新する
