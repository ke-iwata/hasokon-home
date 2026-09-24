// AIアシスタント経由の流入を数えるスクリプトのテスト。
//
// 仕様: docs/features/ai-assistant-channel.md の A
//
// ネットワークもGoogleの認証情報も要らない（GA4 の応答を差し替えて動かす）。
// **数え方そのもの**（期間2本の取り違え・AI チャネルの拾い漏れ）と、
// **実行できなかったときに終了コード2で落ちること**を見る。

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AI_CHANNEL,
  channelRequest,
  dateRanges,
  formatSummaryLine,
  landingPageRequest,
  parseRows,
  runReport,
  summarize,
  summarizeChannels,
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
    report: async ({ body }) => ({
      ok: true,
      body: body.dimensionFilter ? LANDING_BODY : CHANNEL_BODY,
    }),
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
