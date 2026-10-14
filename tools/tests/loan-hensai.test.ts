import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DISCLAIMER,
  annuityPayment,
  balanceAfter,
  burdenRatio,
  compareMethods,
  effectivePrepayments,
  kojoEstimate,
  kojoLimitRange,
  prepayEffect,
  rateChangesWithinTerm,
  simulate,
  validate,
  yearEndTable,
  type LoanInput,
  type LoanResult,
} from '@/lib/loan-hensai';
import { CREDIT_RATE, RESIDENT_CAP_MAX } from '@/lib/jutaku-loan-kojo';
import { tools } from '@/lib/registry';
import { EXAMPLE } from '@/app/loan-hensai/tables';

/**
 * ローン返済シミュレーション（lib/loan-hensai.ts）のテスト。
 *
 * 仕様: docs/features/loan-hensai-simulation.md の「テスト」の表。
 * 期待値は仕様書の起票時（2026-10-12）に、仕様の端数規則（利息・返済額は円未満切り捨て、
 * 最終回で元金と未払利息を精算）で出した値。**実装の出力を正解に置き換えない。**
 * 値が合わないときは、端数規則と見直しの月（61・121…回目）の数え方を先に確かめる。
 */

const BASE: LoanInput = { principal: 30_000_000, years: 35, ratePercent: 1.0, method: 'ganri' };

function run(input: LoanInput): LoanResult {
  const r = simulate(input);
  if (!r) throw new Error('範囲外');
  return r;
}

describe('仕様書の表（1〜6）', () => {
  it('1: 3,000万・35年・1.0%・元利均等', () => {
    const r = run(BASE);
    expect(r.firstMonthlyPayment).toBe(84_685);
    expect(r.monthly.lastMonth).toBe(420);
    expect(r.monthly.finalPayment).toBe(84_789);
    expect(r.totalInterest).toBe(5_567_804);
    expect(r.totalPaid).toBe(30_000_000 + 5_567_804);
  });

  it('2: 0.5% なら毎月 77,875円', () => {
    expect(run({ ...BASE, ratePercent: 0.5 }).firstMonthlyPayment).toBe(77_875);
  });

  it('3: 4,000万・35年・1.8% なら毎月 128,436円', () => {
    expect(run({ ...BASE, principal: 40_000_000, ratePercent: 1.8 }).firstMonthlyPayment).toBe(128_436);
  });

  it('4: 0% なら毎月 71,428円・最終回 71,668円・利息 0', () => {
    const r = run({ ...BASE, ratePercent: 0 });
    expect(r.firstMonthlyPayment).toBe(71_428);
    expect(r.monthly.finalPayment).toBe(71_668);
    expect(r.totalInterest).toBe(0);
  });

  it('5: 元金均等は元金 71,428円・初回 96,428円・利息 5,262,332円', () => {
    const r = run({ ...BASE, method: 'gankin' });
    expect(r.monthly.rows[0].principalPaid).toBe(71_428);
    expect(r.firstMonthlyPayment).toBe(96_428);
    expect(r.totalInterest).toBe(5_262_332);
    // 最終回で端数を精算する（元金の合計が借入額に一致する）
    expect(r.monthly.rows.reduce((s, x) => s + x.principalPaid, 0)).toBe(30_000_000);
    expect(r.monthly.rows.at(-1)?.principalPaid).toBe(30_000_000 - 71_428 * 419);
  });

  it('6: 12 回目後の残高 29,280,480円・控除の目安 204,963円', () => {
    const r = run(BASE);
    expect(balanceAfter(r, 12)).toBe(29_280_480);
    expect(kojoEstimate(29_280_480)).toBe(204_963);
  });
});

describe('5年ルール・125%ルール（7・7b・7c）', () => {
  it('7: 61 回目から 3.0%。上限で頭打ち、未払利息は出ない', () => {
    const r = run({ ...BASE, rule125: true, rateChanges: [{ fromPayment: 61, ratePercent: 3.0 }] });
    expect(balanceAfter(r, 60)).toBe(26_329_393);
    const [first, second] = r.monthly.reviews;
    expect(first).toMatchObject({ k: 61, computed: 111_005, cap: 105_856, payment: 105_856 });
    expect(r.monthly.rows[60].interest).toBe(65_823);
    expect(r.monthly.maxUnpaid).toBe(0);
    expect(second).toMatchObject({ k: 121, computed: 112_584, cap: 132_320, payment: 112_584 });
    expect(r.monthly.finalPayment).toBe(112_599);
    expect(r.totalInterest).toBe(15_207_616);
  });

  it('7b: 61 回目から 5.0%。未払利息が出て、最終回でまとめて精算する', () => {
    const r = run({ ...BASE, rule125: true, rateChanges: [{ fromPayment: 61, ratePercent: 5.0 }] });
    const reviews = r.monthly.reviews;
    expect(reviews[0]).toMatchObject({ k: 61, computed: 141_341, cap: 105_856, payment: 105_856 });
    expect(r.monthly.rows[60].interest).toBe(109_705);
    expect(r.monthly.rows[60].unpaid).toBe(3_849);
    expect(r.monthly.rows[119].unpaid).toBe(230_940);
    expect(reviews[1]).toMatchObject({ k: 121, computed: 155_269, cap: 132_320, payment: 132_320 });
    expect(reviews[2]).toMatchObject({ k: 181, computed: 165_523, cap: 165_400, payment: 165_400 });
    expect(r.monthly.lastMonth).toBe(420);
    expect(r.monthly.finalPayment).toBe(165_598);
    expect(r.totalInterest).toBe(29_101_748);
    // 最終回で未払利息まで精算される
    expect(r.monthly.rows.at(-1)).toMatchObject({ balance: 0, unpaid: 0 });
  });

  it('7c: ルールなしなら 61 回目から 111,005円に引き直す（上限なし）', () => {
    const r = run({ ...BASE, rule125: false, rateChanges: [{ fromPayment: 61, ratePercent: 3.0 }] });
    expect(r.monthly.reviews).toHaveLength(1);
    expect(r.monthly.reviews[0]).toMatchObject({ k: 61, computed: 111_005, cap: null, payment: 111_005 });
    expect(r.monthly.rows[60].payment).toBe(111_005);
  });

  it('金利の変化を入れなければ、ルールを当てる設定でも 1 と同じ結果（見直しで端数がずれない）', () => {
    const r = run({ ...BASE, rule125: true, rateChanges: [] });
    expect(r.monthly.reviews).toHaveLength(0);
    expect(r.monthly.finalPayment).toBe(84_789);
    expect(r.totalInterest).toBe(5_567_804);
  });

  it('返済期間の外の変化・+0% の変化では、ルールを当てる設定でも 1 と同じ結果（#379 のレビュー）', () => {
    for (const rateChanges of [
      [{ fromPayment: 481, ratePercent: 2.0 }], // 40 年後から +1%（35 年ローンの期間の外）
      [{ fromPayment: 61, ratePercent: 1.0 }], // 5 年後から +0%
    ]) {
      const input: LoanInput = { ...BASE, rule125: true, rateChanges };
      expect(rateChangesWithinTerm(input)).toBe(false);
      const r = run(input);
      expect(r.monthly.reviews).toHaveLength(0);
      expect(r.monthly.finalPayment).toBe(84_789);
      expect(r.totalInterest).toBe(5_567_804);
    }
    expect(rateChangesWithinTerm({ ...BASE, rateChanges: [{ fromPayment: 420, ratePercent: 2.0 }] })).toBe(true);
  });

  it('見直しまでのあいだに金利が変わっても、返済額は変えず内訳だけが変わる', () => {
    const r = run({ ...BASE, rule125: true, rateChanges: [{ fromPayment: 30, ratePercent: 2.0 }] });
    expect(r.monthly.rows[29].payment).toBe(84_685);
    expect(r.monthly.rows[29].interest).toBeGreaterThan(r.monthly.rows[28].interest);
    expect(r.monthly.reviews[0].k).toBe(61);
  });

  it('元金均等にはルールを当てず、金利が変わった月から利息だけを引き直す', () => {
    const r = run({ ...BASE, method: 'gankin', rule125: true, rateChanges: [{ fromPayment: 61, ratePercent: 3.0 }] });
    expect(r.monthly.reviews).toHaveLength(0);
    const row = r.monthly.rows[60];
    expect(row.principalPaid).toBe(71_428);
    expect(row.payment).toBe(71_428 + Math.floor(r.monthly.rows[59].balance * 0.03 / 12));
  });

  it('ボーナス払い分にも月の分とは別にルールを当てる（10 回＝5 年ごと、前回の 1.25 倍が上限）', () => {
    const r = run({
      ...BASE,
      bonusPrincipal: 10_000_000,
      rule125: true,
      rateChanges: [{ fromPayment: 61, ratePercent: 5.0 }],
    });
    const bonus = r.bonus!;
    const first = bonus.firstPayment;
    expect(bonus.reviews[0].k).toBe(11);
    expect(bonus.reviews[0].month).toBe(66);
    expect(bonus.reviews[0].cap).toBe(Math.floor(first * 1.25));
    expect(bonus.reviews[0].payment).toBeLessThanOrEqual(bonus.reviews[0].cap!);
    // 月の分は月の分で見直す
    expect(r.monthly.reviews[0].k).toBe(61);
    expect(bonus.rows.at(-1)).toMatchObject({ month: 420, balance: 0, unpaid: 0 });
  });
});

describe('繰上返済（8）', () => {
  it('8: 120 回目の後に 100万円を期間短縮。15 か月短縮・利息 276,373円減', () => {
    const input: LoanInput = {
      ...BASE,
      prepayments: [{ afterPayment: 120, amount: 1_000_000, type: 'shorten' }],
    };
    const r = run(input);
    expect(r.monthly.rows[120].payment).toBe(84_685);
    expect(r.monthly.lastMonth).toBe(405);
    expect(r.monthly.finalPayment).toBe(78_691);
    expect(r.totalInterest).toBe(5_291_431);
    const e = prepayEffect(input)!;
    expect(e.monthsShortened).toBe(15);
    expect(e.interestSaved).toBe(276_373);
    expect(e.paymentDrop).toBe(0);
  });

  it('返済額軽減は期間を変えず、毎月の返済額が下がる。利息の減り方は期間短縮より小さい', () => {
    const reduce = prepayEffect({ ...BASE, prepayments: [{ afterPayment: 120, amount: 1_000_000, type: 'reduce' }] })!;
    const shorten = prepayEffect({ ...BASE, prepayments: [{ afterPayment: 120, amount: 1_000_000, type: 'shorten' }] })!;
    expect(reduce.monthsShortened).toBe(0);
    expect(reduce.paymentDrop).toBeGreaterThan(0);
    expect(reduce.paymentAfter).toBe(84_685 - reduce.paymentDrop);
    expect(reduce.interestSaved).toBeGreaterThan(0);
    expect(reduce.interestSaved).toBeLessThan(shorten.interestSaved);
  });

  it('残高より多い繰上返済は残高までにとどめ、そこで完済になる', () => {
    const r = run({ ...BASE, prepayments: [{ afterPayment: 12, amount: 999_999_999, type: 'shorten' }] });
    expect(r.monthly.lastMonth).toBe(12);
    expect(r.monthly.totalPrepaid).toBe(29_280_480);
    expect(r.totalPaid).toBe(30_000_000 + r.totalInterest);
  });

  it('最終年の終わりの繰上返済は計算に入れず、効果も null（「減る利息 0円」と出さない）', () => {
    const input: LoanInput = { ...BASE, prepayments: [{ afterPayment: 420, amount: 1_000_000, type: 'shorten' }] };
    expect(effectivePrepayments(input)).toHaveLength(0);
    expect(prepayEffect(input)).toBeNull();
    expect(run(input).totalInterest).toBe(5_567_804);
    // 419 回目の後は入れられる
    expect(effectivePrepayments({ ...BASE, prepayments: [{ afterPayment: 419, amount: 10_000, type: 'shorten' }] })).toHaveLength(1);
  });

  it('期間短縮では「毎月の返済額が下がる」を出さない（元金均等でも）', () => {
    const e = prepayEffect({
      ...BASE,
      method: 'gankin',
      prepayments: [{ afterPayment: 120, amount: 1_000_000, type: 'shorten' }],
    })!;
    expect(e.paymentDrop).toBe(0);
    expect(e.monthsShortened).toBeGreaterThan(0);
  });

  it('繰上返済が無ければ効果は null', () => {
    expect(prepayEffect(BASE)).toBeNull();
  });
});

describe('ボーナス払い', () => {
  it('ボーナス分は半年ごとの元利均等（月利 × 6）で、月の分と足すと総返済額になる', () => {
    const r = run({ ...BASE, bonusPrincipal: 6_000_000 });
    expect(r.monthly.firstPayment).toBe(annuityPayment(24_000_000, 420, 1000));
    expect(r.bonus?.firstPayment).toBe(annuityPayment(6_000_000, 70, 1000, 6));
    expect(r.bonus?.rows[0].month).toBe(6);
    expect(r.bonus?.count).toBe(70);
    expect(r.totalPaid).toBe(r.monthly.totalPaid + (r.bonus?.totalPaid ?? 0));
    expect(balanceAfter(r, 420)).toBe(0);
  });

  it('ボーナス払いは借入額の 50% まで', () => {
    expect(validate({ ...BASE, bonusPrincipal: 15_000_000 })).toBeNull();
    expect(validate({ ...BASE, bonusPrincipal: 15_000_001 })).not.toBeNull();
    expect(simulate({ ...BASE, bonusPrincipal: 20_000_000 })).toBeNull();
  });
});

describe('入力の範囲', () => {
  it('期間は 1〜50 年、金利は 0〜15%', () => {
    expect(validate({ ...BASE, years: 0 })).not.toBeNull();
    expect(validate({ ...BASE, years: 51 })).not.toBeNull();
    expect(validate({ ...BASE, years: 50 })).toBeNull();
    expect(validate({ ...BASE, ratePercent: 15.001 })).not.toBeNull();
    expect(validate({ ...BASE, ratePercent: -0.1 })).not.toBeNull();
    expect(validate({ ...BASE, principal: Number.NaN })).not.toBeNull();
    expect(validate({ ...BASE, principal: 0 })).not.toBeNull();
  });

  it('0.001% 刻みの金利を扱える', () => {
    const a = run({ ...BASE, ratePercent: 1.0 }).firstMonthlyPayment;
    const b = run({ ...BASE, ratePercent: 1.001 }).firstMonthlyPayment;
    expect(b).toBeGreaterThan(a);
  });
});

describe('年末残高の表と住宅ローン控除の目安', () => {
  it('1 月開始なら 1 年目の年末残高は 12 回目後の残高', () => {
    const rows = yearEndTable(run(BASE), 2027, 1);
    expect(rows[0]).toEqual({ year: 2027, balance: 29_280_480, kojo: 204_963 });
    expect(rows).toHaveLength(35);
    expect(rows.at(-1)).toMatchObject({ year: 2061, balance: 0 });
  });

  it('11 月開始なら 1 年目は 2 回分だけ返した残高、最後の年は完済の年', () => {
    const r = run(BASE);
    const rows = yearEndTable(r, 2026, 11);
    expect(rows[0].balance).toBe(balanceAfter(r, 2));
    expect(rows[1].balance).toBe(balanceAfter(r, 14));
    // 420 回目は 2061 年 10 月
    expect(rows.at(-1)).toMatchObject({ year: 2061, balance: 0 });
    expect(rows).toHaveLength(36);
  });

  it('控除の目安は lib/jutaku-loan-kojo.ts の控除率を使う', () => {
    expect(kojoEstimate(10_000_000)).toBe(Math.floor(10_000_000 * CREDIT_RATE));
  });

  it('借入限度額の幅と控除期間を lib/jutaku-loan-kojo.ts の表から取る', () => {
    const { min, max, years } = kojoLimitRange();
    expect(min).toBe(20_000_000);
    expect(max).toBe(50_000_000);
    expect(years).toEqual([13, 10]);
    expect(RESIDENT_CAP_MAX).toBe(97_500);
  });
});

describe('比較・返済負担率', () => {
  it('元利均等と元金均等を同じ条件で並べる', () => {
    const c = compareMethods(BASE)!;
    expect(c.ganri.firstMonthlyPayment).toBe(84_685);
    expect(c.gankin.firstMonthlyPayment).toBe(96_428);
    expect(c.ganri.totalInterest - c.gankin.totalInterest).toBe(5_567_804 - 5_262_332);
  });

  it('返済負担率は最初の 12 か月の返済額 ÷ 年収。年収が無ければ null', () => {
    const r = run(BASE);
    expect(burdenRatio(r, 6_000_000)).toBeCloseTo((84_685 * 12) / 6_000_000, 10);
    expect(burdenRatio(r, 0)).toBeNull();
    expect(burdenRatio(r, Number.NaN)).toBeNull();
  });
});

describe('ページ', () => {
  const page = readFileSync(fileURLToPath(new URL('../app/loan-hensai/page.tsx', import.meta.url)), 'utf8');
  const calc = readFileSync(fileURLToPath(new URL('../app/loan-hensai/Calculator.tsx', import.meta.url)), 'utf8');

  it('計算機の直下に「試算です」の固定文を置く', () => {
    expect(DISCLAIMER).toBe(
      'この結果は試算です。実際の返済額は金融機関の約定や端数の処理で異なります。借入の判断は金融機関に確認してください。',
    );
    expect(page).toMatch(/<Calculator \/>\s*<p className="note">\{DISCLAIMER\}<\/p>/);
  });

  it('FAQ の 4 問が仕様書のとおりある', () => {
    for (const q of [
      '3,000万円・35年・金利1%だと毎月いくら？',
      '元金均等のほうが得ですか？',
      '繰上返済は期間短縮と返済額軽減のどちらが利息が減りますか？',
      '金利が1%上がると返済額はいくら増えますか？',
    ]) {
      expect(page).toContain(q);
    }
    expect(page).toContain("'@type': 'FAQPage'");
  });

  it('5年ルール・125%ルールに「採っていない商品もある」を必ず添える', () => {
    expect(page).toContain('採っていない商品もあります');
    expect(calc).toContain('採っていない商品もあります');
  });

  it('本文の計算例は lib の結果から作る（仕様書の値と一致）', () => {
    expect(EXAMPLE.ganriMonthly).toBe(84_685);
    expect(EXAMPLE.ganriTotalInterest).toBe(5_567_804);
    expect(EXAMPLE.gankinFirst).toBe(96_428);
    expect(EXAMPLE.gankinTotalInterest).toBe(5_262_332);
    expect(EXAMPLE.shorten.monthsShortened).toBe(15);
    expect(EXAMPLE.shorten.interestSaved).toBe(276_373);
    expect(EXAMPLE.rise3Review).toMatchObject({ computed: 111_005, cap: 105_856 });
    expect(EXAMPLE.rise3Final).toBe(112_599);
  });

  it('既定の金利は計算例であって市場金利ではないと書く', () => {
    expect(calc).toContain('現在の市場金利ではありません');
  });

  it('registry では preview（テスト環境で確かめてから public）', () => {
    expect(tools.find((t) => t.slug === 'loan-hensai')?.stage).toBe('preview');
  });
});
