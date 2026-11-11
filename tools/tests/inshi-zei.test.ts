import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  HONSOKU_DAI1GO,
  HONSOKU_DAI2GO,
  HONSOKU_RYOSHUSHO,
  KEIGEN_TABLES,
  KEIGEN_TO,
  QUICK_AFTER,
  QUICK_BEFORE,
  judge,
  kataizei,
  keigenTableAt,
  nextDay,
  parseYen,
  quickTable,
  type Bracket,
  type InshiInput,
  type Result,
} from '@/lib/inshi-zei';
import { tools } from '@/lib/registry';

const MAN = 10_000;

const base: InshiInput = {
  doc: 'ryoshusho',
  amount: 0,
  taxWriting: 'komi',
  medium: 'kami',
  date: '2026-11-11',
  copies: 1,
  issuer: 'hojin',
  ukeoiNature: 'kansei',
};

/** 1通あたりの額。非課税は 0、対象外は null */
function per(input: Partial<InshiInput>): number | null {
  const r = judge({ ...base, ...input });
  if (r.kind === 'taishogai') return null;
  return r.kind === 'tax' ? r.perCopy : 0;
}

function taxResult(r: Result) {
  if (r.kind !== 'tax') throw new Error(`tax ではない: ${r.kind}`);
  return r;
}

describe('税額表の形（写し間違いを機械で落とす）', () => {
  const tables: [string, readonly Bracket[], number][] = [
    ['第17号の1', HONSOKU_RYOSHUSHO.brackets, HONSOKU_RYOSHUSHO.exemptBelow],
    ['第1号 本則', HONSOKU_DAI1GO.brackets, HONSOKU_DAI1GO.exemptBelow],
    ['第2号 本則', HONSOKU_DAI2GO.brackets, HONSOKU_DAI2GO.exemptBelow],
    ...KEIGEN_TABLES.map((t): [string, readonly Bracket[], number] => [`軽減 ${t.doc}`, t.brackets, t.over]),
  ];

  it.each(tables)('%s：区切りが昇順で隙間・重なりが無く、最後が「超えるもの」', (_n, brackets, lower) => {
    let prev = lower;
    brackets.forEach((b, i) => {
      if (i === brackets.length - 1) {
        expect(b.upTo).toBeNull();
      } else {
        expect(b.upTo).not.toBeNull();
        expect(b.upTo!).toBeGreaterThan(prev);
        prev = b.upTo!;
      }
    });
  });

  it.each(tables)('%s：税額は金額とともに増える（減らない）', (_n, brackets) => {
    for (let i = 1; i < brackets.length; i++) {
      expect(brackets[i].tax).toBeGreaterThanOrEqual(brackets[i - 1].tax);
    }
  });

  it('第1号と第2号は 500万円以下の区切りが違う（表を1本にまとめていない）', () => {
    expect(HONSOKU_DAI1GO.brackets.map((b) => b.upTo)).not.toEqual(HONSOKU_DAI2GO.brackets.map((b) => b.upTo));
  });

  it('軽減措置は 2014-04-01〜2027-03-31（No.7108）', () => {
    for (const t of KEIGEN_TABLES) {
      expect(t.from).toBe('2014-04-01');
      expect(t.to).toBe('2027-03-31');
    }
    expect(KEIGEN_TO).toBe('2027-03-31');
    expect(nextDay(KEIGEN_TO)).toBe('2027-04-01');
  });
});

describe('領収書の境目（第17号の1）', () => {
  it.each([
    [49_999, 0],
    [50_000, 200],
    [1_000_000, 200],
    [1_000_001, 400],
    [2_000_000, 400],
    [3_000_000, 600],
    [5_000_000, 1_000],
    [10_000_000, 2_000],
    [20_000_000, 4_000],
    [30_000_000, 6_000],
    [50_000_000, 10_000],
    [100_000_000, 20_000],
    [200_000_000, 40_000],
    [300_000_000, 60_000],
    [500_000_000, 100_000],
    [1_000_000_000, 150_000],
    [1_000_000_001, 200_000],
  ])('%d円 → %d円', (amount, tax) => {
    expect(per({ doc: 'ryoshusho', amount })).toBe(tax);
  });

  it('金額の記載なし → 200円', () => {
    expect(per({ doc: 'ryoshusho', amount: null })).toBe(200);
  });

  it('領収書は作成日・通数に関係しない', () => {
    expect(per({ doc: 'ryoshusho', amount: 3_000 * MAN, date: '2030-01-01' })).toBe(6_000);
    const r = taxResult(judge({ ...base, amount: 100 * MAN, copies: 5 }));
    expect(r.copies).toBe(1);
    expect(r.total).toBe(200);
  });
});

describe('不動産の売買契約書（第1号の1）', () => {
  const inPeriod = { doc: 'fudosan' as const, date: '2026-11-11' };
  const after = { doc: 'fudosan' as const, date: '2027-04-01' };

  it.each([
    [9_999, 0],
    [10_000, 200],
    [100_000, 200], // 10万円以下は軽減の対象外（本則 200円）
    [100_001, 200], // 軽減
    [500_000, 200],
    [500_001, 500], // 軽減
    [1_000_000, 500],
    [5_000_000, 1_000],
    [10_000_000, 5_000],
    [30_000_000, 10_000],
    [100_000_000, 30_000],
    [500_000_000, 60_000],
    [1_000_000_000, 160_000],
    [5_000_000_000, 320_000],
    [5_000_000_001, 480_000],
  ])('期間内 %d円 → %d円', (amount, tax) => {
    expect(per({ ...inPeriod, amount })).toBe(tax);
  });

  it.each([
    [10_000, 200],
    [100_001, 400],
    [500_001, 1_000],
    [3_000_000, 2_000],
    [10_000_000, 10_000],
    [30_000_000, 20_000],
    [5_000_000_001, 600_000],
  ])('本則（2027-04-01 作成） %d円 → %d円', (amount, tax) => {
    expect(per({ ...after, amount })).toBe(tax);
  });

  it('3,000万円：2027-03-31 → 1万円、2027-04-01 → 2万円', () => {
    expect(per({ doc: 'fudosan', amount: 3_000 * MAN, date: '2027-03-31' })).toBe(10_000);
    expect(per({ doc: 'fudosan', amount: 3_000 * MAN, date: '2027-04-01' })).toBe(20_000);
  });

  it('軽減が当たるときは本則の額も添える', () => {
    const r = taxResult(judge({ ...base, doc: 'fudosan', amount: 3_000 * MAN, date: '2027-03-31' }));
    expect(r.basis).toBe('keigen');
    expect(r.honsokuPerCopy).toBe(20_000);
    expect(r.keigenTo).toBe('2027-03-31');
  });

  it('期限後は本則で、延長されたら戻る額を添える', () => {
    const r = taxResult(judge({ ...base, doc: 'fudosan', amount: 3_000 * MAN, date: '2027-04-01' }));
    expect(r.basis).toBe('honsoku');
    expect(r.keigenIfExtended).toBe(10_000);
    expect(r.reasons.join()).toContain('延長が決まれば');
  });

  it('10万円以下は期間内でも本則（延長の話は出さない）', () => {
    const r = taxResult(judge({ ...base, doc: 'fudosan', amount: 10 * MAN, date: '2026-11-11' }));
    expect(r.basis).toBe('honsoku');
    expect(r.keigenIfExtended).toBeNull();
  });

  it('金額の記載なし → 200円', () => {
    expect(per({ doc: 'fudosan', amount: null })).toBe(200);
  });
});

describe('工事の請負契約書（第2号・建設工事）', () => {
  it.each([
    [9_999, 0],
    [10_000, 200],
    [1_000_000, 200], // 100万円以下は軽減の対象外
    [1_000_001, 200], // 軽減
    [2_000_001, 500],
    [3_000_001, 1_000],
    [5_000_000, 1_000],
    [10_000_000, 5_000],
    [50_000_000, 10_000],
  ])('期間内 %d円 → %d円', (amount, tax) => {
    expect(per({ doc: 'kensetsu', amount, date: '2026-11-11' })).toBe(tax);
  });

  it('1,000万円：2027-03-31 → 5,000円、2027-04-01 → 1万円', () => {
    expect(per({ doc: 'kensetsu', amount: 1_000 * MAN, date: '2027-03-31' })).toBe(5_000);
    expect(per({ doc: 'kensetsu', amount: 1_000 * MAN, date: '2027-04-01' })).toBe(10_000);
  });
});

describe('請負契約書（工事以外・第2号）', () => {
  it('軽減措置は当たらない（期間内でも本則）', () => {
    expect(per({ doc: 'ukeoi', amount: 1_000 * MAN, date: '2026-11-11' })).toBe(10_000);
    const r = taxResult(judge({ ...base, doc: 'ukeoi', amount: 1_000 * MAN }));
    expect(r.keigenIfExtended).toBeNull();
  });

  it('300万円は第1号本則 2,000円・第2号本則 1,000円（区切りの違い）', () => {
    expect(per({ doc: 'fudosan', amount: 300 * MAN, date: '2027-04-01' })).toBe(2_000);
    expect(per({ doc: 'ukeoi', amount: 300 * MAN })).toBe(1_000);
    expect(per({ doc: 'kensetsu', amount: 300 * MAN, date: '2027-04-01' })).toBe(1_000);
  });

  it('No.7124 の例：請負金額 1,000万円（消費税を分けて記載）→ 1万円', () => {
    expect(per({ doc: 'ukeoi', amount: 1_000 * MAN, taxWriting: 'bunri' })).toBe(10_000);
    // 「1,100万円（税込）」とだけ書いた場合
    expect(per({ doc: 'ukeoi', amount: 1_100 * MAN, taxWriting: 'komi' })).toBe(20_000);
  });

  it.each(['jun-inin', 'kihon'] as const)('「%s」は額を返さず対象外（0円でも第2号の額でもない）', (ukeoiNature) => {
    const r = judge({ ...base, doc: 'ukeoi', amount: 1_000 * MAN, ukeoiNature });
    expect(r.kind).toBe('taishogai');
    expect(r).not.toHaveProperty('perCopy');
    expect(r).not.toHaveProperty('total');
  });

  it('基本契約は第7号（4,000円）の可能性を案内する', () => {
    const r = judge({ ...base, doc: 'ukeoi', amount: 1_000 * MAN, ukeoiNature: 'kihon' });
    expect(r.reasons.join()).toContain('第7号');
    expect(r.reasons.join()).toContain('4,000円');
  });

  it('工事・不動産では請負の中身の質問を見ない', () => {
    expect(per({ doc: 'kensetsu', amount: 1_000 * MAN, ukeoiNature: 'jun-inin' })).toBe(5_000);
  });
});

describe('税抜で判定する（No.7124）', () => {
  it('分けて書く＋税抜 48,000円 → 0円、税込だけ 52,800円 → 200円', () => {
    expect(per({ amount: 48_000, taxWriting: 'bunri' })).toBe(0);
    expect(per({ amount: 52_800, taxWriting: 'komi' })).toBe(200);
  });

  it('理由に「税抜」で判定したことが出る', () => {
    const r = judge({ ...base, amount: 48_000, taxWriting: 'bunri' });
    expect(r.reasons.join()).toContain('税抜');
  });
});

describe('金額に関係なく判定が止まるもの', () => {
  it.each([0, 49_999, 50_000, 10 ** 10])('電子文書は %d円でも 0円', (amount) => {
    for (const doc of ['ryoshusho', 'fudosan', 'kensetsu', 'ukeoi'] as const) {
      const r = judge({ ...base, doc, amount, medium: 'denshi' });
      expect(r.kind).toBe('zero');
      if (r.kind === 'zero') expect(r.reason).toBe('denshi');
    }
  });

  it('電子文書は請負の中身より先に判定する（判定の順番）', () => {
    const r = judge({ ...base, doc: 'ukeoi', amount: 100 * MAN, medium: 'denshi', ukeoiNature: 'jun-inin' });
    expect(r.kind).toBe('zero');
  });

  it.each(['kojin-shigyo', 'kojin-shiteki'] as const)('営業に関しない（%s）の領収書は金額に関係なく 0円', (issuer) => {
    for (const amount of [50_000, 10 ** 9]) {
      const r = judge({ ...base, amount, issuer });
      expect(r.kind).toBe('zero');
      if (r.kind === 'zero') expect(r.reason).toBe('eigyogai');
    }
  });

  it('法人は「営業に関しない」に進まない（5万円以上は必ず課税）', () => {
    const r = judge({ ...base, amount: 50_000, issuer: 'hojin' });
    expect(r.kind).toBe('tax');
    expect(r.reasons.join()).toContain('会社');
  });

  it('個人事業主も営業に関する', () => {
    expect(per({ amount: 50_000, issuer: 'kojin-jigyo' })).toBe(200);
  });

  it('発行者は契約書の判定に効かない', () => {
    expect(per({ doc: 'fudosan', amount: 3_000 * MAN, issuer: 'kojin-shiteki' })).toBe(10_000);
  });

  it('2014-04-01 より前の作成日の契約書は対象外', () => {
    expect(judge({ ...base, doc: 'fudosan', amount: 3_000 * MAN, date: '2014-03-31' }).kind).toBe('taishogai');
    expect(per({ doc: 'fudosan', amount: 3_000 * MAN, date: '2014-04-01' })).toBe(10_000);
  });
});

describe('通数', () => {
  it('不動産 3,000万円・2027-03-31・2通 → 合計 2万円、1通 → 1万円', () => {
    const two = taxResult(judge({ ...base, doc: 'fudosan', amount: 3_000 * MAN, date: '2027-03-31', copies: 2 }));
    expect(two.perCopy).toBe(10_000);
    expect(two.total).toBe(20_000);
    const one = taxResult(judge({ ...base, doc: 'fudosan', amount: 3_000 * MAN, date: '2027-03-31', copies: 1 }));
    expect(one.total).toBe(10_000);
  });

  it('0通・小数は1以上の整数に直す', () => {
    expect(taxResult(judge({ ...base, doc: 'fudosan', amount: 3_000 * MAN, copies: 0 })).copies).toBe(1);
    expect(taxResult(judge({ ...base, doc: 'fudosan', amount: 3_000 * MAN, copies: 2.7 })).copies).toBe(2);
  });
});

describe('判定の理由（画面の「なぜこの額か」）', () => {
  it('電子？→営業に関する？→金額→作成日 の順に並ぶ', () => {
    const r = judge({ ...base, doc: 'fudosan', amount: 3_000 * MAN, date: '2027-03-31' });
    const text = r.reasons;
    expect(text[0]).toContain('紙');
    expect(text.findIndex((t) => t.includes('判定します'))).toBeLessThan(
      text.findIndex((t) => t.includes('作成日')),
    );
  });
});

describe('過怠税（印紙税法20条）', () => {
  it('3倍・自主申出 1.1倍・最低 1,000円', () => {
    expect(kataizei(200)).toEqual({ kaihatsu: 1_000, jishu: 1_000 });
    expect(kataizei(10_000)).toEqual({ kaihatsu: 30_000, jishu: 11_000 });
    expect(kataizei(0)).toEqual({ kaihatsu: 0, jishu: 0 });
  });
});

describe('入力の読み取り', () => {
  it.each([
    ['', undefined],
    ['50000', 50_000],
    ['50,000', 50_000],
    ['５０，０００円', 50_000],
    [' 1 000 ', 1_000],
  ])('%j → %s', (text, n) => {
    expect(parseYen(text)).toBe(n);
  });

  it.each(['-1', '1.5', 'abc', '1e5'])('%j は NaN', (text) => {
    expect(parseYen(text)).toBeNaN();
  });
});

describe('早見表', () => {
  it('期限の前日と翌日の2列で、不動産・工事は額が変わり、領収書は変わらない', () => {
    expect(QUICK_BEFORE).toBe('2027-03-31');
    expect(QUICK_AFTER).toBe('2027-04-01');
    const rows = quickTable();
    const f = rows.find((r) => r.doc === 'fudosan' && r.amount === 3_000 * MAN)!;
    expect([f.before, f.after]).toEqual([10_000, 20_000]);
    const k = rows.find((r) => r.doc === 'kensetsu' && r.amount === 1_000 * MAN)!;
    expect([k.before, k.after]).toEqual([5_000, 10_000]);
    for (const r of rows.filter((x) => x.doc === 'ryoshusho')) expect(r.before).toBe(r.after);
  });

  it('keigenTableAt は期限の翌日に null', () => {
    expect(keigenTableAt('fudosan', '2027-03-31')).not.toBeNull();
    expect(keigenTableAt('fudosan', '2027-04-01')).toBeNull();
    expect(keigenTableAt('ryoshusho', '2026-01-01')).toBeNull();
  });
});

describe('ページ・登録', () => {
  const dir = fileURLToPath(new URL('../app/inshi-zei/', import.meta.url));
  const page = readFileSync(`${dir}page.tsx`, 'utf8');
  const calc = readFileSync(`${dir}Calculator.tsx`, 'utf8');

  it('registry に wip で1件', () => {
    const entry = tools.filter((t) => t.slug === 'inshi-zei');
    expect(entry).toHaveLength(1);
    expect(entry[0].stage).toBe('wip');
  });

  it("metadata に robots: robotsFor('inshi-zei')", () => {
    expect(page).toContain("robots: robotsFor('inshi-zei')");
  });

  it('GA4 に渡すのは「計算した」の1種類だけで、値を載せない', () => {
    const calls = [...calc.matchAll(/trackToolUse\(([^)]*)\)/g)].map((m) => m[1]);
    expect(new Set(calls)).toEqual(new Set(["'inshi-zei', 'calculate'"]));
  });

  it('金額の入力欄は inputmode="numeric"', () => {
    expect(calc).toMatch(/id="inshi-amount"[\s\S]*?inputMode="numeric"/);
  });

  it('FAQ は5問で、仕様書の問いを含む', () => {
    const qs = [...page.matchAll(/q: '([^']+)'/g)].map((m) => m[1]);
    expect(qs).toHaveLength(5);
    const all = qs.join();
    for (const w of ['2027年4月', '税込・税抜', '電子契約', 'フリマ', '貼り忘れ']) expect(all).toContain(w);
  });

  it('消印と割印を分けて書き、割印は過怠税の対象外と書く', () => {
    expect(page).toContain('消印');
    expect(page).toContain('割印」は印紙税法上の義務ではなく');
    expect(page).toContain('押さなくても過怠税はかかりません');
  });

  it('作成日のラベルに注記がある', () => {
    expect(calc).toContain('契約書に書いた日付ではなく、実際に作った日');
  });

  it('電子でも印刷して渡す・原本を郵送すると課税、と選択肢に添える', () => {
    expect(calc).toContain('原本を郵送する');
  });

  it.each([
    ['page.tsx', page],
    ['Calculator.tsx', calc],
  ])('%s に節税の指南・特定サービスの名前が無い', (_n, src) => {
    for (const word of ['節約', '分割して', 'クラウドサイン', 'freee', 'マネーフォワード', 'GMOサイン', 'DocuSign']) {
      expect(src.includes(word), `「${word}」がある`).toBe(false);
    }
  });

  it('出典と最終確認日を出す', () => {
    expect(page).toContain('SOURCES.keigen');
    expect(page).toContain('DATA_CHECKED_AT');
  });
});
