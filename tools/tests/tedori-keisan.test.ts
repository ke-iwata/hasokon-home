import { describe, expect, it } from 'vitest';
import {
  HEALTH_CAP_INCOME,
  PENSION_CAP_INCOME,
  REFORM_EFFECTIVE_ON,
  TABLE_INCOMES,
  TAX_RULES_R7,
  TAX_RULES_R8,
  WITHHOLDING_TABLE_EFFECTIVE_ON,
  calcTedori,
  takeHomeTable,
} from '@/lib/tedori-keisan';
import {
  EMPLOYMENT_RATE,
  KAIGO_RATE,
  calcPremiums,
  calcResidentTax,
  calcTakeHome,
} from '@/lib/hatarakizon';
import {
  RULES_R7,
  RULES_R8,
  calcYearTax,
  type NenmatsuInput,
} from '@/lib/nenmatsu-chosei';
import { GRADES, PENSION_STANDARD_MAX, roundPremium } from '@/lib/shaho-grades';

/**
 * 手取り計算機のテスト。
 *
 * 仕様: docs/features/tedori-keisan.md
 *
 * このツールの本体は lib/hatarakizon.ts の計算をそのまま使うことなので、
 * 見張る中心は**独自の数字を作っていないこと**（既存ツールとの一致）に置いている。
 * ここが緩むと、料率改定のときに片方だけが更新されて、同じ年収に対して
 * サイト内に違う手取りが2つ並ぶ。
 */

/** 年末調整計算機で「給与収入だけ・扶養なし・年末調整の控除なし」の入力を作る */
const bare = (income: number): NenmatsuInput => ({
  income,
  withheld: null,
  socialInsurance: null,
  kaigo: false,
  spouse: 'none',
  spouseIncome: 0,
  dependentsGeneral: 0,
  dependentsSpecific: 0,
  dependentsElderly: 0,
  specialRelativeIncomes: [],
  lifeInsurance: 0,
  earthquakeInsurance: 0,
  smallEnterpriseMutualAid: 0,
  housingLoanCredit: 0,
  housingLoanTier: 'general',
});

/** 年調年税額は100円未満切捨て。所得税額そのものと比べるときに揃える */
const floorTo100 = (v: number) => Math.floor(v / 100) * 100;

/** 突合の3点（仕様書「検証」） */
const SAMPLES = [3_000_000, 5_000_000, 8_000_000];

describe('calcTedori — 既存ツールとの一致（2実装を並べていないこと）', () => {
  it('手取りの内訳は 社会保険 損得計算機 の calcTakeHome とまったく同じ', () => {
    for (const income of SAMPLES) {
      for (const kaigo of [false, true]) {
        expect(calcTedori({ income, kaigo }).current).toEqual(
          calcTakeHome(income, true, kaigo),
        );
      }
    }
  });

  it('住民税は calcResidentTax の値そのもの（素の所得割10%で別に書いていない）', () => {
    for (const income of SAMPLES) {
      const r = calcTedori({ income, kaigo: false });
      expect(r.current.residentTax).toBe(
        calcResidentTax(income, r.current.premiums.total),
      );
      // 均等割を含むので、課税される年収では必ず1円以上になる
      expect(r.current.residentTax).toBeGreaterThan(0);
    }
  });

  it('社会保険料は calcPremiums の値そのもの', () => {
    for (const income of SAMPLES) {
      expect(calcTedori({ income, kaigo: false }).current.premiums).toEqual(
        calcPremiums(income, false),
      );
    }
  });

  /**
   * 所得税は年末調整計算機と同じ額になる。
   * 差は端数処理だけ（年調年税額は100円未満切捨て、こちらは1円単位）なので、
   * 100円未満を落とせば一致する。ここがずれたら、どちらかの控除表が古い。
   */
  it('所得税は年末調整還付金計算機と一致する（令和8年分・令和7年分とも）', () => {
    for (const income of SAMPLES) {
      const r = calcTedori({ income, kaigo: false });
      const si = r.current.premiums.total;
      expect(floorTo100(r.current.incomeTax)).toBe(
        calcYearTax(bare(income), RULES_R8, si).yearTax,
      );
      expect(floorTo100(r.previous.incomeTax)).toBe(
        calcYearTax(bare(income), RULES_R7, si).yearTax,
      );
    }
  });
});

describe('calcTedori — 社会保険料が料額表どおり', () => {
  /**
   * 年収500万円 → 月額416,666円 → 27等級・標準報酬月額410,000円。
   * 手計算（協会けんぽの保険料額表・日本年金機構の保険料額表）:
   * - 健康保険 410,000 × 4.95% = 20,295円 ＋ 子ども・子育て支援金 471円 = 20,766円/月
   * - 厚生年金 410,000 × 9.15% = 37,515円/月
   * - 雇用保険 5,000,000 × 0.55%（標準報酬月額ではなく実際の賃金にかかる）
   */
  it('年収500万円の内訳が保険料額表と一致する', () => {
    const p = calcTedori({ income: 5_000_000, kaigo: false }).current.premiums;
    expect(p.grade).toBe(27);
    expect(p.standardMonthly).toBe(410_000);
    expect(p.pension).toBe(450_180); // 37,515 × 12
    expect(p.health).toBe(249_192); // 20,766 × 12
    expect(p.employment).toBe(Math.round(5_000_000 * EMPLOYMENT_RATE));
    expect(p.employment).toBe(27_500);
  });

  it('40〜64歳は介護保険料の分だけ健康保険料が増える', () => {
    const income = 5_000_000;
    const without = calcTedori({ income, kaigo: false }).current.premiums;
    const withKaigo = calcTedori({ income, kaigo: true }).current.premiums;
    const kaigoMonthly =
      roundPremium(withKaigo.standardMonthly * KAIGO_RATE + without.health / 12) -
      without.health / 12;
    expect(withKaigo.health - without.health).toBeCloseTo(kaigoMonthly * 12, 0);
    expect(withKaigo.health).toBeGreaterThan(without.health);
    // 介護保険料は所得税・住民税の社会保険料控除に入るので、手取りは保険料の増分ほどは減らない
    const netDiff =
      calcTedori({ income, kaigo: false }).current.net -
      calcTedori({ income, kaigo: true }).current.net;
    expect(netDiff).toBeGreaterThan(0);
    expect(netDiff).toBeLessThan(withKaigo.health - without.health);
  });
});

describe('calcTedori — 高年収の頭打ち', () => {
  it('PENSION_CAP_INCOME / HEALTH_CAP_INCOME は等級表から導いている', () => {
    const pensionGrade = GRADES.find((g) => g[1] === PENSION_STANDARD_MAX);
    expect(pensionGrade).toBeDefined();
    expect(PENSION_CAP_INCOME).toBe((pensionGrade as (typeof GRADES)[number])[2] * 12);
    expect(PENSION_CAP_INCOME).toBe(7_620_000);
    expect(HEALTH_CAP_INCOME).toBe(GRADES[GRADES.length - 1][2] * 12);
    expect(HEALTH_CAP_INCOME).toBe(16_260_000);
  });

  /**
   * 厚生年金は32等級・標準報酬月額65万円で頭打ちになる。
   * 年収780万円と1,000万円で保険料が同額になることを期待値として書いておく
   * （「年収が増えれば保険料も増える」という直感で式を書き換えると落ちる）。
   */
  it('厚生年金保険料は年収780万円と1,000万円で同額（32等級で頭打ち）', () => {
    const a = calcTedori({ income: 7_800_000, kaigo: false });
    const b = calcTedori({ income: 10_000_000, kaigo: false });
    expect(a.current.premiums.pension).toBe(b.current.premiums.pension);
    expect(a.current.premiums.pensionStandardMonthly).toBe(PENSION_STANDARD_MAX);
    expect(a.pensionCapped).toBe(true);
    expect(b.pensionCapped).toBe(true);
    // 頭打ちの手前ではまだ増える
    expect(calcTedori({ income: 7_000_000, kaigo: false }).pensionCapped).toBe(false);
    expect(calcTedori({ income: 7_000_000, kaigo: false }).current.premiums.pension).toBeLessThan(
      a.current.premiums.pension,
    );
  });

  it('健康保険料は50等級（標準報酬月額139万円）で頭打ちになる', () => {
    const a = calcTedori({ income: 20_000_000, kaigo: false });
    const b = calcTedori({ income: 30_000_000, kaigo: false });
    expect(a.current.premiums.health).toBe(b.current.premiums.health);
    expect(a.current.premiums.grade).toBe(GRADES.length);
    expect(a.healthCapped).toBe(true);
    expect(calcTedori({ income: 10_000_000, kaigo: false }).healthCapped).toBe(false);
  });
});

describe('calcTedori — 令和8年改正との比較', () => {
  it('改正で手取りが増える（減ることはない）', () => {
    for (const income of SAMPLES) {
      const r = calcTedori({ income, kaigo: false });
      expect(r.reformGain).toBe(r.current.net - r.previous.net);
      expect(r.reformGain).toBeGreaterThan(0);
      // 社会保険料は年分によらず同額。差は所得税・住民税だけ
      expect(r.previous.premiums).toEqual(r.current.premiums);
    }
  });

  it('比較対象は令和7年分の控除（給与所得控除65万・基礎控除は改正前の表）', () => {
    expect(TAX_RULES_R8.label).toBe('令和8年分');
    expect(TAX_RULES_R7.label).toBe('令和7年分');
    // 給与所得控除の最低保障額: 令和8年分74万 / 令和7年分65万
    expect(TAX_RULES_R8.salaryIncome(1_500_000)).toBe(1_500_000 - 740_000);
    expect(TAX_RULES_R7.salaryIncome(1_500_000)).toBe(1_500_000 - 650_000);
    // 住民税の基礎控除は改正されていないので、両年分で同じ関数を指す
    expect(TAX_RULES_R7.basicDeductionResidentTax(3_000_000)).toBe(
      TAX_RULES_R8.basicDeductionResidentTax(3_000_000),
    );
  });

  /**
   * 基礎控除は合計所得489万円超（給与収入およそ665.6万円）で104万→67万に下がる。
   * 境目をまたぐと改正の効果そのものが小さくなるので、その段差を固定しておく。
   */
  it('基礎控除の逓減の境目をまたぐと改正の効果が小さくなる', () => {
    const below = calcTedori({ income: 6_600_000, kaigo: false });
    const above = calcTedori({ income: 6_700_000, kaigo: false });
    expect(above.reformGain).toBeLessThan(below.reformGain);
  });

  it('施行日と源泉徴収税額表の改正日は別の日（月々に効くのは2027年1月から）', () => {
    expect(REFORM_EFFECTIVE_ON).toBe('2026-12-01');
    expect(WITHHOLDING_TABLE_EFFECTIVE_ON).toBe('2027-01-01');
    expect(REFORM_EFFECTIVE_ON < WITHHOLDING_TABLE_EFFECTIVE_ON).toBe(true);
  });
});

describe('calcTedori — 月額換算と手取り率', () => {
  it('月あたりの手取りは年額の12分の1（1円未満切捨て）', () => {
    for (const income of SAMPLES) {
      const r = calcTedori({ income, kaigo: false });
      expect(r.monthlyNet).toBe(Math.floor(r.current.net / 12));
    }
  });

  it('手取り率は年収が上がるほど下がる（累進のため）', () => {
    const rates = SAMPLES.map((income) => calcTedori({ income, kaigo: false }).netRate);
    expect(rates[0]).toBeGreaterThan(rates[1]);
    expect(rates[1]).toBeGreaterThan(rates[2]);
    // 会社員の手取りは額面のおよそ7〜8割に収まる
    for (const rate of rates) {
      expect(rate).toBeGreaterThan(0.7);
      expect(rate).toBeLessThan(0.85);
    }
  });

  it('引かれる合計は 社会保険料 + 所得税 + 住民税', () => {
    const r = calcTedori({ income: 5_000_000, kaigo: false });
    expect(r.totalDeducted).toBe(
      r.current.premiums.total + r.current.incomeTax + r.current.residentTax,
    );
  });
});

describe('calcTedori — 異常値', () => {
  it('年収0円は保険料も税もかからず手取り0円（等級表の下限に当たらない）', () => {
    const r = calcTedori({ income: 0, kaigo: false });
    expect(r.current.net).toBe(0);
    expect(r.current.premiums.total).toBe(0);
    expect(r.monthlyNet).toBe(0);
    expect(r.netRate).toBe(0);
    expect(r.reformGain).toBe(0);
  });

  it('マイナスの年収は0円として扱う', () => {
    expect(calcTedori({ income: -1_000_000, kaigo: false })).toEqual(
      calcTedori({ income: 0, kaigo: false }),
    );
  });

  it('住民税の非課税限度額（給与収入119万円）以下では住民税が0', () => {
    expect(calcTedori({ income: 1_100_000, kaigo: false }).current.residentTax).toBe(0);
    expect(calcTedori({ income: 1_300_000, kaigo: false }).current.residentTax).toBeGreaterThan(0);
  });
});

describe('takeHomeTable — 手取り早見表', () => {
  it('100万〜1,000万円を50万円刻みで並べ、基礎控除の境目の前後を足している', () => {
    expect(TABLE_INCOMES[0]).toBe(1_000_000);
    expect(TABLE_INCOMES[TABLE_INCOMES.length - 1]).toBe(10_000_000);
    // 昇順・重複なし
    expect([...TABLE_INCOMES].sort((a, b) => a - b)).toEqual([...TABLE_INCOMES]);
    expect(new Set(TABLE_INCOMES).size).toBe(TABLE_INCOMES.length);
    // 104万→67万（およそ665.6万円）と 67万→62万（850万円）をまたぐ行
    for (const boundary of [6_600_000, 6_700_000, 8_500_000, 8_600_000]) {
      expect(TABLE_INCOMES).toContain(boundary);
    }
  });

  /**
   * 早見表のスナップショット。料率や控除表を直すとここが動くので、
   * 「直したつもりのない年収まで動いていないか」を差分で確かめられる。
   * [年収, 手取り（年額）, 手取り（月あたり）, 改正による増分]
   */
  it('40歳未満の早見表（料率改定に気づくためのスナップショット）', () => {
    expect(
      takeHomeTable(false).map((r) => [r.gross, r.net, r.monthlyNet, r.reformGain]),
    ).toEqual([
      [1_000_000, 844_392, 70_366, 0],
      [1_500_000, 1_263_718, 105_309, 9_000],
      [2_000_000, 1_643_620, 136_968, 9_522],
      [2_500_000, 2_040_052, 170_004, 8_168],
      [3_000_000, 2_398_098, 199_841, 8_168],
      [3_500_000, 2_784_822, 232_068, 8_168],
      [4_000_000, 3_165_655, 263_804, 8_168],
      [4_500_000, 3_544_977, 295_414, 8_168],
      [5_000_000, 3_938_796, 328_233, 28_741],
      [5_500_000, 4_282_093, 356_841, 36_756],
      [6_000_000, 4_658_237, 388_186, 36_756],
      [6_500_000, 5_034_392, 419_532, 36_756],
      [6_600_000, 5_077_003, 423_083, 36_756],
      [6_700_000, 5_120_689, 426_724, 4_798],
      [7_000_000, 5_304_925, 442_077, 8_168],
      [7_500_000, 5_630_532, 469_211, 8_168],
      [8_000_000, 5_943_690, 495_307, 8_168],
      [8_500_000, 6_291_906, 524_325, 8_168],
      [8_600_000, 6_351_031, 529_252, 8_168],
      [9_000_000, 6_611_052, 550_921, 8_168],
      [9_500_000, 6_940_103, 578_341, 8_168],
      [10_000_000, 7_269_155, 605_762, 8_168],
    ]);
  });

  it('早見表の各行は calcTedori と同じ値', () => {
    for (const row of takeHomeTable(true)) {
      const r = calcTedori({ income: row.gross, kaigo: true });
      expect(row.net).toBe(r.current.net);
      expect(row.monthlyNet).toBe(r.monthlyNet);
      expect(row.reformGain).toBe(r.reformGain);
      expect(row.netRate).toBe(r.netRate);
    }
  });

  it('年収が増えれば手取りも増える（等級の段差があっても逆転しない範囲）', () => {
    const rows = takeHomeTable(false);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].net).toBeGreaterThan(rows[i - 1].net);
    }
  });
});
