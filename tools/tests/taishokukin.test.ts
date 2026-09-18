import { describe, expect, it } from 'vitest';
import {
  DEDUCTION_MIN,
  HAYAMIHYO_AMOUNTS,
  HAYAMIHYO_YEARS,
  NO_DECLARATION_RATE,
  calcTaishokukin,
  deemedServiceYears,
  hayamihyo,
  lookbackYearsFor,
  monthsInPeriod,
  overlapMonths,
  retirementDeduction,
  serviceYearsFromMonths,
  type PriorLumpSum,
  type TaishokukinInput,
} from '@/lib/taishokukin';

/**
 * 退職金の税金・手取り計算機のテスト。
 *
 * 仕様: docs/features/taishokukin-tedori.md
 *
 * 一次情報:
 * - 国税庁 タックスアンサー No.1420「退職金を受け取ったとき（退職所得）」
 * - 所得税法 第30条・第89条・第201条、同施行令 第69条〜第70条
 * - 地方税法 第50条の2〜第50条の6・第328条〜第328条の5
 */

/** 既定の入力（一般・申告書提出済み・iDeCo一時金なし） */
function input(over: Partial<TaishokukinInput> = {}): TaishokukinInput {
  return {
    amount: 20_000_000,
    service: { years: 30, months: 0 },
    kind: 'general',
    paymentYear: 2026,
    declarationSubmitted: true,
    ...over,
  };
}

describe('退職所得控除額', () => {
  it('勤続20年以下は40万円 × 勤続年数', () => {
    expect(retirementDeduction(3)).toBe(1_200_000);
    expect(retirementDeduction(10)).toBe(4_000_000);
    expect(retirementDeduction(19)).toBe(7_600_000);
  });

  it('最低保障額は80万円（勤続1年・2年でも80万円）', () => {
    expect(retirementDeduction(0)).toBe(DEDUCTION_MIN);
    expect(retirementDeduction(1)).toBe(800_000);
    expect(retirementDeduction(2)).toBe(800_000);
    // 3年目からは40万円 × 年数が80万円を上回る
    expect(retirementDeduction(3)).toBe(1_200_000);
  });

  it('20年ちょうどは800万円、21年は870万円（境界で式が切り替わる）', () => {
    expect(retirementDeduction(20)).toBe(8_000_000);
    expect(retirementDeduction(21)).toBe(8_700_000);
    expect(retirementDeduction(30)).toBe(15_000_000);
    expect(retirementDeduction(38)).toBe(20_600_000);
  });

  it('重複期間ぶんの差引額には最低保障額を効かせない', () => {
    // 重複1年に80万円を引くと控除を削りすぎる（40万円が正しい）
    expect(retirementDeduction(1, false)).toBe(400_000);
    expect(retirementDeduction(0, false)).toBe(0);
  });

  it('障害者になったことが直接の原因の退職は100万円加算される', () => {
    const r = calcTaishokukin(input({ service: { years: 10, months: 0 }, kind: 'disability' }));
    expect(r.deduction.base).toBe(4_000_000);
    expect(r.deduction.disabilityAdd).toBe(1_000_000);
    expect(r.deduction.total).toBe(5_000_000);
  });
});

describe('勤続年数の端数（1年未満は切り上げ）', () => {
  it('10年1か月は11年になる', () => {
    expect(serviceYearsFromMonths(121)).toBe(11);
  });

  it('ちょうど10年（120か月）は10年のまま', () => {
    expect(serviceYearsFromMonths(120)).toBe(10);
  });

  it('1日でも超えれば切り上がる（国税庁の例：10年6か月 → 11年）', () => {
    expect(serviceYearsFromMonths(126)).toBe(11);
  });

  it('入社年月〜退職年月からも同じ結果になる', () => {
    // 2015年4月〜2025年4月 ＝ 121か月 → 11年
    const r = calcTaishokukin(
      input({ service: { from: { year: 2015, month: 4 }, to: { year: 2025, month: 4 } } }),
    );
    expect(r.serviceMonths).toBe(121);
    expect(r.serviceYears).toBe(11);
  });

  it('期間は両端を含む（2015年4月〜2026年3月はちょうど11年）', () => {
    expect(monthsInPeriod({ year: 2015, month: 4 }, { year: 2026, month: 3 })).toBe(132);
    expect(serviceYearsFromMonths(132)).toBe(11);
  });

  it('終わりが始まりより前なら0か月', () => {
    expect(monthsInPeriod({ year: 2020, month: 4 }, { year: 2019, month: 3 })).toBe(0);
  });
});

describe('課税退職所得金額', () => {
  it('控除を引いた残りの2分の1（1,000円未満切捨て）', () => {
    const r = calcTaishokukin(input({ amount: 20_000_000, service: { years: 30, months: 0 } }));
    expect(r.deduction.total).toBe(15_000_000);
    expect(r.afterDeduction).toBe(5_000_000);
    expect(r.halfRule).toBe('full');
    expect(r.taxableIncome).toBe(2_500_000);
  });

  it('1,000円未満は切り捨てる', () => {
    // 控除400万円 → 残り2,469,000円 → 半分は1,234,500円 → 1,234,000円
    const r = calcTaishokukin(input({ amount: 6_469_000, service: { years: 10, months: 0 } }));
    expect(r.afterDeduction).toBe(2_469_000);
    expect(r.taxableIncome).toBe(1_234_000);
  });

  it('退職金が控除額以下なら課税退職所得は0で、税金もかからない', () => {
    const r = calcTaishokukin(input({ amount: 13_000_000, service: { years: 30, months: 0 } }));
    expect(r.afterDeduction).toBe(0);
    expect(r.taxableIncome).toBe(0);
    expect(r.incomeTax).toBe(0);
    expect(r.residentTax).toBe(0);
    expect(r.net).toBe(13_000_000);
  });
});

describe('短期退職手当等（一般で勤続5年以下）', () => {
  const service = { years: 5, months: 0 };

  it('控除後300万円までは通常どおり2分の1', () => {
    // 控除200万円 → 残り300万円ちょうど → 150万円
    const r = calcTaishokukin(input({ amount: 5_000_000, service }));
    expect(r.deduction.total).toBe(2_000_000);
    expect(r.afterDeduction).toBe(3_000_000);
    expect(r.halfRule).toBe('partial');
    expect(r.taxableIncome).toBe(1_500_000);
  });

  it('300万円を超える部分は2分の1にならない（段差ができる）', () => {
    // 控除200万円 → 残り400万円 → 150万円 + 100万円 = 250万円
    const r = calcTaishokukin(input({ amount: 6_000_000, service }));
    expect(r.afterDeduction).toBe(4_000_000);
    expect(r.taxableIncome).toBe(2_500_000);
    // 単純に2分の1なら200万円で済むはずのところが250万円になる
    expect(r.taxableIncome).toBeGreaterThan(4_000_000 / 2);
  });

  it('勤続6年になると2分の1が全額に戻る', () => {
    const r = calcTaishokukin(input({ amount: 6_000_000, service: { years: 6, months: 0 } }));
    expect(r.halfRule).toBe('full');
    expect(r.deduction.total).toBe(2_400_000);
    expect(r.taxableIncome).toBe(1_800_000);
  });
});

describe('特定役員退職手当等（役員等で勤続5年以下）', () => {
  it('2分の1が使えない', () => {
    const r = calcTaishokukin(
      input({ amount: 6_000_000, service: { years: 5, months: 0 }, kind: 'officer' }),
    );
    expect(r.halfRule).toBe('none');
    expect(r.afterDeduction).toBe(4_000_000);
    expect(r.taxableIncome).toBe(4_000_000);
  });

  it('300万円以下でも2分の1にならない（短期退職手当等との違い）', () => {
    const general = calcTaishokukin(input({ amount: 5_000_000, service: { years: 5, months: 0 } }));
    const officer = calcTaishokukin(
      input({ amount: 5_000_000, service: { years: 5, months: 0 }, kind: 'officer' }),
    );
    expect(general.taxableIncome).toBe(1_500_000);
    expect(officer.taxableIncome).toBe(3_000_000);
  });

  it('勤続6年を超える役員等は通常どおり2分の1', () => {
    const r = calcTaishokukin(
      input({ amount: 6_000_000, service: { years: 6, months: 0 }, kind: 'officer' }),
    );
    expect(r.halfRule).toBe('full');
    expect(r.taxableIncome).toBe(1_800_000);
  });
});

describe('所得税（速算表・復興特別所得税）', () => {
  it('国税庁の計算例：勤続30年・退職金2,000万円', () => {
    const r = calcTaishokukin(input({ amount: 20_000_000, service: { years: 30, months: 0 } }));
    expect(r.deduction.total).toBe(15_000_000);
    expect(r.taxableIncome).toBe(2_500_000);
    expect(r.taxRate).toBe(0.1);
    // 250万 × 10% − 97,500 = 152,500
    expect(r.incomeTaxBase).toBe(152_500);
    // × 1.021 = 155,702.5 → 1円未満切捨て
    expect(r.incomeTax).toBe(155_702);
    expect(r.reconstructionTax).toBe(3_202);
    expect(r.residentTax).toBe(250_000);
    expect(r.totalTax).toBe(405_702);
    expect(r.net).toBe(19_594_298);
  });

  it('勤続30年・退職金3,000万円（23%の帯）', () => {
    const r = calcTaishokukin(input({ amount: 30_000_000, service: { years: 30, months: 0 } }));
    expect(r.taxableIncome).toBe(7_500_000);
    expect(r.taxRate).toBe(0.23);
    // 750万 × 23% − 636,000 = 1,089,000
    expect(r.incomeTaxBase).toBe(1_089_000);
    // × 1.021 = 1,111,869
    expect(r.incomeTax).toBe(1_111_869);
    expect(r.residentTax).toBe(750_000);
  });

  it('速算表の境界：課税退職所得1,949,000円は5%、1,950,000円は10%', () => {
    // 控除400万円（勤続10年）＋ 課税所得の2倍 が退職金の額
    const lower = calcTaishokukin(
      input({ amount: 4_000_000 + 1_949_000 * 2, service: { years: 10, months: 0 } }),
    );
    expect(lower.taxableIncome).toBe(1_949_000);
    expect(lower.taxRate).toBe(0.05);
    expect(lower.incomeTaxBase).toBe(97_450);
    expect(lower.incomeTax).toBe(99_496); // 97,450 × 1.021 = 99,496.45

    const upper = calcTaishokukin(
      input({ amount: 4_000_000 + 1_950_000 * 2, service: { years: 10, months: 0 } }),
    );
    expect(upper.taxableIncome).toBe(1_950_000);
    expect(upper.taxRate).toBe(0.1);
    expect(upper.incomeTaxBase).toBe(97_500);
    expect(upper.incomeTax).toBe(99_547); // 97,500 × 1.021 = 99,547.5
  });

  it('復興特別所得税は所得税の2.1%（1円未満切捨て）', () => {
    const r = calcTaishokukin(input({ amount: 20_000_000, service: { years: 30, months: 0 } }));
    expect(r.incomeTax - r.incomeTaxBase).toBe(r.reconstructionTax);
    expect(r.incomeTax).toBe(Math.floor((r.incomeTaxBase * 1021) / 1000));
  });
});

describe('住民税（現年分離課税）', () => {
  it('市町村民税6% + 道府県民税4% で合計10%', () => {
    const r = calcTaishokukin(input({ amount: 20_000_000, service: { years: 30, months: 0 } }));
    expect(r.cityTax).toBe(150_000);
    expect(r.prefTax).toBe(100_000);
    expect(r.residentTax).toBe(250_000);
  });

  it('100円未満はそれぞれ切り捨てる（合算してから丸めない）', () => {
    // 課税退職所得 1,234,000円 → 市 74,040 → 74,000 / 県 49,360 → 49,300
    const r = calcTaishokukin(input({ amount: 6_468_000, service: { years: 10, months: 0 } }));
    expect(r.taxableIncome).toBe(1_234_000);
    expect(r.cityTax).toBe(74_000);
    expect(r.prefTax).toBe(49_300);
    expect(r.residentTax).toBe(123_300);
    // 合算してから丸めると123,400円になり、100円ずれる
    expect(r.residentTax).not.toBe(123_400);
  });
});

describe('10年ルール（iDeCo一時金を先に受け取った場合）', () => {
  /**
   * 掛金2002年4月〜2026年3月（24年）・一時金200万円。
   * 既定は「2026年に一時金 → 2031年に退職金」で、**新ルールで答えが変わる最初のケース**。
   */
  const prior = (over: Partial<PriorLumpSum> = {}): PriorLumpSum => ({
    year: 2026,
    amount: 2_000_000,
    from: { year: 2002, month: 4 },
    to: { year: 2026, month: 3 },
    ...over,
  });

  /** 勤続2002年4月〜2031年3月（29年） */
  const service = { from: { year: 2002, month: 4 }, to: { year: 2031, month: 3 } };

  /**
   * **9年内で判定するのは一時金と退職金の両方が2026年以後のときだけ。**
   * 施行令70条1項2号ロは対象の一時金を
   * 「令和八年一月一日以後に支払を受けたものに限り」と限定している。
   */
  it('一時金・退職金の両方が2026年以後なら9年内、どちらかが2025年以前なら4年内', () => {
    expect(lookbackYearsFor(2031, 2026)).toBe(9);
    expect(lookbackYearsFor(2036, 2027)).toBe(9);
    // 一時金が2025年以前なら、退職金が2026年以後でも4年内のまま
    expect(lookbackYearsFor(2030, 2025)).toBe(4);
    expect(lookbackYearsFor(2026, 2020)).toBe(4);
    expect(lookbackYearsFor(2025, 2021)).toBe(4);
  });

  it('一時金の支払が9年前なら対象になる', () => {
    const r = calcTaishokukin(
      input({
        service: { from: { year: 2002, month: 4 }, to: { year: 2035, month: 3 } },
        paymentYear: 2035,
        prior: prior({ year: 2026 }),
      }),
    );
    expect(r.deduction.overlap?.gapYears).toBe(9);
    expect(r.deduction.overlap?.lookbackYears).toBe(9);
    expect(r.deduction.overlap?.applies).toBe(true);
    expect(r.deduction.overlapDeduct).toBeGreaterThan(0);
  });

  it('一時金の支払が10年前なら対象外（控除は満額）', () => {
    const r = calcTaishokukin(
      input({
        service: { from: { year: 2002, month: 4 }, to: { year: 2036, month: 3 } },
        paymentYear: 2036,
        prior: prior({ year: 2026 }),
      }),
    );
    expect(r.deduction.overlap?.gapYears).toBe(10);
    expect(r.deduction.overlap?.applies).toBe(false);
    expect(r.deduction.overlapDeduct).toBe(0);
    expect(r.deduction.total).toBe(retirementDeduction(34));
  });

  /**
   * **回帰テスト：退職金の支払年だけで9年に切り替えてはいけない。**
   * 2025年以前にiDeCoを受け取って2026〜2030年に退職する人を
   * 対象にしてしまうと、控除を引きすぎて税額を多く出す。
   */
  it('2025年以前に受け取った一時金は、2026年以後の退職でも4年内のまま', () => {
    // 5年前：一時金が2025年なら対象外
    const old = calcTaishokukin(
      input({
        service: { from: { year: 2002, month: 4 }, to: { year: 2030, month: 3 } },
        paymentYear: 2030,
        prior: prior({ year: 2025 }),
      }),
    );
    expect(old.deduction.overlap?.gapYears).toBe(5);
    expect(old.deduction.overlap?.lookbackYears).toBe(4);
    expect(old.deduction.overlap?.applies).toBe(false);
    expect(old.deduction.overlapDeduct).toBe(0);

    // 同じ5年前でも、一時金が2026年なら対象になる（これが改正の効果）
    const brandNew = calcTaishokukin(input({ service, paymentYear: 2031, prior: prior({ year: 2026 }) }));
    expect(brandNew.deduction.overlap?.gapYears).toBe(5);
    expect(brandNew.deduction.overlap?.lookbackYears).toBe(9);
    expect(brandNew.deduction.overlap?.applies).toBe(true);
  });

  it('2025年以前の一時金でも、4年内なら従来どおり対象', () => {
    const r = calcTaishokukin(
      input({
        service: { from: { year: 2002, month: 4 }, to: { year: 2028, month: 3 } },
        paymentYear: 2028,
        prior: prior({ year: 2025, to: { year: 2025, month: 3 } }),
      }),
    );
    expect(r.deduction.overlap?.gapYears).toBe(3);
    expect(r.deduction.overlap?.lookbackYears).toBe(4);
    expect(r.deduction.overlap?.applies).toBe(true);
  });

  /**
   * 施行令70条1項2号は「その年の**前年以前**」。同年内は69条1項3号の通算
   * （額も期間も合算する）という別の計算なので、この条文の対象にはならない。
   */
  it('同じ年に受け取った場合は対象外（通算という別の計算になる）', () => {
    const r = calcTaishokukin(
      input({
        service: { from: { year: 2002, month: 4 }, to: { year: 2026, month: 3 } },
        paymentYear: 2026,
        prior: prior({ year: 2026 }),
      }),
    );
    expect(r.deduction.overlap?.sameYear).toBe(true);
    expect(r.deduction.overlap?.applies).toBe(false);
    expect(r.deduction.overlapDeduct).toBe(0);
  });

  it('一時金のほうが後（逆順）なら対象外', () => {
    const r = calcTaishokukin(
      input({
        service: { from: { year: 2002, month: 4 }, to: { year: 2026, month: 3 } },
        paymentYear: 2026,
        prior: prior({ year: 2028 }),
      }),
    );
    expect(r.deduction.overlap?.reverseOrder).toBe(true);
    expect(r.deduction.overlap?.applies).toBe(false);
    expect(r.deduction.overlapDeduct).toBe(0);
  });
});

describe('重複期間の短縮（施行令 第70条2項）', () => {
  /** 勤続2002年4月〜2031年3月（29年） */
  const service = { from: { year: 2002, month: 4 }, to: { year: 2031, month: 3 } };
  /** 掛金2002年4月〜2026年3月（24年）・一時金200万円を2026年に受け取った */
  const base: PriorLumpSum = {
    year: 2026,
    amount: 2_000_000,
    from: { year: 2002, month: 4 },
    to: { year: 2026, month: 3 },
  };

  it('一時金が当時の控除額に満たなければ、みなし勤続期間まで短縮される', () => {
    // 掛金24年 → 当時の控除額1,080万円。一時金200万円はこれに満たない
    // → みなし勤続期間は掛金開始から5年（200万 ÷ 40万）＝ 2002年4月〜2007年3月
    const r = calcTaishokukin(input({ service, paymentYear: 2031, prior: base }));
    const o = r.deduction.overlap;
    expect(o?.contributionYears).toBe(24);
    expect(o?.deductionAtThatTime).toBe(10_800_000);
    expect(o?.actualOverlapYears).toBe(24);
    expect(o?.deemedYears).toBe(5);
    expect(o?.shortened).toBe(true);
    expect(o?.priorPeriod).toEqual({
      from: { year: 2002, month: 4 },
      to: { year: 2007, month: 3 },
    });
    expect(o?.deductibleMonths).toBe(60);
    expect(o?.years).toBe(5);
    expect(o?.amount).toBe(2_000_000);
    // 控除：800万 + 70万 × 9年 = 1,430万 − 200万 = 1,230万
    expect(r.deduction.total).toBe(12_300_000);
  });

  /**
   * **回帰テスト：`min(みなし年数, 実際の重複年数)` にしてはいけない。**
   * 短縮は年数の上限ではなく「掛金期間の初日から◯年」という**期間**なので、
   * 掛金期間が勤続期間より前に始まっていると重なりが消えることがある。
   * 転職前からiDeCoに入っていた人がこれに当たる。
   */
  it('みなし勤続期間が勤続期間と重ならなければ、差し引きは0になる', () => {
    const r = calcTaishokukin(
      input({
        amount: 10_000_000,
        // 入社2015年4月・退職2027年3月（12年）
        service: { from: { year: 2015, month: 4 }, to: { year: 2027, month: 3 } },
        paymentYear: 2027,
        prior: {
          year: 2026,
          amount: 2_400_000,
          // iDeCo 2008年1月〜2025年12月（18年）。入社より7年早く始めている
          from: { year: 2008, month: 1 },
          to: { year: 2025, month: 12 },
        },
      }),
    );
    const o = r.deduction.overlap;
    expect(o?.applies).toBe(true);
    expect(o?.shortened).toBe(true);
    expect(o?.deemedYears).toBe(6);
    // みなし勤続期間は2008年1月〜2013年12月。勤続期間（2015年4月〜）と重ならない
    expect(o?.priorPeriod).toEqual({
      from: { year: 2008, month: 1 },
      to: { year: 2013, month: 12 },
    });
    expect(o?.deductibleMonths).toBe(0);
    expect(o?.years).toBe(0);
    expect(r.deduction.overlapDeduct).toBe(0);
    // 控除は満額の480万円（40万 × 12年）。税金425,912円
    expect(r.deduction.total).toBe(4_800_000);
    expect(r.totalTax).toBe(425_912);
    // 短縮前の重なりは10年あるので、そこを引いてしまうと大きく違う
    expect(o?.actualOverlapYears).toBe(10);
  });

  it('みなし勤続期間が一部だけ重なるときは、その重なりぶんを引く', () => {
    const r = calcTaishokukin(
      input({
        // 入社2013年4月・退職2027年3月（14年）
        service: { from: { year: 2013, month: 4 }, to: { year: 2027, month: 3 } },
        paymentYear: 2027,
        prior: {
          year: 2026,
          amount: 2_000_000,
          // iDeCo 2010年4月〜2025年3月（15年）。みなし5年 → 2010年4月〜2015年3月
          from: { year: 2010, month: 4 },
          to: { year: 2025, month: 3 },
        },
      }),
    );
    const o = r.deduction.overlap;
    expect(o?.deemedYears).toBe(5);
    expect(o?.priorPeriod).toEqual({
      from: { year: 2010, month: 4 },
      to: { year: 2015, month: 3 },
    });
    // 2013年4月〜2015年3月の24か月だけ重なる
    expect(o?.deductibleMonths).toBe(24);
    expect(o?.years).toBe(2);
    expect(o?.amount).toBe(800_000);
    expect(r.deduction.total).toBe(5_600_000 - 800_000); // 40万×14年 − 80万
  });

  it('短縮が効かないときは掛金期間そのものと突き合わせる', () => {
    // 一時金1,080万円は当時の控除額（1,080万円）以上なので短縮されない
    const r = calcTaishokukin(
      input({ service, paymentYear: 2031, prior: { ...base, amount: 10_800_000 } }),
    );
    const o = r.deduction.overlap;
    expect(o?.shortened).toBe(false);
    expect(o?.priorPeriod).toEqual({
      from: { year: 2002, month: 4 },
      to: { year: 2026, month: 3 },
    });
    expect(o?.years).toBe(24);
    expect(o?.amount).toBe(10_800_000); // 800万 + 70万 × 4年
    expect(r.deduction.total).toBe(14_300_000 - 10_800_000);
  });

  it('短縮を入れないと控除を引きすぎる（差は税額に出る）', () => {
    const shortened = calcTaishokukin(input({ service, paymentYear: 2031, prior: base }));
    const notShortened = calcTaishokukin(
      input({ service, paymentYear: 2031, prior: { ...base, amount: 10_800_000 } }),
    );
    expect(notShortened.deduction.overlap?.shortened).toBe(false);
    expect(shortened.deduction.total).toBeGreaterThan(notShortened.deduction.total);
  });

  it('みなし勤続期間は元の掛金期間の終わりを超えない', () => {
    // 掛金3年（2023年4月〜2026年3月）・一時金800万円 → みなし20年だが、掛金は3年しかない
    const r = calcTaishokukin(
      input({
        service,
        paymentYear: 2031,
        prior: {
          year: 2026,
          amount: 8_000_000,
          from: { year: 2023, month: 4 },
          to: { year: 2026, month: 3 },
        },
      }),
    );
    const o = r.deduction.overlap;
    // 当時の控除額は120万円（40万 × 3年）で、一時金800万円はこれ以上 → 短縮なし
    expect(o?.shortened).toBe(false);
    expect(o?.priorPeriod?.to).toEqual({ year: 2026, month: 3 });
    expect(o?.years).toBe(3);
    expect(o?.amount).toBe(1_200_000);
  });

  it('みなし勤続年数：800万円の境界と1年未満切捨て', () => {
    expect(deemedServiceYears(0)).toBe(0);
    expect(deemedServiceYears(400_000)).toBe(1);
    expect(deemedServiceYears(2_000_000)).toBe(5);
    // 1年未満切捨て
    expect(deemedServiceYears(2_399_999)).toBe(5);
    expect(deemedServiceYears(2_400_000)).toBe(6);
    // 800万円ちょうどは20年。超えた分は70万円で1年
    expect(deemedServiceYears(8_000_000)).toBe(20);
    expect(deemedServiceYears(8_000_001)).toBe(20);
    expect(deemedServiceYears(8_699_999)).toBe(20);
    expect(deemedServiceYears(8_700_000)).toBe(21);
    expect(deemedServiceYears(15_000_000)).toBe(30);
  });

  /**
   * 画面の既定値（「はい」を選んだとき）。
   * **開いた瞬間の例が新ルールで効いている**ことを固定する。
   * ここが旧ルールで対象外になる組み合わせ（2025年以前の一時金）だと、
   * この計算機の売りである10年ルールが既定では何も起きない。
   */
  it('画面の既定値は「2026年に一時金 → 2031年に退職」で、新ルールが効く', () => {
    const r = calcTaishokukin(
      input({
        amount: 20_000_000,
        service: { from: { year: 2002, month: 4 }, to: { year: 2031, month: 3 } },
        paymentYear: 2031,
        prior: base,
      }),
    );
    expect(r.serviceYears).toBe(29);
    expect(r.deduction.overlap?.applies).toBe(true);
    expect(r.deduction.overlap?.lookbackYears).toBe(9);
    expect(r.deduction.overlap?.years).toBe(5);
    expect(r.deduction.total).toBe(12_300_000);
    expect(r.taxableIncome).toBe(3_850_000);
    expect(r.incomeTax).toBe(349_692);
    expect(r.residentTax).toBe(385_000);
    expect(r.net).toBe(19_265_308);
  });

  it('みなし勤続年数が0年なら差し引きは0', () => {
    const r = calcTaishokukin(
      input({
        service,
        paymentYear: 2031,
        // 一時金39万円 → みなし0年
        prior: { ...base, amount: 390_000 },
      }),
    );
    expect(r.deduction.overlap?.deemedYears).toBe(0);
    expect(r.deduction.overlap?.priorPeriod).toBeUndefined();
    expect(r.deduction.overlapDeduct).toBe(0);
  });
});

describe('期間の重なり', () => {
  it('月単位で重なりを出す（両端を含む）', () => {
    const months = overlapMonths(
      { from: { year: 2010, month: 4 }, to: { year: 2020, month: 3 } },
      { from: { year: 2015, month: 1 }, to: { year: 2025, month: 12 } },
    );
    expect(months).toBe(63); // 2015年1月〜2020年3月
    expect(Math.floor(months / 12)).toBe(5); // 5年3か月 → 1年未満切捨てで5年
  });

  it('重なりが無ければ0', () => {
    expect(
      overlapMonths(
        { from: { year: 2000, month: 1 }, to: { year: 2005, month: 12 } },
        { from: { year: 2006, month: 1 }, to: { year: 2010, month: 12 } },
      ),
    ).toBe(0);
  });

  it('1か月だけ重なる場合も拾う', () => {
    expect(
      overlapMonths(
        { from: { year: 2000, month: 1 }, to: { year: 2005, month: 12 } },
        { from: { year: 2005, month: 12 }, to: { year: 2010, month: 12 } },
      ),
    ).toBe(1);
  });

  it('片方がもう片方を完全に含む場合は短いほうの長さ', () => {
    expect(
      overlapMonths(
        { from: { year: 2000, month: 1 }, to: { year: 2020, month: 12 } },
        { from: { year: 2005, month: 4 }, to: { year: 2010, month: 3 } },
      ),
    ).toBe(60);
  });

  it('重なりが無ければ控除は満額のまま', () => {
    const r = calcTaishokukin(
      input({
        service: { from: { year: 2012, month: 4 }, to: { year: 2028, month: 3 } },
        paymentYear: 2028,
        prior: {
          year: 2026,
          amount: 2_000_000,
          // 掛金は入社より前に終わっている
          from: { year: 2000, month: 4 },
          to: { year: 2012, month: 3 },
        },
      }),
    );
    expect(r.deduction.overlap?.applies).toBe(true);
    expect(r.deduction.overlap?.overlapMonths).toBe(0);
    expect(r.deduction.overlapDeduct).toBe(0);
    expect(r.deduction.total).toBe(retirementDeduction(16));
  });

  it('勤続期間を年・月で入れた場合は重なりを出せない（indeterminate）', () => {
    const r = calcTaishokukin(
      input({
        service: { years: 29, months: 0 },
        paymentYear: 2031,
        prior: {
          year: 2026,
          amount: 2_000_000,
          from: { year: 2002, month: 4 },
          to: { year: 2026, month: 3 },
        },
      }),
    );
    expect(r.deduction.overlap?.indeterminate).toBe(true);
    expect(r.deduction.overlapDeduct).toBe(0);
  });
});

describe('「退職所得の受給に関する申告書」', () => {
  const args = { amount: 20_000_000, service: { years: 30, months: 0 } };

  it('提出していれば源泉徴収の内訳は出ない', () => {
    expect(calcTaishokukin(input({ ...args, declarationSubmitted: true })).withholding).toBeUndefined();
  });

  it('未提出なら所得税が退職金の20.42%で源泉徴収される', () => {
    const r = calcTaishokukin(input({ ...args, declarationSubmitted: false }));
    expect(NO_DECLARATION_RATE).toBe(0.2042);
    expect(r.withholding?.incomeTaxWithheld).toBe(4_084_000);
    // 確定申告で戻る額 ＝ 源泉徴収された額 − 本来の所得税
    expect(r.withholding?.refund).toBe(4_084_000 - 155_702);
  });

  it('税額そのものは申告書の有無で変わらない', () => {
    const submitted = calcTaishokukin(input({ ...args, declarationSubmitted: true }));
    const not = calcTaishokukin(input({ ...args, declarationSubmitted: false }));
    expect(not.incomeTax).toBe(submitted.incomeTax);
    expect(not.residentTax).toBe(submitted.residentTax);
    expect(not.net).toBe(submitted.net);
  });

  it('住民税は申告書の有無にかかわらず特別徴収される', () => {
    const r = calcTaishokukin(input({ ...args, declarationSubmitted: false }));
    // 振り込まれる額は「退職金 − 20.42%の所得税 − 住民税」
    expect(r.withholding?.netAtPayment).toBe(20_000_000 - 4_084_000 - 250_000);
    expect(r.withholding?.netAtPayment).toBeLessThan(r.net);
  });
});

describe('手取り', () => {
  it('手取り ＝ 退職金 − 所得税 − 住民税', () => {
    const r = calcTaishokukin(input({ amount: 20_000_000, service: { years: 30, months: 0 } }));
    expect(r.net).toBe(20_000_000 - r.incomeTax - r.residentTax);
    expect(r.netRate).toBeCloseTo(r.net / 20_000_000, 10);
  });

  it('退職金が0円でも壊れない', () => {
    const r = calcTaishokukin(input({ amount: 0, service: { years: 0, months: 0 } }));
    expect(r.net).toBe(0);
    expect(r.totalTax).toBe(0);
    expect(r.netRate).toBe(1);
  });

  it('マイナスの入力は0として扱う', () => {
    const r = calcTaishokukin(input({ amount: -1_000_000, service: { years: -3, months: 0 } }));
    expect(r.serviceYears).toBe(0);
    expect(r.net).toBe(0);
  });
});

describe('控除の内訳の式', () => {
  it('20年以下は「40万円 × ◯年」の形で出す', () => {
    const r = calcTaishokukin(input({ service: { years: 12, months: 0 } }));
    expect(r.deduction.formula).toContain('40万円 × 12年');
    expect(r.deduction.formula).toContain('480万円');
  });

  it('20年超は「800万円 ＋ 70万円 ×（◯年 − 20年）」の形で出す', () => {
    const r = calcTaishokukin(input({ service: { years: 30, months: 0 } }));
    expect(r.deduction.formula).toContain('800万円');
    expect(r.deduction.formula).toContain('70万円');
    expect(r.deduction.formula).toContain('1,500万円');
  });

  it('最低保障額が効いたことが分かる', () => {
    const r = calcTaishokukin(input({ service: { years: 1, months: 0 } }));
    expect(r.deduction.formula).toContain('最低保障額');
  });

  it('10年ルールが効いたら重複年数と金額を出す', () => {
    const r = calcTaishokukin(
      input({
        service: { from: { year: 2002, month: 4 }, to: { year: 2031, month: 3 } },
        paymentYear: 2031,
        prior: {
          year: 2026,
          amount: 2_000_000,
          from: { year: 2002, month: 4 },
          to: { year: 2026, month: 3 },
        },
      }),
    );
    expect(r.deduction.formula).toContain('重複 5年分');
    expect(r.deduction.formula).toContain('200万円');
  });
});

describe('早見表', () => {
  const rows = hayamihyo();

  it('退職金7区分 × 勤続4区分', () => {
    expect(rows).toHaveLength(HAYAMIHYO_AMOUNTS.length);
    expect(rows[0].cells).toHaveLength(HAYAMIHYO_YEARS.length);
    expect(rows[0].cells.map((c) => c.years)).toEqual([...HAYAMIHYO_YEARS]);
  });

  it('計算機と同じロジックから作られている', () => {
    for (const row of rows) {
      for (const cell of row.cells) {
        const r = calcTaishokukin({
          amount: row.amount,
          service: { years: cell.years, months: 0 },
          kind: 'general',
          paymentYear: 2026,
          declarationSubmitted: true,
        });
        expect(cell.net).toBe(r.net);
        expect(cell.tax).toBe(r.totalTax);
        expect(cell.deduction).toBe(r.deduction.total);
      }
    }
  });

  it('勤続年数が長いほど手取りは増える（控除が増えるため）', () => {
    for (const row of rows) {
      const nets = row.cells.map((c) => c.net);
      for (let i = 1; i < nets.length; i += 1) {
        expect(nets[i]).toBeGreaterThanOrEqual(nets[i - 1]);
      }
    }
  });

  it('手取りが退職金を超えることはなく、税金は0円以上', () => {
    for (const row of rows) {
      for (const cell of row.cells) {
        expect(cell.net).toBeLessThanOrEqual(row.amount);
        expect(cell.tax).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('勤続38年なら控除2,060万円で、3,000万円でも税負担は軽い', () => {
    const row = rows.find((r) => r.amount === 30_000_000);
    const cell = row?.cells.find((c) => c.years === 38);
    expect(cell?.deduction).toBe(20_600_000);
    // 課税退職所得は(3,000万 − 2,060万) ÷ 2 = 470万
    expect(cell?.tax).toBeGreaterThan(0);
    expect(cell?.net).toBeGreaterThan(29_000_000 - 2_000_000);
  });
});
