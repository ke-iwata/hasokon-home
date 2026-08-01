/**
 * Google Analytics 4 の設定
 *
 * 測定IDをここだけで管理する。ページのHTMLに出る公開情報なので、
 * 環境変数や Secrets にする必要はない（lib/adsense.ts と同じ考え方）。
 *
 * 【設定手順】
 * 1. Googleアナリティクスで「データストリーム」を作る（ウェブ／https://tool.hasokon.com）
 * 2. 発行された測定ID（G-から始まる）を下の GA_MEASUREMENT_ID に貼る
 * 3. hasokon.com（ルートドメイン）も同じIDで計測するなら、
 *    hasokon-home リポジトリの index.html / 404.html にも同じタグを入れる
 *
 * GA_MEASUREMENT_ID が空の間は、スクリプトも計測処理も一切出力されない。
 * 未設定のままデプロイしても害はない。
 */

/** GA4の測定ID（例: 'G-XXXXXXXXXX'）。空なら計測しない */
export const GA_MEASUREMENT_ID = '';

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
  }
}

/** gtag が使えるなら返す。使えなければ undefined */
function gtag(): Gtag | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.gtag;
}

/**
 * ページビューを送る。
 *
 * このサイトは静的書き出しだが、ページ間の移動は next/link による
 * クライアント側のルーティングで、通常のページ読み込みが発生しない。
 * そのため gtag の自動送信は切って（send_page_view: false）、
 * ここから明示的に送っている（app/Analytics.tsx）。
 */
export function trackPageView(path: string): void {
  gtag()?.('event', 'page_view', {
    page_path: path,
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
