#!/usr/bin/env node
// CloudFront のアクセスログ（標準ログ v2、S3 に JSON で配信）を手元で数える。
//
// 仕様: hasokon-infra の docs/features/cloudfront-access-logs.md（PR #15）
//
//   aws s3 sync s3://hasokon-cloudfront-logs/ ./cflogs --quiet
//   node scripts/cf-logs-crawlers.mjs --dir ./cflogs --days 14
//
// 出すもの（仕様書の「集計スクリプト」の 1〜5）:
//   1. クローラー別の日次リクエスト数（UA と ASN の両方で本物を判定。詐称は別に数える）
//   2. Googlebot が取りに来た URL の上位と、薄いページ（/tools/r/*・/tools/guide/*）の比率
//   3. 旧サブドメイン 3 面への要求数と外部の参照元（301 を外す時期の判断材料）
//   4. 404 になったパス（root-path-legacy-redirects で救い漏れたもの）
//   5. HTML の x-edge-result-type（キャッシュヒット率）
//
// ログには IP が無い（記録しない設定）。このスクリプトも IP を扱わない。
// 依存パッケージはゼロ。gzip の展開は node:zlib。

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { aggregate, formatReport, parseLogText } from './lib/cf-logs.mjs';

/** 終了コード。--help の説明と揃えてある。 */
export const EXIT_OK = 0;
export const EXIT_FAILED = 2;

export const DEFAULTS = Object.freeze({
  dir: null,
  days: null,
  top: 20,
  out: null,
  help: false,
});

const USAGE = `使い方: node scripts/cf-logs-crawlers.mjs --dir <path> [オプション]

aws s3 sync で手元に落とした CloudFront のアクセスログ（標準ログ v2・JSON）を読み、
クローラー別の日次件数・Googlebot が取りに来た URL・旧サブドメインへの要求・
404・キャッシュヒット率を Markdown の表で出す。
仕様: hasokon-infra/docs/features/cloudfront-access-logs.md

オプション:
  --dir <path>      ログのディレクトリ（必須。配下を再帰的に読む。.gz はその場で展開）
  --days <n>        直近 n 日だけ数える（ログの最新日から数える。既定は全部）
  --top <n>         各表の行数（既定: ${DEFAULTS.top}）
  --out <path>      集計をJSONで保存する。週ごとに並べて見るためのもの
  --help            この説明を出す

終了コード:
  0  集計できた
  2  実行できなかった（ディレクトリが無い、ログが1件も無い、など）`;

export function usage() {
  return USAGE;
}

/** @param {string[]} argv 実行ファイル名を除いた引数 */
export function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg !== '--dir' && arg !== '--days' && arg !== '--top' && arg !== '--out') {
      throw new Error(`知らないオプションです: ${arg}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${arg} には値が必要です`);
    }
    i += 1;
    if (arg === '--days' || arg === '--top') {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${arg} は1以上の整数にしてください`);
      }
      options[arg.slice(2)] = parsed;
    } else {
      options[arg.slice(2)] = value;
    }
  }

  return options;
}

/** ディレクトリ配下のファイルを再帰的に列挙する（ソート済み） */
export async function listLogFiles(dir, deps = {}) {
  const readDirectory = deps.readdir ?? ((path) => readdir(path, { withFileTypes: true }));
  const files = [];
  const walk = async (current) => {
    const entries = await readDirectory(current);
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  await walk(dir);
  return files.sort();
}

/** 1ファイルを文字列にする。.gz は展開する */
export function decodeLogFile(path, buffer) {
  const bytes = path.endsWith('.gz') ? gunzipSync(buffer) : buffer;
  return bytes.toString('utf8');
}

/** ログの最新日から n 日ぶんの開始日（yyyy-mm-dd） */
export function sinceFor(latestDate, days) {
  const latest = new Date(`${latestDate}T00:00:00Z`);
  latest.setUTCDate(latest.getUTCDate() - (days - 1));
  return latest.toISOString().slice(0, 10);
}

/**
 * @param {string[]} argv 実行ファイル名を除いた引数
 * @param {{
 *   listFiles?: (dir: string) => Promise<string[]>,
 *   readLogFile?: (path: string) => Promise<Buffer>,
 *   writeSnapshot?: (path: string, text: string) => Promise<void>,
 *   now?: () => string,
 *   stdout?: (line: string) => void,
 *   stderr?: (line: string) => void,
 * }} [deps] テストから差し替えるための入り口
 */
export async function main(argv, deps = {}) {
  const listFiles = deps.listFiles ?? listLogFiles;
  const readLogFile = deps.readLogFile ?? ((path) => readFile(path));
  const writeSnapshot = deps.writeSnapshot ?? ((path, text) => writeFile(path, text, 'utf8'));
  const now = deps.now ?? (() => new Date().toISOString());
  const out = deps.stdout ?? ((line) => console.log(line));
  const log = deps.stderr ?? ((line) => console.error(line));

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    log(error.message);
    log('');
    log(usage());
    return EXIT_FAILED;
  }

  if (options.help) {
    out(usage());
    return EXIT_OK;
  }

  if (!options.dir) {
    log('--dir にログのディレクトリを指定してください。');
    log('');
    log(usage());
    return EXIT_FAILED;
  }

  let files;
  try {
    files = await listFiles(options.dir);
  } catch (error) {
    log(`ログのディレクトリを読めません: ${error.message}`);
    return EXIT_FAILED;
  }
  if (files.length === 0) {
    log(`ログが1件もありません: ${options.dir}`);
    log('aws s3 sync s3://hasokon-cloudfront-logs/ <dir> で先に落としてください（配信は最大12時間遅れます）。');
    return EXIT_FAILED;
  }

  const records = [];
  let broken = 0;
  for (const path of files) {
    try {
      records.push(...parseLogText(decodeLogFile(path, await readLogFile(path))));
    } catch (error) {
      broken += 1;
      log(`読めないファイルを飛ばしました: ${path}（${error.message}）`);
    }
  }
  log(`ファイル ${files.length} 本・${records.length} 行を読みました${broken ? `（読めなかったファイル ${broken} 本）` : ''}`);

  let since = null;
  if (options.days) {
    const all = aggregate(records, { top: 1 });
    if (all.range.until) since = sinceFor(all.range.until, options.days);
  }

  const summary = aggregate(records, { since, top: options.top });
  if (summary.total === 0) {
    log('日付の読めるログ行がありません（出力形式が想定外かもしれません。json を前提にしています）。');
    return EXIT_FAILED;
  }

  out(formatReport(summary));

  if (options.out) {
    const snapshot = {
      // 実行日時は結果の意味に効くので必ず残す（docs/README.md の「数字を根拠にする」）
      measuredAt: now(),
      dir: options.dir,
      files: files.length,
      days: options.days,
      ...summary,
    };
    await writeSnapshot(options.out, `${JSON.stringify(snapshot, null, 2)}\n`);
    log(`結果を書き出しました: ${options.out}`);
  }

  return EXIT_OK;
}

// テストから import しても走らないように、直接実行のときだけ動かす
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = EXIT_FAILED;
    },
  );
}
