# 実装の記録（hasokon-home）

hasokon.com のルートドメイン側で、何を・なぜ作ったかの記録です。
新しく機能を足したら、日付の新しい順に追記してください。

初回分（2026-08-10 時点）は git 履歴から復元したものです。
コミットメッセージから読み取れる範囲で書いているので、当時の意図と食い違う箇所があれば直してください。

---

## 2026-08-11：年収の壁 計算機を「106万円の壁」撤廃（2026年10月1日施行）に追随させた

`tools/lib/nenshu-kabe.ts` に基準日（`KabeInput.asOf`）と壁の有効期間
（`WallDef.effectiveFrom` / `effectiveUntil`）を入れ、106万円の壁に
`effectiveUntil: '2026-10-01'` を付けた。加入するかどうかの判定は
`evaluateShaho()` に切り出した。仕様は
[features/nenshu-kabe-2026-10-wall-removal.md](./features/nenshu-kabe-2026-10-wall-removal.md)。

**理由**：施行日を過ぎると、51人以上・週20時間以上で働く人に
「次の壁は106万円。あと◯万円」と出てしまい、**制度上まったく逆の行動**
（年収を抑える）に誘導していた。YMYL のページなので放置できない。

**運営者が手で切り替える運用にはしなかった**。切り替え忘れが起きるため、
暦日で自動的に切り替わるようにしている。静的書き出しのサイトなので基準日を
ビルド時刻にすると10月をまたいでも古い判定のままになる。画面を開いた日で評価する。

**昼間部の学生の適用除外は、判定ではなく注記で補うことにした**
（`DAYTIME_STUDENT_EXCLUSION_NOTE`）。適用拡大では昼間部の学生は適用除外だが、
入力の選択肢「親の扶養内・19〜22歳の学生」は昼間部かどうかまでは分からない。
ロジックで一律に除外すると、実際には加入対象である夜間部・定時制・通信制・休学中の方を
取りこぼす。断定できない情報でロジックを分岐させず、事実だけを添える。

## 2026-08-11：ポータルにGA4を入れ、本番ホスト以外への送信を止めた

`home/analytics.js`（新規）を `home/index.html`・`home/404.html` から読み込む形にして、
未計測だったポータルを計測対象にした。あわせて `tools/lib/analytics.ts`・
`games/lib/analytics.ts` に `shouldTrack()` を足し、`hasokon.com` 以外のホスト
（test.hasokon.com・localhost）では1件も送らないようにした。
仕様は [features/measurement-hygiene.md](./features/measurement-hygiene.md)。

**理由**：サイトの入口であるポータルが未計測で、離脱率も遷移先も分からなかった。
さらにGA4の30日分の page_view の3割が開発・テスト環境の分で、レポートが歪んでいた。
GA4側のフィルタではなくコードで止めているのは、管理画面の手作業がリポジトリに残らず、
開発機のIPも固定ではないため。

**ホストの判定を `isAnalyticsEnabled()` に混ぜていない**のは、これが静的書き出しの
ビルド時（`window` が無い）に評価されて gtag.js の `<script>` を出すかどうかを決めており、
ホスト条件を入れると本番のHTMLからタグごと消えてしまうため。判定は
「タグを出すか（ビルド時）」と「送ってよいか（実行時）」の2つに分けてある。

## 2026-08-11：ゲームに「フリーセル」を追加した

`games/lib/freecell.ts`（ルール）・`games/app/freecell/`（画面）・
`games/tests/freecell.test.ts`（36件）。`lib/registry.ts` と `home/index.html` の
一覧にも足した。仕様は [features/game-freecell.md](./features/game-freecell.md)。

**理由**：ソリティア・スパイダーで作った共有基盤（`lib/cards.ts`・`app/_cards/CardView.tsx`）
をそのまま使えるので、新規ゲームとしては最も安く出せる定番だった。
複数枚移動は「(空きフリーセル数 + 1) × 2 ^ (空き列数)」の上限だけを見て一度に動かしている
（1枚ずつ手で動かさせるとスマホでの操作数が多すぎるため）。
マイクロソフト版のゲーム番号は再現せず、`seededRng` を使った自前の配り番号を表示している。
解けるかどうかのソルバーは持たず、「動かせる手が1つも無い」ことの検出だけを入れた。

## 2026-08-11：GA4のページビューから `page_path` を外した

`tools/lib/analytics.ts`・`games/lib/analytics.ts` の `trackPageView()` から引数と
`page_path` を廃止し、`page_location`（`window.location.href`）だけで送るようにした。
仕様は [features/ga4-page-path.md](./features/ga4-page-path.md)。

**理由**：呼び出し元の `app/Analytics.tsx` が渡していたのは `usePathname()` の値で、
これは Next.js の仕様で basePath（`/tools`・`/games`）を取り除いたパスを返す。
GA4は `page_path` と `page_location` の両方があると `page_path` を優先するため、
ドメイン統合（2026-08-08）で basePath を設定して以降、`page_view` だけが
`/minesweeper/` のような basePath 欠けのURLで記録されていた。`page_path` は
ユニバーサルアナリティクス時代の名残で、GA4が本来見るのは `page_location` なので、
`basePath` を `lib/analytics.ts` にも書いて二重管理するより消すほうが素直。

**⚠️ 2026-08-08 から本修正が本番に出るまでの `pagePath` は信用しないこと。**
GA4に遡及変更の手段はないので、この期間を含む分析では `pagePath` ではなく
`fullPageUrl` を使う（旧データも実際のURLで読める）。同じ期間、
tools と games の `privacy`・`contact` は `/privacy/`・`/contact/` に潰れていて、
どちら側のページかは `pagePath` からは区別できない。

## 2026-08-10：検索インデックス統合の進み具合を数えるスクリプトを置いた

`scripts/gsc-canonical-audit.mjs`。サイトマップに載っている全URLを Search Console の
URL検査APIにかけ、`googleCanonical` が旧サブドメインを指したままのページを数える。
仕様は [features/search-index-consolidation.md](./features/search-index-consolidation.md)。

**理由**：仕様書の「効果の測り方」が、実施前・1週間後・4週間後に全URLの `googleCanonical` を
数え直す、というもの。手でやると86ページ分の検査を3回繰り返すことになり、
数え間違いも起きる。判定条件（legacy が0件なら完了）が機械的に書けるので、
スクリプトにして終了コードで答えさせることにした。

**依存パッケージを入れなかった理由**：このリポジトリは「ビルド工程のない素の静的HTML」で
通してきた。google-auth-library を入れれば JWT の署名は省けるが、そのために
package.json と lock ファイルと更新の面倒を抱えるのは、スクリプト1本には見合わない。
RS256 の署名1回は `node:crypto` で足りる。

**運用作業（GSCへの旧サブドメイン登録・アドレス変更ツールの実行）はまだ未実施。**
サービスアカウントは読み取り権限しか持たず、アドレス変更ツールはAPIから実行できないため、
運営者が管理画面で操作する必要がある。手順は仕様書に書いてある。

## 2026-08-08：サイトマップをインデックス化して tools / games を束ねた

`/sitemap.xml` を sitemapindex にし、`/sitemap-home.xml`・`/tools/sitemap.xml`・`/games/sitemap.xml`
の3本を参照する形にした。

**理由**：ドメイン統合で3サイトが1ドメインに乗ったため、Search Console に
サイトマップを1本送れば全ページが伝わる状態にしたかった。
tools / games は Next.js の `app/sitemap.ts` が自動生成するので、ルート側は束ねるだけにしている。

## 2026-08-08：ドメイン統合に対応（リンク相対化・robots・デプロイ保護）

`tool.hasokon.com` → `hasokon.com/tools/`、`game.hasokon.com` → `hasokon.com/games/` の統合に合わせ、
トップのリンクを相対パス（`/tools/...`）に変更した。

**理由**：サブドメインを分けていると評価が3つに分散する。1ドメインに集約したほうが
ドメイン全体の評価が積み上がる。旧ドメインは301で転送している。

## 2026-08-08：ファビコンを実ファイルにした

SVGだけでなく `favicon.ico` と `apple-touch-icon.png` を実ファイルで置いた。

**理由**：SafariとGoogle検索で SVG ファビコンが表示されないケースがあったため。

## 2026-08-08：トップを個人開発の作品リンクページとして再構成した

ツール一覧のポータルから、スマホアプリ・計算機・ゲームを並べる作品集の形に変えた。
スマホアプリのセクションを最上部に置き、全カードに絵文字アイコンを付けた。

**理由**：hasokon.com は tools / games とは役割が違い、「作った人の入口」として機能させたい。
App Store のアプリはここからしか導線がないので最上部に置いている。

## 2026-08-07：AdSense審査対策としてトップをポータル化し、プライバシーポリシーを追加した

**理由**：AdSense の審査ではサイトの実体とプライバシーポリシーが要る。
ルートドメインが単なるリダイレクトだと審査に通らない。

## 2026-08-06：Search Console の所有権確認メタタグを追加した

`index.html` の `<meta name="google-site-verification">`。

**理由**：Search Console でのインデックス状況の確認とサイトマップ送信に必要。
**このタグは確認後も削除しないこと**（消すと所有権の確認が外れる）。

## 2026-08-05：本番を S3 + CloudFront に移行し、テスト環境とタグリリースを導入した

main へのpushで test.hasokon.com（Basic認証つき）、`v*` タグのpushで本番。

**理由**：tools / games と運用方式を揃えるため。3リポジトリで同じ手順にしておくと
運用の記憶が1つで済む。本番リリースにタグを要求しているのは、
意図しない変更が本番に出るのを防ぐため（AIエージェントが勝手にタグを打たない約束もこれ）。

## 2026-08-01：hasokon.com のランディングページを追加した

ビルド工程のない素の静的HTMLで作っている。

**理由**：ページ数が少なく、更新頻度も低い。Next.js を持ち込むとビルドと依存の管理コストが
中身に見合わない。CSSも `<style>` にインラインで持たせ、ファイル1つで完結させている。

