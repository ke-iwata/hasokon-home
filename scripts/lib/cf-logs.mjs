// CloudFront 標準ログ v2 の読み取りと集計。純関数だけ（ファイルもネットワークも触らない）。
//
// 仕様: hasokon-infra の docs/features/cloudfront-access-logs.md
//
// ログには IP が無い（記録しない設定）。クローラーの真偽は UA と ASN の両方で見る:
//   Googlebot … UA に "Googlebot" かつ ASN 15169（Google）
//   bingbot   … UA に "bingbot"   かつ ASN 8075（Microsoft）
// UA だけ一致して ASN が違うものは「詐称」として別に数える。
// OpenAI 系（GPTBot / ChatGPT-User / OAI-SearchBot）は固定の ASN を公表していないので
// UA だけで数え、verified は付けない。

/** UA と ASN からクローラー種別を決めるための表。上から順に最初に当たったもの */
export const AGENT_RULES = Object.freeze([
  { kind: 'googlebot', pattern: /Googlebot|Google-InspectionTool|Storebot-Google/i, asn: 15169 },
  { kind: 'bingbot', pattern: /bingbot|BingPreview/i, asn: 8075 },
  { kind: 'gptbot', pattern: /GPTBot/i, asn: null },
  { kind: 'chatgpt-user', pattern: /ChatGPT-User/i, asn: null },
  { kind: 'oai-searchbot', pattern: /OAI-SearchBot/i, asn: null },
  { kind: 'claudebot', pattern: /ClaudeBot|Claude-Web|anthropic-ai/i, asn: null },
  { kind: 'perplexitybot', pattern: /PerplexityBot/i, asn: null },
  { kind: 'applebot', pattern: /Applebot/i, asn: null },
  // SNS・チャットのリンクプレビュー取得。人ではないが検索クローラーでもないので別に数える
  // （#281 レビューの指摘 3。共有された回数の目安になる）
  {
    kind: 'social-preview',
    pattern: /facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|LinkedInBot|Line\/|LINE-Parts|Pinterestbot|WhatsApp|TelegramBot|Iframely|Embedly/i,
    asn: null,
  },
  { kind: 'yandex', pattern: /YandexBot/i, asn: null },
  { kind: 'duckduckbot', pattern: /DuckDuckBot/i, asn: null },
  { kind: 'ahrefs', pattern: /AhrefsBot/i, asn: null },
  { kind: 'semrush', pattern: /SemrushBot/i, asn: null },
]);

/** 上の表に無い「何かのボット」を拾う。人間のブラウザに現れない語だけ */
const GENERIC_BOT = /bot\b|bot\/|crawler|spider|slurp|fetch|python-requests|curl\/|wget\/|Go-http-client|HeadlessChrome|Scrapy|httpx|axios/i;

/**
 * `bot\b` に引っかかる人間の端末名。Android の UA は機種名を含み、
 * CUBOT（メーカー名）が "CUBOT X30" のように入る（#281 レビューの指摘 1）。
 * ここに載った語を含む UA は GENERIC_BOT の判定から外して human にする
 */
const HUMAN_DEVICE_NAMES = /\bCUBOT\b/i;

/** クローラーの種類の並び順（表に出すとき） */
export const KIND_ORDER = Object.freeze([
  'googlebot',
  'googlebot-spoof',
  'bingbot',
  'bingbot-spoof',
  'gptbot',
  'chatgpt-user',
  'oai-searchbot',
  'claudebot',
  'perplexitybot',
  'applebot',
  'social-preview',
  'yandex',
  'duckduckbot',
  'ahrefs',
  'semrush',
  'other-bot',
  'human',
]);

/**
 * UA と ASN からクローラー種別を決める。
 *
 * @param {string} userAgent ログの cs(User-Agent)（URL エンコード済みでもよい。中で decode する）
 * @param {number|string|null|undefined} asn ログの asn。無ければ null
 * @returns {{ kind: string, verified: boolean|null }}
 *   verified は「ASN で本物と確認できたか」。ASN を公表していないボットは null
 */
export function classifyAgent(userAgent, asn) {
  const ua = safeDecode(userAgent ?? '');
  const asNumber = asn === null || asn === undefined || asn === '-' || asn === '' ? null : Number(asn);

  for (const rule of AGENT_RULES) {
    if (!rule.pattern.test(ua)) continue;
    if (rule.asn === null) return { kind: rule.kind, verified: null };
    if (asNumber === rule.asn) return { kind: rule.kind, verified: true };
    // UA は名乗っているが、来た網が違う。Googlebot を名乗るスクレイパーはここに落ちる
    return { kind: `${rule.kind}-spoof`, verified: false };
  }

  if (GENERIC_BOT.test(ua) && !HUMAN_DEVICE_NAMES.test(ua)) return { kind: 'other-bot', verified: null };
  return { kind: 'human', verified: null };
}

/** ログの値は URL エンコードされていることがある（スペースや括弧）。壊れていても落とさない */
export function safeDecode(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, ' '));
  } catch {
    return String(value);
  }
}

/**
 * ログファイル1本の中身をレコードの配列にする。
 *
 * 出力形式 json（1行1オブジェクト）を第一に考えるが、w3c（`#Fields:` 見出し＋タブ区切り）も
 * 読めるようにしてある。destination の出力形式は作成後に変えられないので、
 * 万一 w3c で作られていても集計は止まらないようにするため。
 *
 * @param {string} text ファイルの中身（gunzip 済み）
 * @returns {Record<string, string>[]} キーはログの列名そのまま（`cs(User-Agent)` など）
 */
export function parseLogText(text) {
  const records = [];
  let fields = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;

    if (line.startsWith('#')) {
      const match = /^#Fields:\s*(.+)$/.exec(line);
      if (match) fields = match[1].trim().split(/\s+/);
      continue;
    }

    if (line.startsWith('{')) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === 'object') records.push(parsed);
      } catch {
        // 壊れた行は捨てる（配信途中のファイルの末尾で起きうる）
      }
      continue;
    }

    if (fields) {
      const values = line.split('\t');
      const record = {};
      fields.forEach((name, index) => {
        record[name] = values[index] ?? '-';
      });
      records.push(record);
    }
  }

  return records;
}

/** レコードから日付（yyyy-mm-dd）を取る。date 列が無ければ timestamp から */
export function recordDate(record) {
  if (typeof record.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.date)) return record.date;
  const ts = record['timestamp(ms)'] ?? record.timestamp;
  if (ts !== undefined && ts !== '-') {
    const ms = Number(ts);
    if (Number.isFinite(ms)) return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

/** HTML への要求か（`/`・`/tools/foo/`・`.html`）。アセット（_next/static など）を除くため */
export function isHtmlPath(path) {
  if (typeof path !== 'string' || path === '') return false;
  if (path.includes('/_next/')) return false;
  if (path.endsWith('/') || path.endsWith('.html')) return true;
  const last = path.slice(path.lastIndexOf('/') + 1);
  return !last.includes('.');
}

/** 旧サブドメイン。ここに来た要求は 301 で hasokon.com へ寄せている */
export const LEGACY_HOSTS = Object.freeze(['tool.hasokon.com', 'game.hasokon.com', 'roulette.hasokon.com']);

/**
 * 自サイトのホストか。`hasokon.com` そのものと、そのサブドメインだけ。
 * `endsWith('hasokon.com')` だと `evilhasokon.com` も自サイト扱いになる（#281 レビューの指摘 2）
 */
export function isOwnHost(host) {
  const h = String(host).toLowerCase().replace(/:\d+$/, '');
  return h === 'hasokon.com' || h.endsWith('.hasokon.com');
}

/** google-index-recovery.md の B で「近い作りのページ」とした2ルート */
export const THIN_PATH_PREFIXES = Object.freeze(['/tools/r/', '/tools/guide/']);

function bump(map, key, by = 1) {
  map[key] = (map[key] ?? 0) + by;
}

function topEntries(map, limit) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit);
}

/**
 * レコードを仕様書の5つの観点で集計する。
 *
 * @param {Record<string, string>[]} records parseLogText の結果をつなげたもの
 * @param {{ since?: string|null, until?: string|null, top?: number }} [options]
 *   since / until は yyyy-mm-dd（含む）。top は各表の行数（既定 20）
 */
export function aggregate(records, options = {}) {
  const top = options.top ?? 20;
  const since = options.since ?? null;
  const until = options.until ?? null;

  const byDay = {};
  const googlebotPaths = {};
  const googlebotStatuses = {};
  const googlebotHtmlThin = { thin: 0, other: 0 };
  const legacyHosts = {};
  const legacyReferers = {};
  const notFound = {};
  const htmlResultTypes = {};
  let total = 0;
  let skipped = 0;
  let firstDate = null;
  let lastDate = null;

  for (const record of records) {
    const date = recordDate(record);
    if (!date) {
      skipped += 1;
      continue;
    }
    if (since && date < since) continue;
    if (until && date > until) continue;

    total += 1;
    if (!firstDate || date < firstDate) firstDate = date;
    if (!lastDate || date > lastDate) lastDate = date;

    const host = safeDecode(record['x-host-header'] ?? record['cs(Host)'] ?? '-');
    const path = safeDecode(record['cs-uri-stem'] ?? '-');
    const status = String(record['sc-status'] ?? '-');
    const { kind } = classifyAgent(record['cs(User-Agent)'], record.asn);

    const day = (byDay[date] ??= {});
    bump(day, kind);

    if (kind === 'googlebot') {
      bump(googlebotPaths, path);
      bump(googlebotStatuses, status);
      if (isHtmlPath(path)) {
        const thin = THIN_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
        googlebotHtmlThin[thin ? 'thin' : 'other'] += 1;
      }
    }

    if (LEGACY_HOSTS.includes(host)) {
      bump(legacyHosts, host);
      const referer = safeDecode(record['cs(Referer)'] ?? '-');
      if (referer !== '-' && referer !== '') {
        let refHost = referer;
        try {
          refHost = new URL(referer).host;
        } catch {
          // そのまま
        }
        if (!isOwnHost(refHost)) bump(legacyReferers, refHost);
      }
    }

    if (status === '404' && !LEGACY_HOSTS.includes(host)) {
      bump(notFound, path);
    }

    if (isHtmlPath(path) && !LEGACY_HOSTS.includes(host)) {
      bump(htmlResultTypes, String(record['x-edge-result-type'] ?? '-'));
    }
  }

  return {
    range: { since: firstDate, until: lastDate },
    total,
    skipped,
    byDay,
    googlebot: {
      requests: Object.values(googlebotPaths).reduce((sum, n) => sum + n, 0),
      statuses: googlebotStatuses,
      topPaths: topEntries(googlebotPaths, top),
      html: googlebotHtmlThin,
    },
    legacy: {
      hosts: legacyHosts,
      topReferers: topEntries(legacyReferers, top),
    },
    notFound: topEntries(notFound, top),
    htmlResultTypes,
  };
}

/** 集計を Markdown の表にする。google-index-recovery.md の「経過」に貼れる形 */
export function formatReport(summary) {
  const lines = [];
  const { range } = summary;
  lines.push(`# CloudFront アクセスログの集計（${range.since ?? '—'} 〜 ${range.until ?? '—'}）`);
  lines.push('');
  lines.push(`対象リクエスト: ${summary.total} 件${summary.skipped ? `（日付の無い行 ${summary.skipped} 件を除外）` : ''}`);
  lines.push('');

  // 1. クローラー別の日次
  const kindsSeen = new Set();
  for (const day of Object.values(summary.byDay)) for (const kind of Object.keys(day)) kindsSeen.add(kind);
  const kinds = KIND_ORDER.filter((k) => kindsSeen.has(k)).concat(
    [...kindsSeen].filter((k) => !KIND_ORDER.includes(k)).sort(),
  );
  lines.push('## 1. クローラー別の日次リクエスト数');
  lines.push('');
  lines.push('`-spoof` は UA だけ名乗っていて ASN が違うもの（本物ではない）。');
  lines.push('');
  lines.push(`| 日付 | ${kinds.join(' | ')} |`);
  lines.push(`|---|${kinds.map(() => '---:').join('|')}|`);
  for (const date of Object.keys(summary.byDay).sort()) {
    const day = summary.byDay[date];
    lines.push(`| ${date} | ${kinds.map((k) => day[k] ?? 0).join(' | ')} |`);
  }
  lines.push('');

  // 2. Googlebot の URL
  lines.push('## 2. Googlebot（ASN 確認済み）が取りに来た URL');
  lines.push('');
  const statusText = Object.entries(summary.googlebot.statuses)
    .sort()
    .map(([s, n]) => `${s}: ${n}`)
    .join('、');
  lines.push(`合計 ${summary.googlebot.requests} 件。ステータス別: ${statusText || '—'}`);
  const { thin, other } = summary.googlebot.html;
  const htmlTotal = thin + other;
  if (htmlTotal > 0) {
    lines.push(
      `HTML ${htmlTotal} 件のうち \`/tools/r/*\`・\`/tools/guide/*\` が ${thin} 件（${Math.round((thin / htmlTotal) * 100)}%）`,
    );
  }
  lines.push('');
  lines.push('| URL | 件数 |');
  lines.push('|---|---:|');
  for (const [path, n] of summary.googlebot.topPaths) lines.push(`| \`${path}\` | ${n} |`);
  if (summary.googlebot.topPaths.length === 0) lines.push('| （Googlebot の要求なし） | 0 |');
  lines.push('');

  // 3. 旧サブドメイン
  lines.push('## 3. 旧サブドメイン（301 面）への要求');
  lines.push('');
  lines.push('| ホスト | 件数 |');
  lines.push('|---|---:|');
  for (const host of LEGACY_HOSTS) lines.push(`| ${host} | ${summary.legacy.hosts[host] ?? 0} |`);
  lines.push('');
  if (summary.legacy.topReferers.length > 0) {
    lines.push('外部の参照元（上位）:');
    lines.push('');
    lines.push('| 参照元 | 件数 |');
    lines.push('|---|---:|');
    for (const [ref, n] of summary.legacy.topReferers) lines.push(`| ${ref} | ${n} |`);
    lines.push('');
  }

  // 4. 404
  lines.push('## 4. 404 になったパス（hasokon.com）');
  lines.push('');
  lines.push('| パス | 件数 |');
  lines.push('|---|---:|');
  for (const [path, n] of summary.notFound) lines.push(`| \`${path}\` | ${n} |`);
  if (summary.notFound.length === 0) lines.push('| （404 なし） | 0 |');
  lines.push('');

  // 5. キャッシュ
  lines.push('## 5. HTML の x-edge-result-type（hasokon.com）');
  lines.push('');
  const resultTotal = Object.values(summary.htmlResultTypes).reduce((sum, n) => sum + n, 0);
  lines.push('| 種別 | 件数 | 割合 |');
  lines.push('|---|---:|---:|');
  for (const [type, n] of Object.entries(summary.htmlResultTypes).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${type} | ${n} | ${resultTotal ? Math.round((n / resultTotal) * 100) : 0}% |`);
  }
  if (resultTotal === 0) lines.push('| （HTML の要求なし） | 0 | 0% |');

  return `${lines.join('\n')}\n`;
}
