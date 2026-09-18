#!/usr/bin/env node
/**
 * **開きっぱなしのプルリクエストを見つけて、PR自体にコメントで催促する。**
 *
 * **hasokon-infra の `scripts/stale-prs.mjs` と同じ中身**。PRの出どころ（定期ルーチン）が
 * 同じなので両方に置いている。片方を直したらもう片方も直すこと。
 *
 * ## なぜ必要か
 *
 * このリポジトリのPRは、ほとんどが定期ルーチン（提案・実装・レビュー）から作られる。
 * ルーチンのセッションは「PRを1時間おきに確認して、コメントがあれば対応する」という
 * 建て付けだが、**やり取りが増えてセッションが落ちると、そこで見張りが消える**。
 * 誰も拾わないまま、PRだけが残る。
 *
 * このスクリプトは**セッションの生死に関係なく**、GitHub Actions の定期実行から
 * GitHubの状態だけを見て「止まっているPR」を数え、そのPRにコメントを1つ残す。
 * コメントはPRの購読者（＝作者）に通知されるので、少なくとも人には必ず届く。
 *
 * ## 「止まっている」の測り方
 *
 * PRの `updated_at` は**このスクリプトのコメントでも動く**ので、それだけを見ると
 * 催促した瞬間に「今日動いた」ことになってしまう。そこで
 * **人間・実装ルーチンの動き（コミット・ボット以外のコメント・レビュー）だけ**を集め、
 * その最新時刻からの経過日数で判断する。ボットの催促コメントは数に入れない。
 *
 * 同じPRに毎日コメントを積まないよう、直近の催促から `--remind-every` 日のあいだは
 * 何もしない（自分の過去のコメントを目印 MARKER で見分ける）。
 *
 * ## 使い方
 *
 *   node scripts/stale-prs.mjs                  # 何もせず対象を一覧する
 *   node scripts/stale-prs.mjs --post           # 対象のPRにコメントする
 *   node scripts/stale-prs.mjs --days 5 --post  # しきい値を5日にする
 *
 * 環境変数:
 *   GITHUB_TOKEN       GitHubのトークン（Actions の secrets.GITHUB_TOKEN）
 *   GITHUB_REPOSITORY  "owner/repo"。未設定なら --repo で渡す
 *   GITHUB_API_URL     APIの入口（既定: https://api.github.com）
 */

/** APIの入口。GitHub Actions が `GITHUB_API_URL` を入れてくれる（テストの差し替え口でもある） */
const API = process.env.GITHUB_API_URL || 'https://api.github.com';

/** 催促コメントの目印。自分が付けたコメントを見分けるために埋める */
export const MARKER = '<!-- stale-pr-reminder -->';

/** 「動き」として数えないアカウント。自分の催促で経過日数が戻らないようにする */
const BOT_LOGINS = new Set(['github-actions[bot]']);

export const DEFAULTS = Object.freeze({
  days: 3,
  remindEvery: 3,
  repo: process.env.GITHUB_REPOSITORY || '',
  post: false,
  help: false,
});

const USAGE = `使い方: node scripts/stale-prs.mjs [オプション]

開いたまま動いていないPRを見つけて、PRにコメントで催促する。
仕様: docs/features/stale-pr-reminder.md

オプション:
  --days <n>          何日動いていなければ催促するか（既定: ${DEFAULTS.days}）
  --remind-every <n>  同じPRに次を催促するまでの間隔（既定: ${DEFAULTS.remindEvery}日）
  --repo <owner/repo> 対象リポジトリ（既定: 環境変数 GITHUB_REPOSITORY）
  --post              実際にコメントする（付けないと一覧を出すだけ）
  --help              この説明を出す

終了コード:
  0  正常終了（催促の有無によらず）
  2  実行できなかった（トークンが無い、APIが失敗した、など）`;

export function usage() {
  return USAGE;
}

/**
 * @param {string[]} argv 実行ファイル名を除いた引数
 * @returns {typeof DEFAULTS}
 */
export function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--post') {
      options.post = true;
      continue;
    }
    if (arg !== '--days' && arg !== '--remind-every' && arg !== '--repo') {
      throw new Error(`知らないオプションです: ${arg}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${arg} には値が必要です`);
    }
    i += 1;
    if (arg === '--repo') {
      options.repo = value;
      continue;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`${arg} は1以上の整数にしてください`);
    }
    options[arg === '--days' ? 'days' : 'remindEvery'] = parsed;
  }

  return options;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** @param {string|undefined|null} iso @returns {number} 比較用のミリ秒。読めなければ0 */
function toTime(iso) {
  const time = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}

/**
 * **PRが最後に「人の手で」動いた時刻。** ボットの催促コメントは数えない。
 *
 * @param {{created_at: string}} pr
 * @param {{comments?: object[], reviews?: object[], commits?: object[]}} activity
 * @returns {string} ISO8601。何も無ければPRの作成時刻
 */
export function lastActivityAt(pr, activity = {}) {
  const times = [toTime(pr.created_at)];

  for (const comment of activity.comments || []) {
    if (BOT_LOGINS.has(comment.user?.login)) continue;
    times.push(toTime(comment.created_at));
  }
  for (const review of activity.reviews || []) {
    if (BOT_LOGINS.has(review.user?.login)) continue;
    times.push(toTime(review.submitted_at));
  }
  for (const commit of activity.commits || []) {
    times.push(toTime(commit.commit?.committer?.date || commit.commit?.author?.date));
  }

  return new Date(Math.max(...times)).toISOString();
}

/**
 * **このスクリプトが最後に催促した時刻。** 無ければ null。
 *
 * @param {object[]} comments issueコメントの一覧
 * @returns {string|null}
 */
export function lastNudgeAt(comments = []) {
  const times = comments
    .filter((comment) => typeof comment.body === 'string' && comment.body.includes(MARKER))
    .map((comment) => toTime(comment.created_at))
    .filter((time) => time > 0);

  return times.length === 0 ? null : new Date(Math.max(...times)).toISOString();
}

/**
 * 1本のPRについて、いま催促するかを決める。**IOを持たない**ので単体で試せる。
 *
 * @returns {{nudge: boolean, staleDays: number, lastActivity: string, reason: string}}
 */
export function decide({ pr, activity = {}, now, thresholdDays, remindEveryDays }) {
  const nowTime = toTime(typeof now === 'string' ? now : new Date(now).toISOString());
  const lastActivity = lastActivityAt(pr, activity);
  const staleDays = Math.floor((nowTime - toTime(lastActivity)) / DAY_MS);

  if (staleDays < thresholdDays) {
    return { nudge: false, staleDays, lastActivity, reason: 'まだ動いている' };
  }

  const nudgedAt = lastNudgeAt(activity.comments);
  if (nudgedAt !== null) {
    const sinceNudge = Math.floor((nowTime - toTime(nudgedAt)) / DAY_MS);
    if (sinceNudge < remindEveryDays) {
      return { nudge: false, staleDays, lastActivity, reason: `${sinceNudge}日前に催促済み` };
    }
  }

  return { nudge: true, staleDays, lastActivity, reason: `${staleDays}日動いていない` };
}

/**
 * 催促コメントの本文。**目印（MARKER）を必ず先頭に置く**（次回この行で見分ける）。
 */
export function buildComment({ pr, staleDays, lastActivity, thresholdDays }) {
  const author = pr.user?.login ? `@${pr.user.login}` : '作者';
  const reviewers = (pr.requested_reviewers || []).map((user) => `@${user.login}`);
  const reviewerLine = reviewers.length > 0 ? reviewers.join(' ') : 'レビュアー未設定';
  const draft = pr.draft ? '（下書きのままです）' : '';

  return [
    MARKER,
    `**${staleDays}日動いていません**${draft}`,
    '',
    `- 最後の動き: ${lastActivity.slice(0, 10)}`,
    `- 実装: ${author}`,
    `- レビュー: ${reviewerLine}`,
    '',
    '進めるか、取り下げるかを決めてください。作業の続きを誰も見ていない可能性があります。',
    '',
    `<sub>${thresholdDays}日動いていないPRに自動でコメントしています（\`.github/workflows/pr-reminder.yml\`）。</sub>`,
  ].join('\n');
}

/** GitHub API を叩く。失敗したら投げる */
async function api(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    throw new Error(`${method} ${path} が ${response.status} を返しました: ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

/** 1本のPRについて、判断に要る材料をまとめて取る */
async function fetchActivity(repo, number, token) {
  const [comments, reviews, commits] = await Promise.all([
    api(`/repos/${repo}/issues/${number}/comments?per_page=100`, { token }),
    api(`/repos/${repo}/pulls/${number}/reviews?per_page=100`, { token }),
    api(`/repos/${repo}/pulls/${number}/commits?per_page=100`, { token }),
  ]);
  return { comments, reviews, commits };
}

export async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error(`\n${usage()}`);
    return 2;
  }

  if (options.help) {
    console.log(usage());
    return 0;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('GITHUB_TOKEN が要ります');
    return 2;
  }
  if (!options.repo.includes('/')) {
    console.error('--repo に owner/repo を渡すか、GITHUB_REPOSITORY を設定してください');
    return 2;
  }

  const now = new Date().toISOString();
  const pulls = await api(`/repos/${options.repo}/pulls?state=open&per_page=100`, { token });
  console.log(`${options.repo}: 開いているPR ${pulls.length} 件（しきい値 ${options.days}日）\n`);

  let nudged = 0;
  for (const pr of pulls) {
    const activity = await fetchActivity(options.repo, pr.number, token);
    const verdict = decide({
      pr,
      activity,
      now,
      thresholdDays: options.days,
      remindEveryDays: options.remindEvery,
    });

    const mark = verdict.nudge ? '催促' : '——';
    console.log(`  [${mark}] #${pr.number} ${pr.title} (${verdict.reason})`);
    if (!verdict.nudge) continue;

    nudged += 1;
    if (!options.post) continue;

    await api(`/repos/${options.repo}/issues/${pr.number}/comments`, {
      token,
      method: 'POST',
      body: {
        body: buildComment({
          pr,
          staleDays: verdict.staleDays,
          lastActivity: verdict.lastActivity,
          thresholdDays: options.days,
        }),
      },
    });
  }

  console.log(`\n催促${options.post ? 'した' : 'の対象'}: ${nudged} 件`);
  return 0;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('stale-prs.mjs');
if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 2;
    });
}
