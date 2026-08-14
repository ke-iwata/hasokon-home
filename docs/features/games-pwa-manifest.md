# ゲームの「ホーム画面に追加」対応（Webアプリマニフェスト）

**状態**：提案（未実装）
**対象**：`games/`（`hasokon.com/games/` 配下全ページ）
**起票**：2026-08-14

---

## 背景と根拠

### 最大チャネルは Direct（リピーター）なのに、再訪の導線を用意していない

GA4（Data API・直近14日・2026-08-14 取得）のチャネル別セッション：

| チャネル | 直近14日 | その前14日 |
|---|---|---|
| **Direct** | **76** | 55 |
| Organic Search | 61 | 10 |
| Unassigned | 18 | 12 |

Direct が一貫して最大チャネルで、内訳はゲーム
（マインスイーパ・スパイダー・2048・ソリティア・大富豪）が上位を占める。
つまり**このサイトのゲームは「また遊びに来る」使われ方をしている**。

ソリティアやマインスイーパのような定番ゲームは、スマホの
「ホーム画面に追加」でアプリのように起動する使い方と相性がよい。
競合の無料ゲームサイト・アプリはこの導線（またはネイティブアプリ）を
持っており、リピーターの定着で差がつく。

### 現状は manifest が無く、追加してもただのブックマークになる

`home/` にも `games/` にも Web アプリマニフェストが存在しない
（2026-08-14 リポジトリ内 grep で確認。`manifest` への参照ゼロ）。
このため現状で「ホーム画面に追加」すると：

- スタンドアロン表示（アドレスバー非表示のアプリ風起動）にならない
- Android では名前・アイコンの制御が効かず、インストール導線
  （ブラウザのメニュー表示）も出にくい
- iOS は `apple-touch-icon`（ドメイン直下に配置済み）でアイコンだけは出る

## 現状の再現手順

1. スマホの Chrome で `https://hasokon.com/games/solitaire/` を開く
2. メニュー →「ホーム画面に追加」
3. 追加されたアイコンから起動すると、通常のブラウザタブとして開く
   （スタンドアロンにならない）

## 提案する仕様

### games に manifest を追加する（Next.js の Metadata API）

- `games/app/manifest.ts` を新規作成（`MetadataRoute.Manifest`）。
  静的書き出しで `/games/manifest.webmanifest` として出力される
- 内容：
  - `name`: 「はそこん ゲーム」/ `short_name`: 「はそこんG」（文言は実装時に調整）
  - `start_url`: `/games/?utm_source=homescreen`（計測のため。下記）
  - `scope`: `/games/`
  - `display`: `standalone`
  - `background_color` / `theme_color`: games の配色（`globals.css`）に合わせる
  - `icons`: 192px / 512px の PNG（`purpose: any` と `maskable`）
- アイコン PNG は**手描きせず**、既存の `games/app/icon.svg` から
  生成スクリプトで書き出す（`design/ogp/gen-ogp.mjs` と同じ「原典はスクリプト」の流儀。
  `design/` 配下に生成スクリプトを置く）
- 各ページの `<head>` には Next.js が manifest リンクを自動で出す
  （`layout.tsx` の metadata に `manifest` を追加）

### 計測

`start_url` の `utm_source=homescreen` により、GA4 でホーム画面起動の
セッションを識別できる（`lib/analytics.ts` の本番ホスト判定はそのまま効く）。
導入効果はこのセッション数で測る。

### 触るファイル

- `games/app/manifest.ts`（新規）
- `games/app/layout.tsx`（metadata に manifest 参照を追加）
- `design/`（アイコン生成スクリプト新規）＋生成した PNG 2枚（`games/app/` 配下）
- `scripts/test/` に「manifest が書き出され、icons のファイルが実在する」テスト

## 期待される効果

| 項目 | 期待 |
|---|---|
| 再訪の摩擦 | ホーム画面から1タップでアプリ風起動。リピーター（最大チャネル）の定着 |
| 体験 | スタンドアロン表示でゲームの没入感が上がる（特にスマホ横持ちのゲーム） |
| 観測性 | `utm_source=homescreen` でホーム画面起動が数えられるようになる |

**測り方**：導入4週間後に GA4 で `utm_source=homescreen` のセッション数と、
Direct チャネルの再訪ユーザー数の推移を確認。

## 工数の見積り

| 作業 | 目安 |
|---|---|
| manifest.ts と layout の参照追加 | 30分 |
| アイコン生成スクリプト＋PNG書き出し | 1時間 |
| テストと実機確認（iOS Safari / Android Chrome） | 1時間 |
| **合計** | **約2.5時間（AIエージェント実装で 8〜15万トークン程度）** |

## やらないこと

- **Service Worker（オフライン対応・インストールプロンプト制御）**。
  静的サイトでキャッシュ事故（古いHTMLが残り続ける）のリスクが利益を上回る。
  manifest だけでも「ホーム画面に追加→スタンドアロン起動」は成立する
- **tools 側への同時導入**。ゲームほど再訪型ではないツールが多く、
  まず games で効果を計測してから判断する（タイマー・ルーレットは候補）
- **プッシュ通知**。ゲームサイトからの通知は体験を損なう。検討しない
