import { afterEach, describe, expect, it } from 'vitest';
import {
  GA_MEASUREMENT_ID,
  MEASURED_HOST,
  initAnalytics,
  isAnalyticsEnabled,
  shouldTrack,
  trackEvent,
  trackPageView,
  trackToolUse,
} from '@/lib/analytics';

/**
 * lib/analytics.ts のテスト。
 *
 * 見張っているのは2つ。
 *
 * 1. **page_view に page_path を混ぜないこと**。両方渡すとGA4は page_path を優先して
 *    URLを組み立てるが、呼び出し元が持っている `usePathname()` の値は basePath（/games）が
 *    取り除かれたパスなので、実際のURLと食い違う（docs/features/ga4-page-path.md）
 * 2. **本番ホスト以外へ1件も送らないこと**。game.test.hasokon.com と localhost の分が
 *    GA4のレポートの3割を占めて数字が使えなくなっていた
 *    （docs/features/measurement-hygiene.md）
 *
 * このリポジトリの vitest は jsdom を入れていないので、window / document は
 * 最小限のスタブを globalThis に置いて、gtag の呼び出し内容を記録する。
 */

/** gtag に渡された引数（'event' / イベント名 / パラメータ） */
type GtagCall = [command: string, name: string, params?: Record<string, unknown>];

const globals = globalThis as unknown as { window?: unknown; document?: unknown };

let calls: GtagCall[] = [];

/** gtag が使えるブラウザ環境を模す。hostname は href から取る（実物と食い違わせない） */
function stubBrowser(href: string, title = 'テストページ'): void {
  calls = [];
  globals.window = {
    location: { href, hostname: new URL(href).hostname },
    gtag: (...args: GtagCall) => {
      calls.push(args);
    },
  };
  globals.document = { title };
}

/** 直近の page_view のパラメータを取り出す */
function lastPageViewParams(): Record<string, unknown> {
  const call = calls.findLast((c) => c[0] === 'event' && c[1] === 'page_view');
  expect(call, 'page_view が送られていない').toBeDefined();
  return call![2] ?? {};
}

afterEach(() => {
  delete globals.window;
  delete globals.document;
  calls = [];
});

describe('trackPageView', () => {
  it('page_path を送らない（basePath 欠けのパスがGA4に載るのを防ぐ）', () => {
    stubBrowser('https://hasokon.com/games/minesweeper/');
    trackPageView();

    expect(lastPageViewParams()).not.toHaveProperty('page_path');
  });

  it('page_location に basePath 込みの実際のURLを送る', () => {
    stubBrowser('https://hasokon.com/games/minesweeper/');
    trackPageView();

    expect(lastPageViewParams().page_location).toBe('https://hasokon.com/games/minesweeper/');
  });

  it('page_title に document.title を送る', () => {
    stubBrowser('https://hasokon.com/games/klondike/', 'クロンダイク | はそこん');
    trackPageView();

    expect(lastPageViewParams().page_title).toBe('クロンダイク | はそこん');
  });

  it('送るのは page_location と page_title だけ', () => {
    stubBrowser('https://hasokon.com/games/2048/');
    trackPageView();

    expect(Object.keys(lastPageViewParams()).sort()).toEqual(['page_location', 'page_title']);
  });

  it('クエリ文字列とハッシュも落とさない（href をそのまま渡すため）', () => {
    stubBrowser('https://hasokon.com/games/nanpre/?utm_source=x#board');
    trackPageView();

    expect(lastPageViewParams().page_location).toBe(
      'https://hasokon.com/games/nanpre/?utm_source=x#board',
    );
  });

  it('回帰: /games/ の付かないパスがGA4に記録されない', () => {
    // 修正前は page_path に usePathname() の値（'/minesweeper/'）が入り、
    // GA4上で page_view だけが別URLとして記録されていた
    stubBrowser('https://hasokon.com/games/minesweeper/');
    trackPageView();

    const values = Object.values(lastPageViewParams()).filter(
      (v): v is string => typeof v === 'string',
    );
    expect(values.some((v) => v.startsWith('/'))).toBe(false);
    for (const value of values) {
      expect(value).not.toBe('/minesweeper/');
    }
  });

  it('イベント名は page_view', () => {
    stubBrowser('https://hasokon.com/games/');
    trackPageView();

    expect(calls[0]?.[0]).toBe('event');
    expect(calls[0]?.[1]).toBe('page_view');
  });

  it('gtag がまだ無いときは何もしない（読み込み前でも落ちない）', () => {
    calls = [];
    globals.window = { location: { href: 'https://hasokon.com/games/', hostname: 'hasokon.com' } };
    globals.document = { title: 'テストページ' };

    expect(() => trackPageView()).not.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('window が無いとき（サーバー側）は何もしない', () => {
    calls = [];
    delete globals.window;
    delete globals.document;

    expect(() => trackPageView()).not.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('trackEvent / trackToolUse', () => {
  it('trackEvent はイベント名とパラメータをそのまま渡す', () => {
    stubBrowser('https://hasokon.com/games/minesweeper/');
    trackEvent('tool_use', { tool: 'minesweeper', action: 'start' });

    expect(calls).toEqual([['event', 'tool_use', { tool: 'minesweeper', action: 'start' }]]);
  });

  it('trackToolUse は tool_use イベントとして送る', () => {
    stubBrowser('https://hasokon.com/games/breakout/');
    trackToolUse('breakout', 'start');

    expect(calls).toEqual([['event', 'tool_use', { tool: 'breakout', action: 'start' }]]);
  });

  it('gtag が無いときは何もしない', () => {
    calls = [];
    globals.window = { location: { href: 'https://hasokon.com/games/', hostname: 'hasokon.com' } };

    expect(() => trackToolUse('breakout', 'start')).not.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('送信先ホストの判定', () => {
  it('本番ホストなら送る', () => {
    stubBrowser('https://hasokon.com/games/');

    expect(shouldTrack()).toBe(true);
  });

  it.each([
    ['https://test.hasokon.com/games/', 'テスト環境'],
    ['http://localhost:3001/games/', 'ローカル開発'],
    ['http://127.0.0.1:3001/games/', 'ローカル開発（IP）'],
    ['https://game.hasokon.com/minesweeper/', '旧サブドメイン'],
    ['https://game.test.hasokon.com/minesweeper/', '旧サブドメインのテスト環境'],
  ])('%s（%s）では送らない', (href) => {
    stubBrowser(href);

    expect(shouldTrack()).toBe(false);
  });

  it('window が無いビルド時は送らない', () => {
    delete globals.window;

    expect(shouldTrack()).toBe(false);
  });

  it.each([
    ['trackPageView', () => trackPageView()],
    ['trackEvent', () => trackEvent('tool_use', { tool: 'minesweeper' })],
    ['trackToolUse', () => trackToolUse('minesweeper', 'start')],
    ['initAnalytics', () => initAnalytics()],
  ])('本番以外では %s が1件も送らない', (_name, send) => {
    // gtag.js の <script> は本番以外にも出るので、window.gtag は存在しうる。
    // それでも送らないことをここで担保する。
    // なお本番以外の initAnalytics は初期化済みフラグを立てずに戻るので、
    // 後段の「設定」の initAnalytics（ファイル内で唯一の実行）を潰さない
    stubBrowser('https://game.test.hasokon.com/minesweeper/');

    send();

    expect(calls).toHaveLength(0);
  });

  it('gtag.js のタグを出すかどうか（isAnalyticsEnabled）はホストを見ない', () => {
    // ここにホスト条件を混ぜると、静的書き出しのビルド時（window なし）に false になり、
    // 本番のHTMLからも gtag.js のタグが消えてしまう
    stubBrowser('https://test.hasokon.com/games/');
    expect(isAnalyticsEnabled()).toBe(true);

    delete globals.window;
    expect(isAnalyticsEnabled()).toBe(true);
  });

  it('計測するホストは1つだけ（home/analytics.js と揃える）', () => {
    expect(MEASURED_HOST).toBe('hasokon.com');
  });
});

describe('設定', () => {
  it('測定IDが設定されていれば計測が有効', () => {
    expect(GA_MEASUREMENT_ID.startsWith('G-')).toBe(true);
    expect(isAnalyticsEnabled()).toBe(true);
  });

  // initAnalytics はモジュール内のフラグで一度しか走らないので、このテストは
  // ファイル内で唯一の initAnalytics 呼び出しであることを前提にしている
  it('initAnalytics は send_page_view を切る（ページビューは trackPageView に一本化）', () => {
    stubBrowser('https://hasokon.com/games/');
    initAnalytics();

    const config = calls.find((c) => c[0] === 'config');
    expect(config?.[1]).toBe(GA_MEASUREMENT_ID);
    expect(config?.[2]).toEqual({ send_page_view: false });
  });
});
