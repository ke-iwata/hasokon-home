import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/**
 * home/analytics.js（ポータルのアクセス解析）のテスト。
 *
 * 仕様: docs/features/measurement-hygiene.md
 *
 * home/ はビルド工程を持たない素の静的HTMLで、バンドラも import も無い。
 * そのためファイルをそのまま node:vm で評価して、公開している関数を取り出している。
 * ブラウザでの自動初期化は `typeof window` を見ているので、window を置かない
 * コンテキストで評価すれば副作用なしに関数だけ取れる。
 */

const repoRoot = new URL('../../', import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, repoRoot)), 'utf8');

const ANALYTICS_JS = read('home/analytics.js');
const INDEX_HTML = read('home/index.html');
const NOT_FOUND_HTML = read('home/404.html');
const TOOLS_ANALYTICS_TS = read('tools/lib/analytics.ts');
const GAMES_ANALYTICS_TS = read('games/lib/analytics.ts');

/** home/analytics.js を評価して公開オブジェクトを返す（window を置かないので init は走らない） */
function loadAnalytics() {
  // URL は ECMAScript の組み込みではなく Node が足しているグローバルなので、明示的に渡す
  const context = vm.createContext({ URL });
  vm.runInContext(ANALYTICS_JS, context);
  assert.equal(typeof context.window, 'undefined', 'window が無い環境では自動初期化しない');
  return context.hasokonAnalytics;
}

/**
 * ブラウザを模した window。
 * gtag は home/analytics.js 自身が生やすので、こちらでは用意しない
 * （dataLayer に積まれた arguments をそのまま読んで、送信内容を確かめる）。
 */
function fakeWindow(hostname) {
  const clickListeners = [];

  const win = {
    location: { hostname },
    document: {
      addEventListener(type, listener) {
        if (type === 'click') clickListeners.push(listener);
      },
    },
  };

  return {
    win,
    // dataLayer は vm の中で作られるので、比較の前に Array.from でこちら側の配列に移す
    // （別realmの配列は deepStrictEqual が通らない）
    /** dataLayer に積まれた呼び出しを配列の配列で返す */
    calls: () => Array.from(win.dataLayer ?? [], (args) => Array.from(args)),
    /** `portal_click` として送られた destination だけを取り出す */
    destinations: () =>
      Array.from(win.dataLayer ?? [], (args) => Array.from(args))
        .filter((c) => c[0] === 'event' && c[1] === 'portal_click')
        .map((c) => c[2].destination),
    /** href を持つリンクがクリックされたことにする */
    click(href) {
      const link = { getAttribute: (name) => (name === 'href' ? href : null) };
      const event = { target: { closest: (selector) => (selector === 'a[href]' ? link : null) } };
      for (const listener of clickListeners) listener(event);
    },
    /** リンクの外側（見出しなど）がクリックされたことにする */
    clickOutsideLink() {
      const event = { target: { closest: () => null } };
      for (const listener of clickListeners) listener(event);
    },
  };
}

/** HTML から href の一覧を取り出す */
function hrefsOf(html) {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}

describe('portalDestination', () => {
  const { portalDestination } = loadAnalytics();

  it('セクションのトップは tools / games', () => {
    assert.equal(portalDestination('/tools/'), 'tools');
    assert.equal(portalDestination('/games/'), 'games');
  });

  it('個別ページは tool-<slug> / game-<slug>', () => {
    assert.equal(portalDestination('/tools/nenshu-kabe/'), 'tool-nenshu-kabe');
    assert.equal(portalDestination('/games/minesweeper/'), 'game-minesweeper');
  });

  it('App Store のリンクは appstore', () => {
    assert.equal(
      portalDestination(
        'https://apps.apple.com/us/app/4-classic-board-games-in-one/id6794563871',
      ),
      'appstore',
    );
  });

  it('絶対URLでも相対URLでも同じ結果になる', () => {
    assert.equal(portalDestination('https://hasokon.com/tools/warikan/'), 'tool-warikan');
    assert.equal(portalDestination('/tools/warikan/'), 'tool-warikan');
  });

  it('末尾のスラッシュが無くても数える', () => {
    assert.equal(portalDestination('/tools'), 'tools');
    assert.equal(portalDestination('/games/2048'), 'game-2048');
  });

  it('クエリやハッシュが付いていてもパスだけで判定する', () => {
    assert.equal(portalDestination('/tools/roulette/?utm_source=x#result'), 'tool-roulette');
  });

  it('さらに深い階層は第1階層のslugでまとめる', () => {
    // 用途別ルーレット（/tools/r/lunch/）を tool-r-lunch のように増やすと
    // ポータルの並び順を見るという目的に対して細かすぎるため
    assert.equal(portalDestination('/tools/r/lunch/'), 'tool-r');
  });

  it('計測対象でないリンクは null', () => {
    assert.equal(portalDestination('/'), null, 'トップ自身');
    assert.equal(portalDestination('/privacy.html'), null, 'プライバシーポリシー');
    assert.equal(portalDestination('https://docs.google.com/forms/d/e/x/viewform'), null);
    assert.equal(portalDestination('/sitemap.xml'), null);
  });

  it('href が空や壊れていても落ちない', () => {
    assert.equal(portalDestination(''), null);
    assert.equal(portalDestination(null), null);
    assert.equal(portalDestination('javascript:void(0)'), null);
  });
});

describe('shouldTrack', () => {
  const { shouldTrack } = loadAnalytics();

  it('本番ホストだけ true', () => {
    assert.equal(shouldTrack('hasokon.com'), true);
  });

  it('テスト環境・ローカル・file:// では false', () => {
    // GA4の30日分の page_view の3割がこれらのホストだった（仕様書の実測）
    assert.equal(shouldTrack('test.hasokon.com'), false);
    assert.equal(shouldTrack('localhost'), false);
    assert.equal(shouldTrack('127.0.0.1'), false);
    assert.equal(shouldTrack(''), false, 'file:// で開いたとき');
  });

  it('旧サブドメインでも false（本番ホストと前方一致させない）', () => {
    assert.equal(shouldTrack('tool.hasokon.com'), false);
    assert.equal(shouldTrack('game.test.hasokon.com'), false);
  });
});

describe('init', () => {
  it('本番では gtag を設定する', () => {
    const { init } = loadAnalytics();
    const browser = fakeWindow('hasokon.com');

    init(browser.win);

    const calls = browser.calls();
    assert.deepEqual(calls[0][0], 'js');
    assert.deepEqual(calls[1], ['config', 'G-2Z0K6Y2FX0']);
  });

  it('ポータルは send_page_view を切らない（クライアント側ルーティングが無いため）', () => {
    const { init } = loadAnalytics();
    const browser = fakeWindow('hasokon.com');

    init(browser.win);

    const config = browser.calls().find((c) => c[0] === 'config');
    assert.equal(config[2], undefined, 'config にオプションを渡さない＝自動送信のまま');
  });

  it('本番以外では gtag も dataLayer も作らない', () => {
    for (const hostname of ['test.hasokon.com', 'localhost', '']) {
      const { init } = loadAnalytics();
      const browser = fakeWindow(hostname);

      init(browser.win);

      assert.equal(browser.win.gtag, undefined, `${hostname} で gtag を作っている`);
      assert.equal(browser.win.dataLayer, undefined, `${hostname} で dataLayer を作っている`);
    }
  });

  it('本番以外ではクリックしても1件も送らない', () => {
    const { init } = loadAnalytics();
    const browser = fakeWindow('test.hasokon.com');

    init(browser.win);
    browser.click('/tools/nenshu-kabe/');

    assert.deepEqual(browser.calls(), []);
  });

  it('gtag.js が先に読み込まれていれば、その gtag を使う', () => {
    const { init } = loadAnalytics();
    const browser = fakeWindow('hasokon.com');
    const seen = [];
    browser.win.gtag = (...args) => seen.push(args);

    init(browser.win);

    assert.equal(seen.length, 2, 'js と config が本物の gtag に渡る');
    assert.deepEqual(seen[1], ['config', 'G-2Z0K6Y2FX0']);
  });
});

describe('portal_click', () => {
  it('押されたカードの遷移先を送る', () => {
    const { init } = loadAnalytics();
    const browser = fakeWindow('hasokon.com');

    init(browser.win);
    browser.click('/tools/');
    browser.click('/games/freecell/');
    browser.click('https://apps.apple.com/us/app/4-classic-board-games-in-one/id6794563871');

    assert.deepEqual(browser.destinations(), ['tools', 'game-freecell', 'appstore']);
  });

  it('計測対象でないリンクでは送らない', () => {
    const { init } = loadAnalytics();
    const browser = fakeWindow('hasokon.com');

    init(browser.win);
    browser.click('/privacy.html');
    browser.click('https://docs.google.com/forms/d/e/x/viewform');

    assert.deepEqual(browser.destinations(), []);
  });

  it('リンクの外側をクリックしても落ちないし送らない', () => {
    const { init } = loadAnalytics();
    const browser = fakeWindow('hasokon.com');

    init(browser.win);
    browser.clickOutsideLink();

    assert.deepEqual(browser.destinations(), []);
  });
});

describe('home/ のHTML', () => {
  for (const [name, html] of [
    ['index.html', INDEX_HTML],
    ['404.html', NOT_FOUND_HTML],
  ]) {
    it(`${name} が gtag.js と /analytics.js を読み込む`, () => {
      assert.match(
        html,
        /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-2Z0K6Y2FX0"><\/script>/,
      );
      // 404.html はどのURLでも表示されるので、相対パスにすると読めなくなる
      assert.match(html, /<script defer src="\/analytics\.js"><\/script>/);
    });
  }

  it('index.html の tools / games へのリンクがすべて destination を持つ', () => {
    const { portalDestination } = loadAnalytics();
    const internal = hrefsOf(INDEX_HTML).filter((href) => /^\/(tools|games)\//.test(href));

    assert.ok(internal.length > 10, 'カードのリンクを拾えていない');
    for (const href of internal) {
      assert.notEqual(portalDestination(href), null, `${href} が計測されない`);
    }
  });

  it('index.html の App Store のリンクが appstore になる', () => {
    const { portalDestination } = loadAnalytics();
    const appstore = hrefsOf(INDEX_HTML).filter((href) => href.includes('apps.apple.com'));

    assert.equal(appstore.length, 1);
    assert.equal(portalDestination(appstore[0]), 'appstore');
  });
});

describe('tools / games との設定の一致', () => {
  const { MEASUREMENT_ID, MEASURED_HOST } = loadAnalytics();

  /** lib/analytics.ts から `export const 名前 = '値';` の値を取り出す */
  function constantOf(source, name) {
    const match = source.match(new RegExp(`export const ${name} = '([^']+)';`));
    assert.ok(match, `${name} を読み取れない`);
    return match[1];
  }

  it('測定IDが3つとも同じ（1プロパティでサイト全体を見るため）', () => {
    assert.equal(constantOf(TOOLS_ANALYTICS_TS, 'GA_MEASUREMENT_ID'), MEASUREMENT_ID);
    assert.equal(constantOf(GAMES_ANALYTICS_TS, 'GA_MEASUREMENT_ID'), MEASUREMENT_ID);
  });

  it('計測を送るホストが3つとも同じ', () => {
    assert.equal(constantOf(TOOLS_ANALYTICS_TS, 'MEASURED_HOST'), MEASURED_HOST);
    assert.equal(constantOf(GAMES_ANALYTICS_TS, 'MEASURED_HOST'), MEASURED_HOST);
  });

  it('HTMLに書いた測定IDも同じ', () => {
    for (const html of [INDEX_HTML, NOT_FOUND_HTML]) {
      assert.ok(html.includes(`gtag/js?id=${MEASUREMENT_ID}`));
    }
  });
});
