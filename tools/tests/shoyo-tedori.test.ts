import { describe, expect, it } from 'vitest';
import {
  bonusPremiums,
  calcShoyo,
  prevMonthOf,
  rateLabel,
  shoyoTable,
  standardBonusOf,
  TABLE_BONUSES,
  TABLE_PREV_SALARY,
  withholdingTax,
  yearEndNoteKind,
} from '@/lib/shoyo-tedori';
import {
  KOU_LOWER_BOUNDS,
  KOU_RATES_MILLI,
  lookupRate,
  MAX_DEPENDENTS,
  OTSU_LOWER_BOUNDS,
  OTSU_RATES_MILLI,
} from '@/lib/shoyo-gensen-table';
import { BONUS_CAP_YEARLY } from '@/lib/kosodate-shienkin';
import { PENSION_BONUS_CAP } from '@/lib/shaho-grades';
import {
  EMPLOYMENT_RATE,
  HEALTH_RATE,
  PENSION_RATE,
  SHIENKIN_RATE,
} from '@/lib/shaho-ryoritsu';
import { estimateSocialInsurance } from '@/lib/furusato-nozei';

/**
 * 仕様: docs/features/shoyo-tedori-keisan.md
 *
 * 算出率の表の突き合わせは、国税庁「令和8年分 源泉徴収税額表」15〜16ページ
 * https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/data/15-16.pdf
 * を見て書いた値。表を令和9年分へ差し替えるときは、ここも新しい PDF で書き直す。
 */

describe('算出率の表（令和8年分）の形', () => {
  it('甲欄は 0.000%〜45.945% の21行・扶養0〜7人以上の8列', () => {
    expect(KOU_RATES_MILLI).toHaveLength(21);
    expect(KOU_RATES_MILLI[0]).toBe(0);
    expect(KOU_RATES_MILLI[20]).toBe(45945);
    expect(KOU_LOWER_BOUNDS).toHaveLength(8);
    expect(MAX_DEPENDENTS).toBe(7);
    for (const col of KOU_LOWER_BOUNDS) expect(col).toHaveLength(KOU_RATES_MILLI.length);
  });

  it('率は上の行ほど高く、各列の下限は単調に増える（転記の取り違え検知）', () => {
    for (let i = 1; i < KOU_RATES_MILLI.length; i++) {
      expect(KOU_RATES_MILLI[i]).toBeGreaterThan(KOU_RATES_MILLI[i - 1]);
    }
    for (const col of KOU_LOWER_BOUNDS) {
      for (let i = 1; i < col.length; i++) expect(col[i]).toBeGreaterThan(col[i - 1]);
    }
  });

  it('乙欄は5行', () => {
    expect(OTSU_RATES_MILLI).toEqual([10210, 20420, 30630, 38798, 45945]);
    expect(OTSU_LOWER_BOUNDS).toEqual([0, 224, 295, 527, 1118]);
  });
});

describe('算出率の表の突き合わせ（PDFの値）', () => {
  // 甲欄
  it('甲・扶養0人：82千円未満は0%、82千円ちょうどから2.042%', () => {
    expect(lookupRate(81_999, 0, false).rateMilli).toBe(0);
    expect(lookupRate(82_000, 0, false)).toEqual({ rateMilli: 2042, from: 82_000, below: 94_000 });
  });

  it('甲・扶養3人：1,013千円以上1,391千円未満は32.672%', () => {
    expect(lookupRate(1_013_000, 3, false)).toEqual({
      rateMilli: 32672,
      from: 1_013_000,
      below: 1_391_000,
    });
    expect(lookupRate(1_390_999, 3, false).rateMilli).toBe(32672);
    expect(lookupRate(1_391_000, 3, false).rateMilli).toBe(35735);
  });

  it('甲・扶養7人以上：3,717千円以上は45.945%（8人以上も同じ列）', () => {
    expect(lookupRate(3_717_000, 7, false)).toEqual({ rateMilli: 45945, from: 3_717_000, below: null });
    expect(lookupRate(3_716_999, 7, false).rateMilli).toBe(41861);
    expect(lookupRate(3_717_000, 9, false).rateMilli).toBe(45945);
  });

  it('甲・扶養5人：1,440千円以上1,555千円未満は35.735%', () => {
    expect(lookupRate(1_500_000, 5, false).rateMilli).toBe(35735);
  });

  // 乙欄
  it('乙：224千円未満は10.210%', () => {
    expect(lookupRate(223_999, 0, true)).toEqual({ rateMilli: 10210, from: 0, below: 224_000 });
  });

  it('乙：295千円以上527千円未満は30.630%（扶養の数は見ない）', () => {
    expect(lookupRate(295_000, 3, true).rateMilli).toBe(30630);
    expect(lookupRate(526_999, 0, true).rateMilli).toBe(30630);
  });

  it('乙：1,118千円以上は45.945%', () => {
    expect(lookupRate(1_118_000, 0, true)).toEqual({ rateMilli: 45945, from: 1_118_000, below: null });
    expect(lookupRate(1_117_999, 0, true).rateMilli).toBe(38798);
  });
});

describe('標準賞与額と保険料', () => {
  it('標準賞与額は1,000円未満切り捨て', () => {
    expect(standardBonusOf(999)).toBe(0);
    expect(standardBonusOf(500_999)).toBe(500_000);
  });

  it('賞与999円：標準賞与額0なので健保・厚年・支援金は0、雇用保険だけかかる', () => {
    const p = bonusPremiums(999);
    expect(p.standardBonus).toBe(0);
    expect(p.health).toBe(0);
    expect(p.pension).toBe(0);
    expect(p.shienkin).toBe(0);
    // 999 × 0.5% = 4.995 → 50銭超なので切り上げ
    expect(p.employment).toBe(5);
  });

  it('賞与50万円の内訳', () => {
    const p = bonusPremiums(500_000);
    expect(p.health).toBe(24_750); // 500,000 × 4.95%
    expect(p.shienkin).toBe(575); // 500,000 × 0.115%
    expect(p.pension).toBe(45_750); // 500,000 × 9.15%
    expect(p.employment).toBe(2_500); // 500,000 × 0.5%
    expect(p.kaigo).toBe(0);
    expect(p.total).toBe(24_750 + 575 + 45_750 + 2_500);
  });

  it('40歳以上は介護保険料が標準賞与額にかかる', () => {
    expect(bonusPremiums(500_000, true).kaigo).toBe(4_050); // 500,000 × 0.81%
  });

  it('厚生年金：150万円ちょうどは上限に当たらない', () => {
    const p = bonusPremiums(1_500_000);
    expect(p.pensionStandardBonus).toBe(1_500_000);
    expect(p.pensionCapped).toBe(false);
  });

  it('厚生年金：150万1,000円は150万円で頭打ち。雇用保険は150万1,000円の全額にかかる', () => {
    const p = bonusPremiums(1_501_000);
    expect(PENSION_BONUS_CAP).toBe(1_500_000);
    expect(p.pensionStandardBonus).toBe(1_500_000);
    expect(p.pensionCapped).toBe(true);
    expect(p.pension).toBe(Math.round(1_500_000 * PENSION_RATE));
    expect(p.employment).toBe(Math.round(1_501_000 * EMPLOYMENT_RATE));
    expect(p.employment).toBe(7_505);
    // 健康保険は上限に当たらない
    expect(p.healthStandardBonus).toBe(1_501_000);
  });

  it('雇用保険は1,000円未満も切り捨てない', () => {
    expect(bonusPremiums(500_999).employment).toBe(2_505); // 500,999 × 0.5% = 2,504.995 → 切り上げ
  });

  it('健康保険は年度累計573万円をまたぐと、残りの枠だけにかかる', () => {
    expect(BONUS_CAP_YEARLY).toBe(5_730_000);
    const p = bonusPremiums(2_000_000, false, 4_500_000);
    expect(p.healthStandardBonus).toBe(1_230_000);
    expect(p.healthCapped).toBe(true);
    expect(p.health).toBe(Math.round(1_230_000 * HEALTH_RATE));
    // 1,230,000 × 0.115% = 1,414.5 → ちょうど50銭は切り捨て（四捨五入ではない）
    expect(p.shienkin).toBe(1_414);
    // 厚生年金は年度累計ではなく1か月ごとの上限なので、既に受け取った分は関係ない
    expect(p.pensionStandardBonus).toBe(1_500_000);
  });

  it('既に573万円に達していれば健康保険・支援金は0', () => {
    const p = bonusPremiums(1_000_000, true, 6_000_000);
    expect(p.health).toBe(0);
    expect(p.kaigo).toBe(0);
    expect(p.shienkin).toBe(0);
    expect(p.pension).toBeGreaterThan(0);
  });
});

describe('前月の社会保険料（標準報酬月額から求める）', () => {
  it('前月30万円：等級の標準報酬月額30万円 × 率、雇用保険は額面 × 率', () => {
    const p = prevMonthOf(300_000);
    expect(p.standardMonthly).toBe(300_000);
    // 14,850 + 345 + 27,450 + 1,500
    expect(p.social).toBe(44_145);
    expect(p.afterSocial).toBe(255_855);
  });

  it('算出率の表の行の境目：額面 × 率ではなく標準報酬月額 × 率の行を採る', () => {
    // 前月362,000円は22等級ではなく25等級（標準報酬月額360,000円）
    const prevSalary = 362_000;
    const naive =
      prevSalary -
      Math.round(prevSalary * (HEALTH_RATE + SHIENKIN_RATE + PENSION_RATE + EMPLOYMENT_RATE));
    const p = prevMonthOf(prevSalary);
    expect(p.standardMonthly).toBe(360_000);
    // 額面 × 率だと 308,732円 で 6.126% の行、標準報酬月額 × 率だと 309,016円 で 8.168% の行
    expect(lookupRate(naive, 0, false).rateMilli).toBe(6126);
    expect(p.afterSocial).toBe(309_016);
    const r = calcShoyo({ bonus: 500_000, prevSalary, dependents: 0 });
    expect(r.rate?.rateMilli).toBe(8168);
  });
});

describe('源泉所得税と手取り', () => {
  it('源泉所得税は1円未満切り捨て', () => {
    expect(withholdingTax(426_425, 4084)).toBe(17_415); // 426,425 × 4.084% = 17,415.197
    expect(withholdingTax(100_000, 0)).toBe(0);
  });

  it('賞与50万円・前月30万円・扶養0人', () => {
    const r = calcShoyo({ bonus: 500_000, prevSalary: 300_000, dependents: 0 });
    expect(r.special).toBeNull();
    expect(r.rate?.rateMilli).toBe(4084);
    expect(r.incomeTax).toBe(17_415);
    expect(r.residentTax).toBe(0);
    expect(r.net).toBe(500_000 - 73_575 - 17_415);
  });

  it('扶養2人だと同じ前月給与でも率が下がる', () => {
    const r = calcShoyo({ bonus: 500_000, prevSalary: 300_000, dependents: 2 });
    expect(r.rate?.rateMilli).toBe(2042);
    expect(r.net!).toBeGreaterThan(calcShoyo({ bonus: 500_000, prevSalary: 300_000, dependents: 0 }).net!);
  });

  it('乙欄：前月30万円（控除後255,855円）は20.420%', () => {
    const r = calcShoyo({ bonus: 500_000, prevSalary: 300_000, dependents: 2, otsu: true });
    expect(r.rate?.rateMilli).toBe(20420);
    expect(r.incomeTax).toBe(Math.floor((426_425 * 20420) / 100_000));
  });

  it('手取り = 賞与 − 社会保険料 − 源泉所得税（住民税は引かない）', () => {
    const r = calcShoyo({ bonus: 1_234_567, prevSalary: 410_000, dependents: 1, kaigo: true });
    expect(r.net).toBe(r.bonus - r.premiums.total - r.incomeTax!);
  });
});

describe('月額表で計算する特例（判定だけして金額は出さない）', () => {
  it('前月給与0は特例', () => {
    const r = calcShoyo({ bonus: 500_000, prevSalary: 0, dependents: 0 });
    expect(r.special).toBe('no-prev-salary');
    expect(r.prev).toBeNull();
    expect(r.incomeTax).toBeNull();
    expect(r.net).toBeNull();
    // 社会保険料は出す
    expect(r.premiums.total).toBeGreaterThan(0);
  });

  it('「前月に給与が無い」のチェックは額面より優先', () => {
    expect(calcShoyo({ bonus: 500_000, prevSalary: 300_000, noPrevSalary: true, dependents: 0 }).special).toBe(
      'no-prev-salary',
    );
  });

  it('前月の給与が前月の社会保険料以下なら特例', () => {
    // 1万円でも標準報酬月額は下限の58,000円・厚年88,000円で計算されるので控除後はマイナス
    expect(calcShoyo({ bonus: 100_000, prevSalary: 10_000, dependents: 0 }).special).toBe('no-prev-salary');
  });

  it('賞与（社保控除後）が前月給与（同）の10倍を超えると特例、10倍ちょうどは表で計算', () => {
    const prev = prevMonthOf(200_000).afterSocial;
    const over = calcShoyo({ bonus: 3_000_000, prevSalary: 200_000, dependents: 0 });
    expect(over.bonus - over.premiums.total).toBeGreaterThan(prev * 10);
    expect(over.special).toBe('over-10x');
    expect(over.net).toBeNull();

    const under = calcShoyo({ bonus: 1_000_000, prevSalary: 200_000, dependents: 0 });
    expect(under.bonus - under.premiums.total).toBeLessThanOrEqual(prev * 10);
    expect(under.special).toBeNull();
  });
});

describe('年末調整の注記', () => {
  it('2026年12月31日までは「年末調整で精算」、2027年1月1日から「令和9年分の表」', () => {
    expect(yearEndNoteKind('2026-09-27')).toBe('r8-year-end-adjustment');
    // REFORM_EFFECTIVE_ON（12-01）で切らない：12月の賞与にこそ要る注記
    expect(yearEndNoteKind('2026-12-10')).toBe('r8-year-end-adjustment');
    expect(yearEndNoteKind('2026-12-31')).toBe('r8-year-end-adjustment');
    expect(yearEndNoteKind('2027-01-01')).toBe('r9-table');
  });
});

describe('早見表', () => {
  it('賞与20万〜200万円 × 扶養0〜2人（前月給与30万円）', () => {
    expect(TABLE_PREV_SALARY).toBe(300_000);
    const t = shoyoTable();
    expect(t[0].bonus).toBe(200_000);
    expect(t[t.length - 1].bonus).toBe(2_000_000);
    expect(t).toHaveLength(TABLE_BONUSES.length);
    for (const row of t) {
      expect(row.nets).toHaveLength(3);
      for (const n of row.nets) {
        expect(n).not.toBeNull();
        expect(n!).toBeLessThan(row.bonus);
      }
    }
    // 賞与50万円・扶養0人は calcShoyo と同じ値
    expect(t.find((r) => r.bonus === 500_000)!.nets[0]).toBe(409_010);
  });

  it('手取りは賞与が増えるほど増える', () => {
    const t = shoyoTable();
    for (let d = 0; d < 3; d++) {
      for (let i = 1; i < t.length; i++) expect(t[i].nets[d]!).toBeGreaterThan(t[i - 1].nets[d]!);
    }
  });
});

describe('表示', () => {
  it('率は小数第3位まで', () => {
    expect(rateLabel(6126)).toBe('6.126%');
    expect(rateLabel(0)).toBe('0.000%');
  });
});

describe('furusato-nozei の上限を定数参照にしても値は変わらない', () => {
  it('厚生年金1,230万円・健康保険2,241万円で頭打ち', () => {
    const above = estimateSocialInsurance(30_000_000);
    const atCap = estimateSocialInsurance(22_410_000);
    // 両方とも上限に当たったあとは雇用保険の分しか増えない
    const employmentDiff = (30_000_000 - 22_410_000) * EMPLOYMENT_RATE;
    expect(Math.abs(above - atCap - employmentDiff)).toBeLessThanOrEqual(1);
    // 厚生年金の上限（1,230万円）はそれより手前で効いている
    const pensionCap = estimateSocialInsurance(12_300_000);
    const pensionAbove = estimateSocialInsurance(12_400_000);
    const noPensionDiff = 100_000 * (HEALTH_RATE + SHIENKIN_RATE + EMPLOYMENT_RATE);
    expect(Math.abs(pensionAbove - pensionCap - noPensionDiff)).toBeLessThanOrEqual(1);
  });
});
