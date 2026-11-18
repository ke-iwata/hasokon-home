/**
 * 偏差値 計算機のロジック（純関数のみ）。
 *
 * 仕様: docs/features/hensachi-keisan.md
 *
 * - 偏差値 ＝ 50 ＋ 10 ×（得点 − 平均点）÷ 標準偏差
 * - 標準偏差は**母標準偏差**（n で割る。表計算ソフトの STDEV.P）。STDEV.S（n−1）ではない
 * - 上位何% は得点の分布を正規分布とみなしたときの目安（1 − Φ(z)、z ＝（偏差値 − 50）÷ 10）
 * - 逆算：必要な得点 ＝ 平均点 ＋ 標準偏差 ×（目標の偏差値 − 50）÷ 10（切り上げ）
 *
 * 制度に依存しないので【データ更新箇所】は無い。
 */

/** 貼り付けで読む件数の上限 */
export const MAX_SCORES = 10_000;

/** 人数がこれ未満なら「上位の目安はずれやすい」を出す */
export const SMALL_GROUP = 30;

/** 必要な点数を切り上げる前に引く許容幅（浮動小数点の誤差で 73 が 74 に切り上がらないように） */
const CEIL_EPSILON = 1e-9;

export interface Options {
  /** タイムなど「小さいほど良い」記録。符号を反転して偏差値を出す */
  lowerIsBetter?: boolean;
}

/**
 * 偏差値。標準偏差が 0 以下（全員同点など）のときは定義できないので null。
 */
export function hensachi(score: number, mean: number, sd: number, opts: Options = {}): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0) return null;
  const diff = opts.lowerIsBetter ? mean - score : score - mean;
  return 50 + (10 * diff) / sd;
}

/** 小数第 d 位で四捨五入（表示用。負の値も対称に丸める） */
export function roundTo(x: number, d = 1): number {
  const f = 10 ** d;
  const r = Math.round(Math.abs(x) * f + 1e-9) / f;
  return x < 0 ? -r : r;
}

/**
 * 相補誤差関数 erfc(x)。Abramowitz & Stegun 7.1.26（|誤差| ≤ 1.5e-7）。
 */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const r = poly * Math.exp(-z * z);
  return x >= 0 ? r : 2 - r;
}

/**
 * 偏差値 t の「上位何%」（0〜100）。正規分布とみなしたときの目安。
 * 上側確率 1 − Φ(z) ＝ erfc(z/√2) ÷ 2、z ＝（t − 50）÷ 10。
 */
export function upperPercent(t: number): number {
  const z = (t - 50) / 10;
  return 50 * erfc(z / Math.SQRT2);
}

/** 上位何% を表示用の文字列に（小数第2位。極端な値は「未満」「超」） */
export function formatPercent(p: number): string {
  if (p < 0.005) return '0.01%未満';
  if (p > 99.995) return '99.99%超';
  return `${roundTo(p, 2).toFixed(2)}%`;
}

/**
 * 受験者数 n のうち「約何位」か。上位 p% なら、自分より上が約 p×n 人なので floor(p×n)＋1 位。
 */
export function estimatedRank(t: number, n: number): number | null {
  if (!Number.isInteger(n) || n < 1) return null;
  const above = Math.floor((upperPercent(t) / 100) * n);
  return Math.min(n, Math.max(1, above + 1));
}

/** 文字列の小数部の桁数（「12.34」→ 2）。必要な点数の刻みに使う */
export function decimalsOf(s: string): number {
  const m = s.trim().match(/\.(\d+)$/);
  return m ? m[1].length : 0;
}

/** 小さいほど良い記録（タイム）の刻みの選択肢。値は小数桁（0＝1、1＝0.1、2＝0.01） */
export const RECORD_STEPS = [
  { decimals: 0, label: '1' },
  { decimals: 1, label: '0.1' },
  { decimals: 2, label: '0.01' },
] as const;

/**
 * 必要な点数を丸める刻み（小数桁）。
 *
 * **平均点からは取らない**（平均点は集計値で、得点の刻みを表さない。平均 58.24 で 88.84点 と出していた。#519 のレビュー）。
 * - 高いほど良い：満点の小数桁（空なら 0＝1点刻み）。満点 100 → 1点、満点 10.0 → 0.1点
 * - 小さいほど良い記録：利用者が選んだ刻み（recordDecimals。既定 2＝0.01秒）
 */
export function stepDecimals(fullMarkInput: string, opts: Options & { recordDecimals?: number } = {}): number {
  if (opts.lowerIsBetter) return opts.recordDecimals ?? 2;
  return decimalsOf(fullMarkInput);
}

export interface Required {
  /** 式どおりの値（丸める前） */
  raw: number;
  /** 必要な得点。高いほど良いなら切り上げ、小さいほど良いなら切り捨て（それ以下に抑える上限） */
  value: number;
  /** 満点を超えて届かない（満点を入れたときだけ） */
  overFull: boolean;
}

/**
 * 目標の偏差値に必要な得点。
 *
 * 72.1点必要なら 72点では届かないので 73点（切り上げ）。刻みは 1点が既定で、
 * decimals を渡すとその小数桁で切り上げる。切り上げの前に許容幅 1e-9 を引く。
 * 小さいほど良い記録（タイム）では「この値以下」が要るので切り捨てる。
 */
export function requiredScore(
  target: number,
  mean: number,
  sd: number,
  opts: Options & { decimals?: number; fullMark?: number | null } = {},
): Required | null {
  if (![target, mean, sd].every(Number.isFinite) || sd <= 0) return null;
  const delta = (sd * (target - 50)) / 10;
  const f = 10 ** (opts.decimals ?? 0);
  let raw: number;
  let value: number;
  if (opts.lowerIsBetter) {
    raw = mean - delta;
    value = Math.floor(raw * f + CEIL_EPSILON) / f;
  } else {
    raw = mean + delta;
    value = Math.ceil(raw * f - CEIL_EPSILON) / f;
  }
  const full = opts.fullMark;
  const overFull = !opts.lowerIsBetter && full != null && Number.isFinite(full) && value > full;
  return { raw, value, overFull };
}

export interface Entry {
  /** 点数の前にあった名前（無ければ null） */
  label: string | null;
  score: number;
}

export interface Parsed {
  entries: Entry[];
  /** 読めなかった行・語の数（中身は表示しない） */
  skipped: number;
  /** 負の点数の数（読むが注意を出す） */
  negatives: number;
  /** 上限を超えて読まなかった点数の数 */
  truncated: number;
}

const NUMBER = /^-?\d+(\.\d+)?$/;

/** 全角の数字・小数点・マイナス・カンマを半角に */
function normalize(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．]/g, '.')
    .replace(/[－−]/g, '-')
    .replace(/[，、]/g, ',');
}

/**
 * 貼り付けた点数を読む。規則は仕様書「parseScores の読み方」のとおり：
 *
 * 1. 全角を半角にし、行ごとにカンマ・タブ・空白で区切ってトークンにする
 * 2. `^-?\d+(\.\d+)?$` に合うトークンが点数。数字でないトークンは、**同じ行の中で**その後に来る最初の数字のラベル
 *    （続く複数のトークンは空白でつなぐ）。行をまたいでラベルは付かない
 * 3. 1行に数字が複数あればそれぞれ別の点数
 * 4. 小数は読む。負の数は読むが数える（注意を出す）
 * 5. 名前だけの行・数字の後ろに残った名前は読まず、読めなかった数に入れる
 * 6. 上限（10,000件）を超えたら先頭だけ使い、残りの数を返す
 * 7. 分:秒（1:02.3）は読まない（読めなかった数に入れる）
 */
export function parseScores(text: string, limit = MAX_SCORES): Parsed {
  const entries: Entry[] = [];
  let skipped = 0;
  let negatives = 0;
  let truncated = 0;

  for (const line of normalize(text).split(/\r\n|\r|\n/)) {
    let pending: string[] = [];
    for (const token of line.split(/[,\s]+/)) {
      if (token === '') continue;
      if (NUMBER.test(token)) {
        if (entries.length >= limit) {
          truncated++;
        } else {
          const score = Number(token);
          if (score < 0) negatives++;
          entries.push({ label: pending.length ? pending.join(' ') : null, score });
        }
        pending = [];
      } else if (/\d:\d/.test(token)) {
        // 分:秒の書式。ラベルにもせず読めなかった数に入れる
        if (pending.length) skipped++;
        pending = [];
        skipped++;
      } else {
        pending.push(token);
      }
    }
    if (pending.length) skipped++;
  }
  return { entries, skipped, negatives, truncated };
}

export interface Row {
  /** 入力の順番（0 始まり）。名前を伏せるときは #(index+1) */
  index: number;
  label: string | null;
  score: number;
  hensachi: number | null;
  /** 順位。同点は同順位（1, 1, 3） */
  rank: number;
}

export interface Summary {
  count: number;
  mean: number;
  /** 母標準偏差（n で割る）。偏差値に使う */
  sd: number;
  /** 標本標準偏差（n−1 で割る）。比べる説明用。1件のときは null */
  sampleSd: number | null;
  max: number;
  min: number;
  median: number;
  /** 入力の順番のまま */
  rows: Row[];
}

/** 平均・母標準偏差・中央値と、全員の偏差値・順位 */
export function summarize(entries: Entry[], opts: Options = {}): Summary | null {
  const n = entries.length;
  if (n === 0) return null;
  const scores = entries.map((e) => e.score);
  const mean = scores.reduce((a, b) => a + b, 0) / n;
  const ss = scores.reduce((a, b) => a + (b - mean) ** 2, 0);
  const sd = Math.sqrt(ss / n);
  const sampleSd = n > 1 ? Math.sqrt(ss / (n - 1)) : null;
  const sorted = [...scores].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  // 良い順に並べて順位をつける（同点は同順位）
  const order = scores.map((s, i) => i).sort((a, b) => (opts.lowerIsBetter ? scores[a] - scores[b] : scores[b] - scores[a]));
  const ranks = new Array<number>(n);
  order.forEach((idx, pos) => {
    const prev = order[pos - 1];
    ranks[idx] = pos > 0 && scores[prev] === scores[idx] ? ranks[prev] : pos + 1;
  });

  // 全員同点を浮動小数点の誤差で「ばらつきあり」と見ないよう、最大＝最小なら 0 にする
  const sdUsed = sorted[0] === sorted[n - 1] ? 0 : sd;
  const rows: Row[] = entries.map((e, i) => ({
    index: i,
    label: e.label,
    score: e.score,
    hensachi: hensachi(e.score, mean, sdUsed, opts),
    rank: ranks[i],
  }));
  return { count: n, mean, sd: sdUsed, sampleSd: sdUsed === 0 ? 0 : sampleSd, max: sorted[n - 1], min: sorted[0], median, rows };
}

/** 表・CSV の名前の欄。伏せるときは #1, #2… */
export function rowName(row: Row, showNames: boolean): string {
  return showNames && row.label ? row.label : `#${row.index + 1}`;
}

function csvField(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 全件の CSV（名前・得点・偏差値・順位の4列） */
export function toCsv(summary: Summary, showNames: boolean): string {
  const lines = ['名前,得点,偏差値,順位'];
  for (const r of summary.rows) {
    lines.push(
      [csvField(rowName(r, showNames)), String(r.score), r.hensachi === null ? '' : roundTo(r.hensachi, 1).toFixed(1), String(r.rank)].join(','),
    );
  }
  return lines.join('\n');
}

/** GA4 に送る件数の階級（中身は送らない） */
export function countBucket(n: number): string {
  if (n < 30) return '1-29';
  if (n < 100) return '30-99';
  if (n < 1000) return '100-999';
  return '1000+';
}
