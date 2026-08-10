/**
 * 子ども・子育て支援金 計算ロジック
 *
 * 一次情報:
 * - こども家庭庁「子ども・子育て支援金制度について」
 *   https://www.cfa.go.jp/policies/kodomokosodateshienkinseido
 * - 2026年度（令和8年度）の支援金率は全国一律 0.23%（被用者保険）・労使折半
 * - 2027年度は総額8,000億円計画にもとづく見込み値、2028年度は政府試算 0.4%
 *
 * 【データ更新箇所】料率が確定・変更されたら FISCAL_YEARS を更新する
 */

export interface FiscalYearRate {
  fiscalYear: number;
  era: string;
  /** 支援金率（労使折半前）例: 0.0023 = 0.23% */
  rate: number;
  status: '確定' | '見込み' | '政府試算';
  note: string;
}

export const FISCAL_YEARS: FiscalYearRate[] = [
  {
    fiscalYear: 2026,
    era: '令和8年度',
    rate: 0.0023,
    status: '確定',
    note: '全国一律0.23%（被用者保険）。労使折半のため本人負担は0.115%。',
  },
  {
    fiscalYear: 2027,
    era: '令和9年度',
    rate: 0.003,
    status: '見込み',
    note: '支援金総額8,000億円（政府計画）にもとづく推計値。料率は未確定。',
  },
  {
    fiscalYear: 2028,
    era: '令和10年度',
    rate: 0.004,
    status: '政府試算',
    note: 'こども家庭庁の試算資料にもとづく想定値（0.4%・本人負担0.2%）。',
  },
];

/** 標準賞与額の年度上限（健康保険と同じ573万円） */
export const BONUS_CAP_YEARLY = 5_730_000;

/**
 * 健康保険の標準報酬月額 等級表（1〜50等級）
 * [等級, 標準報酬月額, 報酬月額下限（以上）, 報酬月額上限（未満）]
 */
export const GRADES: ReadonlyArray<readonly [number, number, number, number]> = [
  [1, 58_000, 0, 63_000],
  [2, 68_000, 63_000, 73_000],
  [3, 78_000, 73_000, 83_000],
  [4, 88_000, 83_000, 93_000],
  [5, 98_000, 93_000, 101_000],
  [6, 104_000, 101_000, 107_000],
  [7, 110_000, 107_000, 114_000],
  [8, 118_000, 114_000, 122_000],
  [9, 126_000, 122_000, 130_000],
  [10, 134_000, 130_000, 138_000],
  [11, 142_000, 138_000, 146_000],
  [12, 150_000, 146_000, 155_000],
  [13, 160_000, 155_000, 165_000],
  [14, 170_000, 165_000, 175_000],
  [15, 180_000, 175_000, 185_000],
  [16, 190_000, 185_000, 195_000],
  [17, 200_000, 195_000, 210_000],
  [18, 220_000, 210_000, 230_000],
  [19, 240_000, 230_000, 250_000],
  [20, 260_000, 250_000, 270_000],
  [21, 280_000, 270_000, 290_000],
  [22, 300_000, 290_000, 310_000],
  [23, 320_000, 310_000, 330_000],
  [24, 340_000, 330_000, 350_000],
  [25, 360_000, 350_000, 370_000],
  [26, 380_000, 370_000, 395_000],
  [27, 410_000, 395_000, 425_000],
  [28, 440_000, 425_000, 455_000],
  [29, 470_000, 455_000, 485_000],
  [30, 500_000, 485_000, 515_000],
  [31, 530_000, 515_000, 545_000],
  [32, 560_000, 545_000, 575_000],
  [33, 590_000, 575_000, 605_000],
  [34, 620_000, 605_000, 635_000],
  [35, 650_000, 635_000, 665_000],
  [36, 680_000, 665_000, 695_000],
  [37, 710_000, 695_000, 730_000],
  [38, 750_000, 730_000, 770_000],
  [39, 790_000, 770_000, 810_000],
  [40, 830_000, 810_000, 855_000],
  [41, 880_000, 855_000, 905_000],
  [42, 930_000, 905_000, 955_000],
  [43, 980_000, 955_000, 1_005_000],
  [44, 1_030_000, 1_005_000, 1_055_000],
  [45, 1_090_000, 1_055_000, 1_115_000],
  [46, 1_150_000, 1_115_000, 1_175_000],
  [47, 1_210_000, 1_175_000, 1_235_000],
  [48, 1_270_000, 1_235_000, 1_295_000],
  [49, 1_330_000, 1_295_000, 1_355_000],
  [50, 1_390_000, 1_355_000, Number.MAX_SAFE_INTEGER],
];

/** 月収（額面）から健康保険の標準報酬月額を求める */
export function standardMonthly(monthlyIncome: number): number {
  for (const [, std, lo, hi] of GRADES) {
    if (monthlyIncome >= lo && monthlyIncome < hi) return std;
  }
  return GRADES[GRADES.length - 1][1];
}

/**
 * 被保険者負担分の端数処理（50銭以下切り捨て・50銭超切り上げ）
 * ※実際の給与では健康保険料と合算後に端数処理されるため±1円の誤差が出ることがある
 */
export function roundPremium(value: number): number {
  const frac = value - Math.floor(value);
  return frac > 0.5 ? Math.ceil(value) : Math.floor(value);
}

export interface ShienkinResult {
  fiscalYear: number;
  era: string;
  status: FiscalYearRate['status'];
  note: string;
  /** 支援金率（%表記の数値 例: 0.23） */
  ratePercent: number;
  /** 算定に使った標準報酬月額 */
  standardMonthly: number;
  /** 毎月の本人負担額（円） */
  monthly: number;
  /** 年間賞与からの本人負担額（円） */
  bonus: number;
  /** 年間合計（円） */
  yearly: number;
}

/**
 * 本人負担額を年度ごとに計算する
 * @param monthlyIncome 月収（額面・円）
 * @param bonusYearly   年間賞与（額面・円）
 */
export function calcShienkin(monthlyIncome: number, bonusYearly = 0): ShienkinResult[] {
  const std = standardMonthly(Math.max(0, monthlyIncome));
  // 標準賞与額: 1,000円未満切り捨て・年度累計573万円上限
  const stdBonus = Math.min(
    Math.floor(Math.max(0, bonusYearly) / 1000) * 1000,
    BONUS_CAP_YEARLY
  );
  return FISCAL_YEARS.map((y) => {
    const monthly = roundPremium((std * y.rate) / 2);
    const bonus = roundPremium((stdBonus * y.rate) / 2);
    return {
      fiscalYear: y.fiscalYear,
      era: y.era,
      status: y.status,
      note: y.note,
      ratePercent: y.rate * 100,
      standardMonthly: std,
      monthly,
      bonus,
      yearly: monthly * 12 + bonus,
    };
  });
}
