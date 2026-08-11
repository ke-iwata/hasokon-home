/**
 * Google Analytics 4 の設定
 *
 * 測定IDをここだけで管理する。ページのHTMLに出る公開情報なので、
 * 環境変数や Secrets にする必要はない（lib/adsense.ts と同じ考え方）。
 *
 * 測定IDは設定済み。games と同じIDで、ドメイン統合後は1プロパティで計測している。
 * tools だけを見るときは、GA4のレポートでページパス（/tools/）で絞り込む。
 * ルートドメイン側（home/index.html・404.html）にも同じ測定IDのタグが入っている
 * （実装は home/analytics.js。ホストの判定条件もここと揃えること）。
 *
 * GA_MEASUREMENT_ID を空にすると、スクリプトも計測処理も一切出力されなくなる。
 *
 * 判定が2つあるのは、**効くタイミングが違う**ため（docs/features/measurement-hygiene.md）。
 * - `isAnalyticsEnabled()`：測定IDが設定されているか。**静的書き出しのビルド時**に評価され、
 *   gtag.js の <script> をHTMLに出すかどうかを決める（app/layout.tsx）
 * - `shouldTrack()`：いま送ってよいか。**ブラウザ**で評価され、本番ホスト以外では送らない
 *
 * ビルド時には window が無いので、`isAnalyticsEnabled()` にホスト条件を混ぜてはいけない。
 * 混ぜると静的HTMLから gtag.js のタグごと消え、本番でも計測できなくなる。
 */

/** GA4の測定ID（例: 'G-XXXXXXXXXX'）。空なら計測しない */
export const GA_MEASUREMENT_ID = 'G-2Z0K6Y2FX0';

/**
 * 計測を送ってよいホスト。
 * ここ以外（test.hasokon.com・localhost・プレビュー）では1件も送らない。
 * GA4の30日分の page_view の3割が開発・テスト環境で、レポートが歪んでいたため
 * （docs/features/measurement-hygiene.md の実測）。
 */
export const MEASURED_HOST = 'hasokon.com';

/** 計測が設定されているか（測定IDの有無だけを見るビルド時の判定） */
export function isAnalyticsEnabled(): boolean {
  return GA_MEASUREMENT_ID.startsWith('G-');
}

/**
 * いま計測を送ってよいか（ブラウザで評価される実行時の判定）。
 *
 * GA4側のフィルタではなくコードで止めているのは、管理画面での手作業がリポジトリに
 * 残らないうえ、開発機のIPが固定でないため（docs/features/measurement-hygiene.md）。
 */
export function shouldTrack(): boolean {
  if (!isAnalyticsEnabled()) return false;
  // 静的書き出しのビルド時。実際の送信はブラウザでしか起きない
  if (typeof window === 'undefined') return false;
  return window.location.hostname === MEASURED_HOST;
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

/**
 * gtag が使えて、かつ送ってよいホストなら返す。それ以外は undefined。
 *
 * gtag.js の <script> は本番以外のホストにも出るので、そこで読み込まれた
 * `window.gtag` がそのまま使えてしまう。送信経路をこの1か所に通すことで、
 * trackPageView / trackEvent / trackToolUse のすべてがホスト条件に従う。
 */
function gtag(): Gtag | undefined {
  if (!shouldTrack()) return undefined;
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
  if (initialized || !shouldTrack()) return;
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
