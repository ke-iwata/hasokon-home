// Bing の検索パフォーマンスを取るスクリプトのテスト。
//
// 仕様: docs/features/bing-search-performance-audit.md の A・B
//
// ネットワークも API キーも要らない（Bing の応答を差し替えて動かす）。
// **キーがどこにも出ないこと**（エラー文・--dry-run・JSON）と、
// **表示 5 回未満の検索語が表にも JSON にも残らないこと**を特に見る。

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aggregate,
  API_ENDPOINT,
  callApi,
  DEFAULT_SITE_URL,
  endpointUrl,
  filterQueries,
  formatReport,
  METHODS,
  MIN_IMPRESSIONS,
  parseDotNetDate,
  parseRows,
  redactKey,
  summarize,
  summarizeTraffic,
  toRelativePath,
  TOP_N,
  topN,
} from '../lib/bing-webmaster.mjs';
import { EXIT_FAILED, EXIT_OK, main, parseArgs } from '../bing-search-stats.mjs';

const KEY = 'abc123SECRETkey';

/** 2026-09-DD の 00:00 JST を WCF 形式で */
function wcf(isoDate, offset = '+0900') {
  const sign = offset[0] === '+' ? 1 : -1;
  const minutes = Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3));
  const ms = Date.parse(`${isoDate}T00:00:00Z`) - sign * minutes * 60 * 1000;
  return `/Date(${ms}${offset})/`;
}

function dailyTraffic(from, days, impressions = 10, clicks = 1) {
  const rows = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    rows.push({ Date: wcf(date), Impressions: impressions, Clicks: clicks });
  }
  return rows;
}

describe('定数（仕様書で決めた絞り込み）', () => {
  it('検索語は表示 5 回以上・上位 20 件', () => {
    assert.equal(MIN_IMPRESSIONS, 5);
    assert.equal(TOP_N, 20);
  });

  it('叩くのは 3 本、仕様書の順番で', () => {
    assert.deepEqual([...METHODS], ['GetRankAndTrafficStats', 'GetQueryStats', 'GetPageStats']);
  });

  it('既定のサイトは末尾スラッシュつき（違うと空の配列が返る）', () => {
    assert.equal(DEFAULT_SITE_URL, 'https://hasokon.com/');
  });
});

describe('endpointUrl()', () => {
  it('JSON エンドポイントに siteUrl と apikey を付ける', () => {
    const url = new URL(endpointUrl('GetQueryStats', 'https://hasokon.com/', KEY));
    assert.equal(`${url.origin}${url.pathname}`, `${API_ENDPOINT}/GetQueryStats`);
    assert.equal(url.searchParams.get('siteUrl'), 'https://hasokon.com/');
    assert.equal(url.searchParams.get('apikey'), KEY);
  });

  it('追加の引数（GetPageQueryStats の page）も載せる', () => {
    const url = new URL(endpointUrl('GetPageQueryStats', 'https://hasokon.com/', KEY, { page: 'https://hasokon.com/tools/' }));
    assert.equal(url.searchParams.get('page'), 'https://hasokon.com/tools/');
  });
});

describe('redactKey()', () => {
  it('apikey= の値を伏せる', () => {
    assert.equal(redactKey('GET https://x/y?siteUrl=a&apikey=zzz&b=1', ''), 'GET https://x/y?siteUrl=a&apikey=***&b=1');
  });

  it('キーそのものが本文に出ていても伏せる', () => {
    const text = redactKey(`invalid key ${KEY} (apikey=${KEY})`, KEY);
    assert.ok(!text.includes(KEY));
    assert.match(text, /apikey=\*\*\*/);
  });

  it('URL エンコードされたキーも伏せる', () => {
    const key = 'a+b/c=';
    const text = redactKey(`echo: ${encodeURIComponent(key)}`, key);
    assert.ok(!text.includes(encodeURIComponent(key)));
  });
});

describe('parseDotNetDate()', () => {
  it('仕様書の例（-0700）を書き出した側の暦日にする', () => {
    assert.equal(parseDotNetDate('/Date(1316156400000-0700)/'), '2011-09-16');
  });

  it('+0900 でも暦日がずれない', () => {
    assert.equal(parseDotNetDate(wcf('2026-09-28', '+0900')), '2026-09-28');
  });

  it('タイムゾーンが無ければ UTC で読む', () => {
    assert.equal(parseDotNetDate(`/Date(${Date.parse('2026-09-01T00:00:00Z')})/`), '2026-09-01');
  });

  it('形式が違えば null（Date.parse に頼らない）', () => {
    assert.equal(parseDotNetDate('2026-09-28'), null);
    assert.equal(parseDotNetDate(undefined), null);
  });
});

describe('parseRows()', () => {
  it('d が空・null でもエラーにしない（登録直後は 0 件が正常）', () => {
    assert.deepEqual(parseRows({ d: [] }), []);
    assert.deepEqual(parseRows({ d: null }), []);
    assert.deepEqual(parseRows({}), []);
  });
});

describe('summarizeTraffic()', () => {
  it('日別なら 7 日と 28 日を出す', () => {
    const rows = dailyTraffic('2026-08-20', 30);
    const t = summarizeTraffic(rows, '2026-09-29T00:00:00Z');
    assert.equal(t.granularity, 'daily');
    assert.equal(t.latest, '2026-09-18');
    assert.deepEqual(
      { from: t.last7.from, impressions: t.last7.impressions, clicks: t.last7.clicks },
      { from: '2026-09-12', impressions: 70, clicks: 7 },
    );
    assert.equal(t.last28.impressions, 280);
    assert.equal(t.last28.from, '2026-08-22');
  });

  it('週単位なら 7 日を作らず、28 日だけ出す', () => {
    const rows = ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'].map((d) => ({
      Date: wcf(d),
      Impressions: 100,
      Clicks: 5,
    }));
    const t = summarizeTraffic(rows, '2026-09-29T00:00:00Z');
    assert.equal(t.granularity, 'weekly');
    assert.equal(t.last7, null);
    assert.equal(t.last28.points, 4);
    assert.equal(t.last28.impressions, 400);
  });

  it('今日より先の点は数えない', () => {
    const rows = [{ Date: wcf('2026-10-10'), Impressions: 999, Clicks: 9 }, ...dailyTraffic('2026-09-20', 3)];
    const t = summarizeTraffic(rows, '2026-09-29T00:00:00Z');
    assert.equal(t.latest, '2026-09-22');
    assert.equal(t.last28.impressions, 30);
  });

  it('0 件なら latest が null', () => {
    const t = summarizeTraffic([], '2026-09-29T00:00:00Z');
    assert.equal(t.latest, null);
    assert.equal(t.last28.impressions, 0);
  });
});

describe('aggregate() / filterQueries() / topN()', () => {
  const rows = [
    { Query: '最低賃金 いくら', Impressions: 30, Clicks: 3, AvgImpressionPosition: 4 },
    { Query: '最低賃金 いくら', Impressions: 10, Clicks: 1, AvgImpressionPosition: 8 },
    { Query: 'たばこ税 値上げ', Impressions: 5, Clicks: 0, AvgImpressionPosition: 12 },
    { Query: '山田太郎 養育費', Impressions: 4, Clicks: 1, AvgImpressionPosition: 2 },
  ];

  it('同じ検索語を足し合わせ、順位は表示回数で重み付けする', () => {
    const [top] = aggregate(rows, (r) => r.Query);
    assert.deepEqual(top, { key: '最低賃金 いくら', impressions: 40, clicks: 4, ctr: 10, position: 5 });
  });

  it('表示 5 回未満の検索語を落とす（5 回ちょうどは残す）', () => {
    const kept = filterQueries(aggregate(rows, (r) => r.Query)).map((r) => r.key);
    assert.deepEqual(kept.sort(), ['たばこ税 値上げ', '最低賃金 いくら'].sort());
  });

  it('表示回数の多い順に n 件', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ key: `q${i}`, impressions: i, clicks: 0 }));
    const top = topN(many, 'impressions');
    assert.equal(top.length, TOP_N);
    assert.equal(top[0].key, 'q29');
  });

  it('表示 0 回なら CTR は null（0 除算にしない）', () => {
    const [row] = aggregate([{ Query: 'x', Impressions: 0, Clicks: 0 }], (r) => r.Query);
    assert.equal(row.ctr, null);
    assert.equal(row.position, null);
  });
});

describe('toRelativePath()', () => {
  it('hasokon.com のページはパスにする（GA4 の pagePath と突き合わせる）', () => {
    assert.equal(toRelativePath('https://hasokon.com/tools/saitei-chingin/'), '/tools/saitei-chingin/');
  });

  it('別ホストはそのまま', () => {
    assert.equal(toRelativePath('https://tool.hasokon.com/x/'), 'https://tool.hasokon.com/x/');
  });
});

describe('summarize() / formatReport()', () => {
  const nowIso = '2026-09-29T00:00:00Z';

  it('取れなかった本と 0 件の本を区別する', () => {
    const summary = summarize({ traffic: [], queries: null, pages: [] }, { nowIso });
    assert.equal(summary.queries, null);
    assert.deepEqual(summary.pages, []);
    const text = formatReport(summary, { queries: 'HTTP 401: denied' });
    assert.match(text, /取れませんでした\*\*：HTTP 401: denied/);
    assert.match(text, /0 件/);
  });

  it('ページは GetPageStats の Query（URL）を相対パスにして並べる', () => {
    const summary = summarize(
      {
        traffic: [],
        queries: [],
        pages: [
          { Query: 'https://hasokon.com/tools/saitei-chingin/', Impressions: 50, Clicks: 10, AvgImpressionPosition: 3 },
          { Query: 'https://hasokon.com/tools/shuzei-kaisei/', Impressions: 20, Clicks: 2, AvgImpressionPosition: 6 },
        ],
      },
      { nowIso },
    );
    assert.deepEqual(
      summary.pages.map((p) => p.key),
      ['/tools/saitei-chingin/', '/tools/shuzei-kaisei/'],
    );
    const text = formatReport(summary);
    assert.match(text, /\| \/tools\/saitei-chingin\/ \| 50 \| 10 \| 20% \| 3 \|/);
  });

  it('ページ別は URL だけなので、表示 5 回未満でも落とさない', () => {
    const summary = summarize(
      { traffic: [], queries: [], pages: [{ Query: 'https://hasokon.com/about/', Impressions: 1, Clicks: 0 }] },
      { nowIso },
    );
    assert.equal(summary.pages.length, 1);
  });

  it('週単位のときは見出しに粒度を書き、7 日の行を出さない', () => {
    const traffic = ['2026-09-07', '2026-09-14', '2026-09-21'].map((d) => ({ Date: wcf(d), Impressions: 10, Clicks: 1 }));
    const text = formatReport(summarize({ traffic, queries: [], pages: [] }, { nowIso }));
    assert.match(text, /週単位/);
    assert.doesNotMatch(text, /直近 7 日/);
    assert.match(text, /直近 28 日/);
  });

  it('表のセルに | が入っても崩れない', () => {
    const summary = summarize(
      { traffic: [], queries: [{ Query: 'a|b', Impressions: 9, Clicks: 0 }], pages: [] },
      { nowIso },
    );
    assert.match(formatReport(summary), /a\\\|b/);
  });
});

describe('callApi()', () => {
  const noSleep = async () => {};

  it('GET で叩き、JSON を返す', async () => {
    let seen;
    const result = await callApi(
      { method: 'GetQueryStats', siteUrl: DEFAULT_SITE_URL, apiKey: KEY },
      {
        fetchImpl: async (url, init) => {
          seen = { url, init };
          return new Response(JSON.stringify({ d: [] }), { status: 200 });
        },
        sleep: noSleep,
      },
    );
    assert.deepEqual(result, { ok: true, body: { d: [] } });
    assert.equal(seen.init.method, 'GET');
    assert.match(seen.url, /GetQueryStats\?/);
  });

  it('5xx は 1 回だけ投げ直す', async () => {
    let calls = 0;
    const result = await callApi(
      { method: 'GetQueryStats', siteUrl: DEFAULT_SITE_URL, apiKey: KEY },
      {
        fetchImpl: async () => {
          calls += 1;
          return new Response('busy', { status: 503 });
        },
        sleep: noSleep,
      },
    );
    assert.equal(calls, 2);
    assert.equal(result.ok, false);
  });

  it('401 は投げ直さない', async () => {
    let calls = 0;
    await callApi(
      { method: 'GetQueryStats', siteUrl: DEFAULT_SITE_URL, apiKey: KEY },
      {
        fetchImpl: async () => {
          calls += 1;
          return new Response('no', { status: 401 });
        },
        sleep: noSleep,
      },
    );
    assert.equal(calls, 1);
  });

  it('エラー文にキーを出さない（応答本文・通信エラーにキーが含まれていても）', async () => {
    const echoed = await callApi(
      { method: 'GetQueryStats', siteUrl: DEFAULT_SITE_URL, apiKey: KEY },
      {
        fetchImpl: async (url) => new Response(`bad request: ${url}`, { status: 400 }),
        sleep: noSleep,
      },
    );
    assert.equal(echoed.ok, false);
    assert.ok(!echoed.error.includes(KEY), echoed.error);

    const thrown = await callApi(
      { method: 'GetQueryStats', siteUrl: DEFAULT_SITE_URL, apiKey: KEY },
      {
        fetchImpl: async (url) => {
          throw new Error(`fetch failed for ${url}`);
        },
        sleep: noSleep,
      },
    );
    assert.ok(!thrown.error.includes(KEY), thrown.error);
  });
});

describe('parseArgs()', () => {
  it('既定は hasokon.com・JSON なし', () => {
    const options = parseArgs([]);
    assert.equal(options.siteUrl, 'https://hasokon.com/');
    assert.equal(options.out, null);
  });

  it('--site と --out を読む', () => {
    const options = parseArgs(['--site', 'https://example.com/', '--out', 'x.json']);
    assert.equal(options.siteUrl, 'https://example.com/');
    assert.equal(options.out, 'x.json');
  });

  it('URL でない --site・知らないオプションは弾く', () => {
    assert.throws(() => parseArgs(['--site', 'hasokon.com']));
    assert.throws(() => parseArgs(['--nope']));
    assert.throws(() => parseArgs(['--out']));
  });
});

describe('main()', () => {
  function run(argv, { env = { BING_WEBMASTER_API_KEY: KEY }, responses = {} } = {}) {
    const stdout = [];
    const stderr = [];
    const written = {};
    const calls = [];
    return main(argv, {
      env,
      now: () => '2026-09-29T00:00:00.000Z',
      call: async (params) => {
        calls.push(params);
        return responses[params.method] ?? { ok: true, body: { d: [] } };
      },
      writeSnapshot: async (path, text) => {
        written[path] = text;
      },
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    }).then((code) => ({ code, stdout: stdout.join('\n'), stderr: stderr.join('\n'), written, calls }));
  }

  it('--help は 0', async () => {
    const { code, stdout } = await run(['--help']);
    assert.equal(code, EXIT_OK);
    assert.match(stdout, /BING_WEBMASTER_API_KEY/);
  });

  it('--dry-run は URL だけ出し、キーを伏せる', async () => {
    const { code, stdout, calls } = await run(['--dry-run']);
    assert.equal(code, EXIT_OK);
    assert.equal(calls.length, 0);
    assert.ok(!stdout.includes(KEY));
    assert.equal(stdout.match(/apikey=\*\*\*/g).length, 3);
  });

  it('--dry-run はキーが無くても動く', async () => {
    const { code } = await run(['--dry-run'], { env: {} });
    assert.equal(code, EXIT_OK);
  });

  it('キーが無ければ 2（API は叩かない）', async () => {
    const { code, calls } = await run([], { env: {} });
    assert.equal(code, EXIT_FAILED);
    assert.equal(calls.length, 0);
  });

  it('3 本を順に叩き、表と JSON を出す', async () => {
    const queries = [
      { Query: '最低賃金 東京 2026', Impressions: 120, Clicks: 15, AvgImpressionPosition: 4 },
      { Query: '田中花子 養育費', Impressions: 2, Clicks: 1, AvgImpressionPosition: 1 },
    ];
    const { code, stdout, written, calls } = await run(['--out', 'bing.json'], {
      responses: {
        GetRankAndTrafficStats: { ok: true, body: { d: dailyTraffic('2026-09-01', 20) } },
        GetQueryStats: { ok: true, body: { d: queries } },
        GetPageStats: {
          ok: true,
          body: { d: [{ Query: 'https://hasokon.com/tools/saitei-chingin/', Impressions: 3, Clicks: 1 }] },
        },
      },
    });
    assert.equal(code, EXIT_OK);
    assert.deepEqual(
      calls.map((c) => c.method),
      ['GetRankAndTrafficStats', 'GetQueryStats', 'GetPageStats'],
    );
    assert.match(stdout, /最低賃金 東京 2026/);
    assert.match(stdout, /\/tools\/saitei-chingin\//);

    const snapshot = JSON.parse(written['bing.json']);
    assert.equal(snapshot.measuredAt, '2026-09-29T00:00:00.000Z');
    assert.equal(snapshot.minImpressions, 5);
    assert.deepEqual(
      snapshot.queries.map((q) => q.key),
      ['最低賃金 東京 2026'],
    );
    assert.equal(snapshot.traffic.granularity, 'daily');
  });

  it('表示 5 回未満の検索語は、表にも JSON にも残らない', async () => {
    const { stdout, stderr, written } = await run(['--out', 'bing.json'], {
      responses: {
        GetQueryStats: { ok: true, body: { d: [{ Query: '田中花子 養育費', Impressions: 4, Clicks: 1 }] } },
      },
    });
    for (const text of [stdout, stderr, written['bing.json']]) {
      assert.ok(!text.includes('田中花子'), text);
    }
  });

  it('1 本でも取れなければ 2。取れた本は出し、キーはどこにも出さない', async () => {
    const { code, stdout, stderr, written } = await run(['--out', 'bing.json'], {
      responses: {
        GetQueryStats: { ok: false, error: `HTTP 401: invalid apikey=${KEY}` },
      },
    });
    assert.equal(code, EXIT_FAILED);
    assert.match(stdout, /取れませんでした/);
    for (const text of [stdout, stderr, written['bing.json']]) {
      assert.ok(!text.includes(KEY), text);
    }
    const snapshot = JSON.parse(written['bing.json']);
    assert.equal(snapshot.queries, null);
    assert.deepEqual(snapshot.pages, []);
  });
});
