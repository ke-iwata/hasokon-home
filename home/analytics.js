/**
 * ポータル（hasokon.com/）のアクセス解析。
 *
 * 仕様: docs/features/measurement-hygiene.md
 * テスト: scripts/test/home-analytics.test.mjs
 *
 * index.html と 404.html の両方から読み込む。同じ処理を2枚のHTMLに直接書くと
 * 片方だけ直し忘れて必ずずれるので、1ファイルにまとめてある
 * （tools/games の lib/analytics.ts にあたるもの）。home/ はビルド工程を持たないため、
 * バンドラも型もない素のJSで書く。
 *
 * tools/games と違って React のハイドレーションが無いので、gtag の初期化を
 * そのままここで済ませられる。クライアント側ルーティングも無いので
 * send_page_view も既定（自動送信）のままでよい。
 */
var hasokonAnalytics = (function () {
  'use strict';

  /** GA4の測定ID。tools/games（lib/analytics.ts）と同じIDで1プロパティに集約している */
  var MEASUREMENT_ID = 'G-2Z0K6Y2FX0';

  /**
   * 計測を送ってよいホスト。
   * ここ以外（test.hasokon.com・localhost・file:// でのプレビュー）では1件も送らない。
   * GA4の30日分の page_view の3割が開発・テスト環境で、レポートが歪んでいたため。
   */
  var MEASURED_HOST = 'hasokon.com';

  /** ポータルから出ていく先のうち、App Store のアプリを指すホスト */
  var APPSTORE_HOST = 'apps.apple.com';

  /**
   * リンク先から `portal_click` の destination を決める。
   *
   * ポータルは「並んでいるものから1つ選ぶ」ページなので、**どのカードが押されたか**が
   * そのまま並び順と文言の良し悪しになる。押されないカードを数字で見つけるための値。
   *
   * @param {string} href リンクのURL（相対でも絶対でもよい）
   * @returns {string|null} `tools` / `games` / `appstore` / `tool-<slug>` / `game-<slug>`。
   *   計測対象でないリンク（プライバシーポリシー・問い合わせフォームなど）は null
   */
  function portalDestination(href) {
    if (!href) return null;

    var url;
    try {
      // 相対リンク（/tools/ など）を解決するための基準。判定はパスだけを見る
      url = new URL(href, 'https://' + MEASURED_HOST + '/');
    } catch (e) {
      return null;
    }

    if (url.hostname === APPSTORE_HOST) return 'appstore';
    // 外部リンク（問い合わせフォームなど）は数えない
    if (url.hostname !== MEASURED_HOST) return null;

    var segments = url.pathname.split('/').filter(Boolean);
    var section = segments[0];
    if (section !== 'tools' && section !== 'games') return null;

    // /tools/ ・/games/ そのもの（ヒーローの2ボタン）
    if (segments.length === 1) return section;

    return (section === 'tools' ? 'tool-' : 'game-') + segments[1];
  }

  /** そのホストで計測を送ってよいか */
  function shouldTrack(hostname) {
    return hostname === MEASURED_HOST;
  }

  /**
   * gtag の初期化とクリック計測の登録。
   *
   * gtag.js の <script> はHTML側にあり、ホストによらず読み込まれる。
   * ここで `config` を呼ばなければ送信先が決まらないので、本番以外では
   * ページビューもイベントも1件も送られない。
   *
   * @param {Window} win 対象のwindow（テストから差し替えられるように引数で受ける）
   */
  function init(win) {
    if (!shouldTrack(win.location.hostname)) return;

    win.dataLayer = win.dataLayer || [];
    // gtag.js が既に本物を入れていればそれを使う。まだならキューに積むだけの関数を置く
    if (!win.gtag) {
      win.gtag = function () {
        // gtag は arguments オブジェクトをそのまま積む仕様（配列だと解釈されない）
        win.dataLayer.push(arguments);
      };
    }
    win.gtag('js', new Date());
    win.gtag('config', MEASUREMENT_ID);

    trackPortalClicks(win);
  }

  /**
   * ポータルのリンククリックを `portal_click` イベントで送る。
   *
   * リンクごとに属性を付けるのではなく document 側で1回だけ受けている。
   * カードを増やしたときにHTML側で計測用の記述を足す必要がなくなるため
   * （足し忘れたカードだけ数字が0になる、という壊れ方をしない）。
   */
  function trackPortalClicks(win) {
    win.document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;

      var link = target.closest('a[href]');
      if (!link) return;

      var destination = portalDestination(link.getAttribute('href'));
      if (!destination) return;

      // 遷移でページが破棄されても送信は sendBeacon で完了する（gtag の既定）
      win.gtag('event', 'portal_click', { destination: destination });
    });
  }

  return {
    MEASUREMENT_ID: MEASUREMENT_ID,
    MEASURED_HOST: MEASURED_HOST,
    portalDestination: portalDestination,
    shouldTrack: shouldTrack,
    init: init,
  };
})();

// ブラウザで読み込まれたときだけ動く。テストは init を明示的に呼ぶ
if (typeof window !== 'undefined') {
  hasokonAnalytics.init(window);
}
