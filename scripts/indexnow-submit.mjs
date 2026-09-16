#!/usr/bin/env node
// 更新したURLを IndexNow（Bing・Yandex・Naver・Seznam・Yep の共同エンドポイント）に通知する。
//
// 仕様: docs/features/indexnow.md
// 「変更したURLの通知」プロトコルなので、**変わっていないURLは送らない**。
// デプロイ前に取っておいた本番サイトマップ（--before）と、同期後に配信されている
// サイトマップを <loc> ＋ <lastmod> で突き合わせ、新規か lastmod が動いたURLだけを送る。
//
//   node scripts/indexnow-submit.mjs \
//     --key-file home/<key>.txt \
//     --before /tmp/sitemaps-before/ \
//     --sitemap https://hasokon.com/sitemap.xml
//
// 通知は「あれば嬉しい」であってデプロイの成否ではない。送信に失敗しても
// ::warning:: を出して終了コード 0 で終える（設定の誤りだけは 2 で落とす）。

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { collectUrls, parseEntries } from './lib/sitemap.mjs';

/** 終了コード。--help の説明と揃えてある。 */
export const EXIT_OK = 0;
export const EXIT_FAILED = 2;

/** 1つのエンドポイントに送れば参加エンジン全部に共有される（indexnow.org） */
export const ENDPOINT = 'https://api.indexnow.org/indexnow';

export const DEFAULTS = Object.freeze({
  keyFile: null,
  before: null,
  sitemap: 'https://hasokon.com/sitemap.xml',
  dryRun: false,
  help: false,
});

const USAGE = `使い方: node scripts/indexnow-submit.mjs --key-file <path> [オプション]

更新したURLを IndexNow に通知する。--before に取っておいた前回のサイトマップと
突き合わせ、新規または <lastmod> が動いたURLだけを送る。
仕様: docs/features/indexnow.md

オプション:
  --key-file <path>   鍵ファイル（home/<key>.txt）。中身＝ファイル名（拡張子を除く）
  --before <dir>      デプロイ前に保存したサイトマップ（*.xml）のディレクトリ。
                      無い・読めないときは全件送る（送り漏れ側に倒さない）
  --sitemap <url>     いま配信されているサイトマップの起点（既定: ${DEFAULTS.sitemap}）
  --dry-run           送信せず、送る予定のURLだけ出す
  --help              この説明を出す

終了コード:
  0  送信した／送る対象が0件だった／送信に失敗した（デプロイは止めない）
  2  実行できなかった（引数の誤り、鍵ファイルを読めない・中身がファイル名と違う）`;

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
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--key-file':
      case '--before':
      case '--sitemap': {
        const key = arg === '--key-file' ? 'keyFile' : arg.slice(2);
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) {
          throw new Error(`${arg} には値が必要です`);
        }
        i += 1;
        options[key] = value;
        break;
      }
      default:
        throw new Error(`知らないオプションです: ${arg}`);
    }
  }

  if (!options.help && !options.keyFile) {
    throw new Error('--key-file は必須です');
  }

  return options;
}

/**
 * 鍵ファイルの中身を検証して鍵を返す。
 *
 * IndexNow の検証は「`https://<host>/<key>.txt` を取りに行き、中身が key と一致するか」
 * だけを見る。ファイル名と中身がずれていると送信は全部 403 になるので、ここで落とす。
 *
 * @param {string} keyFile 鍵ファイルのパス
 * @param {string} contents その中身
 */
export function verifyKey(keyFile, contents) {
  const key = contents.trim();
  const name = path.basename(keyFile);
  const expected = name.endsWith('.txt') ? name.slice(0, -'.txt'.length) : name;

  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
    throw new Error(`鍵の形式が不正です（英数字とハイフンで8〜128文字）: ${keyFile}`);
  }
  if (key !== expected) {
    throw new Error(`鍵ファイルの中身がファイル名と違います: ${name} の中身が「${key}」`);
  }
  return key;
}

/**
 * 保存しておいたサイトマップ（*.xml）を読み、`loc → lastmod` の対応表にする。
 *
 * ディレクトリが無い・XMLが1枚も無いときは null を返す（＝前回が分からない）。
 * 呼び出し側はそのとき全件送る。
 */
export async function readBefore(dir, deps) {
  let names;
  try {
    names = await deps.readdir(dir);
  } catch {
    return null;
  }

  const entries = new Map();
  for (const name of names.filter((n) => n.toLowerCase().endsWith('.xml')).sort()) {
    let xml;
    try {
      xml = await deps.readFile(path.join(dir, name), 'utf8');
    } catch {
      continue;
    }
    for (const entry of parseEntries(xml)) {
      if (!entries.has(entry.loc)) entries.set(entry.loc, entry.lastmod);
    }
  }

  return entries.size > 0 ? entries : null;
}

/**
 * 送信対象のURLを選ぶ。**新規、または lastmod が変わったURL**だけ。
 *
 * @param {Map<string, string|null>|null} before 前回の `loc → lastmod`。null なら全件
 * @param {{loc: string, lastmod: string|null}[]} after いま配信されているもの
 */
export function selectChanged(before, after) {
  if (!before) return after.map((entry) => entry.loc);
  return after
    .filter((entry) => !before.has(entry.loc) || before.get(entry.loc) !== entry.lastmod)
    .map((entry) => entry.loc);
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

async function fetchTextOverHttp(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { 'user-agent': 'hasokon-indexnow-submit' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/**
 * @param {string[]} argv 実行ファイル名を除いた引数
 * @param {{
 *   fetch?: typeof fetch,
 *   readFile?: (path: string, encoding: string) => Promise<string>,
 *   readdir?: (path: string) => Promise<string[]>,
 *   stdout?: (line: string) => void,
 *   stderr?: (line: string) => void,
 * }} [deps] テストから差し替えるための入り口（テストはネットワークを使わない）
 */
export async function main(argv, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const io = {
    readFile: deps.readFile ?? readFile,
    readdir: deps.readdir ?? readdir,
  };
  // Actions のワークフローコマンド（::warning:: など）は標準出力から読まれる
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

  let key;
  try {
    key = verifyKey(options.keyFile, await io.readFile(options.keyFile, 'utf8'));
  } catch (error) {
    out(`::error::IndexNow の鍵を読めません: ${error.message}`);
    log(error.message);
    return EXIT_FAILED;
  }

  const host = new URL(options.sitemap).host;
  const keyLocation = `https://${host}/${path.basename(options.keyFile)}`;

  log(`サイトマップを読みます: ${options.sitemap}`);
  const { entries, sitemaps, errors } = await collectUrls(options.sitemap, (url) =>
    fetchTextOverHttp(url, fetchImpl),
  );
  for (const failure of errors) {
    log(`  サイトマップを読めません: ${failure.sitemap}（${failure.message}）`);
  }
  if (entries.length === 0) {
    out('::warning::IndexNow: サイトマップからURLを1件も取れませんでした。通知を見送ります');
    return EXIT_OK;
  }
  log(`  サイトマップ ${sitemaps.length} 本 / URL ${entries.length} 件`);

  const before = options.before ? await readBefore(options.before, io) : null;
  if (options.before && !before) {
    log(`  前回のサイトマップがありません（${options.before}）。全件送ります`);
  }

  const selected = selectChanged(before, entries);
  // IndexNow は鍵ファイルを置いたホストのURLしか受け付けない
  const urlList = selected.filter((url) => {
    if (hostOf(url) === host) return true;
    log(`  ホストが違うので送りません: ${url}`);
    return false;
  });

  log(`送信対象: ${urlList.length} 件（サイトマップ ${entries.length} 件中）`);
  for (const url of urlList) log(`  ${url}`);

  if (urlList.length === 0) {
    out('IndexNow: 更新されたURLはありません。送信しません');
    return EXIT_OK;
  }

  if (options.dryRun) {
    out(JSON.stringify({ host, key, keyLocation, urlList }, null, 2));
    return EXIT_OK;
  }

  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation, urlList }),
    });
  } catch (error) {
    out(`::warning::IndexNow への送信に失敗しました（${error.message}）。デプロイは続けます`);
    return EXIT_OK;
  }

  // 200 = 受理、202 = 受理したが鍵の検証は保留。どちらも成功として扱う
  if (response.status !== 200 && response.status !== 202) {
    out(
      `::warning::IndexNow が ${response.status} を返しました（${urlList.length} 件の通知は届いていません）。` +
        `鍵ファイル ${keyLocation} が配信されているか確認してください`,
    );
    return EXIT_OK;
  }

  out(`IndexNow に ${urlList.length} 件を通知しました（HTTP ${response.status}）`);
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
