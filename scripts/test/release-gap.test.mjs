// 「直したのに本番が古い」を数える（scripts/release-gap.mjs）。
//
// 仕様: docs/features/honban-release-gap-2026-11-16.md の B-4

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildStageIndex,
  classifyCommit,
  DEFAULT_MAX_DAYS,
  displaySubject,
  fileEffect,
  formatReport,
  jstDate,
  jstDaysBetween,
  prNumberOf,
  readHistory,
  refLabel,
  SHALLOW_WARNING,
  summarize,
  warningLine,
} from '../lib/release-gap.mjs';
import { DEFAULTS, parseArgs, run } from '../release-gap.mjs';

const ENTRIES = [
  { kind: 'tools', slug: 'sozoku-toki-kigen', stage: 'public' },
  { kind: 'tools', slug: 'aircon-denkidai', stage: 'public' },
  { kind: 'tools', slug: 'bmi', stage: 'wip' },
  { kind: 'tools', slug: 'menkyo-koshin', stage: 'wip' },
  { kind: 'games', slug: 'daifugo', stage: 'public' },
  { kind: 'games', slug: 'chess', stage: 'wip' },
  { kind: 'learn', slug: 'nisa', stage: 'public' },
];
const index = buildStageIndex(ENTRIES);

describe('classifyCommit（仕様書 B-1 の 4 区分）', () => {
  it('public-fix：件名が「正確さ」で、public の slug の app/ を触る', () => {
    assert.equal(
      classifyCommit(
        {
          subject: 'feat: 公開中ツールの正確さの点検（2026-11-04）の実装 (#458)',
          files: ['tools/app/sozoku-toki-kigen/page.tsx', 'docs/features/x.md'],
        },
        index,
      ),
      'public-fix',
    );
  });

  it('public-fix：件名のキーワードは「誤り」「ずれ」「条文」でも当たる', () => {
    for (const word of ['誤り', 'ずれ', '条文']) {
      const commit = { subject: `feat: 割引の1円の${word}を直す`, files: ['tools/lib/rounding.ts'] };
      assert.equal(classifyCommit(commit, index), 'public-fix', word);
    }
  });

  it('public-update：件名は当たらないが public の slug を触る', () => {
    assert.equal(
      classifyCommit(
        {
          subject: 'feat: エアコン電気代を冬向けに (#499)',
          files: ['tools/app/aircon-denkidai/Calculator.tsx', 'tools/lib/aircon-denkidai.ts'],
        },
        index,
      ),
      'public-update',
    );
  });

  it('public-update：home/ と learn/ の本文', () => {
    assert.equal(classifyCommit({ subject: 'feat: x', files: ['home/index.html'] }, index), 'public-update');
    assert.equal(classifyCommit({ subject: 'feat: x', files: ['learn/lib/curriculum.ts'] }, index), 'public-update');
    assert.equal(classifyCommit({ subject: 'feat: x', files: ['learn/app/_chapter/Body.tsx'] }, index), 'public-update');
  });

  it('deps：package.json / package-lock.json だけ', () => {
    assert.equal(
      classifyCommit(
        {
          subject: 'feat: next を 16.4.5 に上げる (#484)',
          files: ['tools/package.json', 'tools/package-lock.json', 'games/package-lock.json'],
        },
        index,
      ),
      'deps',
    );
  });

  it('unlisted：wip / preview の slug だけ（台帳と新しい共通ファイルは引きずられない）', () => {
    assert.equal(
      classifyCommit(
        {
          subject: 'feat: tools に「運転免許の更新期間 計算機」を wip で追加',
          files: [
            'tools/app/menkyo-koshin/page.tsx',
            'tools/lib/menkyo-koshin.ts',
            'tools/lib/registry.ts',
            'tools/app/ToolIcon.tsx',
            'tools/app/globals.css',
            'tools/lib/prefecture-capitals.ts',
            'tools/tests/menkyo-koshin.test.ts',
          ],
          added: ['tools/lib/prefecture-capitals.ts'],
        },
        index,
      ),
      'unlisted',
    );
  });

  it('public と wip の両方を触ったコミットは public-*（安全側）', () => {
    const commit = {
      subject: 'feat: BMI を wip で追加し、大富豪にイベントを足す',
      files: ['tools/app/bmi/page.tsx', 'games/app/daifugo/Game.tsx'],
    };
    assert.equal(classifyCommit(commit, index), 'public-update');
    assert.equal(classifyCommit({ ...commit, subject: 'feat: 大富豪の点数のずれ' }, index), 'public-fix');
  });

  it('lib/ の slug に結びつかない既存ファイルは、公開中の slug を持つアプリなら public-*（import はたどらない）', () => {
    const commit = { subject: 'feat: BMI を wip で追加', files: ['tools/app/bmi/page.tsx', 'tools/lib/rounding.ts'] };
    assert.equal(classifyCommit(commit, index), 'public-update');
  });

  it('台帳だけを触ったとき（stage を上げた など）は public-*', () => {
    assert.equal(classifyCommit({ subject: 'feat: BMI を public に', files: ['tools/lib/registry.ts'] }, index), 'public-update');
  });

  it('どれにも効かない（scripts/・docs/・テストだけ）は other', () => {
    assert.equal(
      classifyCommit(
        { subject: 'feat: 監査', files: ['scripts/release-gap.mjs', 'tools/tests/x.test.ts', 'CLAUDE.md', 'tools/CLAUDE.md'] },
        index,
      ),
      'other',
    );
  });
});

describe('fileEffect', () => {
  it('lib/ のファイル名が slug で始まれば、その slug の段階に従う', () => {
    assert.equal(fileEffect('games/lib/chess-puzzles.ts', index), 'unlisted');
    assert.equal(fileEffect('tools/lib/bmi.ts', index), 'unlisted');
    assert.equal(fileEffect('tools/lib/sozoku-toki-kigen.ts', index), 'public');
  });

  it('tools/app/<slug> の slug は registry の段階で決まる', () => {
    assert.equal(fileEffect('tools/app/bmi/page.tsx', index), 'unlisted');
    assert.equal(fileEffect('games/app/daifugo/Game.tsx', index), 'public');
  });

  it('アプリの外・ビルドに入らないものは none', () => {
    assert.equal(fileEffect('docs/features/a.md', index), 'none');
    assert.equal(fileEffect('.github/workflows/deploy.yml', index), 'none');
    assert.equal(fileEffect('tools/tests/a.test.ts', index), 'none');
    assert.equal(fileEffect('tools/CLAUDE.md', index), 'none');
  });
});

describe('PR 番号', () => {
  it('件名末尾の (#NNN) から取る', () => {
    assert.equal(prNumberOf('feat: 何か (#458)'), 458);
    assert.equal(refLabel({ subject: 'feat: 何か (#458)', sha: 'abcdef0123456789' }), '#458');
  });

  it('無ければ短い SHA', () => {
    assert.equal(prNumberOf('feat: 直 push'), null);
    assert.equal(refLabel({ subject: 'feat: 直 push', sha: 'abcdef0123456789' }), 'abcdef0');
  });

  it('途中の (#NNN) は PR 番号にしない', () => {
    assert.equal(prNumberOf('feat: #458 (#12) の続き と書いた'), null);
  });

  it('表に出す件名からは feat: と末尾の (#NNN) を外す', () => {
    assert.equal(displaySubject('feat: 年齢計算の年またぎ (#477)'), '年齢計算の年またぎ');
  });
});

describe('日数は JST の暦日で数える', () => {
  it('2026-11-05 に入って 2026-11-08 に数えたら 3 日', () => {
    assert.equal(jstDaysBetween('2026-11-05T10:00:00+09:00', '2026-11-08T09:00:00+09:00'), 3);
  });

  it('UTC では前日でも JST で日付が変わっていれば翌日', () => {
    // 2026-11-04T15:30Z は JST 2026-11-05 00:30
    assert.equal(jstDate('2026-11-04T15:30:00Z'), '2026-11-05');
    assert.equal(jstDaysBetween('2026-11-04T15:30:00Z', '2026-11-08T00:00:00Z'), 3);
  });

  it('同じ暦日なら 0 日', () => {
    assert.equal(jstDaysBetween('2026-11-05T00:01:00+09:00', '2026-11-05T23:59:00+09:00'), 0);
  });
});

const NOW = '2026-11-16T09:00:00+09:00';
const COMMITS = [
  {
    sha: '1'.repeat(40),
    date: '2026-11-05T12:00:00+09:00',
    subject: 'feat: 公開中ツールの正確さの点検（2026-11-04）の実装 (#458)',
    files: ['tools/app/sozoku-toki-kigen/page.tsx'],
  },
  {
    sha: '2'.repeat(40),
    date: '2026-11-14T12:00:00+09:00',
    subject: 'feat: 割引の1円のずれ (#505)',
    files: ['tools/lib/rounding.ts'],
  },
  {
    sha: '3'.repeat(40),
    date: '2026-11-13T12:00:00+09:00',
    subject: 'feat: エアコン電気代を冬向けに (#499)',
    files: ['tools/app/aircon-denkidai/page.tsx'],
  },
  { sha: '4'.repeat(40), date: '2026-11-09T12:00:00+09:00', subject: 'feat: next (#484)', files: ['tools/package.json'] },
  { sha: '5'.repeat(40), date: '2026-11-10T12:00:00+09:00', subject: 'feat: BMI を wip で (#489)', files: ['tools/app/bmi/page.tsx'] },
  { sha: '6'.repeat(40), date: '2026-11-10T12:00:00+09:00', subject: 'docs: 仕様書 (#490)', files: ['docs/features/a.md'] },
];
const TAG = { name: 'v1.30.0', date: '2026-11-03T12:39:00+09:00' };

describe('summarize / formatReport（仕様書 B-2）', () => {
  const summary = summarize({ tag: TAG, commits: COMMITS, index, now: NOW });

  it('feat: だけを数え、区分ごとに分ける', () => {
    assert.equal(summary.featCount, 5);
    assert.deepEqual(summary.groups['public-fix'].map((f) => f.ref), ['#458', '#505']);
    assert.deepEqual(summary.groups['public-update'].map((f) => f.ref), ['#499']);
    assert.equal(summary.groups.deps.length, 1);
    assert.equal(summary.groups.unlisted.length, 1);
  });

  it('最長の日数と、しきい値を超えたものだけを warning の対象にする', () => {
    assert.equal(summary.oldestFixDays, 11);
    assert.equal(summary.maxDays, DEFAULT_MAX_DAYS);
    assert.deepEqual(summary.overdue.map((f) => f.ref), ['#458']);
    assert.equal(summary.warn, true);
    assert.match(warningLine(summary), /^::warning::公開中ページの修正 1 本（#458）が 3 日を超えて/);
  });

  it('本文に最終リリース・差・各区分の本数が出る', () => {
    const text = formatReport(summary);
    assert.match(text, /^本番の最終リリース: v1\.30\.0（2026-11-03、13 日前）$/m);
    assert.match(text, /^main との差: feat 5 本$/m);
    assert.match(text, /^本番に届いていない公開中ページの修正（public-fix）: 2 本 ← 最長 11 日$/m);
    assert.match(text, /^ {2}#458 2026-11-05 {2}公開中ツールの正確さの点検（2026-11-04）の実装$/m);
    assert.match(text, /^公開中ページの更新（public-update）: 1 本$/m);
    assert.match(text, /^依存の更新（deps）: 1 本$/m);
    assert.match(text, /^公開前のもの（unlisted）: 1 本（本番に出しても一覧には出ない）$/m);
    // other が 0 本なら行を出さない
    assert.doesNotMatch(text, /other/);
  });

  it('3 日以内なら warning を出さない', () => {
    const fresh = summarize({ tag: TAG, commits: COMMITS.slice(1), index, now: NOW });
    assert.equal(fresh.oldestFixDays, 2);
    assert.equal(fresh.warn, false);
    assert.equal(warningLine(fresh), null);
  });

  it('しきい値は maxDays で変えられる', () => {
    assert.equal(summarize({ tag: TAG, commits: COMMITS, index, now: NOW, maxDays: 11 }).warn, false);
    assert.equal(summarize({ tag: TAG, commits: COMMITS, index, now: NOW, maxDays: 1 }).overdue.length, 2);
  });
});

/** 固定の応答を返す git の替え玉 */
function fakeGit({ shallow = 'false', tags = true, log = '', show = {} }) {
  return (args) => {
    const [cmd] = args;
    if (cmd === 'rev-parse') return `${shallow}\n`;
    if (cmd === 'describe') {
      if (!tags) throw new Error('fatal: No names found, cannot describe anything.');
      return `${TAG.name}\n`;
    }
    if (cmd === 'for-each-ref') return `${TAG.date}\n`;
    if (cmd === 'log') return log;
    if (cmd === 'show') return show[args.at(-1)] ?? '';
    throw new Error(`想定外の git ${args.join(' ')}`);
  };
}

describe('readHistory / run', () => {
  it('履歴が shallow のときは「リリース前」と言わず、warning を出して数えない', () => {
    const git = fakeGit({ shallow: 'true' });
    assert.deepEqual(readHistory(git, 'origin/main'), { shallow: true });
    const result = run(DEFAULTS, { git, entries: () => ENTRIES, now: NOW });
    assert.equal(result.code, 0);
    assert.deepEqual(result.lines, [SHALLOW_WARNING]);
    assert.ok(!result.lines.join('\n').includes('リリース前'));
  });

  it('タグが 1 本も無いとき（shallow でない）は「リリース前」と出して落ちない', () => {
    const git = fakeGit({ tags: false, log: '' });
    const result = run(DEFAULTS, { git, entries: () => ENTRIES, now: NOW });
    assert.equal(result.code, 0);
    assert.match(result.lines[0], /リリース前/);
  });

  it('タグ以降の log と変更ファイルを読み、追加ファイルを区別する', () => {
    const sha = 'a'.repeat(40);
    const git = fakeGit({
      log: `${sha}\t2026-11-10T12:00:00+09:00\tfeat: 新ツール (#1)\n${'b'.repeat(40)}\t2026-11-10T12:00:00+09:00\tdocs: x (#2)\n`,
      show: { [sha]: 'A\ttools/lib/new-shared.ts\nM\ttools/app/bmi/page.tsx\n' },
    });
    const history = readHistory(git, 'origin/main');
    assert.equal(history.tag.name, 'v1.30.0');
    assert.deepEqual(history.commits[0].files, ['tools/lib/new-shared.ts', 'tools/app/bmi/page.tsx']);
    assert.deepEqual(history.commits[0].added, ['tools/lib/new-shared.ts']);
    // docs: のコミットの変更ファイルは読まない
    assert.deepEqual(history.commits[1].files, []);

    const result = run(DEFAULTS, { git, entries: () => ENTRIES, now: NOW });
    assert.equal(result.summary.groups.unlisted.length, 1);
    assert.equal(result.lines.length, 1); // public-fix が無いので warning なし
  });
});

describe('parseArgs', () => {
  it('既定は origin/main・3 日', () => {
    assert.deepEqual(parseArgs([]), DEFAULTS);
    assert.equal(DEFAULTS.ref, 'origin/main');
    assert.equal(DEFAULTS.maxDays, 3);
  });

  it('--max-days と --ref を読む', () => {
    assert.equal(parseArgs(['--max-days', '7']).maxDays, 7);
    assert.equal(parseArgs(['--ref', 'HEAD']).ref, 'HEAD');
  });

  it('変な値は落とす', () => {
    assert.throws(() => parseArgs(['--max-days', '-1']));
    assert.throws(() => parseArgs(['--max-days']));
    assert.throws(() => parseArgs(['--unknown']));
  });
});
