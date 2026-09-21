import { describe, expect, it } from 'vitest';
import {
  HOKENRYO_CHOSEI_SHARES,
  HOKENRYO_CHOSEI_STARTS_ON,
  choseiShare,
  ratePercent,
  DEPENDENT_LIMIT,
  DEPENDENT_LIMIT_STUDENT,
  EMPLOYMENT_RATE,
  HEALTH_RATE,
  PENSION_RATE,
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
import { estimateSocialInsurance } from '@/lib/furusato-nozei';
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
  workplace: 'over51',
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
    expect(p.employment).toBe(Math.round(2_400_000 * EMPLOYMENT_RATE));
    expect(p.total).toBe(p.health + p.pension + p.employment);
  });

  /**
   * 料率そのものを一次情報で固定する。上の `Math.round(... * EMPLOYMENT_RATE)` は
   * 定数を変えても一緒に動いてしまうので、改定の見落としには気づけない。
   *
   * 厚生労働省「令和8年4月1日から令和9年3月31日までの雇用保険料率」
   * https://www.mhlw.go.jp/content/001692566.pdf
   * 一般の事業：労働者負担 5/1,000・事業主負担 8.5/1,000・合計 13.5/1,000
   * （令和7年度は労働者 5.5/1,000・事業主 9/1,000・合計 14.5/1,000）
   */
  it('雇用保険料率（労働者負担・一般の事業）は令和8年度の 5/1,000', () => {
    expect(EMPLOYMENT_RATE).toBe(5 / 1_000);
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
  it('加入対象でない勤務先・週20時間未満なら加入しないので比較しない', () => {
    expect(calcHatarakizon({ ...base, workplace: 'not-covered' }).kind).toBe('not-applicable');
    expect(calcHatarakizon({ ...base, hours20: false }).kind).toBe('not-applicable');
  });

  it('50人以下でも加入対象の勤務先（任意特定適用事業所）なら比較できる', () => {
    // 3択化の前は size51: false で打ち切られ、保険料調整制度の対象者に
    // セレクトを置く画面そのものが存在しなかった。docs/features/hokenryo-chosei-seido.md
    const r = calcHatarakizon({ ...base, workplace: 'optional-covered' });
    expect(r.kind).toBe('compare');
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

/**
 * この改定の主題は金額の大きさではなく、**ツールによって社保の概算の年度が食い違わないこと**。
 * 等級ベースの calcPremiums()（手取り・損得の2ツール）と年収ベースの
 * estimateSocialInsurance()（ふるさと納税・年末調整・iDeCo・医療費控除の4ツール）は
 * 精度が違うので総額は一致しないが、**同じ料率の定数を見ている**ことは確かめられる。
 * docs/features/shaho-gaisan-r8-koyo-hoken-ryoritsu.md
 */
describe('6ツールで社会保険料の料率が揃っている', () => {
  it('雇用保険は等級ベースでも年収ベースでも同じ料率で引かれる', () => {
    for (const income of [2_000_000, 5_000_000, 8_000_000, 20_000_000]) {
      // 概算から健保・厚年（どちらも上限あり）を引いた残りが雇用保険分
      const health = Math.min(income, 22_410_000) * (HEALTH_RATE + SHIENKIN_RATE);
      const pension = Math.min(income, 12_300_000) * PENSION_RATE;
      const employmentInEstimate =
        estimateSocialInsurance(income) - Math.round(health + pension);
      expect(employmentInEstimate).toBeCloseTo(
        calcPremiums(income).employment,
        0,
      );
    }
  });

  it('概算が令和8年度の料率で組まれている（年収500万円で735,750円）', () => {
    // 健保4.95% + 支援金0.115% = 253,250 / 厚年9.15% = 457,500 / 雇用0.5% = 25,000
    expect(estimateSocialInsurance(5_000_000)).toBe(735_750);
  });
});

/**
 * 保険料調整制度（2026年10月1日〜）。docs/features/hokenryo-chosei-seido.md
 *
 * 割合の表と金額は日本年金機構のパンフレット（令和8年10月）で確認している（2026-09-19）。
 * https://www.nenkin.go.jp/service/kounen/hokenryo/hokenryochosei/gaiyo.files/pamphlet202610.pdf
 */
describe('保険料調整制度（本人負担の軽減）', () => {
  /** 標準報酬月額（円）を作る年収。等級表の真ん中を狙って月額 × 12 で置く */
  const incomeFor = (std: number) => std * 12;

  describe('割合の引き方', () => {
    it('使っていなければ null（折半のまま）', () => {
      expect(choseiShare(88_000, 'none')).toBeNull();
    });

    it('標準報酬月額ごとに1〜2年目・3年目の割合が引ける', () => {
      expect(choseiShare(88_000, 'y12')).toBe(0.25);
      expect(choseiShare(88_000, 'y3')).toBe(0.375);
      expect(choseiShare(126_000, 'y12')).toBe(0.48);
      expect(choseiShare(126_000, 'y3')).toBe(0.49);
    });

    it('88,000円未満の等級（58,000〜78,000円）も「〜88,000」の行に入る', () => {
      for (const std of [58_000, 68_000, 78_000]) {
        expect(choseiShare(std, 'y12')).toBe(0.25);
        expect(choseiShare(std, 'y3')).toBe(0.375);
      }
    });

    it('標準報酬月額 126,000円を超えると対象外（割合を適用しない）', () => {
      expect(choseiShare(134_000, 'y12')).toBeNull();
      expect(choseiShare(134_000, 'y3')).toBeNull();
    });

    /**
     * 画面に出す文字列。**割合は 0.25 のような小数なので、そのまま % を付けると
     * 100分の1で出る**（レビューで実際に「本人負担 0.25%」が出ていた。#239）。
     * 整形は lib/shaho-ryoritsu.ts の ratePercent() に通す約束なので、
     * 9通りすべてが解説の表と同じ文字列になることを固定しておく。
     */
    it('画面に出す割合が解説の表と同じ文字列になる（0.25 → 25%、0.375 → 37.5%）', () => {
      const expected: [number, string][] = [
        [88_000, '25%'],
        [98_000, '30%'],
        [104_000, '36%'],
        [110_000, '41%'],
        [118_000, '45%'],
        [126_000, '48%'],
      ];
      for (const [std, label] of expected) {
        expect(ratePercent(choseiShare(std, 'y12')!)).toBe(label);
      }
      // 3年目は0.5桁が残る。小数第1位を落とすと原典の値と合わなくなる
      const expectedY3: [number, string][] = [
        [88_000, '37.5%'],
        [98_000, '40%'],
        [104_000, '43%'],
        [110_000, '45.5%'],
        [118_000, '47.5%'],
        [126_000, '49%'],
      ];
      for (const [std, label] of expectedY3) {
        expect(ratePercent(choseiShare(std, 'y3')!)).toBe(label);
      }
    });

    it('3年目は軽減幅がちょうど1〜2年目の半分になる', () => {
      // 折半50%からの下げ幅が半分。例: 25% は 50 − 25 = 25pt 下げ → 3年目は 12.5pt 下げ
      for (const row of HOKENRYO_CHOSEI_SHARES) {
        expect(row.y3).toBeCloseTo(0.5 - (0.5 - row.y12) / 2, 10);
      }
    });
  });

  /**
   * 一次資料の計算例との突き合わせ。パンフレット5頁
   * 「保険料調整制度を利用した場合の厚生年金保険料」の表の被保険者負担額（月額）。
   * 厚生年金保険料は支援金・介護保険料が混ざらないので、そのまま比較できる。
   */
  describe('パンフレットの厚生年金保険料の表と一致する', () => {
    const TABLE: [number, number, number][] = [
      // [標準報酬月額, 1〜2年目の本人負担（月額）, 3年目の本人負担（月額）]
      [88_000, 4_026, 6_039],
      [98_000, 5_380, 7_174],
      [104_000, 6_852, 8_184],
      [110_000, 8_253, 9_159],
      [118_000, 9_717, 10_257],
      [126_000, 11_068, 11_298],
    ];

    for (const [std, y12, y3] of TABLE) {
      it(`標準報酬月額 ${std.toLocaleString()}円: 1〜2年目 ${y12}円 / 3年目 ${y3}円`, () => {
        const income = incomeFor(std);
        expect(calcPremiums(income, false, 'y12').pension / 12).toBe(y12);
        expect(calcPremiums(income, false, 'y3').pension / 12).toBe(y3);
        // 折半額（軽減前）も表と合っていること
        expect(calcPremiums(income).pension / 12).toBe(roundPremium(std * PENSION_RATE));
      });
    }
  });

  describe('calcPremiums への適用', () => {
    it('標準報酬月額88,000円・1〜2年目は本人負担が保険料全体の25%（＝折半の半分）', () => {
      const income = incomeFor(88_000);
      const full = calcPremiums(income);
      const cut = calcPremiums(income, false, 'y12');
      // 厚生年金はちょうど半分
      expect(cut.pension).toBe(full.pension / 2);
      // 健康保険料の本体（支援金を除く）も半分
      expect(cut.health).toBe(roundPremium(88_000 * (HEALTH_RATE / 2 + SHIENKIN_RATE)) * 12);
    });

    it('介護保険料・子ども・子育て支援金・雇用保険料は軽減されない', () => {
      // パンフレット5頁 Q5/A5 の注記「賞与に関する保険料や、介護保険料、
      // 子ども・子育て支援金は、制度の対象外です」（対象の列挙は1頁 ※1）。
      // 支援金まで巻き込むと軽減額が過大に出る
      const income = incomeFor(88_000);
      const cut = calcPremiums(income, true, 'y12');
      const kaigoAndShienkin = roundPremium(88_000 * (SHIENKIN_RATE + KAIGO_RATE)) * 12;
      expect(cut.health).toBe(
        roundPremium(88_000 * (HEALTH_RATE / 2 + SHIENKIN_RATE + KAIGO_RATE)) * 12,
      );
      // 軽減額は健保本体と厚年の減った分だけ（支援金・介護の分は入らない）
      expect(cut.choseiSavings).toBeLessThan(calcPremiums(income, true).total - kaigoAndShienkin);
      // 雇用保険料は完全に不変
      expect(cut.employment).toBe(calcPremiums(income, true).employment);
    });

    it('軽減額は「折半だった場合」との差になる', () => {
      const income = incomeFor(104_000);
      const full = calcPremiums(income);
      const cut = calcPremiums(income, false, 'y12');
      expect(cut.choseiSavings).toBe(full.health - cut.health + (full.pension - cut.pension));
      expect(cut.total).toBe(full.total - cut.choseiSavings);
      expect(cut.choseiShare).toBe(0.36);
    });

    it('対象外の標準報酬月額では折半のまま（軽減額0・割合 null）', () => {
      const income = incomeFor(134_000);
      const cut = calcPremiums(income, false, 'y12');
      expect(cut.total).toBe(calcPremiums(income).total);
      expect(cut.choseiSavings).toBe(0);
      expect(cut.choseiShare).toBeNull();
    });

    it('126,000円・3年目は49%（表の下端）', () => {
      const income = incomeFor(126_000);
      expect(calcPremiums(income, false, 'y3').choseiShare).toBe(0.49);
      expect(calcPremiums(income, false, 'y3').pension / 12).toBe(11_298);
    });
  });

  /**
   * この制度でいちばん誤りやすいところ。
   * 本人負担が減っても標準報酬月額は同じなので、**将来の年金額も傷病手当金も変わらない**
   * （パンフレット「被保険者が将来受け取る年金額への影響はありません」）。
   * 変わるのは実際に払う保険料と、それを年金の増分で取り戻すまでの年数だけ。
   */
  describe('増える給付は軽減の有無で変わらない', () => {
    const income = incomeFor(110_000);

    it('年金の増分・傷病手当金の日額・標準報酬月額は1円も動かない', () => {
      const full = calcBenefits(income);
      for (const stage of ['y12', 'y3'] as const) {
        const cut = calcBenefits(income, false, stage);
        expect(cut.standardMonthly).toBe(full.standardMonthly);
        expect(cut.pensionPerYearEnrolled).toBe(full.pensionPerYearEnrolled);
        expect(cut.pensionAfter10Years).toBe(full.pensionAfter10Years);
        expect(cut.sickBenefitDaily).toBe(full.sickBenefitDaily);
      }
    });

    it('払う保険料が減るぶん、取り戻すまでの年数は短くなる', () => {
      const full = calcBenefits(income);
      const y12 = calcBenefits(income, false, 'y12');
      const y3 = calcBenefits(income, false, 'y3');
      expect(y12.pensionPremiumYearly).toBeLessThan(full.pensionPremiumYearly);
      expect(y12.pensionPaybackYears).toBeLessThan(full.pensionPaybackYears);
      // 3年目は軽減が半分なので、1〜2年目と折半の間になる
      expect(y3.pensionPaybackYears).toBeGreaterThan(y12.pensionPaybackYears);
      expect(y3.pensionPaybackYears).toBeLessThan(full.pensionPaybackYears);
    });
  });

  describe('calcHatarakizon での適用条件', () => {
    const target: HatarakizonInput = {
      ...base,
      workplace: 'optional-covered',
      income: incomeFor(88_000), // 年収105.6万円。標準報酬月額88,000円
    };

    it('50人以下の加入対象の勤務先・施行後なら効く', () => {
      const r = compare({ ...target, chosei: 'y12' });
      expect(r.choseiSelectable).toBe(true);
      expect(r.choseiApplied).toBe(true);
      expect(r.choseiSavings).toBeGreaterThan(0);
      // 折半のままの場合より手取りが多い
      const none = compare({ ...target, chosei: 'none' });
      expect(r.target.net).toBeGreaterThan(none.target.net);
      expect(r.target.net - none.target.net).toBe(r.choseiSavings);
    });

    it('従業員51人以上（制度の対象外）はセレクトの値にかかわらず折半', () => {
      const folded = compare({ ...target, workplace: 'over51', chosei: 'none' });
      for (const chosei of ['y12', 'y3'] as const) {
        const r = compare({ ...target, workplace: 'over51', chosei });
        expect(r.choseiSelectable).toBe(false);
        expect(r.choseiApplied).toBe(false);
        expect(r.choseiSavings).toBe(0);
        expect(r.target.premiums.total).toBe(folded.target.premiums.total);
      }
    });

    it('施行日前（2026-09-30まで）は既存どおり折半', () => {
      const r = compare({ ...target, chosei: 'y12', asOf: BEFORE });
      expect(r.choseiSelectable).toBe(false);
      expect(r.choseiApplied).toBe(false);
      expect(r.choseiSavings).toBe(0);
    });

    it('施行日（2026-10-01）から効く', () => {
      expect(HOKENRYO_CHOSEI_STARTS_ON).toBe('2026-10-01');
      const r = compare({ ...target, chosei: 'y12', asOf: AFTER });
      expect(r.choseiSelectable).toBe(true);
    });

    it('セレクトを出せる勤務先でも、標準報酬月額が12.6万円を超えれば効かない', () => {
      const r = compare({ ...target, income: incomeFor(134_000), chosei: 'y12' });
      expect(r.choseiSelectable).toBe(true); // セレクトは出す（年収を下げれば対象になる）
      expect(r.choseiApplied).toBe(false);
      expect(r.choseiSavings).toBe(0);
    });

    it('働き損ゾーンと損益分岐点も軽減後の保険料で出る（この改修の主目的）', () => {
      // 折半のままだと、対象者に「実際より広い働き損ゾーン」を見せることになる
      const none = compare({ ...target, chosei: 'none' });
      const cut = compare({ ...target, chosei: 'y12' });

      // 曲線そのものが軽減後で引かれている（対象になる年収帯で手取りが増える）
      const at = (r: typeof cut, gross: number) => r.curve.find((p) => p.gross === gross)!.net;
      expect(at(cut, 1_000_000)).toBeGreaterThan(at(none, 1_000_000));

      // 損益分岐点は軽減があるぶん手前に来る（追いつくのが早い）
      if (none.breakEven !== null && cut.breakEven !== null) {
        expect(cut.breakEven).toBeLessThanOrEqual(none.breakEven);
      }
    });

    it('既定（chosei 未指定）は折半のまま', () => {
      const r = compare({ ...target });
      expect(r.choseiApplied).toBe(false);
      expect(r.choseiSavings).toBe(0);
    });
  });
});
