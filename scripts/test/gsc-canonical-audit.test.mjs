// スクリプト全体の振る舞い。とくに終了コードは
// 「0 なら統合完了」という約束で使うので、ここで固定しておく。

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EXIT_COMPLETE,
  EXIT_FAILED,
  EXIT_INCOMPLETE,
  STALE_DAYS,
  formatSitemapStatus,
  isStale,
  main,
} from '../gsc-canonical-audit.mjs';

const INDEX_XML = `<sitemapindex>
  <sitemap><loc>https://hasokon.com/sitemap-home.xml</loc></sitemap>
  <sitemap><loc>https://hasokon.com/tools/sitemap.xml</loc></sitemap>
</sitemapindex>`;

const SITEMAPS = {
  'https://hasokon.com/sitemap.xml': INDEX_XML,
  'https://hasokon.com/sitemap-home.xml': '<urlset><url><loc>https://hasokon.com/</loc></url></urlset>',
  'https://hasokon.com/tools/sitemap.xml':
    '<urlset><url><loc>https://hasokon.com/tools/nenshu-kabe/</loc></url></urlset>',
};

const CANONICALS = {
  'https://hasokon.com/': 'https://hasokon.com/',
  'https://hasokon.com/tools/nenshu-kabe/': 'https://tool.hasokon.com/nenshu-kabe/',
};

/** Sitemaps API の応答。now（2026-08-10）から見て新しいので、既定では警告にならない。 */
const sitemapResponse = (lastDownloaded = '2026-08-08T00:00:00.000Z') => ({
  ok: true,
  body: { lastDownloaded, contents: [{ type: 'web', submitted: '2', indexed: '0' }] },
});

/** Sitemaps API の 404（送信済みでも既知でもないサイトマップ）。 */
const notFoundResponse = { ok: false, status: 404, notFound: true, error: 'HTTP 404: notFound' };

/** 出力を溜め、全部を差し替えた deps を作る。 */
function harness(overrides = {}) {
  const stdout = [];
  const stderr = [];
  const written = [];

  const deps = {
    env: { GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email":"a@b.iam.gserviceaccount.com","private_key":"x"}' },
    fetchText: async (url) => {
      if (!(url in SITEMAPS)) throw new Error('HTTP 404');
      return SITEMAPS[url];
    },
    getAccessToken: async () => 'ya29.test',
    inspect: async ({ url }) => ({
      ok: true,
      body: { inspectionResult: { indexStatusResult: { googleCanonical: CANONICALS[url] } } },
    }),
    getSitemap: async () => sitemapResponse(),
    writeSnapshot: async (path, text) => void written.push({ path, text }),
    now: () => '2026-08-10T00:00:00.000Z',
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    ...overrides,
  };

  return { deps, stdout, stderr, written, out: () => stdout.join('\n') };
}

describe('main', () => {
  it('--help は説明を出して 0', async () => {
    const h = harness();
    assert.equal(await main(['--help'], h.deps), EXIT_COMPLETE);
    assert.match(h.out(), /使い方/);
  });

  it('知らないオプションは 2 で終わる', async () => {
    const h = harness();
    assert.equal(await main(['--nope'], h.deps), EXIT_FAILED);
    assert.match(h.stderr.join('\n'), /知らないオプション/);
  });

  it('--dry-run はAPIを叩かず、対象URLだけ出して 0', async () => {
    let inspected = 0;
    const h = harness({ inspect: async () => void (inspected += 1) });

    assert.equal(await main(['--dry-run'], h.deps), EXIT_COMPLETE);
    assert.equal(inspected, 0);
    assert.deepEqual(h.stdout, ['https://hasokon.com/', 'https://hasokon.com/tools/nenshu-kabe/']);
  });

  it('サイトマップからURLが取れなければ 2', async () => {
    const h = harness({
      fetchText: async () => {
        throw new Error('HTTP 500');
      },
    });

    assert.equal(await main([], h.deps), EXIT_FAILED);
    assert.match(h.stderr.join('\n'), /対象URLが1件も取れませんでした/);
  });

  it('旧サブドメインが残っていれば 1 で終わる', async () => {
    const h = harness();

    assert.equal(await main([], h.deps), EXIT_INCOMPLETE);
    assert.match(h.out(), /統合は未完了。残り 1 件/);
    assert.match(h.out(), /https:\/\/tool\.hasokon\.com\/nenshu-kabe\//);
  });

  it('全部が新URLを指していれば 0 で終わる', async () => {
    const h = harness({
      inspect: async ({ url }) => ({
        ok: true,
        body: { inspectionResult: { indexStatusResult: { googleCanonical: url } } },
      }),
    });

    assert.equal(await main([], h.deps), EXIT_COMPLETE);
    assert.match(h.out(), /統合完了/);
  });

  it('検査に失敗したURLがあれば、完了扱いにせず 1', async () => {
    const h = harness({ inspect: async () => ({ ok: false, error: 'HTTP 403' }) });

    assert.equal(await main([], h.deps), EXIT_INCOMPLETE);
    assert.match(h.out(), /検査に失敗したURL:/);
  });

  it('サービスアカウントが無ければ 2（APIは叩かない）', async () => {
    let inspected = 0;
    const h = harness({ env: {}, inspect: async () => void (inspected += 1) });

    assert.equal(await main([], h.deps), EXIT_FAILED);
    assert.equal(inspected, 0);
    assert.match(h.stderr.join('\n'), /GOOGLE_SERVICE_ACCOUNT_JSON/);
  });

  it('トークンが取れなければ 2', async () => {
    const h = harness({
      getAccessToken: async () => {
        throw new Error('HTTP 401: invalid_grant');
      },
    });

    assert.equal(await main([], h.deps), EXIT_FAILED);
    assert.match(h.stderr.join('\n'), /認証に失敗.*invalid_grant/s);
  });

  it('--out に計測日つきのJSONを書き出す', async () => {
    const h = harness();

    await main(['--out', 'baseline.json'], h.deps);

    assert.equal(h.written.length, 1);
    assert.equal(h.written[0].path, 'baseline.json');

    const snapshot = JSON.parse(h.written[0].text);
    assert.equal(snapshot.measuredAt, '2026-08-10T00:00:00.000Z');
    assert.equal(snapshot.siteUrl, 'https://hasokon.com/');
    assert.equal(snapshot.total, 2);
    assert.equal(snapshot.counts.legacy, 1);
    assert.deepEqual(snapshot.legacyByHost, { 'tool.hasokon.com': 1 });
    assert.equal(snapshot.rows.length, 2);
  });

  it('--out のJSONに coverageState 別の内訳を残す', async () => {
    // 週ごとに並べて「登録が増えているか」を見るのがこの内訳
    // （docs/features/google-index-recovery.md）
    const COVERAGE = {
      'https://hasokon.com/': 'Submitted and indexed',
      'https://hasokon.com/tools/nenshu-kabe/': 'Crawled - currently not indexed',
    };
    const h = harness({
      inspect: async ({ url }) => ({
        ok: true,
        body: {
          inspectionResult: {
            indexStatusResult: { googleCanonical: CANONICALS[url], coverageState: COVERAGE[url] },
          },
        },
      }),
    });

    await main(['--out', 'weekly.json'], h.deps);

    const snapshot = JSON.parse(h.written[0].text);
    assert.deepEqual(snapshot.coverageByState, [
      {
        state: 'Crawled - currently not indexed',
        count: 1,
        urls: ['https://hasokon.com/tools/nenshu-kabe/'],
      },
      { state: 'Submitted and indexed', count: 1, urls: ['https://hasokon.com/'] },
    ]);
    assert.match(h.out(), /Submitted and indexed: 1/);
  });

  it('--out を指定しなければ何も書かない', async () => {
    const h = harness();
    await main([], h.deps);
    assert.equal(h.written.length, 0);
  });

  it('--site-url で検査するプロパティを差し替えられる', async () => {
    const seen = [];
    const h = harness({
      inspect: async (params) => {
        seen.push(params.siteUrl);
        return { ok: true, body: { inspectionResult: { indexStatusResult: {} } } };
      },
    });

    await main(['--site-url', 'https://test.hasokon.com/'], h.deps);
    assert.deepEqual(new Set(seen), new Set(['https://test.hasokon.com/']));
  });

  it('取得したトークンを検査リクエストに渡す', async () => {
    const seen = [];
    const h = harness({
      getAccessToken: async () => 'ya29.specific',
      inspect: async (params) => {
        seen.push(params.accessToken);
        return { ok: true, body: { inspectionResult: { indexStatusResult: {} } } };
      },
    });

    await main([], h.deps);
    assert.deepEqual(new Set(seen), new Set(['ya29.specific']));
  });
});

// docs/features/sitemap-discovery-audit.md の「B」
// index に並べただけの子が Google に読まれないことがある（2026-09-19 の /learn/sitemap.xml）。
// URL検査の結果は正常に見えるので、ここを数えないと気づけない。
describe('サイトマップが読まれたか', () => {
  /** 正規URLはすべて新URL（＝サイトマップの状態だけが終了コードを決める）。 */
  const allConsolidated = {
    inspect: async ({ url }) => ({
      ok: true,
      body: { inspectionResult: { indexStatusResult: { googleCanonical: url } } },
    }),
  };

  it('index を辿って見つけた全サイトマップの状態を取りに行く', async () => {
    const seen = [];
    const h = harness({
      getSitemap: async (params) => {
        seen.push(params);
        return sitemapResponse();
      },
    });

    await main([], h.deps);

    assert.deepEqual(
      seen.map((params) => params.feedpath),
      [
        'https://hasokon.com/sitemap.xml',
        'https://hasokon.com/sitemap-home.xml',
        'https://hasokon.com/tools/sitemap.xml',
      ],
    );
    assert.deepEqual(new Set(seen.map((params) => params.siteUrl)), new Set(['https://hasokon.com/']));
    assert.deepEqual(new Set(seen.map((params) => params.accessToken)), new Set(['ya29.test']));
  });

  it('読まれていない子が1本でもあれば 1（統合そのものは完了していても）', async () => {
    const h = harness({
      ...allConsolidated,
      getSitemap: async ({ feedpath }) =>
        feedpath === 'https://hasokon.com/tools/sitemap.xml' ? notFoundResponse : sitemapResponse(),
    });

    assert.equal(await main([], h.deps), EXIT_INCOMPLETE);
    assert.match(h.stderr.join('\n'), /Google は知らない/);
    assert.match(h.stderr.join('\n'), /読まれていない.*サイトマップ: 1 本/);
    // 報告は「統合完了」なので、1 で終わる理由が分かるようにしておく
    assert.match(h.out(), /統合完了/);
    assert.match(h.stderr.join('\n'), /終了コード 1 にします/);
  });

  it('全部が最近読まれていれば、サイトマップを理由に 1 にはしない', async () => {
    const h = harness(allConsolidated);

    assert.equal(await main([], h.deps), EXIT_COMPLETE);
    assert.doesNotMatch(h.stderr.join('\n'), /読まれていない/);
  });

  it(`最終ダウンロードが ${STALE_DAYS} 日より古ければ 1`, async () => {
    // now は 2026-08-10。2026-07-20 は21日前
    const h = harness({
      ...allConsolidated,
      getSitemap: async ({ feedpath }) =>
        feedpath === 'https://hasokon.com/sitemap-home.xml'
          ? sitemapResponse('2026-07-20T00:00:00.000Z')
          : sitemapResponse(),
    });

    assert.equal(await main([], h.deps), EXIT_INCOMPLETE);
    assert.match(h.stderr.join('\n'), new RegExp(`${STALE_DAYS}日より古い`));
  });

  it('登録はあるが一度も読まれていない子も 1', async () => {
    const h = harness({
      ...allConsolidated,
      getSitemap: async () => ({ ok: true, body: { lastDownloaded: null } }),
    });

    assert.equal(await main([], h.deps), EXIT_INCOMPLETE);
    assert.match(h.stderr.join('\n'), /まだ一度も読まれていない/);
  });

  it('404 以外の失敗は 2（URL検査は始めない）', async () => {
    let inspected = 0;
    const h = harness({
      inspect: async () => void (inspected += 1),
      getSitemap: async () => ({ ok: false, status: 403, notFound: false, error: 'HTTP 403: forbidden' }),
    });

    assert.equal(await main([], h.deps), EXIT_FAILED);
    assert.equal(inspected, 0, 'サイトマップの状態を取れない時点でURL検査を始めています');
    assert.match(h.stderr.join('\n'), /サイトマップの状態を取れません.*403/s);
  });

  it('--dry-run では Sitemaps API も叩かない', async () => {
    let called = 0;
    const h = harness({ getSitemap: async () => void (called += 1) });

    assert.equal(await main(['--dry-run'], h.deps), EXIT_COMPLETE);
    assert.equal(called, 0);
  });

  it('--out のJSONに1本ずつの状態を残す', async () => {
    const h = harness({
      getSitemap: async ({ feedpath }) =>
        feedpath === 'https://hasokon.com/tools/sitemap.xml' ? notFoundResponse : sitemapResponse(),
    });

    await main(['--out', 'weekly.json'], h.deps);

    const snapshot = JSON.parse(h.written[0].text);
    assert.deepEqual(snapshot.sitemaps, [
      {
        path: 'https://hasokon.com/sitemap.xml',
        known: true,
        lastDownloaded: '2026-08-08T00:00:00.000Z',
        submitted: 2,
        indexed: 0,
      },
      {
        path: 'https://hasokon.com/sitemap-home.xml',
        known: true,
        lastDownloaded: '2026-08-08T00:00:00.000Z',
        submitted: 2,
        indexed: 0,
      },
      {
        path: 'https://hasokon.com/tools/sitemap.xml',
        known: false,
        lastDownloaded: null,
        submitted: null,
        indexed: null,
      },
    ]);
  });
});

describe('isStale', () => {
  const now = '2026-08-10T00:00:00.000Z';

  it(`${STALE_DAYS} 日を超えて古ければ true`, () => {
    assert.equal(isStale('2026-07-20T00:00:00.000Z', now), true);
  });

  it(`ちょうど ${STALE_DAYS} 日前はまだ true にしない`, () => {
    assert.equal(isStale('2026-07-27T00:00:00.000Z', now), false);
  });

  it('読まれた日が無ければ false（「古い」ではなく「無い」なので別に数える）', () => {
    assert.equal(isStale(null, now), false);
  });

  it('日付として読めなければ false（勝手に警告を出さない）', () => {
    assert.equal(isStale('いつか', now), false);
    assert.equal(isStale('2026-08-01T00:00:00.000Z', 'いつか'), false);
  });
});

describe('formatSitemapStatus', () => {
  const now = '2026-08-10T00:00:00.000Z';

  it('読まれた日・送信数・登録数を1行に出す', () => {
    const line = formatSitemapStatus(
      {
        path: 'https://hasokon.com/sitemap-home.xml',
        known: true,
        lastDownloaded: '2026-08-08T00:00:00.000Z',
        submitted: 2,
        indexed: 0,
      },
      now,
    );

    assert.match(line, /sitemap-home\.xml/);
    assert.match(line, /送信 2/);
    assert.match(line, /登録 0/);
    assert.doesNotMatch(line, /より古い/);
  });

  it('登録0は「—」ではなく 0 と出す（数えられた0と、数えていないのを区別する）', () => {
    const line = formatSitemapStatus(
      { path: 'x', known: true, lastDownloaded: now, submitted: 0, indexed: 0 },
      now,
    );
    assert.match(line, /送信 0 \/ 登録 0/);
  });

  it('index のように件数が無ければ「—」', () => {
    const line = formatSitemapStatus(
      { path: 'x', known: true, lastDownloaded: now, submitted: null, indexed: null },
      now,
    );
    assert.match(line, /送信 — \/ 登録 —/);
  });

  it('知られていないサイトマップはそう書く', () => {
    const line = formatSitemapStatus(
      { path: 'https://hasokon.com/learn/sitemap.xml', known: false, lastDownloaded: null, submitted: null, indexed: null },
      now,
    );
    assert.match(line, /Google は知らない/);
  });
});
