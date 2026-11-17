#!/usr/bin/env node
// 「直したのに本番が古い」を数える。
//
// 仕様: docs/features/honban-release-gap-2026-11-16.md の B
//
//   node scripts/release-gap.mjs
//
// 最後の `v*` タグ（＝本番の最終リリース）以降に main に入った `feat:` を、
// public-fix / public-update / deps / unlisted に分けて出す。
// `public-fix` が `--max-days`（既定 3 日）を超えて本番に届いていなければ
// `::warning::` を出す。**終了コードは 0 のまま**（リリースは運営者の判断で、
// 監査の成否と混ぜない。仕様書の B-3）。**自動リリースはしない。**
//
// GitHub Actions の中では、本文を $GITHUB_STEP_SUMMARY（Job Summary）にも書く。

import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  buildStageIndex,
  DEFAULT_MAX_DAYS,
  formatReport,
  readHistory,
  runGit,
  SHALLOW_WARNING,
  summarize,
  warningLine,
} from './lib/release-gap.mjs';
import { loadChapters, loadRegistries } from './lib/registry.mjs';

export const EXIT_OK = 0;
export const EXIT_FAILED = 2;

export const DEFAULTS = Object.freeze({
  ref: 'origin/main',
  maxDays: DEFAULT_MAX_DAYS,
  help: false,
});

const USAGE = `使い方: node scripts/release-gap.mjs [オプション]

最後の v* タグ以降に main に入った feat: のコミットを、本番で見えるものに
効くかどうかで分けて数える（public-fix / public-update / deps / unlisted）。
public-fix が --max-days を超えて本番に届いていなければ ::warning:: を出す。
仕様: docs/features/honban-release-gap-2026-11-16.md の B

オプション:
  --ref <ref>       数える先（既定: ${DEFAULTS.ref}）
  --max-days <n>    public-fix の許容日数（既定: ${DEFAULTS.maxDays}）
  --help            この説明を出す

履歴が shallow（checkout の fetch-depth: 1 など）のときは数えずに警告だけ出す。

終了コード:
  0  数えた（warning を出したときも 0）／shallow で数えられなかった
  2  実行できなかった（git が読めない・registry が読めない など）`;

export function usage() {
  return USAGE;
}

export function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--ref':
      case '--max-days': {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) throw new Error(`${arg} には値が必要です`);
        i += 1;
        if (arg === '--ref') {
          options.ref = value;
        } else {
          const n = Number(value);
          if (!Number.isInteger(n) || n < 0) throw new Error('--max-days は0以上の整数にしてください');
          options.maxDays = n;
        }
        break;
      }
      default:
        throw new Error(`知らないオプションです: ${arg}`);
    }
  }
  return options;
}

/**
 * 本体。テストから git・registry・時刻・出力先を差し替えられるようにしてある。
 *
 * @returns {{code: number, lines: string[], summary?: object}}
 */
export function run(options, deps = {}) {
  const {
    git = runGit,
    entries = () => [...loadRegistries(), ...loadChapters()],
    now = new Date().toISOString(),
  } = deps;

  const history = readHistory(git, options.ref);
  if (history.shallow) return { code: EXIT_OK, lines: [SHALLOW_WARNING] };

  const summary = summarize({
    tag: history.tag,
    commits: history.commits,
    index: buildStageIndex(entries()),
    now,
    maxDays: options.maxDays,
  });
  const lines = [formatReport(summary)];
  const warning = warningLine(summary);
  if (warning) lines.push(warning);
  return { code: EXIT_OK, lines, summary };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    return EXIT_FAILED;
  }
  if (options.help) {
    console.log(usage());
    return EXIT_OK;
  }

  let result;
  try {
    result = run(options);
  } catch (error) {
    console.error(`リリースの遅れを数えられませんでした: ${error.message}`);
    return EXIT_FAILED;
  }

  for (const line of result.lines) console.log(line);

  // Job Summary には本文だけ（::warning:: はログの注釈として出る）
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath && result.summary) {
    const body = result.lines.filter((l) => !l.startsWith('::')).join('\n');
    appendFileSync(summaryPath, `## リリースの遅れ\n\n\`\`\`\n${body}\n\`\`\`\n`);
  }
  return result.code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main();
}
