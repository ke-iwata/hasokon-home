import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gzipSync } from 'node:zlib';

import { aggregate, classifyAgent, formatReport, isHtmlPath, isOwnHost, parseLogText } from '../lib/cf-logs.mjs';
import { DEFAULTS, EXIT_FAILED, EXIT_OK, decodeLogFile, main, parseArgs, sinceFor } from '../cf-logs-crawlers.mjs';

const GOOGLEBOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BINGBOT_UA =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)';
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function record(overrides = {}) {
  return {
    date: '2026-09-28',
    time: '01:02:03',
    'x-host-header': 'hasokon.com',
    'cs-method': 'GET',
    'cs-uri-stem': '/tools/saitei-chingin/',
    'sc-status': '200',
    'cs(User-Agent)': encodeURIComponent(CHROME_UA),
    asn: '2516',
    'c-country': 'JP',
    'cs(Referer)': '-',
    'x-edge-result-type': 'Hit',
    'x-edge-response-result-type': 'Hit',
    'sc-bytes': '12345',
    'time-taken': '0.002',
    ...overrides,
  };
}

const jsonl = (records) => `${records.map((r) => JSON.stringify(r)).join('\n')}\n`;

describe('classifyAgent', () => {
  it('Googlebot は UA と ASN 15169 の両方で本物と判定する', () => {
    assert.deepEqual(classifyAgent(GOOGLEBOT_UA, 15169), { kind: 'googlebot', verified: true });
    assert.deepEqual(classifyAgent(encodeURIComponent(GOOGLEBOT_UA), '15169'), {
      kind: 'googlebot',
      verified: true,
    });
  });

  it('Googlebot を名乗って別の網から来たものは詐称として分ける', () => {
    assert.deepEqual(classifyAgent(GOOGLEBOT_UA, 4837), { kind: 'googlebot-spoof', verified: false });
    assert.deepEqual(classifyAgent(GOOGLEBOT_UA, null), { kind: 'googlebot-spoof', verified: false });
  });

  it('bingbot は ASN 8075', () => {
    assert.equal(classifyAgent(BINGBOT_UA, 8075).kind, 'bingbot');
    assert.equal(classifyAgent(BINGBOT_UA, 15169).kind, 'bingbot-spoof');
  });

  it('OpenAI 系は UA だけで数え、verified は付けない', () => {
    assert.deepEqual(classifyAgent('Mozilla/5.0; GPTBot/1.2', 20473), { kind: 'gptbot', verified: null });
    assert.equal(classifyAgent('ChatGPT-User/1.0', null).kind, 'chatgpt-user');
    assert.equal(classifyAgent('OAI-SearchBot/1.0', null).kind, 'oai-searchbot');
  });

  it('端末名に CUBOT を含む Android のブラウザは human（bot\\b に引っかけない）', () => {
    const cubot =
      'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
    assert.equal(classifyAgent(cubot, 2516).kind, 'human');
    // 本物のボット名は引き続き other-bot
    assert.equal(classifyAgent('Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot)', 1).kind, 'other-bot');
    assert.equal(classifyAgent('MJ12bot/v1.4.8', 1).kind, 'other-bot');
  });

  it('SNS・チャットのリンクプレビューは social-preview', () => {
    assert.equal(classifyAgent('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 1).kind, 'social-preview');
    assert.equal(classifyAgent('Twitterbot/1.0', 1).kind, 'social-preview');
    assert.equal(classifyAgent('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)', 1).kind, 'social-preview');
    assert.equal(classifyAgent('Mozilla/5.0 (Linux; Android 14) Line/14.0.0', 1).kind, 'social-preview');
  });

  it('知らないボットは other-bot、ブラウザは human', () => {
    assert.equal(classifyAgent('SomethingCrawler/1.0', 1).kind, 'other-bot');
    assert.equal(classifyAgent('python-requests/2.31', 1).kind, 'other-bot');
    assert.equal(classifyAgent(CHROME_UA, 2516).kind, 'human');
    assert.equal(classifyAgent('', null).kind, 'human');
  });
});

describe('parseLogText', () => {
  it('JSON の1行1レコードを読む', () => {
    const rows = parseLogText(jsonl([record(), record({ 'sc-status': '404' })]));
    assert.equal(rows.length, 2);
    assert.equal(rows[1]['sc-status'], '404');
  });

  it('壊れた行と空行は飛ばす', () => {
    const rows = parseLogText(`${JSON.stringify(record())}\n{"date": "2026-\n\n`);
    assert.equal(rows.length, 1);
  });

  it('w3c（#Fields 見出し＋タブ区切り）も読める', () => {
    const text = [
      '#Version: 1.0',
      '#Fields: date time x-host-header cs-uri-stem sc-status cs(User-Agent) asn',
      ['2026-09-28', '00:00:01', 'hasokon.com', '/games/2048/', '200', encodeURIComponent(GOOGLEBOT_UA), '15169'].join('\t'),
    ].join('\n');
    const rows = parseLogText(text);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]['cs-uri-stem'], '/games/2048/');
    assert.equal(rows[0].asn, '15169');
  });
});

describe('isHtmlPath', () => {
  it('末尾スラッシュ・.html・拡張子なしは HTML、_next とアセットは違う', () => {
    assert.equal(isHtmlPath('/'), true);
    assert.equal(isHtmlPath('/tools/saitei-chingin/'), true);
    assert.equal(isHtmlPath('/privacy.html'), true);
    assert.equal(isHtmlPath('/tools/saitei-chingin'), true);
    assert.equal(isHtmlPath('/tools/_next/static/chunks/a.js'), false);
    assert.equal(isHtmlPath('/ogp.png'), false);
    assert.equal(isHtmlPath('/sitemap.xml'), false);
  });
});

describe('aggregate', () => {
  const records = [
    record({ 'cs(User-Agent)': GOOGLEBOT_UA, asn: '15169', 'cs-uri-stem': '/tools/r/lunch/' }),
    record({ 'cs(User-Agent)': GOOGLEBOT_UA, asn: '15169', 'cs-uri-stem': '/tools/saitei-chingin/' }),
    record({ 'cs(User-Agent)': GOOGLEBOT_UA, asn: '15169', 'cs-uri-stem': '/tools/saitei-chingin/' }),
    record({ 'cs(User-Agent)': GOOGLEBOT_UA, asn: '15169', 'cs-uri-stem': '/tools/_next/static/x.js' }),
    record({ 'cs(User-Agent)': GOOGLEBOT_UA, asn: '4837', 'cs-uri-stem': '/' }),
    record({ 'cs(User-Agent)': BINGBOT_UA, asn: '8075', date: '2026-09-27' }),
    record({ 'x-host-header': 'tool.hasokon.com', 'cs-uri-stem': '/nenshu-kabe/', 'sc-status': '301', 'cs(Referer)': 'https://example.jp/post/1' }),
    record({ 'x-host-header': 'tool.hasokon.com', 'cs-uri-stem': '/nenshu-kabe/', 'sc-status': '301', 'cs(Referer)': 'https://hasokon.com/tools/' }),
    record({ 'cs-uri-stem': '/old-page/', 'sc-status': '404', 'x-edge-result-type': 'Error' }),
    record({ 'x-edge-result-type': 'Miss' }),
    { time: '00:00:00' }, // 日付の無い行
  ];

  it('クローラー別の日次と、Googlebot の詐称を分けて数える', () => {
    const s = aggregate(records);
    assert.equal(s.total, 10);
    assert.equal(s.skipped, 1);
    assert.deepEqual(s.range, { since: '2026-09-27', until: '2026-09-28' });
    assert.equal(s.byDay['2026-09-28'].googlebot, 4);
    assert.equal(s.byDay['2026-09-28']['googlebot-spoof'], 1);
    assert.equal(s.byDay['2026-09-27'].bingbot, 1);
    assert.equal(s.byDay['2026-09-28'].human, 4);
  });

  it('Googlebot の URL 上位と、薄いページの比率（HTML だけで数える）', () => {
    const s = aggregate(records);
    assert.equal(s.googlebot.requests, 4);
    assert.deepEqual(s.googlebot.topPaths[0], ['/tools/saitei-chingin/', 2]);
    assert.deepEqual(s.googlebot.html, { thin: 1, other: 2 });
    assert.deepEqual(s.googlebot.statuses, { 200: 4 });
  });

  it('旧サブドメインの件数と外部の参照元。自サイトからの参照は数えない', () => {
    const s = aggregate(records);
    assert.equal(s.legacy.hosts['tool.hasokon.com'], 2);
    assert.deepEqual(s.legacy.topReferers, [['example.jp', 1]]);
  });

  it('自サイト判定は hasokon.com とそのサブドメインだけ（evilhasokon.com は外部）', () => {
    assert.equal(isOwnHost('hasokon.com'), true);
    assert.equal(isOwnHost('test.hasokon.com'), true);
    assert.equal(isOwnHost('Tool.Hasokon.com:443'), true);
    assert.equal(isOwnHost('evilhasokon.com'), false);
    assert.equal(isOwnHost('hasokon.com.example.net'), false);
    const s = aggregate([
      record({ 'x-host-header': 'tool.hasokon.com', 'sc-status': '301', 'cs(Referer)': 'https://evilhasokon.com/x' }),
    ]);
    assert.deepEqual(s.legacy.topReferers, [['evilhasokon.com', 1]]);
  });

  it('404 と HTML の result type は hasokon.com だけで数える', () => {
    const s = aggregate(records);
    assert.deepEqual(s.notFound, [['/old-page/', 1]]);
    assert.equal(s.htmlResultTypes.Error, 1);
    assert.equal(s.htmlResultTypes.Miss, 1);
    // Hit は hasokon.com の HTML だけ: r/lunch・saitei×2・詐称の `/`・bingbot の 5 件（_next と旧面は除く）
    assert.equal(s.htmlResultTypes.Hit, 5);
  });

  it('since / until で期間を絞れる', () => {
    const s = aggregate(records, { since: '2026-09-28' });
    assert.equal(s.total, 9);
    assert.equal(s.byDay['2026-09-27'], undefined);
  });

  it('IP に当たる列を出力に持ち込まない', () => {
    const s = aggregate([record({ 'c-ip': '203.0.113.1' })]);
    assert.doesNotMatch(JSON.stringify(s), /203\.0\.113\.1/);
  });
});

describe('formatReport', () => {
  it('5つの見出しと、詐称の列を出す', () => {
    const text = formatReport(
      aggregate([
        record({ 'cs(User-Agent)': GOOGLEBOT_UA, asn: '15169' }),
        record({ 'cs(User-Agent)': GOOGLEBOT_UA, asn: '1' }),
      ]),
    );
    for (const heading of ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.']) assert.match(text, new RegExp(heading));
    assert.match(text, /googlebot-spoof/);
    assert.match(text, /\| `\/tools\/saitei-chingin\/` \| 1 \|/);
    assert.match(text, /tool\.hasokon\.com \| 0/);
  });
});

describe('parseArgs', () => {
  it('引数が無ければ既定値', () => {
    assert.deepEqual(parseArgs([]), DEFAULTS);
  });

  it('それぞれのオプションを読む', () => {
    const o = parseArgs(['--dir', './cflogs', '--days', '14', '--top', '5', '--out', 'a.json']);
    assert.equal(o.dir, './cflogs');
    assert.equal(o.days, 14);
    assert.equal(o.top, 5);
    assert.equal(o.out, 'a.json');
  });

  it('値の無いオプションと知らないオプションは落とす', () => {
    assert.throws(() => parseArgs(['--dir']), /値が必要/);
    assert.throws(() => parseArgs(['--days', '0']), /1以上/);
    assert.throws(() => parseArgs(['--foo']), /知らないオプション/);
  });
});

describe('sinceFor / decodeLogFile', () => {
  it('最新日から n 日ぶんの開始日', () => {
    assert.equal(sinceFor('2026-09-28', 1), '2026-09-28');
    assert.equal(sinceFor('2026-09-28', 14), '2026-09-15');
    assert.equal(sinceFor('2026-10-01', 2), '2026-09-30');
  });

  it('.gz は展開し、それ以外はそのまま', () => {
    const text = jsonl([record()]);
    assert.equal(decodeLogFile('a.gz', gzipSync(Buffer.from(text))), text);
    assert.equal(decodeLogFile('a.json', Buffer.from(text)), text);
  });
});

describe('main', () => {
  const files = {
    'cflogs/hasokon-com/2026/09/28/a.gz': gzipSync(
      Buffer.from(jsonl([record({ 'cs(User-Agent)': GOOGLEBOT_UA, asn: '15169' }), record()])),
    ),
    'cflogs/tool-hasokon-com/2026/09/28/b.gz': gzipSync(
      Buffer.from(jsonl([record({ 'x-host-header': 'tool.hasokon.com', 'sc-status': '301' })])),
    ),
  };
  const deps = (extra = {}) => {
    const stdout = [];
    const stderr = [];
    const written = {};
    return {
      captured: { stdout, stderr, written },
      deps: {
        listFiles: async () => Object.keys(files).sort(),
        readLogFile: async (path) => files[path],
        writeSnapshot: async (path, text) => {
          written[path] = text;
        },
        now: () => '2026-09-29T00:00:00.000Z',
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
        ...extra,
      },
    };
  };

  it('--dir が無ければ 2 で使い方を出す', async () => {
    const { deps: d, captured } = deps();
    assert.equal(await main([], d), EXIT_FAILED);
    assert.match(captured.stderr.join('\n'), /--dir/);
  });

  it('--help は 0', async () => {
    const { deps: d, captured } = deps();
    assert.equal(await main(['--help'], d), EXIT_OK);
    assert.match(captured.stdout.join('\n'), /使い方/);
  });

  it('ログを読んで表を出し、--out に JSON を残す', async () => {
    const { deps: d, captured } = deps();
    assert.equal(await main(['--dir', 'cflogs', '--out', 'r.json'], d), EXIT_OK);
    const report = captured.stdout.join('\n');
    assert.match(report, /googlebot/);
    assert.match(report, /tool\.hasokon\.com \| 1/);
    const snapshot = JSON.parse(captured.written['r.json']);
    assert.equal(snapshot.measuredAt, '2026-09-29T00:00:00.000Z');
    assert.equal(snapshot.total, 3);
    assert.equal(snapshot.files, 2);
  });

  it('ログが1件も無ければ 2', async () => {
    const { deps: d, captured } = deps({ listFiles: async () => [] });
    assert.equal(await main(['--dir', 'empty'], d), EXIT_FAILED);
    assert.match(captured.stderr.join('\n'), /1件もありません/);
  });

  it('ディレクトリが読めなければ 2', async () => {
    const { deps: d } = deps({
      listFiles: async () => {
        throw new Error('ENOENT');
      },
    });
    assert.equal(await main(['--dir', 'missing'], d), EXIT_FAILED);
  });
});
