# GA4のページパスから basePath が欠けている問題を直す

**状態**：提案。未実装
**対象**：`tools/lib/analytics.ts`・`games/lib/analytics.ts`（home/ は素のHTMLなので対象外）
**起票**：2026-08-10

---

## 背景と根拠

2026-08-10 に GA4 Data API（プロパティ `properties/548154955`）で計測データを確認したところ、
**同じページのアクセスが、GA4の中で2つの別々のURLとして記録されていた**。

### 計測値（2026-08-10 取得 / GA4 Data API `runReport`）

ディメンション `fullPageUrl` × `eventName`、期間 2026-08-08〜2026-08-09
（ドメイン統合が本番に出た当日以降）。ホスト名 `hasokon.com` の分だけを抜き出す。

| GA4に記録されたURL | イベント | 回数 | 実際のページ |
|---|---|---|---|
| `hasokon.com/minesweeper/` | page_view | 3 | `hasokon.com/games/minesweeper/` |
| `hasokon.com/games/minesweeper/` | user_engagement | 2 | 同上 |
| `hasokon.com/hebon-romaji/` | page_view | 3 | `hasokon.com/tools/hebon-romaji/` |
| `hasokon.com/tools/hebon-romaji/` | user_engagement | 3 | 同上 |
| `hasokon.com/tools/hebon-romaji/` | scroll | 1 | 同上 |
| `hasokon.com/nenshu-kabe/` | page_view | 2 | `hasokon.com/tools/nenshu-kabe/` |
| `hasokon.com/tools/nenshu-kabe/` | user_engagement | 2 | 同上 |
| `hasokon.com/roulette/` | page_view | 3 | `hasokon.com/tools/roulette/` |
| `hasokon.com/tools/roulette/` | user_engagement | 1 | 同上 |
| `hasokon.com/about/` | page_view | 4 | `hasokon.com/tools/about/` |
| `hasokon.com/tools/about/` | user_engagement | 2 | 同上 |

**`page_view` だけが `/games/`・`/tools/` の付かないパスで記録され、
GA4が自動で送る `user_engagement`・`scroll`・`session_start` は正しいURLで記録されている。**

### 原因

`app/Analytics.tsx` が `usePathname()` の戻り値をそのまま `trackPageView()` に渡している。

```tsx
// tools/app/Analytics.tsx, games/app/Analytics.tsx（内容は同一）
const pathname = usePathname();
useEffect(() => {
  initAnalytics();
  trackPageView(pathname);   // ← ここ
}, [pathname]);
```

```ts
// tools/lib/analytics.ts, games/lib/analytics.ts
export function trackPageView(path: string): void {
  gtag()?.('event', 'page_view', {
    page_path: path,                       // ← basePath が欠けた値
    page_location: window.location.href,   // ← こちらは正しい
    page_title: document.title,
  });
}
```

**`usePathname()` は basePath を取り除いたパスを返す**（Next.js の仕様）。
`next.config.ts` で `basePath: '/tools'` / `basePath: '/games'` を設定しているため、
`hasokon.com/games/minesweeper/` を開いても `usePathname()` は `/minesweeper/` を返す。

`page_location` には正しいURLを渡しているが、`page_path` が同時にあると
GA4は `page_path` 側を採用してページのURLを組み立てる。上の計測値の食い違いは
これで説明がつく（`page_view` だけがずれ、gtagが自前で送るイベントはずれない）。

**ドメイン統合（2026-08-08）までは basePath が無く、`usePathname()` の値がそのまま
正しいパスだったため、この不整合は起きていなかった。統合で初めて表面化した。**

## 現状

### 何が壊れているか

1. **ページ単位の指標がどれも読めない。**
   「表示回数」は `/minesweeper/` に、「平均エンゲージメント時間」「スクロール率」は
   `/games/minesweeper/` に別々に積まれる。GA4の標準レポート「ページとスクリーン」を開くと、
   1ページが2行に割れ、どちらの行も片方の指標が0になる。

2. **tools と games の同名ページが1行に混ざる。**
   basePath を落とすと、次の4ページが2組に潰れる。

   | 実際のURL | GA4上のパス |
   |---|---|
   | `hasokon.com/tools/privacy/` | `/privacy/` |
   | `hasokon.com/games/privacy/` | `/privacy/` |
   | `hasokon.com/tools/contact/` | `/contact/` |
   | `hasokon.com/games/contact/` | `/contact/` |

   実際、直近28日の `pagePath` レポートには `/privacy/` が1行（6表示）しかなく、
   ツール側とゲーム側のどちらが見られたのか分けられない。

3. **旧サブドメイン時代のデータと見分けが付かない。**
   `game.hasokon.com/minesweeper/`（統合前）と `hasokon.com/games/minesweeper/`（統合後）が
   `pagePath` では同じ `/minesweeper/` になる。ホスト名で絞れば分けられるが、
   標準レポートは `pagePath` 基準なので、統合の前後比較がそのままでは取れない。

### 再現手順

1. `hasokon.com/games/minesweeper/` をブラウザで開く
2. DevTools の Network で `google-analytics.com/g/collect` へのリクエストを見る
3. `page_view` の `dp`（page_path）が `/minesweeper/` になっている
4. 数秒後に飛ぶ `user_engagement` は `dl`（page_location）が `/games/minesweeper/` のまま

## 提案する仕様

### 変更内容

`trackPageView()` から `page_path` を落とし、`page_location` だけで送る。

```ts
// tools/lib/analytics.ts, games/lib/analytics.ts
/**
 * ページビューを送る。
 *
 * GA4が見るのは page_location で、page_path はUA時代の名残。
 * 両方あると page_path が優先されるが、Analytics.tsx が渡す usePathname() の値は
 * basePath（/tools・/games）が取り除かれたパスなので、渡すと実際のURLと食い違う。
 * page_location（window.location.href）だけを渡せば常に実際のURLになる。
 */
export function trackPageView(): void {
  gtag()?.('event', 'page_view', {
    page_location: window.location.href,
    page_title: document.title,
  });
}
```

`app/Analytics.tsx` は `usePathname()` を「パスが変わったことを検知する」ためだけに使い、
値は渡さない。

```tsx
const pathname = usePathname();
useEffect(() => {
  if (!isAnalyticsEnabled()) return;
  initAnalytics();
  trackPageView();
}, [pathname]);
```

`usePathname()` は URL が history に積まれたあとに変化するため、
effect の中の `window.location.href` は移動後のURLになっている。

### 触るファイル

| ファイル | 変更 |
|---|---|
| `tools/lib/analytics.ts` | `trackPageView` の引数を廃止し `page_path` を送らない |
| `games/lib/analytics.ts` | 同上 |
| `tools/app/Analytics.tsx` | `trackPageView()` を引数なしで呼ぶ |
| `games/app/Analytics.tsx` | 同上 |
| `tools/tests/analytics.test.ts`（新規） | `page_path` を送らないこと・`page_location` を送ることのテスト |
| `games/tests/analytics.test.ts`（新規） | 同上 |

### GA4側の後始末

コードを直しても、**2026-08-08〜修正日までのデータは壊れたまま**残る。
遡って直す手段はGA4に無いので、次のどちらかで運用する。

- 探索レポートでは `pagePath` ではなく `fullPageUrl` を使う（旧データも正しいURLで見られる）
- DECISIONS.md に「◯月◯日以前の pagePath は basePath 欠けのため信用しない」と書き残す

## 期待される効果

**直接の集客効果は無い。これは計測を直す変更で、効果は「今後の判断材料が使えるようになる」こと。**

- ページ単位の「表示回数 × 平均エンゲージメント時間」が1行で読めるようになる。
  いまはこれが割れているため、**どのツールが読まれて、どのツールが直帰しているのかが判定できない**。
  ツールの改善対象を選ぶ根拠が無い状態が続いている
- tools / games の privacy・contact が分離し、問い合わせ導線がどちら側から使われているか分かる
- 検索インデックス統合（[search-index-consolidation.md](./search-index-consolidation.md)）の効果を
  GA4側からも前後比較できるようになる

**測り方**：修正をデプロイした翌日に GA4 Data API で
`fullPageUrl` × `eventName` を取り、`page_view` と `user_engagement` が
同じURLに載っていることを確認する。上の計測値と同じクエリで再取得すればよい。

## 工数の見積り

| 作業 | 目安 |
|---|---|
| `lib/analytics.ts` × 2 の修正 | 15分 |
| `app/Analytics.tsx` × 2 の修正 | 10分 |
| テスト追加 × 2 | 30分 |
| テスト環境で `g/collect` を実機確認 | 20分 |
| 合計 | **1〜1.5時間**（AIエージェントに任せる場合の消費トークンは 15k〜25k 程度） |

## やらないこと

- **`page_path` に basePath を足す案**は採らない。
  `basePath` の値を `lib/analytics.ts` にもう一度書くことになり、`next.config.ts` と
  二重管理になる。GA4が本来見るのは `page_location` なので、`page_path` を消すほうが素直
- **`window.location.pathname` を `trackPageView` に渡す案**も採らない。
  クエリ文字列とハッシュが落ちる。`page_location` に `href` を丸ごと渡せば済む
- **GA4のデータストリームを tools / games / home で分ける**のはやらない。
  1プロパティのまま `hostName` と `fullPageUrl` で分けられるし、
  分けるとサイト横断の回遊（トップ → ツール → ゲーム）が追えなくなる
- **過去データの補正**はしない。GA4に遡及変更の手段が無い
