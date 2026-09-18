import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { describe, it } from 'node:test';

import {
  MARKER,
  buildComment,
  decide,
  lastActivityAt,
  lastNudgeAt,
  parseArgs,
} from '../stale-prs.mjs';

/**
 * 開きっぱなしのPRを催促する仕組みのテスト。
 *
 * 仕様: docs/features/stale-pr-reminder.md
 *
 * いちばん効くのは**催促コメント自身を「動き」に数えないこと**。ここが壊れると、
 * 1回催促した時点で経過日数が0に戻り、二度と催促が飛ばなくなる（放置を防ぐ
 * 仕組みが、放置を見逃す側に回る）。
 */

const NOW = '2026-09-18T00:00:00Z';

/** @param {number} days NOW から何日前か */
function daysAgo(days) {
  return new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();
}

function pullRequest(overrides = {}) {
  return {
    number: 1,
    title: 'feat: 何かを足す',
    draft: false,
    user: { login: 'ke-iwata' },
    requested_reviewers: [],
    created_at: daysAgo(10),
    ...overrides,
  };
}

const THRESHOLD = { thresholdDays: 3, remindEveryDays: 3 };

describe('lastActivityAt', () => {
  it('コミット・コメント・レビューのうち最新を返す', () => {
    const activity = {
      comments: [{ user: { login: 'ke-iwata' }, created_at: daysAgo(8) }],
      reviews: [{ user: { login: 'ke-iwata' }, submitted_at: daysAgo(5) }],
      commits: [{ commit: { committer: { date: daysAgo(9) } } }],
    };

    assert.equal(lastActivityAt(pullRequest(), activity), daysAgo(5));
  });

  it('ボットの催促コメントは動きに数えない', () => {
    const activity = {
      comments: [
        { user: { login: 'github-actions[bot]' }, created_at: daysAgo(0), body: MARKER },
      ],
      commits: [{ commit: { committer: { date: daysAgo(7) } } }],
    };

    assert.equal(lastActivityAt(pullRequest(), activity), daysAgo(7));
  });

  it('何も無ければPRの作成時刻を返す', () => {
    assert.equal(lastActivityAt(pullRequest({ created_at: daysAgo(4) }), {}), daysAgo(4));
  });
});

describe('decide', () => {
  it('しきい値を超えていなければ催促しない', () => {
    const verdict = decide({
      pr: pullRequest({ created_at: daysAgo(2) }),
      now: NOW,
      ...THRESHOLD,
    });

    assert.equal(verdict.nudge, false);
    assert.equal(verdict.staleDays, 2);
  });

  it('しきい値ちょうどで催促する', () => {
    const verdict = decide({ pr: pullRequest({ created_at: daysAgo(3) }), now: NOW, ...THRESHOLD });

    assert.equal(verdict.nudge, true);
    assert.equal(verdict.staleDays, 3);
  });

  it('催促したばかりのPRは間を空ける', () => {
    const activity = {
      comments: [
        { user: { login: 'github-actions[bot]' }, created_at: daysAgo(1), body: `${MARKER}\n催促` },
      ],
    };
    const verdict = decide({ pr: pullRequest(), activity, now: NOW, ...THRESHOLD });

    assert.equal(verdict.nudge, false);
    assert.match(verdict.reason, /催促済み/);
  });

  it('前の催促から間隔が空いていれば、また催促する', () => {
    const activity = {
      comments: [
        { user: { login: 'github-actions[bot]' }, created_at: daysAgo(4), body: `${MARKER}\n催促` },
      ],
    };
    const verdict = decide({ pr: pullRequest(), activity, now: NOW, ...THRESHOLD });

    assert.equal(verdict.nudge, true);
    assert.equal(verdict.staleDays, 10, '催促コメントで経過日数が戻ってはいけない');
  });

  it('催促のあとに人が動いたら、そこから数え直す', () => {
    const activity = {
      comments: [
        { user: { login: 'github-actions[bot]' }, created_at: daysAgo(6), body: MARKER },
        { user: { login: 'ke-iwata' }, created_at: daysAgo(1), body: '見ます' },
      ],
    };
    const verdict = decide({ pr: pullRequest(), activity, now: NOW, ...THRESHOLD });

    assert.equal(verdict.nudge, false);
    assert.equal(verdict.staleDays, 1);
  });
});

describe('lastNudgeAt', () => {
  it('目印のあるコメントだけを見る', () => {
    const comments = [
      { created_at: daysAgo(2), body: 'ふつうのコメント' },
      { created_at: daysAgo(5), body: `${MARKER}\n**5日動いていません**` },
    ];

    assert.equal(lastNudgeAt(comments), daysAgo(5));
  });

  it('催促がなければ null', () => {
    assert.equal(lastNudgeAt([{ created_at: daysAgo(2), body: 'ふつうのコメント' }]), null);
  });
});

describe('buildComment', () => {
  it('目印・経過日数・作者を入れる', () => {
    const body = buildComment({
      pr: pullRequest(),
      staleDays: 8,
      lastActivity: daysAgo(8),
      thresholdDays: 3,
    });

    assert.ok(body.startsWith(MARKER), '目印が先頭にないと次回の判定ができない');
    assert.match(body, /8日動いていません/);
    assert.match(body, /@ke-iwata/);
    assert.match(body, /レビュアー未設定/);
  });

  it('下書きのままなら、そう書く', () => {
    const body = buildComment({
      pr: pullRequest({ draft: true }),
      staleDays: 4,
      lastActivity: daysAgo(4),
      thresholdDays: 3,
    });

    assert.match(body, /下書き/);
  });
});

describe('parseArgs', () => {
  it('既定は3日・催促なし（一覧だけ）', () => {
    const options = parseArgs([]);

    assert.equal(options.days, 3);
    assert.equal(options.remindEvery, 3);
    assert.equal(options.post, false);
  });

  it('しきい値と --post を受け取る', () => {
    const options = parseArgs(['--days', '5', '--remind-every', '7', '--post']);

    assert.equal(options.days, 5);
    assert.equal(options.remindEvery, 7);
    assert.equal(options.post, true);
  });

  it('知らないオプションや不正な値は投げる', () => {
    assert.throws(() => parseArgs(['--nope']), /知らないオプション/);
    assert.throws(() => parseArgs(['--days']), /値が必要/);
    assert.throws(() => parseArgs(['--days', '0']), /1以上の整数/);
  });
});

/**
 * ここから下は**APIを叩く経路**のテスト。GitHubの代わりに小さなサーバーを立て、
 * `GITHUB_API_URL` を向けて実際にスクリプトを走らせる。
 * 「催促の対象を正しく選んだか」ではなく、**選んだPRにコメントを本当にPOSTするか**、
 * `--post` が無いときに**POSTしない**かを見ている。
 */
describe('スクリプトとしての実行', () => {
  /** 開いているPR: #1 は10日止まっている、#2 は今日動いた */
  function stubGitHub() {
    const posted = [];
    const server = createServer((req, res) => {
      const [path] = req.url.split('?');
      const json = (value) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };

      if (path === '/repos/o/r/pulls') {
        return json([
          pullRequest({ number: 1, created_at: daysAgo(10) }),
          pullRequest({ number: 2, created_at: daysAgo(10) }),
        ]);
      }
      if (path === '/repos/o/r/pulls/1/commits') return json([]);
      if (path === '/repos/o/r/pulls/2/commits') {
        return json([{ commit: { committer: { date: new Date().toISOString() } } }]);
      }
      if (path.endsWith('/reviews') || path.endsWith('/comments')) {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          return req.on('end', () => {
            posted.push({ path, body: JSON.parse(body).body });
            res.writeHead(201, { 'content-type': 'application/json' });
            res.end('{}');
          });
        }
        return json([]);
      }
      res.writeHead(404);
      res.end('{}');
    });

    return { server, posted };
  }

  async function run(args, { server, posted }) {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const result = await new Promise((resolve) => {
      const child = execFile(
        process.execPath,
        ['scripts/stale-prs.mjs', '--repo', 'o/r', ...args],
        {
          cwd: new URL('../..', import.meta.url).pathname,
          env: {
            ...process.env,
            GITHUB_TOKEN: 'test-token',
            GITHUB_API_URL: `http://127.0.0.1:${port}`,
            NO_PROXY: '127.0.0.1,localhost',
          },
        },
        (error, stdout, stderr) => resolve({ code: child.exitCode, stdout, stderr, error }),
      );
    });
    server.close();
    return { ...result, posted };
  }

  it('--post を付けると、止まっているPRにだけコメントする', async () => {
    const { stdout, posted } = await run(['--post'], stubGitHub());

    assert.equal(posted.length, 1, `1件だけのはず: ${JSON.stringify(posted)}`);
    assert.equal(posted[0].path, '/repos/o/r/issues/1/comments');
    assert.ok(posted[0].body.startsWith(MARKER));
    assert.match(stdout, /催促した: 1 件/);
  });

  it('--post が無ければ一覧を出すだけでコメントしない', async () => {
    const { stdout, posted } = await run([], stubGitHub());

    assert.equal(posted.length, 0);
    assert.match(stdout, /催促の対象: 1 件/);
  });

  it('トークンが無ければ終了コード2', async () => {
    const stub = stubGitHub();
    await new Promise((resolve) => stub.server.listen(0, '127.0.0.1', resolve));
    const result = await new Promise((resolve) => {
      execFile(
        process.execPath,
        ['scripts/stale-prs.mjs', '--repo', 'o/r'],
        { cwd: new URL('../..', import.meta.url).pathname, env: { ...process.env, GITHUB_TOKEN: '' } },
        (error, stdout, stderr) => resolve({ error, stderr }),
      );
    });
    stub.server.close();

    assert.equal(result.error?.code, 2);
    assert.match(result.stderr, /GITHUB_TOKEN/);
  });
});
