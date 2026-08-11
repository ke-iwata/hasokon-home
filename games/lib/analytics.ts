/**
 * Google Analytics 4 の設定
 *
 * 測定IDをここだけで管理する。ページのHTMLに出る公開情報なので、
 * 環境変数や Secrets にする必要はない（lib/adsense.ts と同じ考え方）。
 *
 * 【設定手順】
 * 1. Googleアナリティクスで「データストリーム」を作る（ウェブ／https://game.hasokon.com）
 * 2. 発行された測定ID（G-から始まる）を下の GA_MEASUREMENT_ID に貼る
 * 3. hasokon.com（ルートドメイン）も同じIDで計測するなら、
 *    tool.hasokon.com と同じストリームで計測している。
 *    サイト別に見るときはGA4のレポートでホスト名で絞り込む
 *
 * GA_MEASUREMENT_ID が空の間は、スクリプトも計測処理も一切出力されない。
 * 未設定のままデプロイしても害はない。
 */

/** GA4の測定ID（例: 'G-XXXXXXXXXX'）。空なら計測しない */
export const GA_MEASUREMENT_ID = 'G-2Z0K6Y2FX0';

/** 計測が有効か */
export function isAnalyticsEnabled(): boolean {
  return GA_MEASUREMENT_ID.startsWith('G-');
}

/**
 * gtag の型。GA4のスクリプトが window に生やす関数。
 * 読み込み前・未設定のときは存在しないので、呼ぶ側で必ず存在確認する。
 */
type Gtag = (command: string, ...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
    dataLayer?: IArguments[];
  }
}

/** gtag が使えるなら返す。使えなければ undefined */
function gtag(): Gtag | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.gtag;
}

/** 初期化済みかどうか。React StrictMode で effect が2回走っても二重に設定しない */
let initialized = false;

/**
 * gtag の初期化。
 *
 * 一般的なGA4のスニペットは `<head>` にインラインの <script> を置くが、
 * このサイトではそれをしていない。AdSense のスクリプトが実行時に
 * `<head>` へ別の <script> を差し込むため、Reactがハイドレーション時に
 * 自前のインラインscriptと突き合わせて食い違いを起こすからである
 * （React が「一致しない」と判断すると描画をやり直し、表示が遅くなる）。
 *
 * `<script async src>` は React 19 が hoistable として個別に扱うので
 * `<head>` に置いたままで問題ない。初期化だけをここに移している。
 *
 * dataLayer 経由で積むので、gtag.js の読み込みが先でも後でも取りこぼさない。
 */
export function initAnalytics(): void {
  if (initialized || !isAnalyticsEnabled() || typeof window === 'undefined') return;
  initialized = true;
  window.dataLayer = window.dataLayer || [];
  // gtag.js が既に本物を入れていればそれを使う。まだならキューに積むだけの関数を置く
  if (!window.gtag) {
    window.gtag = function (...args: unknown[]) {
      // gtag は arguments オブジェクトをそのまま積む仕様（配列だと解釈されない）
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    } as Gtag;
  }
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false });
}

/**
 * ページビューを送る。
 *
 * このサイトは静的書き出しだが、ページ間の移動は next/link による
 * クライアント側のルーティングで、通常のページ読み込みが発生しない。
 * そのため gtag の自動送信は切って（send_page_view: false）、
 * ここから明示的に送っている（app/Analytics.tsx）。
 *
 * **page_path は渡さない。** GA4が本来見るのは page_location で、page_path は
 * ユニバーサルアナリティクス時代の名残だが、両方あるとGA4は page_path を優先して
 * ページのURLを組み立ててしまう。呼び出し元の app/Analytics.tsx が持っているのは
 * `usePathname()` の値で、これは basePath（/tools・/games）を取り除いたパスなので
 * （Next.js の仕様）、渡すと実際のURLと食い違う。ドメイン統合で basePath を
 * 設定した 2026-08-08 以降、page_view だけが `/minesweeper/` のような
 * basePath 欠けのURLで記録されていた（docs/features/ga4-page-path.md）。
 * page_location（window.location.href）だけを渡せば常に実際のURLになる。
 */
export function trackPageView(): void {
  gtag()?.('event', 'page_view', {
    page_location: window.location.href,
    page_title: document.title,
  });
}

/**
 * 操作イベントを送る。
 *
 * ページビューだけでは「開かれたが使われなかった」ページが分からないため、
 * 各ツールの主要な操作（ルーレットを回す・サイコロを振るなど）で呼んでいる。
 * GA4の管理画面では「イベント」に tool_use などの名前で集計される。
 *
 * @param name イベント名（GA4の規約に合わせて英小文字とアンダースコアのみ）
 * @param params 付随する情報。tool にツールのslugを入れて絞り込めるようにする
 */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  gtag()?.('event', name, params);
}

/**
 * ツールが実際に使われたことを記録する。
 * どのツールがどれだけ使われているかを比べられるよう、イベント名は共通にして
 * ツール名をパラメータで渡している。
 *
 * @param tool ツールのslug（例: 'roulette'）
 * @param action 操作の種類（例: 'spin'）
 */
export function trackToolUse(tool: string, action: string): void {
  trackEvent('tool_use', { tool, action });
}
