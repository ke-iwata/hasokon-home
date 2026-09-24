import { describe, expect, it } from 'vitest';
import {
  CREDIT_RATE,
  DATA_CHECKED_AT,
  ECO_GRADES,
  HOUSE_KINDS,
  INCOME_LIMIT,
  INCOME_LIMIT_SMALL,
  MOVE_IN_YEARS,
  MOVE_IN_YEAR_LAST,
  RESIDENT_CAP_FULL_AT,
  RESIDENT_CAP_MAX,
  RED_ZONE_FROM_YEAR,
  SOURCES,
  calculate,
  cellLimit,
  ecoGradeLabel,
  formatEra,
  formatMan,
  formatRate,
  formatYen,
  hayamihyo,
  houseKindLabel,
  isSupportedYear,
  limitRow,
  limitRowR7,
  parseAmountInput,
  transitionalApplies,
  type EcoGrade,
  type HouseKind,
  type KojoInput,
  type MoveInYear,
} from '@/lib/jutaku-loan-kojo';
import { housingLoanResidentCap } from '@/lib/furusato-nozei';

/**
 * 住宅ローン控除 計算機のテスト。
 *
 * 仕様: docs/features/jutaku-loan-kojo.md
 *
 * **借入限度額は一次資料に「控除限度額」の形で載っている。**
 * 国税庁のタックスアンサーは「年末残高等×0.7％（31.5万円）」という書き方なので、
 * このテストは借入限度額そのものではなく、**割り戻す前の控除限度額**を
 * 期待値に置いて突き合わせる（原典の表と目で比べられるようにするため）。
 */

/** 要件はすべて満たしている入力。各テストで必要なところだけ上書きする */
const base: KojoInput = {
  year: 2026,
  kind: 'new',
  grade: 'certified',
  tokurei: false,
  floorArea: 75,
  totalIncome: 6_000_000,
  balance: 100_000_000, // 限度額で必ず頭打ちになる額
};

/** その組み合わせの「年あたりの控除限度額」（＝借入限度額×0.7%） */
function annualCapOf(
  kind: HouseKind,
  grade: EcoGrade,
  year: MoveInYear,
  tokurei = false,
): number {
  const result = calculate({ ...base, kind, grade, year, tokurei });
  return result?.eligible ? result.annualCap : 0;
}

describe('一次資料の控除限度額との突き合わせ', () => {
  /**
   * 国税庁 No.1211-1「住宅の新築等をし、令和4年以降に居住の用に供した場合」の
   * 令和6年から令和12年の行。カッコ内が特例対象個人（注1〜注4）。
   */
  it('新築等（No.1211-1）の控除限度額が原典と一致する', () => {
    expect(annualCapOf('new', 'certified', 2026)).toBe(315_000);
    expect(annualCapOf('new', 'certified', 2026, true)).toBe(350_000);
    expect(annualCapOf('new', 'zeh', 2026)).toBe(245_000);
    expect(annualCapOf('new', 'zeh', 2026, true)).toBe(315_000);
    // 省エネ基準適合住宅は令和8年・令和9年だけ
    expect(annualCapOf('new', 'energy', 2026)).toBe(140_000);
    expect(annualCapOf('new', 'energy', 2027, true)).toBe(210_000);
  });

  it('買取再販住宅（No.1211-2）の控除限度額が原典と一致する', () => {
    expect(annualCapOf('resale', 'certified', 2026)).toBe(315_000);
    expect(annualCapOf('resale', 'certified', 2026, true)).toBe(350_000);
    expect(annualCapOf('resale', 'zeh', 2030)).toBe(245_000);
    expect(annualCapOf('resale', 'zeh', 2030, true)).toBe(315_000);
    // 買取再販の省エネ基準適合住宅は令和12年まで13年で使える（新築と違うところ）
    expect(annualCapOf('resale', 'energy', 2030)).toBe(140_000);
    expect(annualCapOf('resale', 'energy', 2030, true)).toBe(210_000);
    // 「その他の住宅」は10年・14万円で、特例対象個人の上乗せが無い
    expect(annualCapOf('resale', 'other', 2030)).toBe(140_000);
    expect(annualCapOf('resale', 'other', 2030, true)).toBe(140_000);
  });

  it('既存住宅（No.1211-3）の控除限度額が原典と一致する', () => {
    expect(annualCapOf('existing', 'certified', 2026)).toBe(245_000);
    expect(annualCapOf('existing', 'certified', 2026, true)).toBe(315_000);
    expect(annualCapOf('existing', 'zeh', 2030)).toBe(245_000);
    expect(annualCapOf('existing', 'zeh', 2030, true)).toBe(315_000);
    expect(annualCapOf('existing', 'energy', 2030)).toBe(140_000);
    expect(annualCapOf('existing', 'energy', 2030, true)).toBe(210_000);
    expect(annualCapOf('existing', 'other', 2030)).toBe(140_000);
    expect(annualCapOf('existing', 'other', 2030, true)).toBe(140_000);
  });

  it('借入限度額は控除限度額を控除率0.7%で割り戻したものになっている', () => {
    const cases: [HouseKind, EcoGrade, number][] = [
      ['new', 'certified', 45_000_000],
      ['new', 'zeh', 35_000_000],
      ['new', 'energy', 20_000_000],
      ['resale', 'certified', 45_000_000],
      ['existing', 'certified', 35_000_000],
      ['existing', 'other', 20_000_000],
    ];
    for (const [kind, grade, limit] of cases) {
      const result = calculate({ ...base, kind, grade, year: 2026 });
      expect(result?.limit).toBe(limit);
      expect(result?.annualCap).toBe(Math.floor((limit * CREDIT_RATE) / 100) * 100);
    }
  });
});

describe('控除期間', () => {
  it('新築・買取再販の認定住宅等は13年', () => {
    for (const kind of ['new', 'resale'] as HouseKind[]) {
      for (const grade of ['certified', 'zeh'] as EcoGrade[]) {
        expect(calculate({ ...base, kind, grade, year: 2030 })?.years).toBe(13);
      }
    }
  });

  /** 令和8年度改正の目玉。既存住宅の認定住宅等が10年から13年になった */
  it('既存住宅の認定住宅等は令和8年入居から13年（改正前は10年）', () => {
    expect(calculate({ ...base, kind: 'existing', grade: 'certified' })?.years).toBe(13);
    expect(calculate({ ...base, kind: 'existing', grade: 'zeh' })?.years).toBe(13);
    expect(calculate({ ...base, kind: 'existing', grade: 'energy' })?.years).toBe(13);
    // 改正前（令和7年入居）は10年
    expect(limitRowR7('existing', 'certified').years).toBe(10);
  });

  it('既存・買取再販の「その他の住宅」は10年', () => {
    expect(calculate({ ...base, kind: 'existing', grade: 'other' })?.years).toBe(10);
    expect(calculate({ ...base, kind: 'resale', grade: 'other' })?.years).toBe(10);
  });

  it('控除期間を通じた上限は、年あたりの上限 × 控除期間', () => {
    const result = calculate({ ...base, kind: 'new', grade: 'certified', tokurei: true });
    expect(result?.annualCap).toBe(350_000);
    expect(result?.years).toBe(13);
    expect(result?.maxTotal).toBe(350_000 * 13);
  });
});

describe('対象外になる組み合わせ', () => {
  it('新築の「その他の住宅」は令和8年以降の入居では対象外', () => {
    for (const year of MOVE_IN_YEARS) {
      const result = calculate({ ...base, kind: 'new', grade: 'other', year });
      expect(result?.eligible).toBe(false);
      expect(result?.reasons).toContain('no-period');
    }
  });

  /** 国土交通省「建築確認が令和10年以降の省エネ基準適合住宅は適用対象外」 */
  it('新築の省エネ基準適合住宅は令和10年入居から対象外', () => {
    expect(calculate({ ...base, kind: 'new', grade: 'energy', year: 2027 })?.eligible).toBe(true);
    for (const year of [2028, 2029, 2030] as MoveInYear[]) {
      const result = calculate({ ...base, kind: 'new', grade: 'energy', year });
      expect(result?.eligible).toBe(false);
      expect(result?.reasons).toContain('no-period');
    }
  });

  it('買取再販・既存の省エネ基準適合住宅は令和12年入居まで対象', () => {
    expect(calculate({ ...base, kind: 'resale', grade: 'energy', year: 2030 })?.eligible).toBe(
      true,
    );
    expect(calculate({ ...base, kind: 'existing', grade: 'energy', year: 2030 })?.eligible).toBe(
      true,
    );
  });
});

describe('建築確認の時期による経過措置', () => {
  it('新築の省エネ基準適合住宅は令和10年以降でも2,000万円・10年で救われる', () => {
    const result = calculate({
      ...base,
      kind: 'new',
      grade: 'energy',
      year: 2030,
      transitional: true,
    });
    expect(result?.eligible).toBe(true);
    expect(result?.limit).toBe(20_000_000);
    expect(result?.years).toBe(10);
    expect(result?.transitionalApplied).toBe(true);
    expect(result?.annualCap).toBe(140_000);
  });

  it('新築の「その他の住宅」も2,000万円・10年で救われる', () => {
    const result = calculate({
      ...base,
      kind: 'new',
      grade: 'other',
      year: 2026,
      transitional: true,
    });
    expect(result?.eligible).toBe(true);
    expect(result?.limit).toBe(20_000_000);
    expect(result?.years).toBe(10);
    expect(result?.transitionalApplied).toBe(true);
  });

  /** 経過措置は「対象外」を救うためのもの。本則のほうが有利なら本則を使う */
  it('本則のほうが有利な令和8年の省エネ基準適合住宅では経過措置を使わない', () => {
    const result = calculate({
      ...base,
      kind: 'new',
      grade: 'energy',
      year: 2026,
      tokurei: true,
      transitional: true,
    });
    expect(result?.transitionalApplied).toBe(false);
    expect(result?.years).toBe(13);
    expect(result?.limit).toBe(30_000_000);
  });

  it('経過措置に上乗せは無い', () => {
    const result = calculate({
      ...base,
      kind: 'new',
      grade: 'energy',
      year: 2030,
      tokurei: true,
      transitional: true,
    });
    expect(result?.limit).toBe(20_000_000);
    expect(result?.tokureiApplied).toBe(false);
  });

  it('経過措置があるのは新築の省エネ基準適合住宅・その他の住宅だけ', () => {
    expect(transitionalApplies('new', 'energy')).toBe(true);
    expect(transitionalApplies('new', 'other')).toBe(true);
    expect(transitionalApplies('new', 'certified')).toBe(false);
    expect(transitionalApplies('resale', 'energy')).toBe(false);
    expect(transitionalApplies('existing', 'other')).toBe(false);
    // 経過措置のチェックを立てても、対象外の区分では無視される
    const { transitionalApplied } = limitRow('existing', 'other', 2026, true);
    expect(transitionalApplied).toBe(false);
  });
});

describe('特例対象個人（子育て世帯・若者夫婦世帯）の上乗せ', () => {
  it('上乗せが効くと借入限度額が上がる', () => {
    const plain = calculate({ ...base, kind: 'new', grade: 'zeh' });
    const uplift = calculate({ ...base, kind: 'new', grade: 'zeh', tokurei: true });
    expect(plain?.limit).toBe(35_000_000);
    expect(uplift?.limit).toBe(45_000_000);
    expect(uplift?.tokureiApplied).toBe(true);
    expect(uplift?.limitBase).toBe(35_000_000);
  });

  /**
   * 国税庁の注記「令和8年1月1日以降に特例認定住宅等に居住した場合、
   * 特例対象個人への借入限度額上乗せ措置を適用できません」。
   * 特例認定住宅等＝床面積40㎡以上50㎡未満の認定住宅等。
   */
  it('床面積40㎡以上50㎡未満の認定住宅等には上乗せが効かない', () => {
    const result = calculate({
      ...base,
      kind: 'new',
      grade: 'zeh',
      tokurei: true,
      floorArea: 45,
      totalIncome: 9_000_000,
    });
    expect(result?.eligible).toBe(true);
    expect(result?.tokureiApplied).toBe(false);
    expect(result?.tokureiBlockedBySmallArea).toBe(true);
    expect(result?.limit).toBe(35_000_000);
  });

  it('床面積50㎡ちょうどなら上乗せが効く', () => {
    const result = calculate({
      ...base,
      kind: 'new',
      grade: 'zeh',
      tokurei: true,
      floorArea: 50,
      totalIncome: 9_000_000,
    });
    expect(result?.tokureiApplied).toBe(true);
    expect(result?.tokureiBlockedBySmallArea).toBe(false);
  });

  it('上乗せの無い区分では特例対象個人でも額が変わらない', () => {
    const plain = calculate({ ...base, kind: 'existing', grade: 'other' });
    const uplift = calculate({ ...base, kind: 'existing', grade: 'other', tokurei: true });
    expect(uplift?.limit).toBe(plain?.limit);
    expect(uplift?.tokureiApplied).toBe(false);
  });
});

describe('所得要件・床面積要件', () => {
  it('合計所得金額2,000万円ちょうどは対象、超えると対象外', () => {
    expect(calculate({ ...base, totalIncome: INCOME_LIMIT })?.eligible).toBe(true);
    const over = calculate({ ...base, totalIncome: INCOME_LIMIT + 1 });
    expect(over?.eligible).toBe(false);
    expect(over?.reasons).toContain('income-over');
  });

  it('40㎡以上50㎡未満は合計所得金額1,000万円以下が条件', () => {
    expect(
      calculate({ ...base, floorArea: 45, totalIncome: INCOME_LIMIT_SMALL })?.eligible,
    ).toBe(true);
    const over = calculate({ ...base, floorArea: 45, totalIncome: INCOME_LIMIT_SMALL + 1 });
    expect(over?.eligible).toBe(false);
    expect(over?.reasons).toContain('income-over-small');
    // 50㎡以上なら1,000万円超でも通る
    expect(
      calculate({ ...base, floorArea: 50, totalIncome: INCOME_LIMIT_SMALL + 1 })?.eligible,
    ).toBe(true);
  });

  it('床面積40㎡未満は対象外', () => {
    expect(calculate({ ...base, floorArea: 40 })?.eligible).toBe(true);
    const small = calculate({ ...base, floorArea: 39.9 });
    expect(small?.eligible).toBe(false);
    expect(small?.reasons).toContain('floor-area');
  });

  it('所得超過と床面積不足は理由が両方出る', () => {
    const result = calculate({ ...base, floorArea: 30, totalIncome: 30_000_000 });
    expect(result?.reasons).toContain('floor-area');
    expect(result?.reasons).toContain('income-over');
  });
});

describe('入居年', () => {
  it('計算の対象は令和8年から令和12年まで', () => {
    expect(MOVE_IN_YEARS).toEqual([2026, 2027, 2028, 2029, 2030]);
    expect(MOVE_IN_YEAR_LAST).toBe(2030);
    for (const year of MOVE_IN_YEARS) expect(isSupportedYear(year)).toBe(true);
  });

  it('令和7年以前・令和13年以降は out-of-range', () => {
    for (const year of [2024, 2025, 2031]) {
      const result = calculate({ ...base, year });
      expect(result?.eligible).toBe(false);
      expect(result?.reasons).toEqual(['out-of-range']);
    }
  });
});

describe('災害レッドゾーン', () => {
  it('令和10年以降に入居する新築住宅は対象外', () => {
    const result = calculate({ ...base, year: RED_ZONE_FROM_YEAR, redZone: true });
    expect(result?.eligible).toBe(false);
    expect(result?.reasons).toContain('red-zone');
  });

  it('令和9年までの入居、既存住宅・買取再販は対象のまま', () => {
    expect(calculate({ ...base, year: 2027, redZone: true })?.eligible).toBe(true);
    expect(
      calculate({ ...base, year: 2030, kind: 'existing', grade: 'certified', redZone: true })
        ?.eligible,
    ).toBe(true);
    expect(
      calculate({ ...base, year: 2030, kind: 'resale', grade: 'certified', redZone: true })
        ?.eligible,
    ).toBe(true);
  });
});

describe('控除額の計算', () => {
  it('年末残高が限度額より少なければ残高で計算する', () => {
    const result = calculate({ ...base, balance: 30_000_000 });
    expect(result?.cappedByLimit).toBe(false);
    expect(result?.cappedBalance).toBe(30_000_000);
    expect(result?.annualCredit).toBe(210_000); // 3,000万円 × 0.7%
  });

  it('年末残高が限度額を超えたら限度額で頭打ちになる', () => {
    const result = calculate({ ...base, balance: 60_000_000 });
    expect(result?.cappedByLimit).toBe(true);
    expect(result?.cappedBalance).toBe(45_000_000);
    expect(result?.annualCredit).toBe(315_000);
  });

  it('100円未満を切り捨てる', () => {
    // 12,345,678円 × 0.7% = 86,419.746円 → 86,400円
    const result = calculate({ ...base, balance: 12_345_678 });
    expect(result?.annualCredit).toBe(86_400);
  });

  it('年末残高0円なら控除額も0円（適用そのものは外れない）', () => {
    const result = calculate({ ...base, balance: 0 });
    expect(result?.eligible).toBe(true);
    expect(result?.annualCredit).toBe(0);
  });
});

describe('実際に戻る額（所得税→住民税）', () => {
  it('所得税額が未入力なら戻る額を出さない', () => {
    expect(calculate({ ...base, balance: 30_000_000 })?.refund).toBeNull();
  });

  it('所得税から引ききれれば、そこで完結する', () => {
    const result = calculate({
      ...base,
      balance: 30_000_000,
      incomeTax: 300_000,
      taxableIncomeTax: 3_000_000,
    });
    expect(result?.annualCredit).toBe(210_000);
    expect(result?.refund?.fromIncomeTax).toBe(210_000);
    expect(result?.refund?.fromResidentTax).toBe(0);
    expect(result?.refund?.used).toBe(210_000);
    expect(result?.refund?.wasted).toBe(0);
  });

  /** 「控除額＝戻る額」ではないことを、引ききれない例で押さえる */
  it('所得税で引ききれない分は住民税から引き、上限を超えた分は切り捨てになる', () => {
    const result = calculate({
      ...base,
      balance: 45_000_000,
      incomeTax: 100_000,
      taxableIncomeTax: 3_000_000,
    });
    expect(result?.annualCredit).toBe(315_000);
    expect(result?.refund?.fromIncomeTax).toBe(100_000);
    // 課税総所得金額等300万円 × 5% = 15万円 > 97,500円 なので上限の97,500円
    expect(result?.refund?.fromResidentTax).toBe(97_500);
    expect(result?.refund?.used).toBe(197_500);
    expect(result?.refund?.wasted).toBe(315_000 - 197_500);
  });

  it('住民税側の限度額は課税総所得金額等 × 5%（上限97,500円）', () => {
    const low = calculate({
      ...base,
      balance: 45_000_000,
      incomeTax: 0,
      taxableIncomeTax: 1_000_000,
    });
    expect(low?.residentCap).toBe(50_000);
    expect(low?.refund?.fromResidentTax).toBe(50_000);
    expect(low?.residentCapAssumed).toBe(false);
  });

  it('ふるさと納税側の住民税ロジックと同じ結果になる（二重管理を作らない）', () => {
    for (const taxable of [0, 500_000, 1_949_999, RESIDENT_CAP_FULL_AT, 5_000_000]) {
      const result = calculate({
        ...base,
        balance: 45_000_000,
        incomeTax: 0,
        taxableIncomeTax: taxable,
      });
      expect(result?.residentCap).toBe(housingLoanResidentCap(taxable, 'rate5'));
    }
  });

  it('課税総所得金額等が未入力なら上限いっぱいで見積もり、その旨を返す', () => {
    const result = calculate({ ...base, balance: 45_000_000, incomeTax: 0 });
    expect(result?.residentCapAssumed).toBe(true);
    expect(result?.residentCap).toBe(RESIDENT_CAP_MAX);
    expect(RESIDENT_CAP_MAX).toBe(97_500);
    expect(result?.refund?.fromResidentTax).toBe(97_500);
  });

  it('住民税側の限度額が上限に届くのは課税総所得金額等195万円から', () => {
    expect(housingLoanResidentCap(RESIDENT_CAP_FULL_AT, 'rate5')).toBe(RESIDENT_CAP_MAX);
    expect(housingLoanResidentCap(RESIDENT_CAP_FULL_AT - 20, 'rate5')).toBeLessThan(
      RESIDENT_CAP_MAX,
    );
  });
});

describe('改正前（令和7年入居）との比較', () => {
  it('既存住宅の認定住宅等は限度額が上がり、控除期間も延びた', () => {
    const before = limitRowR7('existing', 'certified');
    const after = calculate({ ...base, kind: 'existing', grade: 'certified' });
    expect(before.limit).toBe(30_000_000);
    expect(before.years).toBe(10);
    expect(after?.limit).toBe(35_000_000);
    expect(after?.years).toBe(13);
  });

  it('既存住宅には改正前に上乗せが無かった', () => {
    const before = limitRowR7('existing', 'zeh');
    expect(before.limitTokurei).toBe(before.limit);
    const after = calculate({ ...base, kind: 'existing', grade: 'zeh', tokurei: true });
    expect(after?.limit).toBe(45_000_000);
  });

  it('新築の省エネ基準適合住宅は限度額が下がった', () => {
    expect(limitRowR7('new', 'energy').limit).toBe(30_000_000);
    expect(limitRowR7('new', 'energy').limitTokurei).toBe(40_000_000);
    expect(calculate({ ...base, kind: 'new', grade: 'energy' })?.limit).toBe(20_000_000);
  });

  it('新築・買取再販の認定住宅等は改正前後で変わらない', () => {
    for (const kind of ['new', 'resale'] as HouseKind[]) {
      expect(limitRowR7(kind, 'certified').limit).toBe(45_000_000);
      expect(limitRowR7(kind, 'certified').limitTokurei).toBe(50_000_000);
      expect(calculate({ ...base, kind, grade: 'certified' })?.limit).toBe(45_000_000);
    }
  });
});

describe('早見表', () => {
  const rows = hayamihyo();

  it('住宅の種類3つ × 省エネ区分4つの12行になる', () => {
    expect(rows).toHaveLength(12);
    expect(new Set(rows.map((r) => r.kind)).size).toBe(3);
    expect(new Set(rows.map((r) => r.grade)).size).toBe(4);
  });

  it('年で中身が変わるのは新築の省エネ基準適合住宅だけ', () => {
    const changed = rows.filter(
      (r) => r.early.limit !== r.late.limit || r.early.years !== r.late.years,
    );
    expect(changed).toHaveLength(1);
    expect(changed[0].kind).toBe('new');
    expect(changed[0].grade).toBe('energy');
  });

  it('世帯の切り替えは cellLimit で行い、表の軸を増やさない', () => {
    const row = rows.find((r) => r.kind === 'new' && r.grade === 'zeh')!;
    expect(cellLimit(row.early, false)).toBe(35_000_000);
    expect(cellLimit(row.early, true)).toBe(45_000_000);
  });

  it('計算結果と早見表が食い違わない', () => {
    for (const row of rows) {
      for (const tokurei of [false, true]) {
        const result = calculate({
          ...base,
          kind: row.kind,
          grade: row.grade,
          year: 2026,
          tokurei,
          // 40〜50㎡の認定住宅等は上乗せが外れるので、ここは50㎡以上で比べる
          floorArea: 75,
        });
        const expected = cellLimit(row.early, tokurei);
        if (expected === 0) expect(result?.eligible).toBe(false);
        else expect(result?.limit).toBe(expected);
      }
    }
  });
});

describe('入力の扱い', () => {
  it('数値として読めない入力は null を返す', () => {
    expect(calculate({ ...base, balance: Number.NaN })).toBeNull();
    expect(calculate({ ...base, floorArea: Number.NaN })).toBeNull();
    expect(calculate({ ...base, totalIncome: Number.NaN })).toBeNull();
  });

  it('負の入力は null を返す', () => {
    expect(calculate({ ...base, balance: -1 })).toBeNull();
    expect(calculate({ ...base, floorArea: -1 })).toBeNull();
    expect(calculate({ ...base, totalIncome: -1 })).toBeNull();
  });

  it('全角数字・カンマ・空白を受ける', () => {
    expect(parseAmountInput('30,000,000')).toBe(30_000_000);
    expect(parseAmountInput('３０００万'.replace('万', ''))).toBe(3000);
    expect(parseAmountInput(' 1 234 ')).toBe(1234);
    expect(parseAmountInput('75.5')).toBe(75.5);
    expect(Number.isNaN(parseAmountInput(''))).toBe(true);
    expect(Number.isNaN(parseAmountInput('あ'))).toBe(true);
  });
});

describe('表示', () => {
  /** `CREDIT_RATE * 100` を素で出すと 0.7000000000000001 になる */
  it('控除率のパーセント表示に浮動小数の誤差が出ない', () => {
    expect(formatRate(CREDIT_RATE)).toBe('0.7%');
    expect(formatRate(0.05)).toBe('5%');
    expect(formatRate(0.075)).toBe('7.5%');
  });

  it('円・万円・和暦・日付の整形', () => {
    expect(formatYen(1_234_567)).toBe('1,234,567円');
    expect(formatMan(45_000_000)).toBe('4,500万円');
    expect(formatEra(2026)).toBe('令和8年（2026年）');
    expect(formatEra(2030)).toBe('令和12年（2030年）');
  });

  it('区分のラベルが選択肢と一致する', () => {
    expect(houseKindLabel('existing')).toBe('既存（中古）');
    expect(ecoGradeLabel('zeh')).toBe('ZEH水準省エネ住宅');
    expect(HOUSE_KINDS.map((k) => k.value)).toEqual(['new', 'resale', 'existing']);
    expect(ECO_GRADES.map((g) => g.value)).toEqual(['certified', 'zeh', 'energy', 'other']);
  });
});

describe('出典', () => {
  it('国税庁・国土交通省・財務省の一次資料だけを出典にしている', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(5);
    for (const source of SOURCES) {
      expect(source.url).toMatch(/^https:\/\/www\.(nta|mlit|mof)\.go\.jp\//);
      expect(source.label.length).toBeGreaterThan(5);
      expect(source.checkedAt).toBe(DATA_CHECKED_AT);
    }
  });

  it('データ最終確認日が YYYY-MM-DD の形式', () => {
    expect(DATA_CHECKED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
