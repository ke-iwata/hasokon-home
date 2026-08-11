import { afterEach, describe, expect, it } from 'vitest';
import {
  GA_MEASUREMENT_ID,
  initAnalytics,
  isAnalyticsEnabled,
  trackEvent,
  trackPageView,
  trackToolUse,
} from '@/lib/analytics';

/**
 * lib/analytics.ts のテスト。
 *
 * このテストの主目的は **page_view に page_path を混ぜないこと** の担保。
 * 両方渡すとGA4は page_path を優先してURLを組み立てるが、呼び出し元が持っている
 * `usePathname()` の値は basePath（/tools）が取り除かれたパスなので、実際のURLと
 * 食い違う（docs/features/ga4-page-path.md）。
 *
 * このリポジトリの vitest は jsdom を入れていないので、window / document は
 * 最小限のスタブを globalThis に置いて、gtag の呼び出し内容を記録する。
 */

/** gtag に渡された引数（'event' / イベント名 / パラメータ） */
type GtagCall = [command: string, name: string, params?: Record<string, unknown>];

const globals = globalThis as unknown as { window?: unknown; document?: unknown };

let calls: GtagCall[] = [];

/** gtag が使えるブラウザ環境を模す */
function stubBrowser(href: string, title = 'テストページ'): void {
  calls = [];
  globals.window = {
    location: { href },
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
    stubBrowser('https://hasokon.com/tools/hebon-romaji/');
    trackPageView();

    expect(lastPageViewParams()).not.toHaveProperty('page_path');
  });

  it('page_location に basePath 込みの実際のURLを送る', () => {
    stubBrowser('https://hasokon.com/tools/hebon-romaji/');
    trackPageView();

    expect(lastPageViewParams().page_location).toBe('https://hasokon.com/tools/hebon-romaji/');
  });

  it('page_title に document.title を送る', () => {
    stubBrowser('https://hasokon.com/tools/roulette/', 'ルーレット | はそこん');
    trackPageView();

    expect(lastPageViewParams().page_title).toBe('ルーレット | はそこん');
  });

  it('送るのは page_location と page_title だけ', () => {
    stubBrowser('https://hasokon.com/tools/nenshu-kabe/');
    trackPageView();

    expect(Object.keys(lastPageViewParams()).sort()).toEqual(['page_location', 'page_title']);
  });

  it('クエリ文字列とハッシュも落とさない（href をそのまま渡すため）', () => {
    stubBrowser('https://hasokon.com/tools/r/lunch/?utm_source=x#result');
    trackPageView();

    expect(lastPageViewParams().page_location).toBe(
      'https://hasokon.com/tools/r/lunch/?utm_source=x#result',
    );
  });

  it('回帰: /tools/ の付かないパスがGA4に記録されない', () => {
    // 修正前は page_path に usePathname() の値（'/hebon-romaji/'）が入り、
    // GA4上で page_view だけが別URLとして記録されていた
    stubBrowser('https://hasokon.com/tools/hebon-romaji/');
    trackPageView();

    const values = Object.values(lastPageViewParams()).filter(
      (v): v is string => typeof v === 'string',
    );
    expect(values.some((v) => v.startsWith('/'))).toBe(false);
    for (const value of values) {
      expect(value).not.toBe('/hebon-romaji/');
    }
  });

  it('イベント名は page_view', () => {
    stubBrowser('https://hasokon.com/tools/');
    trackPageView();

    expect(calls[0]?.[0]).toBe('event');
    expect(calls[0]?.[1]).toBe('page_view');
  });

  it('gtag がまだ無いときは何もしない（読み込み前でも落ちない）', () => {
    calls = [];
    globals.window = { location: { href: 'https://hasokon.com/tools/' } };
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
    stubBrowser('https://hasokon.com/tools/roulette/');
    trackEvent('tool_use', { tool: 'roulette', action: 'spin' });

    expect(calls).toEqual([['event', 'tool_use', { tool: 'roulette', action: 'spin' }]]);
  });

  it('trackToolUse は tool_use イベントとして送る', () => {
    stubBrowser('https://hasokon.com/tools/warikan/');
    trackToolUse('warikan', 'calc');

    expect(calls).toEqual([['event', 'tool_use', { tool: 'warikan', action: 'calc' }]]);
  });

  it('gtag が無いときは何もしない', () => {
    calls = [];
    globals.window = { location: { href: 'https://hasokon.com/tools/' } };

    expect(() => trackToolUse('warikan', 'calc')).not.toThrow();
    expect(calls).toHaveLength(0);
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
    stubBrowser('https://hasokon.com/tools/');
    initAnalytics();

    const config = calls.find((c) => c[0] === 'config');
    expect(config?.[1]).toBe(GA_MEASUREMENT_ID);
    expect(config?.[2]).toEqual({ send_page_view: false });
  });
});
