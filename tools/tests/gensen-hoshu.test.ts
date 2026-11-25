import { describe, expect, it } from 'vitest';
import { surtaxAmount } from '@/lib/boei-tokubetsu-shotokuzei';
import {
  breakdown,
  calcHoshu,
  combinedRatePercent,
  formulaText,
  fromNet,
  invoiceLines,
  invoiceText,
  needsPaidOnNotice,
  withholding,
  type HoshuOptions,
  type TaxMode,
} from '@/lib/gensen-hoshu';

const opts = (taxMode: TaxMode = 'exclusive', kind: HoshuOptions['kind'] = 'normal', paidOn = '2027-01-15'): HoshuOptions => ({
  taxMode,
  kind,
  paidOn,
});

describe('withholding（仕様書のテストの例）', () => {
  it('ふつうの報酬', () => {
    expect(withholding(100_000)).toBe(10_210);
    expect(withholding(1_000_000)).toBe(102_100);
    expect(withholding(1_200_000)).toBe(142_940);
    expect(withholding(99_999)).toBe(10_209); // 10,209.8979 → 切捨て
    expect(withholding(0)).toBe(0);
  });

  it('司法書士等は (支払額 − 1万円) × 10.21%', () => {
    expect(withholding(50_000, 'shihoshoshi')).toBe(4_084);
    expect(withholding(10_000, 'shihoshoshi')).toBe(0);
    expect(withholding(5_000, 'shihoshoshi')).toBe(0);
    // 100万円を超えても 20% の段はない（所得税法205条2号）
    expect(withholding(2_010_000, 'shihoshoshi')).toBe(204_200);
  });

  it('国税庁の計算例と一致する', () => {
    // Q&A Q6 例1・例2
    expect(withholding(222_222)).toBe(22_688);
    expect(withholding(1_333_333)).toBe(170_166);
    // タックスアンサー No.2795・No.2798：150万円 → 204,200円
    expect(withholding(1_500_000)).toBe(204_200);
    // Q&A Q10：支払金額 111,370円 → 11,370円
    expect(withholding(111_370)).toBe(11_370);
  });

  it('税額は 2026年と2027年で同じ', () => {
    for (const b of [1, 99_999, 222_222, 1_000_001, 1_333_333, 9_876_543]) {
      expect(withholding(b, 'normal', 2026)).toBe(withholding(b, 'normal', 2027));
    }
  });

  it('10.21% / 20.42% は所得税率と付加税から組み立てる', () => {
    expect(combinedRatePercent(100, 2026)).toBe(10.21);
    expect(combinedRatePercent(100, 2027)).toBe(10.21);
    expect(combinedRatePercent(200, 2027)).toBe(20.42);
  });
});

describe('calcHoshu（消費税の3通り）', () => {
  it('税抜11万円 → 税込121,000円・源泉 11,231円', () => {
    const r = calcHoshu(110_000, opts('exclusive'));
    expect(r.consumptionTax).toBe(11_000);
    expect(r.gross).toBe(121_000);
    expect(r.withholding).toBe(11_231);
    expect(r.net).toBe(121_000 - 11_231);
    expect(r.unseparatedExtra).toBe(0);
  });

  it('税込121,000円・区分あり → 税抜に源泉 11,231円', () => {
    const r = calcHoshu(121_000, opts('inclusiveSeparated'));
    expect(r.fee).toBe(110_000);
    expect(r.withholding).toBe(11_231);
  });

  it('税込121,000円・区分なし → 税込に源泉 12,354円、区分すれば 1,123円減る', () => {
    const r = calcHoshu(121_000, opts('inclusiveUnseparated'));
    expect(r.withholdingBase).toBe(121_000);
    expect(r.withholding).toBe(12_354);
    expect(r.unseparatedExtra).toBe(12_354 - 11_231);
  });

  it('負の数・小数・NaN は 0 円以上の整数にそろえる', () => {
    expect(calcHoshu(-5, opts()).withholding).toBe(0);
    expect(calcHoshu(Number.NaN, opts()).gross).toBe(0);
    expect(calcHoshu(100_000.9, opts()).fee).toBe(100_000);
  });
});

describe('fromNet（手取りから請求額）', () => {
  it('Q&A Q10：消費税なしで手取り100,000円 → 111,370円', () => {
    // Q10 は消費税を区別しない例なので、「入力額＝源泉の対象額」になる inclusiveUnseparated で比べる
    const r = fromNet(100_000, opts('inclusiveUnseparated'));
    expect(r.amount).toBe(111_370);
    expect(r.result.withholding).toBe(11_370);
    expect(r.exact).toBe(true);
  });

  it('税抜の請求で手取り 109,769円 → 報酬 110,000円', () => {
    const r = fromNet(121_000 - 11_231, opts('exclusive'));
    expect(r.amount).toBe(110_000);
    expect(r.exact).toBe(true);
  });

  const modes: TaxMode[] = ['exclusive', 'inclusiveSeparated', 'inclusiveUnseparated'];
  // 再現できる乱数（線形合同法）
  let seed = 20261125;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };

  for (const mode of modes) {
    for (const kind of ['normal', 'shihoshoshi'] as const) {
      it(`任意の請求額 g で fromNet(net(g)) ≦ g かつ同じ振込額（${mode}・${kind}・1,000本）`, () => {
        const o = opts(mode, kind);
        for (let i = 0; i < 1000; i += 1) {
          const g = 1 + Math.floor(rand() * 3_000_000);
          const net = calcHoshu(g, o).net;
          const back = fromNet(net, o);
          expect(back.exact).toBe(true);
          expect(back.amount).toBeLessThanOrEqual(g);
          expect(back.result.net).toBe(net);
          // 最小であること
          if (back.amount > 0) expect(calcHoshu(back.amount - 1, o).net).toBeLessThan(net);
        }
      });
    }
  }

  it('ちょうどの金額が無い振込額は、1円多い振込額になる最小の金額を返す', () => {
    const o = opts('exclusive');
    // 振込額が2円飛ぶ所を探す
    let found = false;
    for (let g = 1; g < 2000 && !found; g += 1) {
      const a = calcHoshu(g, o).net;
      const b = calcHoshu(g + 1, o).net;
      if (b - a === 2) {
        const r = fromNet(a + 1, o);
        expect(r.exact).toBe(false);
        expect(r.amount).toBe(g + 1);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('切り捨てで同じ振込額になる金額が2つあるときは sameNetAtNext', () => {
    const o = opts('inclusiveUnseparated');
    // 111,370 と 111,371 はどちらも振込額 100,000円（111,371 × 10.21% = 11,370.97）
    expect(calcHoshu(111_371, o).net).toBe(100_001);
    let found = false;
    for (let g = 1; g < 2000 && !found; g += 1) {
      if (calcHoshu(g, o).net === calcHoshu(g + 1, o).net) {
        const r = fromNet(calcHoshu(g, o).net, o);
        expect(r.amount).toBe(g);
        expect(r.sameNetAtNext).toBe(true);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe('breakdown（参考の内訳）', () => {
  it('支払日 2026-12-31 と 2027-01-01 で税額が同じで、内訳だけ 2→3 行になる', () => {
    const a = calcHoshu(1_200_000, opts('exclusive', 'normal', '2026-12-31'));
    const b = calcHoshu(1_200_000, opts('exclusive', 'normal', '2027-01-01'));
    expect(a.withholding).toBe(b.withholding);
    expect(a.breakdown.map((r) => r.label)).toEqual(['所得税', '復興特別所得税']);
    expect(b.breakdown.map((r) => r.label)).toEqual(['所得税', '防衛特別所得税', '復興特別所得税']);
  });

  it('10万円の内訳：2027年は 所得税 10,000・防衛 100・復興 110', () => {
    expect(breakdown(10_210, '2027-03-01').map((r) => r.amount)).toEqual([10_000, 100, 110]);
    expect(breakdown(10_210, '2026-03-01').map((r) => r.amount)).toEqual([10_000, 210]);
  });

  it('内訳の和は必ず源泉徴収税額に一致し、付加税の合計は surtaxAmount に合う', () => {
    for (let t = 0; t <= 30_000; t += 7) {
      for (const paidOn of ['2026-06-01', '2027-06-01']) {
        const rows = breakdown(t, paidOn);
        expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(t);
        const income = rows[0].amount;
        const surtax = t - income;
        const year = Number(paidOn.slice(0, 4));
        // 付加税は合計額で1回だけ切り捨てる（各税で別々に切らない）。
        // 合計からの逆算なので surtaxAmount(所得税) と同じか、合計の飛びの分だけ1円多い
        expect(surtax - surtaxAmount(income, year, 'after')).toBeGreaterThanOrEqual(0);
        expect(surtax - surtaxAmount(income, year, 'after')).toBeLessThanOrEqual(1);
        expect(income + 1 + surtaxAmount(income + 1, year, 'after')).toBeGreaterThan(t);
      }
    }
  });

  it('仕様書の例（10万・100万・120万）では付加税の合計が surtaxAmount とちょうど一致する', () => {
    for (const b of [100_000, 1_000_000, 1_200_000]) {
      const rows = calcHoshu(b, opts()).breakdown;
      const income = rows[0].amount;
      expect(rows.slice(1).reduce((s, r) => s + r.amount, 0)).toBe(surtaxAmount(income, 2027, 'after'));
    }
  });
});

describe('表示用の関数', () => {
  it('式は実際の数字で出す', () => {
    expect(formulaText(calcHoshu(1_200_000, opts()))).toBe(
      '(1,000,000 × 10.21%) ＋ (200,000 × 20.42%) ＝ 102,100 ＋ 40,840 ＝ 142,940円',
    );
    expect(formulaText(calcHoshu(1_333_333, opts()))).toBe(
      '(1,000,000 × 10.21%) ＋ (333,333 × 20.42%) ＝ 102,100 ＋ 68,066.5986 ＝ 170,166.5986 ⇒ 170,166円（1円未満切捨て）',
    );
    expect(formulaText(calcHoshu(100_000, opts()))).toBe('(100,000 × 10.21%) ＝ 10,210円');
  });

  it('請求書の例は区分ありで5行、区分なしで3行', () => {
    const r = calcHoshu(110_000, opts('exclusive'));
    const lines = invoiceLines(r, 'exclusive');
    expect(lines.map((l) => l.label)).toEqual(['報酬', '消費税（10%）', '小計', '源泉徴収税額', '差引請求額']);
    expect(lines.map((l) => l.amount)).toEqual([110_000, 11_000, 121_000, -11_231, 109_769]);
    expect(invoiceText(lines)).toBe(
      '報酬\t110,000円\n消費税（10%）\t11,000円\n小計\t121,000円\n源泉徴収税額\t−11,231円\n差引請求額\t109,769円',
    );
    expect(invoiceLines(calcHoshu(121_000, opts('inclusiveUnseparated')), 'inclusiveUnseparated')).toHaveLength(3);
  });

  it('改正の境目（2026年12月〜2027年1月）の支払日では断定しない注記を出す', () => {
    expect(needsPaidOnNotice('2026-11-30')).toBe(false);
    expect(needsPaidOnNotice('2026-12-01')).toBe(true);
    expect(needsPaidOnNotice('2027-01-31')).toBe(true);
    expect(needsPaidOnNotice('2027-02-01')).toBe(false);
  });
});
