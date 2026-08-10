// URL検査APIの結果を「統合が済んだか」の観点で仕分けして数える。
//
// 判定の基準は docs/features/search-index-consolidation.md の「効果の測り方」。
//   googleCanonical が旧サブドメインを指すURLの件数が 0 になったら統合完了。

/** 統合前に使っていたサブドメイン。ここを指していたら、まだ移り終わっていない。 */
export const LEGACY_HOSTS = Object.freeze([
  'tool.hasokon.com',
  'game.hasokon.com',
  'roulette.hasokon.com',
]);

/** 統合後の正しい行き先。 */
export const CANONICAL_HOSTS = Object.freeze(['hasokon.com', 'www.hasokon.com']);

/**
 * 仕分けの区分。
 * - legacy       … 旧サブドメインが正規URLのまま。これが 0 になったら完了
 * - consolidated … 新URLが正規URLとして登録済み
 * - unindexed    … まだインデックスされておらず、正規URLが決まっていない
 * - foreign      … 想定外のホストが正規URLになっている（要調査）
 * - error        … 検査そのものが失敗した
 */
export const STATUSES = Object.freeze([
  'legacy',
  'consolidated',
  'unindexed',
  'foreign',
  'error',
]);

export function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export function isLegacyUrl(url) {
  const host = hostOf(url);
  return host !== null && LEGACY_HOSTS.includes(host);
}

/**
 * URL検査APIのレスポンス1件を仕分ける。
 *
 * @param {string} url 検査したURL
 * @param {{ inspectionResult?: object } | null} response API のレスポンス本文
 * @param {{ error?: string }} [extra] 失敗したときのメッセージ
 */
export function classify(url, response, extra = {}) {
  if (extra.error || !response) {
    return {
      url,
      status: 'error',
      googleCanonical: null,
      userCanonical: null,
      verdict: null,
      coverageState: null,
      lastCrawlTime: null,
      error: extra.error ?? 'レスポンスが空です',
    };
  }

  const index = response.inspectionResult?.indexStatusResult ?? {};
  const googleCanonical = index.googleCanonical ?? null;
  const row = {
    url,
    status: 'unindexed',
    googleCanonical,
    userCanonical: index.userCanonical ?? null,
    verdict: index.verdict ?? null,
    coverageState: index.coverageState ?? null,
    lastCrawlTime: index.lastCrawlTime ?? null,
    error: null,
  };

  if (!googleCanonical) return row;

  if (isLegacyUrl(googleCanonical)) {
    row.status = 'legacy';
  } else if (CANONICAL_HOSTS.includes(hostOf(googleCanonical))) {
    row.status = 'consolidated';
  } else {
    row.status = 'foreign';
  }
  return row;
}

/** 仕分け済みの行をまとめて、件数と内訳を返す。 */
export function summarize(rows) {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const row of rows) {
    if (counts[row.status] === undefined) counts[row.status] = 0;
    counts[row.status] += 1;
  }

  const legacy = rows.filter((row) => row.status === 'legacy');
  return {
    total: rows.length,
    counts,
    legacy,
    foreign: rows.filter((row) => row.status === 'foreign'),
    errors: rows.filter((row) => row.status === 'error'),
    // 旧サブドメインごとの内訳。どのサイトの移行が遅れているかを見るため
    legacyByHost: legacy.reduce((acc, row) => {
      const host = hostOf(row.googleCanonical) ?? '(不明)';
      acc[host] = (acc[host] ?? 0) + 1;
      return acc;
    }, {}),
    // 検査が全部成功したうえで legacy が 0 なら統合完了
    complete: counts.legacy === 0 && counts.error === 0,
  };
}

/** 人が読む形のレポートにする。 */
export function formatReport(summary) {
  const lines = [];
  lines.push(`検査したURL: ${summary.total} 件`);
  lines.push('');
  lines.push('  旧サブドメインが正規URL (legacy) : ' + summary.counts.legacy);
  lines.push('  新URLが正規URL (consolidated)    : ' + summary.counts.consolidated);
  lines.push('  インデックス未登録 (unindexed)   : ' + summary.counts.unindexed);
  lines.push('  想定外のホスト (foreign)         : ' + summary.counts.foreign);
  lines.push('  検査に失敗 (error)               : ' + summary.counts.error);

  if (summary.legacy.length > 0) {
    lines.push('');
    lines.push('旧サブドメインを指したままのURL:');
    for (const row of summary.legacy) {
      lines.push(`  ${row.url}`);
      lines.push(`    → ${row.googleCanonical}（最終クロール: ${row.lastCrawlTime ?? '不明'}）`);
    }
    lines.push('');
    lines.push('旧サブドメイン別の件数:');
    for (const [host, count] of Object.entries(summary.legacyByHost).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${host}: ${count}`);
    }
  }

  if (summary.foreign.length > 0) {
    lines.push('');
    lines.push('想定外のホストが正規URLになっているURL:');
    for (const row of summary.foreign) {
      lines.push(`  ${row.url} → ${row.googleCanonical}`);
    }
  }

  if (summary.errors.length > 0) {
    lines.push('');
    lines.push('検査に失敗したURL:');
    for (const row of summary.errors) {
      lines.push(`  ${row.url}: ${row.error}`);
    }
  }

  lines.push('');
  lines.push(
    summary.complete
      ? '統合完了。旧サブドメインを正規URLとするページは残っていません。'
      : `統合は未完了。残り ${summary.counts.legacy} 件` +
          (summary.counts.error > 0 ? `（ほかに ${summary.counts.error} 件は検査に失敗）` : ''),
  );
  return lines.join('\n');
}
