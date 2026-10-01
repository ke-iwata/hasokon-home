// AIアシスタント経由の流入を数えるスクリプトのテスト。
//
// 仕様: docs/features/ai-assistant-channel.md の A
//
// ネットワークもGoogleの認証情報も要らない（GA4 の応答を差し替えて動かす）。
// **数え方そのもの**（期間2本の取り違え・AI チャネルの拾い漏れ）と、
// **実行できなかったときに終了コード2で落ちること**を見る。
// page_view の無い「幽霊セッション」の数え方は docs/features/web-vitals-phantom-sessions.md の C。
// Yahoo! JAPAN 検索の AI 回答（openai）の足し算・参照元ホストの表・未確定行の警告は
// docs/features/yahoo-ai-search-referral.md の A・B。

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AI_CHANNEL,
  AI_SOURCE_NOTE,
  channelRequest,
  dateRanges,
  formatSummaryLine,
  formatPhantomLine,
  formatAiTrafficLine,
  formatReport,
  formatUnresolvedLine,
  landingPageRequest,
  parseRows,
  PHANTOM_LANDING_PAGES,
  PHANTOM_WARN_PERCENT,
  phantomSessionRequest,
  referrerHost,
  referrerRequest,
  runReport,
  summarize,
  summarizeAiTraffic,
  summarizeChannels,
  summarizePhantom,
  summarizeReferrers,
  summarizeUnresolved,
  topLandings,
  topSources,
} from '../lib/ga4.mjs';
import { DEFAULT_PROPERTY_ID, EXIT_FAILED, EXIT_OK, main, parseArgs } from '../ga4-ai-channel.mjs';

/** GA4 の応答（チャネル × 参照元）。期間を2つ渡したときの形 */
const CHANNEL_BODY = {
  dimensionHeaders: [
    { name: 'sessionDefaultChannelGroup' },
    { name: 'sessionSource' },
    { name: 'dateRange' },
  ],
  metricHeaders: [{ name: 'sessions' }],
  rows: [
    {
      dimensionValues: [{ value: 'Organic Search' }, { value: 'bing' }, { value: 'current' }],
      metricValues: [{ value: '240' }],
    },
    {
      dimensionValues: [{ value: 'AI Assistant' }, { value: 'chatgpt.com' }, { value: 'current' }],
      metricValues: [{ value: '60' }],
    },
    {
      dimensionValues: [{ value: 'AI Assistant' }, { value: 'copilot.com' }, { value: 'current' }],
      metricValues: [{ value: '8' }],
    },
    {
      dimensionValues: [{ value: 'AI Assistant' }, { value: 'chatgpt.com' }, { value: 'previous' }],
      metricValues: [{ value: '1' }],
    },
    {
      dimensionValues: [{ value: 'Direct' }, { value: '(direct)' }, { value: 'current' }],
      metricValues: [{ value: '36' }],
    },
  ],
};

/** GA4 の応答（AI Assistant のランディング）。期間は1本なので dateRange 次元が無い */
const LANDING_BODY = {
  dimensionHeaders: [{ name: 'landingPage' }],
  metricHeaders: [{ name: 'sessions' }],
  rows: [
    { dimensionValues: [{ value: '/games/daifugo' }], metricValues: [{ value: '15' }] },
    { dimensionValues: [{ value: '/tools/interval-timer' }], metricValues: [{ value: '10' }] },
    { dimensionValues: [{ value: '/games' }], metricValues: [{ value: '9' }] },
  ],
};

/** GA4 の応答（着地ページが空のセッションをチャネル別に）。仕様書 C の切り口 */
const PHANTOM_BODY = {
  dimensionHeaders: [{ name: 'sessionDefaultChannelGroup' }],
  metricHeaders: [{ name: 'sessions' }],
  rows: [
    { dimensionValues: [{ value: 'Unassigned' }], metricValues: [{ value: '40' }] },
    { dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '3' }] },
  ],
};

/** 期間2本の応答に Unassigned を混ぜたもの。チャネル表の注記を見るため */
const CHANNEL_BODY_WITH_UNASSIGNED = {
  ...CHANNEL_BODY,
  rows: [
    ...CHANNEL_BODY.rows,
    {
      dimensionValues: [{ value: 'Unassigned' }, { value: '(not set)' }, { value: 'current' }],
      metricValues: [{ value: '71' }],
    },
  ],
};

/** GA4 の応答（参照元 × sessionSource × チャネル、session_start に絞った eventCount） */
const REFERRER_BODY = {
  dimensionHeaders: [
    { name: 'pageReferrer' },
    { name: 'sessionSource' },
    { name: 'sessionDefaultChannelGroup' },
  ],
  metricHeaders: [{ name: 'eventCount' }],
  rows: [
    {
      dimensionValues: [{ value: 'https://www.bing.com/' }, { value: 'bing' }, { value: 'Organic Search' }],
      metricValues: [{ value: '189' }],
    },
    {
      dimensionValues: [
        { value: 'https://search.yahoo.co.jp/' },
        { value: 'openai' },
        { value: 'Organic Search' },
      ],
      metricValues: [{ value: '90' }],
    },
    {
      dimensionValues: [
        { value: 'https://search.yahoo.co.jp/search?p=x' },
        { value: 'openai' },
        { value: 'Organic Search' },
      ],
      metricValues: [{ value: '3' }],
    },
    {
      dimensionValues: [{ value: '' }, { value: 'chatgpt.com' }, { value: 'AI Assistant' }],
      metricValues: [{ value: '16' }],
    },
  ],
};

/**
 * 2026-09-21〜30 の実測（仕様書の表）に近い、Yahoo! AI と未確定行を含む期間2本の応答。
 * 直近: bing 189・openai 93・(data not available) 107・(not set) 59・chatgpt.com 52・copilot.com 4
 */
const CHANNEL_BODY_YAHOO = {
  dimensionHeaders: CHANNEL_BODY.dimensionHeaders,
  metricHeaders: CHANNEL_BODY.metricHeaders,
  rows: [
    ['Organic Search', 'bing', 'current', 189],
    ['Organic Search', 'openai', 'current', 93],
    ['Cross-network', '(data not available)', 'current', 107],
    ['Unassigned', '(not set)', 'current', 59],
    ['AI Assistant', 'chatgpt.com', 'current', 52],
    ['AI Assistant', 'copilot.com', 'current', 4],
    ['AI Assistant', 'chatgpt.com', 'previous', 60],
    ['Organic Search', 'openai', 'previous', 2],
  ].map(([channel, source, range, n]) => ({
    dimensionValues: [{ value: channel }, { value: source }, { value: range }],
    metricValues: [{ value: String(n) }],
  })),
};

/** リクエストの中身で、差し替える応答を選ぶ */
function fakeBody(body) {
  const field = body.dimensionFilter?.filter?.fieldName;
  if (field === 'eventName') return REFERRER_BODY;
  if (field === 'landingPage') return PHANTOM_BODY;
  if (field === 'sessionDefaultChannelGroup') return LANDING_BODY;
  return CHANNEL_BODY;
}

/** 出力を溜め、全部を差し替えた deps を作る。 */
function harness(overrides = {}) {
  const stdout = [];
  const stderr = [];
  const written = [];

  const deps = {
    env: {
      GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email":"a@b.iam.gserviceaccount.com","private_key":"x"}',
    },
    getAccessToken: async () => 'ya29.test',
    report: async ({ body }) => ({ ok: true, body: fakeBody(body) }),
    writeSnapshot: async (path, text) => written.push({ path, text }),
    now: () => '2026-09-29T00:00:00.000Z',
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    ...overrides,
  };

  return { deps, stdout, stderr, written };
}

describe('リクエストの組み立て', () => {
  it('直近28日と、その前の28日を並べる（当日は入れない）', () => {
    const [current, previous] = dateRanges();
    assert.deepEqual(current, { name: 'current', startDate: '28daysAgo', endDate: 'yesterday' });
    assert.deepEqual(previous, { name: 'previous', startDate: '56daysAgo', endDate: '29daysAgo' });
  });

  it('チャネル別はチャネル × 参照元で引く（仕様書の表と同じ切り口）', () => {
    const body = channelRequest();
    assert.deepEqual(
      body.dimensions.map((d) => d.name),
      ['sessionDefaultChannelGroup', 'sessionSource'],
    );
    assert.deepEqual(body.dateRanges.length, 2);
  });

  it('ランディングは AI Assistant だけに絞る', () => {
    const body = landingPageRequest();
    const filter = body.dimensionFilter.filter;
    assert.equal(filter.fieldName, 'sessionDefaultChannelGroup');
    assert.equal(filter.stringFilter.value, AI_CHANNEL);
    // 絞り込みを忘れると全チャネルのランディングになり、数字の意味が変わる
    assert.equal(body.dateRanges.length, 1);
  });
});

describe('応答の読み取り', () => {
  it('次元の位置を決め打ちせず、ヘッダーの名前で引く', () => {
    const rows = parseRows(CHANNEL_BODY);
    assert.equal(rows[0].sessionDefaultChannelGroup, 'Organic Search');
    assert.equal(rows[0].sessionSource, 'bing');
    assert.equal(rows[0].dateRange, 'current');
    assert.equal(rows[0].sessions, 240);
  });

  it('行が1件も無くても落ちない', () => {
    assert.deepEqual(parseRows({ dimensionHeaders: [{ name: 'landingPage' }] }), []);
    assert.deepEqual(parseRows(undefined), []);
  });

  it('期間の名前が落ちた応答（date_range_0 / 1）でも読める', () => {
    const rows = parseRows({
      dimensionHeaders: [{ name: 'sessionDefaultChannelGroup' }, { name: 'dateRange' }],
      rows: [
        {
          dimensionValues: [{ value: AI_CHANNEL }, { value: 'date_range_1' }],
          metricValues: [{ value: '1' }],
        },
      ],
    });
    const totals = summarizeChannels(rows);
    assert.equal(totals.previous.get(AI_CHANNEL), 1);
    assert.equal(totals.current.get(AI_CHANNEL), undefined);
  });
});

describe('集計', () => {
  const summary = summarize(parseRows(CHANNEL_BODY), parseRows(LANDING_BODY));

  it('AI Assistant は参照元をまたいで合計する', () => {
    // chatgpt.com 60 + copilot.com 8。参照元ごとに分かれたまま数えると見落とす
    assert.equal(summary.ai.current, 68);
    assert.equal(summary.ai.previous, 1);
    assert.equal(summary.ai.delta, 67);
  });

  it('全体に占める割合を出す（68 / 344）', () => {
    assert.equal(summary.aiShare, 19.8);
  });

  it('チャネルは直近28日の多い順で、前の28日を併記する', () => {
    assert.deepEqual(summary.channels[0], {
      channel: 'Organic Search',
      sessions: 240,
      previous: 0,
    });
    assert.deepEqual(summary.channels[1], { channel: AI_CHANNEL, sessions: 68, previous: 1 });
  });

  it('参照元は直近28日だけを数える', () => {
    const sources = topSources(parseRows(CHANNEL_BODY));
    assert.deepEqual(sources[0], { source: 'bing', sessions: 240 });
    // previous の chatgpt.com 1 を足してしまうと 61 になる
    assert.deepEqual(
      sources.find((s) => s.source === 'chatgpt.com'),
      { source: 'chatgpt.com', sessions: 60 },
    );
  });

  it('ランディングは多い順に5件まで', () => {
    assert.deepEqual(topLandings(parseRows(LANDING_BODY))[0], {
      page: '/games/daifugo',
      sessions: 15,
    });
    assert.ok(topLandings(parseRows(LANDING_BODY)).length <= 5);
  });

  it('セッションが0件でも0除算にならない', () => {
    const empty = summarize([], []);
    assert.equal(empty.ai.current, 0);
    assert.equal(empty.aiShare, 0);
  });

  it('月曜のログに出す1行に、増減と上位ランディングが入る', () => {
    const line = formatSummaryLine(summary);
    assert.match(line, /AI Assistant: 68 セッション/);
    assert.match(line, /\+67/);
    assert.match(line, /\/games\/daifugo 15/);
  });
});

describe('page_view の無いセッション（web-vitals-phantom-sessions.md の C）', () => {
  it('着地ページが空／(not set) のセッションを、チャネル別に直近だけ引く', () => {
    const body = phantomSessionRequest();
    const filter = body.dimensionFilter.filter;
    assert.equal(filter.fieldName, 'landingPage');
    // 空文字を落とすと、09-28 の 42 件がまるごと数えられない
    assert.deepEqual(filter.inListFilter.values, ['', '(not set)']);
    assert.deepEqual(PHANTOM_LANDING_PAGES, ['', '(not set)']);
    assert.deepEqual(
      body.dimensions.map((d) => d.name),
      ['sessionDefaultChannelGroup'],
    );
    assert.equal(body.dateRanges.length, 1);
    assert.equal(body.dateRanges[0].endDate, 'yesterday');
  });

  it('数・割合・Unassigned に入った分を出す', () => {
    const phantom = summarizePhantom(parseRows(PHANTOM_BODY), 430);
    assert.equal(phantom.sessions, 43);
    assert.equal(phantom.unassigned, 40);
    assert.equal(phantom.share, 10);
    assert.equal(phantom.warnPercent, PHANTOM_WARN_PERCENT);
  });

  it('閾値ちょうどは警告しない。超えたら警告する（暫定 10%）', () => {
    assert.equal(PHANTOM_WARN_PERCENT, 10);
    assert.equal(summarizePhantom(parseRows(PHANTOM_BODY), 430).warn, false);
    // 09-28 の型：75 セッション中 42 が幽霊（56%）
    const spike = summarizePhantom(
      [{ sessionDefaultChannelGroup: 'Unassigned', sessions: 42 }],
      75,
    );
    assert.equal(spike.share, 56);
    assert.equal(spike.warn, true);
    // 09-02〜09-27 の低いほう（3%）は警告しない
    assert.equal(
      summarizePhantom([{ sessionDefaultChannelGroup: 'Unassigned', sessions: 1 }], 34).warn,
      false,
    );
  });

  it('チャネル名が空の行は Unassigned に寄せる', () => {
    const phantom = summarizePhantom([{ sessions: 5 }], 100);
    assert.equal(phantom.unassigned, 5);
  });

  it('セッションが0件でも0除算にならず、警告もしない', () => {
    const phantom = summarizePhantom([], 0);
    assert.deepEqual(phantom, {
      sessions: 0,
      unassigned: 0,
      share: 0,
      warnPercent: PHANTOM_WARN_PERCENT,
      warn: false,
    });
  });

  it('分母はチャネル別の直近ぶんの合計（前の28日を混ぜない）', () => {
    // current の合計は 240 + 60 + 8 + 36 + 71 = 415。previous の 1 を足すと 416 になる
    const summary = summarize(parseRows(CHANNEL_BODY_WITH_UNASSIGNED), parseRows(LANDING_BODY), {
      phantomRows: parseRows(PHANTOM_BODY),
    });
    assert.equal(summary.phantom.sessions, 43);
    assert.equal(summary.phantom.share, 10.4);
    assert.equal(summary.phantom.warn, true);
  });

  it('チャネル表の Unassigned の行に「うち page_view 無し」を添える', () => {
    const summary = summarize(parseRows(CHANNEL_BODY_WITH_UNASSIGNED), parseRows(LANDING_BODY), {
      phantomRows: parseRows(PHANTOM_BODY),
    });
    const report = formatReport(summary);
    assert.match(report, /Unassigned: 71 \/ 0（うち page_view 無し 40）/);
    // 他のチャネルには付けない
    assert.doesNotMatch(report, /Organic Search: 240 \/ 0（/);
    assert.match(report, /page_view の無いセッション（着地ページ空）: 43/);
  });

  it('閾値を超えた行には印が付く', () => {
    const line = formatPhantomLine({ sessions: 42, unassigned: 42, share: 56, warnPercent: 10, warn: true }, 28);
    assert.match(line, /⚠ 10% 超え/);
    assert.match(line, /全体の 56%/);
    const calm = formatPhantomLine({ sessions: 1, unassigned: 1, share: 3, warnPercent: 10, warn: false }, 28);
    assert.doesNotMatch(calm, /⚠/);
  });
});

describe('Yahoo! AI と参照元ホスト（yahoo-ai-search-referral.md の A）', () => {
  it('参照元は session_start に絞った eventCount を、ホスト × sessionSource × チャネルで直近だけ引く', () => {
    const body = referrerRequest(28);
    assert.deepEqual(
      body.dimensions.map((d) => d.name),
      ['pageReferrer', 'sessionSource', 'sessionDefaultChannelGroup'],
    );
    assert.deepEqual(body.metrics, [{ name: 'eventCount' }]);
    assert.deepEqual(body.dimensionFilter.filter, {
      fieldName: 'eventName',
      stringFilter: { matchType: 'EXACT', value: 'session_start' },
    });
    assert.equal(body.dateRanges.length, 1);
    assert.equal(body.dateRanges[0].endDate, 'yesterday');
  });

  it('参照元の URL はホスト名に丸め、空は (none) にする', () => {
    assert.equal(referrerHost('https://search.yahoo.co.jp/search?p=%E9%85%92'), 'search.yahoo.co.jp');
    assert.equal(referrerHost(''), '(none)');
    assert.equal(referrerHost(undefined), '(none)');
    assert.equal(referrerHost('(not set)'), '(not set)');
  });

  it('同じホストのパス違いを1行にまとめ、多い順に並べる', () => {
    const referrers = summarizeReferrers(parseRows(REFERRER_BODY));
    assert.deepEqual(referrers[0], {
      host: 'www.bing.com',
      source: 'bing',
      channel: 'Organic Search',
      sessions: 189,
    });
    assert.deepEqual(referrers[1], {
      host: 'search.yahoo.co.jp',
      source: 'openai',
      channel: 'Organic Search',
      sessions: 93,
    });
    assert.equal(referrers[2].host, '(none)');
  });

  it('上位10行までに切る', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      pageReferrer: `https://r${i}.example/`,
      sessionSource: `r${i}`,
      sessionDefaultChannelGroup: 'Referral',
      sessions: i + 1,
    }));
    const referrers = summarizeReferrers(rows);
    assert.equal(referrers.length, 10);
    assert.equal(referrers[0].sessions, 15);
  });

  it('AI 経由の合計は ChatGPT 直接・Yahoo! AI（Organic Search に入っていても）・その他の AI Assistant を足す', () => {
    const traffic = summarizeAiTraffic(parseRows(CHANNEL_BODY_YAHOO));
    assert.deepEqual(traffic.current, { total: 149, chatgpt: 52, yahoo: 93, other: 4 });
    assert.deepEqual(traffic.previous, { total: 62, chatgpt: 60, yahoo: 2, other: 0 });
    assert.equal(traffic.delta, 87);
  });

  it('AI Assistant チャネル単独だと Yahoo! AI が抜ける（判断の値は合計のほう）', () => {
    const summary = summarize(parseRows(CHANNEL_BODY_YAHOO), []);
    assert.equal(summary.ai.current, 56);
    assert.equal(summary.aiTraffic.current.total, 149);
  });

  it('判断の1行に合計・内訳・前期比が入り、レポートの先頭に来る', () => {
    const summary = summarize(parseRows(CHANNEL_BODY_YAHOO), [], {
      referrerRows: parseRows(REFERRER_BODY),
    });
    const line = formatAiTrafficLine(summary);
    assert.equal(
      line,
      'AI 経由: 合計 149（ChatGPT 直接 52・Yahoo! AI 93・その他の AI Assistant 4）／直近28日・前の28日は 62・+87',
    );
    const report = formatReport(summary);
    assert.equal(report.split('\n')[0], line);
    assert.ok(report.includes(AI_SOURCE_NOTE));
    assert.match(report, /search\.yahoo\.co\.jp \/ openai \/ Organic Search: 93/);
  });

  it('セッションが0件でも合計は0で落ちない', () => {
    const empty = summarize([], []);
    assert.deepEqual(empty.aiTraffic.current, { total: 0, chatgpt: 0, yahoo: 0, other: 0 });
    assert.deepEqual(empty.referrers, []);
    assert.match(formatAiTrafficLine(empty), /合計 0/);
  });
});

describe('参照元が未確定のセッション（yahoo-ai-search-referral.md の B）', () => {
  it('(data not available) と (not set) を直近ぶんだけ数え、割合を出す', () => {
    // 直近合計 504、未確定 166 → 32.9%
    const unresolved = summarizeUnresolved(parseRows(CHANNEL_BODY_YAHOO));
    assert.equal(unresolved.sessions, 166);
    assert.equal(unresolved.share, 32.9);
    assert.equal(unresolved.warn, true);
  });

  it('閾値ちょうどは警告しない。超えたら警告する（10%）', () => {
    const rows = (n) => [
      { sessionSource: 'bing', sessionDefaultChannelGroup: 'Organic Search', sessions: 100 - n },
      { sessionSource: '(not set)', sessionDefaultChannelGroup: 'Unassigned', sessions: n },
    ];
    assert.equal(summarizeUnresolved(rows(10)).warn, false);
    assert.equal(summarizeUnresolved(rows(11)).warn, true);
    assert.equal(summarizeUnresolved([]).share, 0);
  });

  it('閾値を超えた行には印が付く', () => {
    const line = formatUnresolvedLine(summarizeUnresolved(parseRows(CHANNEL_BODY_YAHOO)));
    assert.match(line, /^  ⚠ 10% 超え: 参照元が未確定のセッション/);
    assert.match(line, /166（直近28日・全体の 32\.9%）/);
  });
});

describe('引数', () => {
  it('既定はプロパティ548154955・28日', () => {
    const options = parseArgs([]);
    assert.equal(options.propertyId, DEFAULT_PROPERTY_ID);
    assert.equal(options.days, 28);
  });

  it('知らないオプションは落とす', () => {
    assert.throws(() => parseArgs(['--nope']), /知らないオプション/);
    assert.throws(() => parseArgs(['--days']), /値が必要/);
    assert.throws(() => parseArgs(['--days', '0']), /1以上の整数/);
  });
});

describe('スクリプト全体', () => {
  it('計測してレポートを出す', async () => {
    const { deps, stdout } = harness();
    assert.equal(await main([], deps), EXIT_OK);
    const report = stdout.join('\n');
    assert.match(report, /AI Assistant: 68 セッション/);
    assert.match(report, /bing: 240/);
  });

  it('--out にJSONを書き出す（週ごとに並べて見るため）', async () => {
    const { deps, written } = harness();
    assert.equal(await main(['--out', 'ga4.json'], deps), EXIT_OK);
    assert.equal(written.length, 1);
    const snapshot = JSON.parse(written[0].text);
    assert.equal(snapshot.measuredAt, '2026-09-29T00:00:00.000Z');
    assert.equal(snapshot.ai.current, 68);
    assert.equal(snapshot.landings[0].page, '/games/daifugo');
  });

  it('幽霊セッションが閾値を超えたら警告する（終了コードは0のまま）', async () => {
    // CHANNEL_BODY の直近合計は 344。幽霊 43 件で 12.5%
    const { deps, stdout, stderr, written } = harness({ env: { ...harness().deps.env, GITHUB_ACTIONS: 'true' } });
    assert.equal(await main(['--out', 'ga4.json'], deps), EXIT_OK);
    assert.match(stdout.join('\n'), /⚠ 10% 超え: page_view の無いセッション（着地ページ空）: 43/);
    assert.match(stderr.join('\n'), /^::warning::page_view の無いセッションが全体の 12\.5%/m);
    const snapshot = JSON.parse(written[0].text);
    assert.equal(snapshot.phantom.sessions, 43);
    assert.equal(snapshot.phantom.warn, true);
  });

  it('Actions の外では注釈の書式にしない', async () => {
    const { deps, stderr } = harness();
    assert.equal(await main([], deps), EXIT_OK);
    assert.match(stderr.join('\n'), /^警告: page_view の無いセッション/m);
    assert.doesNotMatch(stderr.join('\n'), /::warning::/);
  });

  it('閾値以下なら警告しない', async () => {
    const { deps, stderr } = harness({
      report: async ({ body }) => ({
        ok: true,
        body:
          body.dimensionFilter?.filter?.fieldName === 'landingPage'
            ? { dimensionHeaders: [{ name: 'sessionDefaultChannelGroup' }], rows: [] }
            : fakeBody(body),
      }),
    });
    assert.equal(await main([], deps), EXIT_OK);
    assert.doesNotMatch(stderr.join('\n'), /page_view の無いセッション/);
  });

  it('AI 経由の合計と参照元ホストをレポートと JSON に残す', async () => {
    const { deps, stdout, written } = harness();
    assert.equal(await main(['--out', 'ga4.json'], deps), EXIT_OK);
    assert.match(stdout.join('\n'), /^AI 経由: 合計 68/);
    assert.match(stdout.join('\n'), /search\.yahoo\.co\.jp \/ openai/);
    const snapshot = JSON.parse(written[0].text);
    assert.equal(snapshot.aiTraffic.current.total, 68);
    assert.equal(snapshot.referrers[1].host, 'search.yahoo.co.jp');
    assert.equal(snapshot.unresolved.warn, false);
  });

  it('参照元が未確定のセッションが10%を超えたら警告する（終了コードは0のまま）', async () => {
    const { deps, stderr, written } = harness({
      env: { ...harness().deps.env, GITHUB_ACTIONS: 'true' },
      report: async ({ body }) => ({
        ok: true,
        body: body.dimensionFilter ? fakeBody(body) : CHANNEL_BODY_YAHOO,
      }),
    });
    assert.equal(await main(['--out', 'ga4.json'], deps), EXIT_OK);
    assert.match(
      stderr.join('\n'),
      /^::warning::参照元が未確定のセッションが 166 件（32\.9%）。直近 1〜2 日分の処理待ちの可能性/m,
    );
    assert.equal(JSON.parse(written[0].text).unresolved.sessions, 166);
  });

  it('参照元が未確定のセッションが少なければ警告しない', async () => {
    const { deps, stderr } = harness();
    assert.equal(await main([], deps), EXIT_OK);
    assert.doesNotMatch(stderr.join('\n'), /参照元が未確定/);
  });

  it('参照元の集計が取れなければ終了コード2', async () => {
    const { deps, stderr } = harness({
      report: async ({ body }) =>
        body.dimensionFilter?.filter?.fieldName === 'eventName'
          ? { ok: false, error: 'HTTP 400' }
          : { ok: true, body: fakeBody(body) },
    });
    assert.equal(await main([], deps), EXIT_FAILED);
    assert.match(stderr.join('\n'), /GA4 の集計を取れません（referrers）/);
  });

  it('幽霊セッションの集計が取れなければ終了コード2', async () => {
    const { deps, stderr } = harness({
      report: async ({ body }) =>
        body.dimensionFilter?.filter?.fieldName === 'landingPage'
          ? { ok: false, error: 'HTTP 400' }
          : { ok: true, body: fakeBody(body) },
    });
    assert.equal(await main([], deps), EXIT_FAILED);
    assert.match(stderr.join('\n'), /GA4 の集計を取れません（phantoms）/);
  });

  it('--dry-run はAPIを叩かずリクエストだけ出す', async () => {
    let called = false;
    const { deps, stdout } = harness({
      report: async () => {
        called = true;
        return { ok: false, error: '呼んではいけない' };
      },
    });
    assert.equal(await main(['--dry-run'], deps), EXIT_OK);
    assert.equal(called, false);
    assert.match(stdout.join('\n'), /sessionDefaultChannelGroup/);
    assert.match(stdout.join('\n'), /"phantoms"/);
    assert.match(stdout.join('\n'), /"referrers"/);
  });

  it('認証できなければ終了コード2', async () => {
    const { deps, stderr } = harness({ env: {} });
    assert.equal(await main([], deps), EXIT_FAILED);
    assert.match(stderr.join('\n'), /認証に失敗/);
  });

  it('APIが失敗したら終了コード2（黙って0を返さない）', async () => {
    // 権限が無いときに「AI経由0セッション」と読めてしまうのがいちばん困る
    const { deps, stderr } = harness({ report: async () => ({ ok: false, error: 'HTTP 403' }) });
    assert.equal(await main([], deps), EXIT_FAILED);
    assert.match(stderr.join('\n'), /GA4 の集計を取れません/);
  });
});

describe('runReport の投げ直し', () => {
  it('429 は待って投げ直す', async () => {
    const calls = [];
    const result = await runReport(
      { propertyId: '1', accessToken: 't', body: {} },
      {
        fetchImpl: async () => {
          calls.push(1);
          return calls.length < 3
            ? { ok: false, status: 429, text: async () => 'slow down' }
            : { ok: true, json: async () => ({ rows: [] }) };
        },
        sleep: async () => {},
      },
    );
    assert.equal(result.ok, true);
    assert.equal(calls.length, 3);
  });

  it('403 は投げ直さない（待っても変わらない）', async () => {
    const calls = [];
    const result = await runReport(
      { propertyId: '1', accessToken: 't', body: {} },
      {
        fetchImpl: async () => {
          calls.push(1);
          return { ok: false, status: 403, text: async () => 'forbidden' };
        },
        sleep: async () => {},
      },
    );
    assert.equal(result.ok, false);
    assert.equal(calls.length, 1);
    assert.match(result.error, /HTTP 403/);
  });
});
