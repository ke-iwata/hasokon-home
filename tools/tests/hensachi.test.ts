import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MAX_SCORES,
  countBucket,
  decimalsOf,
  estimatedRank,
  formatPercent,
  hensachi,
  parseScores,
  requiredScore,
  roundTo,
  rowName,
  stepDecimals,
  summarize,
  toCsv,
  upperPercent,
} from '@/lib/hensachi';

/**
 * 偏差値 計算機。仕様: docs/features/hensachi-keisan.md の「確かめること」の表（#1〜#8）
 */

const r1 = (x: number | null) => (x === null ? null : roundTo(x, 1));
const pct = (t: number) => roundTo(upperPercent(t), 2);
const entries = (scores: number[]) => scores.map((score) => ({ label: null, score }));

describe('偏差値（#1・#2）', () => {
  it('#1 得点80・平均60・標準偏差10 → 70.0、上位2.28%', () => {
    const t = hensachi(80, 60, 10)!;
    expect(r1(t)).toBe(70);
    expect(pct(t)).toBe(2.28);
  });

  it('#2 得点45・平均60・標準偏差15 → 40.0、上位84.13%', () => {
    const t = hensachi(45, 60, 15)!;
    expect(r1(t)).toBe(40);
    expect(pct(t)).toBe(84.13);
  });

  it('#5 標準偏差0（全員同点）は定義できない', () => {
    expect(hensachi(70, 70, 0)).toBeNull();
    expect(hensachi(70, 70, -1)).toBeNull();
    expect(hensachi(Number.NaN, 70, 10)).toBeNull();
  });

  it('小さいほど良い記録は符号を反転する（平均より速いと50より上）', () => {
    expect(r1(hensachi(12, 13, 0.5, { lowerIsBetter: true }))).toBe(70);
    expect(r1(hensachi(14, 13, 0.5, { lowerIsBetter: true }))).toBe(30);
  });
});

describe('upperPercent（標準正規分布表の14点）', () => {
  // 偏差値 20〜80 の5刻みの13点と 62.5。値は標準正規分布表（上側確率）
  const TABLE: [number, number][] = [
    [20, 99.87],
    [25, 99.38],
    [30, 97.72],
    [35, 93.32],
    [40, 84.13],
    [45, 69.15],
    [50, 50.0],
    [55, 30.85],
    [60, 15.87],
    [62.5, 10.56],
    [65, 6.68],
    [70, 2.28],
    [75, 0.62],
    [80, 0.13],
  ];
  it.each(TABLE)('偏差値 %s → 上位 %s%%', (t, expected) => {
    expect(pct(t)).toBe(expected);
  });
  it('14点ある', () => expect(TABLE).toHaveLength(14));

  it('表示：極端な値は「未満」「超」', () => {
    expect(formatPercent(upperPercent(100))).toBe('0.01%未満');
    expect(formatPercent(upperPercent(0))).toBe('99.99%超');
    expect(formatPercent(upperPercent(60))).toBe('15.87%');
    expect(formatPercent(upperPercent(50))).toBe('50.00%');
  });

  it('受験者数を入れたときの「約○位」', () => {
    expect(estimatedRank(70, 100)).toBe(3); // 上に約2.28人
    expect(estimatedRank(50, 100)).toBeGreaterThanOrEqual(50);
    expect(estimatedRank(50, 100)).toBeLessThanOrEqual(51);
    expect(estimatedRank(100, 100)).toBe(1);
    expect(estimatedRank(0, 100)).toBe(100);
    expect(estimatedRank(60, 0)).toBeNull();
    expect(estimatedRank(60, 2.5)).toBeNull();
  });
});

describe('summarize（#3・#5・#7・#8）', () => {
  it('#3 点数 50,60,70,80,90 → 平均70・母標準偏差14.142…（標本なら15.811…）、90点は64.1', () => {
    const s = summarize(entries([50, 60, 70, 80, 90]))!;
    expect(s.count).toBe(5);
    expect(s.mean).toBe(70);
    expect(s.sd).toBeCloseTo(14.1421356, 6);
    expect(s.sampleSd).toBeCloseTo(15.8113883, 6);
    expect(s.max).toBe(90);
    expect(s.min).toBe(50);
    expect(s.median).toBe(70);
    expect(r1(s.rows[4].hensachi)).toBe(64.1);
  });

  it('#5 点数 70,70,70 → 標準偏差0で偏差値は定義できない', () => {
    const s = summarize(entries([70, 70, 70]))!;
    expect(s.sd).toBe(0);
    expect(s.rows.every((r) => r.hensachi === null)).toBe(true);
  });

  it('全員同点を浮動小数点の誤差で「ばらつきあり」と見ない', () => {
    const s = summarize(entries([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]))!;
    expect(s.sd).toBe(0);
    expect(s.rows[0].hensachi).toBeNull();
  });

  it('#7 同点2人は同順位（1, 1, 3）', () => {
    const s = summarize(entries([90, 90, 80]))!;
    expect(s.rows.map((r) => r.rank)).toEqual([1, 1, 3]);
    // 入力の順番は保つ
    const t = summarize(entries([80, 90, 90]))!;
    expect(t.rows.map((r) => r.rank)).toEqual([3, 1, 1]);
  });

  it('小さいほど良い記録は小さい順に順位がつく', () => {
    const s = summarize(entries([12.5, 11.9, 13.1]), { lowerIsBetter: true })!;
    expect(s.rows.map((r) => r.rank)).toEqual([2, 1, 3]);
    expect(s.rows[1].hensachi!).toBeGreaterThan(50);
  });

  it('#8 1人100点・25人0点（26人）→ 100.0（超えない）。27人なら101.0', () => {
    const s26 = summarize(entries([100, ...Array(25).fill(0)]))!;
    expect(r1(s26.rows[0].hensachi)).toBe(100);
    const s27 = summarize(entries([100, ...Array(26).fill(0)]))!;
    expect(r1(s27.rows[0].hensachi)).toBe(101);
  });

  it('偶数件の中央値は真ん中2つの平均', () => {
    expect(summarize(entries([10, 40, 20, 30]))!.median).toBe(25);
  });

  it('0件は null、1件は標本標準偏差なし', () => {
    expect(summarize([])).toBeNull();
    const one = summarize(entries([50]))!;
    expect(one.sd).toBe(0);
    expect(one.sampleSd).toBe(0);
  });
});

describe('requiredScore（#4・#4b）', () => {
  it('#4 目標65・平均55・標準偏差12 → 73点', () => {
    expect(requiredScore(65, 55, 12)!.value).toBe(73);
  });

  it('#4b 目標61・平均55・標準偏差12 → 68.2 → 69点（切り上げ）', () => {
    const r = requiredScore(61, 55, 12)!;
    expect(r.raw).toBeCloseTo(68.2, 9);
    expect(r.value).toBe(69);
  });

  it('割り切れる値が浮動小数点の誤差で1点上に切り上がらない', () => {
    // 0.1 + 0.2 型の誤差：60.1 ＋ 0.2 は 60.300000000000004 になる
    expect(requiredScore(60, 60.1, 0.2, { decimals: 1 })!.value).toBe(60.3);
    // 平均 0.3 は 0.1*3 で作ると 0.30000000000000004
    expect(requiredScore(50, 0.1 * 3, 10, { decimals: 1 })!.value).toBe(0.3);
  });

  it('小数の記録は入力の小数桁で切り上げる', () => {
    expect(requiredScore(61, 55, 12, { decimals: 1 })!.value).toBe(68.2);
    expect(requiredScore(60.5, 55.33, 7.1, { decimals: 2 })!.value).toBe(62.79);
    expect(decimalsOf('12.34')).toBe(2);
    expect(decimalsOf('72')).toBe(0);
  });

  it('満点を超えるときは「満点でも届きません」', () => {
    expect(requiredScore(80, 60, 15, { fullMark: 100 })!.overFull).toBe(true); // 105点
    expect(requiredScore(70, 60, 15, { fullMark: 100 })!.overFull).toBe(false); // 90点
    expect(requiredScore(80, 60, 15)!.overFull).toBe(false);
  });

  it('小さいほど良い記録は「この値以下」なので切り捨て', () => {
    const r = requiredScore(61, 13.05, 0.52, { lowerIsBetter: true, decimals: 2 })!;
    expect(r.raw).toBeCloseTo(12.478, 9);
    expect(r.value).toBe(12.47);
    // 割り切れるときはそのまま（13.05 − 0.52 ＝ 12.53）
    expect(requiredScore(60, 13.05, 0.52, { lowerIsBetter: true, decimals: 2 })!.value).toBe(12.53);
  });

  it('標準偏差0は null', () => {
    expect(requiredScore(60, 50, 0)).toBeNull();
  });
});

describe('必要な点数の刻み（stepDecimals。#519 のレビュー）', () => {
  it('平均点が小数でも1点刻み：目標65・平均58.24・標準偏差20.4 → 89点（88.84点ではない）', () => {
    const decimals = stepDecimals('100');
    expect(decimals).toBe(0);
    const r = requiredScore(65, 58.24, 20.4, { decimals, fullMark: 100 })!;
    expect(r.raw).toBeCloseTo(88.84, 9);
    expect(r.value).toBe(89);
  });

  it('満点が空なら1点刻み、満点が小数ならその桁', () => {
    expect(stepDecimals('')).toBe(0);
    expect(stepDecimals('10.0')).toBe(1);
    expect(requiredScore(65, 6.24, 1.37, { decimals: stepDecimals('10.0') })!.value).toBe(8.3); // 8.295
  });

  it('小さいほど良い記録は選んだ刻み（既定 0.01）。満点の桁は見ない', () => {
    expect(stepDecimals('100', { lowerIsBetter: true })).toBe(2);
    expect(stepDecimals('100', { lowerIsBetter: true, recordDecimals: 1 })).toBe(1);
    expect(stepDecimals('', { lowerIsBetter: true, recordDecimals: 0 })).toBe(0);
  });

  it('画面は刻みを平均点から取らない（stepDecimals を通す）', () => {
    const src = readFileSync(fileURLToPath(new URL('../app/hensachi/Calculator.tsx', import.meta.url)), 'utf8');
    expect(src).toContain('stepDecimals(');
    expect(src).not.toMatch(/decimalsOf\(tMean\)/);
  });
});

describe('parseScores（#6・#6b・#6c）', () => {
  it('#6 「佐藤 72\\n鈴木,８５\\t田中 60」→ 3件（全角数字・タブ・カンマ）', () => {
    const p = parseScores('佐藤 72\n鈴木,８５\t田中 60');
    expect(p.entries).toEqual([
      { label: '佐藤', score: 72 },
      { label: '鈴木', score: 85 },
      { label: '田中', score: 60 },
    ]);
    expect(p.skipped).toBe(0);
  });

  it('#6b ラベル「佐藤 太郎」・小数・負の数・80と90は別々、読めなかった1件（山田）', () => {
    const p = parseScores('佐藤 太郎 72\n12.34\n-5\n山田\n80 90');
    expect(p.entries).toEqual([
      { label: '佐藤 太郎', score: 72 },
      { label: null, score: 12.34 },
      { label: null, score: -5 },
      { label: null, score: 80 },
      { label: null, score: 90 },
    ]);
    expect(p.negatives).toBe(1);
    expect(p.skipped).toBe(1);
  });

  it('#6c 10,001行 → 10,000件を使い、残り1件の案内', () => {
    const text = Array.from({ length: 10_001 }, (_, i) => String(i % 101)).join('\n');
    const p = parseScores(text);
    expect(p.entries).toHaveLength(MAX_SCORES);
    expect(p.truncated).toBe(1);
  });

  it('数字の後ろに残った名前は読まない（「72 佐藤」）', () => {
    const p = parseScores('72 佐藤');
    expect(p.entries).toEqual([{ label: null, score: 72 }]);
    expect(p.skipped).toBe(1);
  });

  it('ラベルは直前の数字の前にあったものだけ（佐藤 72 鈴木 85）', () => {
    const p = parseScores('佐藤 72 鈴木 85');
    expect(p.entries.map((e) => e.label)).toEqual(['佐藤', '鈴木']);
  });

  it('分:秒の書式は読まない', () => {
    const p = parseScores('1:02.3\n佐藤 1:05.0\n61.2');
    expect(p.entries).toEqual([{ label: null, score: 61.2 }]);
    expect(p.skipped).toBe(3);
  });

  it('全角の小数点・マイナス・全角スペース・CRLF も読む', () => {
    const p = parseScores('７２．５\r\n－３　４０');
    expect(p.entries.map((e) => e.score)).toEqual([72.5, -3, 40]);
  });

  it('空行・空文字は0件', () => {
    expect(parseScores('\n\n  \n').entries).toHaveLength(0);
    expect(parseScores('').skipped).toBe(0);
  });

  it('10,000件を1秒以内に読んで集計する', () => {
    const text = Array.from({ length: 10_000 }, (_, i) => `生徒${i} ${(i * 37) % 101}`).join('\n');
    const start = performance.now();
    const s = summarize(parseScores(text).entries)!;
    expect(performance.now() - start).toBeLessThan(1000);
    expect(s.count).toBe(10_000);
  });
});

describe('表とCSV', () => {
  const s = summarize([
    { label: '佐藤, 太郎', score: 80 },
    { label: null, score: 60 },
  ])!;

  it('名前は既定で伏せ字 #1, #2、表示に切り替えるとラベル', () => {
    expect(rowName(s.rows[0], false)).toBe('#1');
    expect(rowName(s.rows[0], true)).toBe('佐藤, 太郎');
    expect(rowName(s.rows[1], true)).toBe('#2');
  });

  it('CSV は4列・全件。カンマを含む名前は引用符で囲む', () => {
    expect(toCsv(s, false).split('\n')).toEqual(['名前,得点,偏差値,順位', '#1,80,60.0,1', '#2,60,40.0,2']);
    expect(toCsv(s, true).split('\n')[1]).toBe('"佐藤, 太郎",80,60.0,1');
    const big = summarize(entries(Array.from({ length: 250 }, (_, i) => i)))!;
    expect(toCsv(big, false).split('\n')).toHaveLength(251);
  });

  it('GA4 には件数の階級だけ', () => {
    expect(countBucket(5)).toBe('1-29');
    expect(countBucket(30)).toBe('30-99');
    expect(countBucket(500)).toBe('100-999');
    expect(countBucket(10_000)).toBe('1000+');
  });
});

describe('ページと画面（ソースの検査）', () => {
  const read = (p: string) => readFileSync(fileURLToPath(new URL(`../app/hensachi/${p}`, import.meta.url)), 'utf8');

  it('貼り付けた中身は GA4 に送らない（tool_use の action は固定の語か件数の階級だけ）', () => {
    const src = read('Calculator.tsx');
    const calls = [...src.matchAll(/trackToolUse\(SLUG,\s*([^)]*)\)/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(3);
    for (const arg of calls) {
      expect(arg, arg).not.toMatch(/\btext\b|parsed\.entries\b(?!\.length)|label|score\b/);
    }
  });

  it('「点数はこの端末の外に送りません」を入力欄の下に出す', () => {
    expect(read('Calculator.tsx')).toContain('点数はこの端末の外に送りません');
  });

  it('上位の目安には「正規分布とみなしたとき」を必ず添える', () => {
    expect(read('Calculator.tsx')).toContain('正規分布とみなしたとき');
  });

  it('模試会社名・大学名は出さない（仕様書「やらないこと」）', () => {
    const src = read('page.tsx') + read('Calculator.tsx');
    expect(src).not.toMatch(/河合|駿台|ベネッセ|進研|東進|代ゼミ|早稲田|慶應|東京大学/);
  });
});
