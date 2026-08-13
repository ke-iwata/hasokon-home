import { describe, expect, it } from 'vitest';
import {
  DEPENDENT_LIMIT,
  DEPENDENT_LIMIT_STUDENT,
  HEALTH_RATE,
  KAIGO_RATE,
  PENSION_ACCRUAL_RATE,
  SHIENKIN_RATE,
  STEP,
  WAGE_GATE_INCOME,
  calcBenefits,
  calcHatarakizon,
  calcIncomeTax,
  calcPremiums,
  calcResidentTax,
  calcTakeHome,
  type HatarakizonInput,
} from '@/lib/hatarakizon';
import {
  GRADES,
  PENSION_STANDARD_MAX,
  PENSION_STANDARD_MIN,
  gradeOf,
  roundPremium,
  standardMonthly,
} from '@/lib/shaho-grades';
import * as kosodate from '@/lib/kosodate-shienkin';

/** 日本時間の正午。UTC解釈で前日にずれるのを避ける */
const at = (ymd: string) => new Date(`${ymd}T12:00:00+09:00`);

const BEFORE = at('2026-09-30'); // 賃金要件が残っている最終日
const AFTER = at('2026-10-01'); // 賃金要件が撤廃された日

const base: HatarakizonInput = {
  income: 1_300_000,
  position: 'spouse',
  size51: true,
  hours20: true,
  kaigo: false,
  baselineIncome: null,
  asOf: AFTER,
};

/** 比較結果だけを取り出す（not-applicable なら失敗させる） */
function compare(input: Partial<HatarakizonInput> = {}) {
  const r = calcHatarakizon({ ...base, ...input });
  if (r.kind !== 'compare') throw new Error(`比較できない: ${r.reason}`);
  return r;
}

describe('標準報酬月額の等級表（lib/shaho-grades）', () => {
  it('等級表の境界値で正しい等級を引く', () => {
    // 報酬月額93,000円ちょうどは5等級（下限は「以上」）。1円下は4等級
    expect(gradeOf(92_999)[0]).toBe(4);
    expect(standardMonthly(92_999)).toBe(88_000);
    expect(gradeOf(93_000)[0]).toBe(5);
    expect(standardMonthly(93_000)).toBe(98_000);

    expect(standardMonthly(0)).toBe(58_000); // 1等級
    expect(standardMonthly(62_999)).toBe(58_000);
    expect(standardMonthly(63_000)).toBe(68_000);
    expect(gradeOf(1_355_000)[0]).toBe(50); // 上限なしの最上位等級
    expect(standardMonthly(99_999_999)).toBe(1_390_000);
  });

  it('等級表に隙間・重複がない', () => {
    for (let i = 1; i < GRADES.length; i++) {
      expect(GRADES[i][2]).toBe(GRADES[i - 1][3]);
    }
  });

  it('kosodate-shienkin からの再エクスポートが同じ実体を指す（既存の import を壊さない）', () => {
    expect(kosodate.GRADES).toBe(GRADES);
    expect(kosodate.standardMonthly).toBe(standardMonthly);
    expect(kosodate.standardMonthly(93_000)).toBe(98_000);
  });
});

describe('calcPremiums（社会保険料・本人負担）', () => {
  it('協会けんぽの保険料額表と一致する: 標準報酬月額20万円', () => {
    // 月収20万円 → 17等級（標準報酬月額20万円）
    // 健康保険（令和8年度の全国平均9.9%・折半後 4.95%）+ 支援金（0.23%・折半後 0.115%）
    //   = 200,000 × 5.065% = 10,130円/月
    // 厚生年金（18.3%の折半 = 9.15%）= 18,300円/月
    const p = calcPremiums(200_000 * 12);
    expect(p.grade).toBe(17);
    expect(p.standardMonthly).toBe(200_000);
    expect(p.health).toBe(10_130 * 12);
    expect(p.pension).toBe(18_300 * 12);
    expect(p.employment).toBe(Math.round(2_400_000 * 0.0055));
    expect(p.total).toBe(p.health + p.pension + p.employment);
  });

  it('40〜64歳は介護保険料（令和8年度1.62%・折半後0.81%）が健康保険料に上乗せされる', () => {
    const without = calcPremiums(200_000 * 12, false);
    const withKaigo = calcPremiums(200_000 * 12, true);
    expect(withKaigo.health - without.health).toBe(1_620 * 12);
    expect(withKaigo.pension).toBe(without.pension); // 厚生年金は変わらない
  });

  // 仕様書 docs/features/hatarakizon-r8-hokenryoritsu.md の想定表そのもの。
  // 令和8年度の料率と子ども・子育て支援金を、金額として固定しておく
  it('標準報酬月額30万円の健康保険料（年額）が令和8年度の額になる', () => {
    // 40歳未満: 300,000 × (4.95% + 0.115%) = 15,195円/月 → 年 182,340円
    expect(calcPremiums(300_000 * 12, false).health).toBe(182_340);
    // 40〜64歳: 300,000 × (4.95% + 0.115% + 0.81%) = 17,625円/月 → 年 211,500円
    expect(calcPremiums(300_000 * 12, true).health).toBe(211_500);
  });

  // このテストが今回の不整合そのものを再発させないための一本。
  // kosodate-shienkin.ts の料率を更新したときに hatarakizon が置き去りにされたら落ちる
  it('支援金率が kosodate-shienkin の確定値と一致している（2ツールが同じ数字を使う）', () => {
    const confirmed = kosodate.FISCAL_YEARS.filter((y) => y.status === '確定');
    expect(confirmed.length).toBeGreaterThan(0);
    const latest = confirmed.reduce((a, b) => (b.fiscalYear > a.fiscalYear ? b : a));
    expect(SHIENKIN_RATE).toBe(latest.rate / 2);

    // 健康保険料の月額 = 標準報酬月額 ×（健康保険料率 + 支援金率）で組み立てられている
    const std = 300_000;
    expect(calcPremiums(std * 12).health).toBe(
      roundPremium(std * (HEALTH_RATE + latest.rate / 2)) * 12,
    );
  });

  it('確定していない年度の料率（見込み・政府試算）は使わない', () => {
    // 手取りは「いまいくら引かれるか」なので、令和9年度以降の見込み値は入れない
    const unconfirmed = kosodate.FISCAL_YEARS.filter((y) => y.status !== '確定');
    for (const y of unconfirmed) {
      expect(SHIENKIN_RATE).not.toBe(y.rate / 2);
    }
  });

  it('支援金を含めた保険料は、含めない場合より必ず大きい', () => {
    for (const gross of [600_000, 1_060_000, 1_300_000, 2_000_000, 3_000_000, 10_000_000]) {
      for (const kaigo of [false, true]) {
        const p = calcPremiums(gross, kaigo);
        const withoutShienkin =
          roundPremium(p.standardMonthly * (HEALTH_RATE + (kaigo ? KAIGO_RATE : 0))) * 12;
        expect(p.health).toBeGreaterThan(withoutShienkin);
      }
    }
  });

  it('支援金の分だけ手取りが減るが、社会保険料控除に入るので減り幅は保険料の増分より小さい', () => {
    const gross = 2_000_000;
    const take = calcTakeHome(gross, true);

    // 支援金を含めなかった場合の保険料・税・手取りを組み直して比べる
    const healthWithout = roundPremium(take.premiums.standardMonthly * HEALTH_RATE) * 12;
    const totalWithout = take.premiums.total - take.premiums.health + healthWithout;
    const netWithout =
      gross - totalWithout - calcIncomeTax(gross, totalWithout) - calcResidentTax(gross, totalWithout);

    const premiumDiff = take.premiums.total - totalWithout;
    expect(premiumDiff).toBeGreaterThan(0);
    expect(take.net).toBeLessThan(netWithout); // 手取りは減る
    expect(netWithout - take.net).toBeLessThan(premiumDiff); // ただし税が追随する分だけ小さい
  });

  it('厚生年金の標準報酬月額は88,000〜650,000円で頭打ちになる', () => {
    // 月収5万円 → 健康保険は1等級（58,000円）だが、厚生年金の下限は88,000円
    const low = calcPremiums(50_000 * 12);
    expect(low.standardMonthly).toBe(58_000);
    expect(low.pensionStandardMonthly).toBe(PENSION_STANDARD_MIN);

    // 月収83万円 → 健康保険は40等級（830,000円）だが、厚生年金の上限は650,000円
    const high = calcPremiums(830_000 * 12);
    expect(high.standardMonthly).toBe(830_000);
    expect(high.pensionStandardMonthly).toBe(PENSION_STANDARD_MAX);
  });

  it('負の年収は0として扱う', () => {
    const p = calcPremiums(-1_000_000);
    expect(p.standardMonthly).toBe(58_000);
    expect(p.employment).toBe(0);
  });
});

describe('calcIncomeTax / calcResidentTax（令和8年分）', () => {
  it('住民税は年収119万円まで非課税（給与所得控除74万 + 非課税限度額45万）', () => {
    expect(calcResidentTax(1_190_000, 0)).toBe(0);
    expect(calcResidentTax(1_200_000, 0)).toBeGreaterThan(0);
  });

  it('所得税は年収178万円までかからない（給与所得控除74万 + 基礎控除104万）', () => {
    expect(calcIncomeTax(1_780_000, 0)).toBe(0);
    expect(calcIncomeTax(1_800_000, 0)).toBeGreaterThan(0);
  });

  it('社会保険料が所得控除になり、加入すると税額が下がる', () => {
    const social = calcPremiums(2_000_000).total;
    expect(calcIncomeTax(2_000_000, social)).toBeLessThan(calcIncomeTax(2_000_000, 0));
    expect(calcResidentTax(2_000_000, social)).toBeLessThan(calcResidentTax(2_000_000, 0));
  });

  it('住民税の非課税判定は所得控除前の合計所得金額で行う（社保加入でも非課税にならない）', () => {
    // 年収125万円は合計所得51万円で非課税限度額45万円を超える。
    // 社会保険料を引くと所得割は0になるが、均等割5,000円は残る
    const social = calcPremiums(1_250_000).total;
    expect(calcResidentTax(1_250_000, social)).toBe(5_000);
  });
});

describe('calcHatarakizon（施行日をまたぐ挙動）', () => {
  it('2026-09-30 は年収106万円未満なら加入しない', () => {
    const r = compare({ income: 1_000_000, asOf: BEFORE });
    expect(r.shaho.kind).toBe('wage-gate');
    expect(r.wageRequirementAbolished).toBe(false);
    expect(r.target.enrolled).toBe(false);
    expect(r.target.premiums.total).toBe(0);
    // 扶養内の上限は賃金要件（106万円）
    expect(r.ceiling.limit).toBe(WAGE_GATE_INCOME);
    expect(r.baseline.gross).toBe(WAGE_GATE_INCOME - STEP);
  });

  it('2026-09-30 でも年収106万円以上なら加入する', () => {
    const r = compare({ income: WAGE_GATE_INCOME, asOf: BEFORE });
    expect(r.target.enrolled).toBe(true);
    expect(r.target.premiums.total).toBeGreaterThan(0);
  });

  it('2026-10-01 は年収に関係なく加入する（賃金要件の撤廃）', () => {
    const r = compare({ income: 1_000_000, asOf: AFTER });
    expect(r.shaho.kind).toBe('enrolled');
    expect(r.wageRequirementAbolished).toBe(true);
    expect(r.target.enrolled).toBe(true);
    expect(r.target.premiums.total).toBeGreaterThan(0);
    // 扶養内に留まるには週20時間未満に抑えるしかなく、上限は扶養認定基準になる
    expect(r.ceiling.limit).toBe(DEPENDENT_LIMIT);
    expect(r.baseline.gross).toBe(DEPENDENT_LIMIT - STEP);
  });

  it('同じ年収でも施行日の前後で手取りが変わる', () => {
    const income = 1_000_000;
    const before = compare({ income, asOf: BEFORE });
    const after = compare({ income, asOf: AFTER });
    expect(after.target.net).toBeLessThan(before.target.net);
    expect(before.ceiling.limit).not.toBe(after.ceiling.limit);
  });

  it('19〜22歳の学生は扶養認定基準150万円が上限になる', () => {
    const r = compare({ position: 'student', asOf: AFTER });
    expect(r.ceiling.limit).toBe(DEPENDENT_LIMIT_STUDENT);
    expect(r.baseline.gross).toBe(DEPENDENT_LIMIT_STUDENT - STEP);
  });
});

describe('calcHatarakizon（逆転区間と損益分岐点）', () => {
  const cases: { name: string; input: Partial<HatarakizonInput> }[] = [
    { name: '賃金要件あり（2026-09-30）', input: { asOf: BEFORE } },
    { name: '賃金要件の撤廃後（2026-10-01）', input: { asOf: AFTER } },
    { name: '学生・撤廃後', input: { asOf: AFTER, position: 'student' } },
    { name: '40〜64歳・撤廃後', input: { asOf: AFTER, kaigo: true } },
  ];

  for (const c of cases) {
    it(`${c.name}: 加入直後に手取りが下がる（逆転区間が空にならない）`, () => {
      const r = compare(c.input);
      expect(r.lossZone).not.toBeNull();
      const zone = r.lossZone!;
      // 逆転区間は扶養内の上限のすぐ上から始まる
      expect(zone.from).toBe(r.baseline.gross + STEP);
      expect(zone.from).toBeLessThanOrEqual(zone.to);
      // 区間の中は「年収は高いのに手取りが少ない」
      for (const g of [zone.from, zone.to]) {
        const point = r.curve.find((p) => p.gross === g)!;
        expect(point.gross).toBeGreaterThan(r.baseline.gross);
        expect(point.net).toBeLessThan(r.baseline.net);
      }
    });

    it(`${c.name}: 損益分岐点まで働くと扶養内の手取り以上になる`, () => {
      const r = compare(c.input);
      expect(r.breakEven).not.toBeNull();
      const breakEven = r.breakEven!;
      expect(breakEven).toBe(r.lossZone!.to + STEP);
      expect(breakEven).toBeGreaterThan(r.baseline.gross);

      const atBreakEven = r.curve.find((p) => p.gross === breakEven)!;
      expect(atBreakEven.enrolled).toBe(true);
      expect(atBreakEven.net).toBeGreaterThanOrEqual(r.baseline.net);

      // 1つ手前はまだ届いていない（分岐点が最小であることの確認）
      const justBefore = r.curve.find((p) => p.gross === breakEven - STEP)!;
      expect(justBefore.net).toBeLessThan(r.baseline.net);
    });
  }

  it('賃金要件の撤廃で、扶養内に留まれる上限も損益分岐点も上がる', () => {
    const before = compare({ asOf: BEFORE });
    const after = compare({ asOf: AFTER });
    expect(after.baseline.gross).toBeGreaterThan(before.baseline.gross);
    expect(after.breakEven!).toBeGreaterThan(before.breakEven!);
  });

  it('入力した年収が逆転区間の中なら netDiff がマイナスになる', () => {
    const r = compare({ income: 1_300_000, asOf: AFTER });
    expect(r.lossZone!.from).toBeLessThanOrEqual(1_300_000);
    expect(r.lossZone!.to).toBeGreaterThanOrEqual(1_300_000);
    expect(r.netDiff).toBeLessThan(0);
    expect(r.netDiff).toBe(r.target.net - r.baseline.net);
  });

  it('損益分岐点を超える年収なら netDiff がプラスになる', () => {
    const r = compare({ income: 2_000_000, asOf: AFTER });
    expect(r.netDiff).toBeGreaterThan(0);
  });

  it('扶養内の年収を自分で指定できる（上限ぎりぎりまでは働けない人向け）', () => {
    const r = compare({ baselineIncome: 1_000_000, asOf: AFTER });
    expect(r.baseline.gross).toBe(1_000_000);
    // 抑える年収が低いほど、追いつくのも早い
    expect(r.breakEven!).toBeLessThan(compare({ asOf: AFTER }).breakEven!);
  });

  it('指定した扶養内の年収は上限を超えられない（超えると扶養から外れるため）', () => {
    const r = compare({ baselineIncome: 5_000_000, asOf: AFTER });
    expect(r.baseline.gross).toBe(DEPENDENT_LIMIT - STEP);
  });

  it('手取り曲線は全体として右肩上がりになる', () => {
    const r = compare({ asOf: AFTER });
    const first = r.curve[0];
    const last = r.curve[r.curve.length - 1];
    expect(last.net).toBeGreaterThan(first.net);
    // 100万円ずつ離れた2点で比べれば、必ず高いほうが手取りも多い
    for (let i = 100; i < r.curve.length; i += 100) {
      expect(r.curve[i].net).toBeGreaterThan(r.curve[i - 100].net);
    }
  });

  it('標準報酬月額の等級の境目では、年収が1万円増えても手取りが下がる', () => {
    // 年収111万円（月92,500円）→ 4等級（標準報酬月額88,000円）
    // 年収112万円（月93,333円）→ 5等級（標準報酬月額98,000円）
    // 標準報酬月額が1万円上がるぶん、保険料が年間約1.7万円増える
    const r = compare({ asOf: AFTER });
    const before = r.curve.find((p) => p.gross === 1_110_000)!;
    const after = r.curve.find((p) => p.gross === 1_120_000)!;
    expect(after.net).toBeLessThan(before.net);
    // 実際に起きる階段なので均さない。ただし下げ幅は等級1つ分に収まる
    expect(before.net - after.net).toBeLessThan(40_000);
  });
});

describe('calcHatarakizon（比較できないケース）', () => {
  it('従業員51人未満・週20時間未満なら加入しないので比較しない', () => {
    expect(calcHatarakizon({ ...base, size51: false }).kind).toBe('not-applicable');
    expect(calcHatarakizon({ ...base, hours20: false }).kind).toBe('not-applicable');
  });

  it('扶養に入っていない人は対象外', () => {
    const r = calcHatarakizon({ ...base, position: 'none' });
    expect(r.kind).toBe('not-applicable');
    if (r.kind === 'not-applicable') expect(r.reason).toContain('扶養に入っていない');
  });
});

describe('calcBenefits（加入して増えるもの）', () => {
  it('老齢厚生年金は「標準報酬月額 × 5.481/1000 × 月数」で増える', () => {
    const b = calcBenefits(1_300_000);
    expect(b.standardMonthly).toBe(110_000); // 月収108,333円 → 7等級
    expect(b.pensionPerYearEnrolled).toBe(Math.round(110_000 * PENSION_ACCRUAL_RATE * 12));
    expect(b.pensionAfter10Years).toBe(Math.round(110_000 * PENSION_ACCRUAL_RATE * 120));
  });

  it('保険料を年金の増分で取り戻すのに約17年かかる（年収によらずほぼ一定）', () => {
    const a = calcBenefits(1_300_000).pensionPaybackYears;
    const b = calcBenefits(3_000_000).pensionPaybackYears;
    expect(a).toBeGreaterThan(16);
    expect(a).toBeLessThan(17);
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });

  it('傷病手当金の日額が出る（標準報酬日額の3分の2）', () => {
    // 標準報酬月額110,000円 → 日額 110,000÷30=3,666.7→3,670円 → ×2/3 = 2,447円
    expect(calcBenefits(1_300_000).sickBenefitDaily).toBe(2_447);
  });
});

describe('calcTakeHome（手取りの内訳）', () => {
  it('手取り = 年収 − 社会保険料 − 所得税 − 住民税', () => {
    const t = calcTakeHome(1_500_000, true);
    expect(t.net).toBe(t.gross - t.premiums.total - t.incomeTax - t.residentTax);
  });

  it('加入していない場合は社会保険料が0になる', () => {
    const t = calcTakeHome(1_500_000, false);
    expect(t.premiums.total).toBe(0);
    expect(t.net).toBeGreaterThan(calcTakeHome(1_500_000, true).net);
  });
});
