/**
 * 公的年金等控除（所得税法35条4項・租税特別措置法41条の15の3）
 *
 * 仕様: docs/features/kyuyo-nenkin-kojo-280man.md（計算ロジック）
 *
 * 公的年金等控除の表を持つのは**このファイルだけ**。給与と年金の控除 280万円上限 計算機
 * （lib/kyuyo-nenkin-kojo.ts）が使い、住民税非課税判定（docs/features/juminzei-hikazei-hantei.md）を
 * 実装するときもここを import する（同じ表を2か所に書かない）。
 *
 * ■ 控除額の決まり方（条文の形のまま持つ）
 *   控除額 = イ（年金以外の合計所得で 40万／30万／20万）＋ ロ（年金収入 − 50万円 の帯ごとの額）
 *   ただし最低額（65歳未満 60万／50万／40万、65歳以上 110万／100万／90万）を下回らない。
 *   国税庁 No.1600 の6表（「収入×25%＋27.5万円」など）は、この式を帯ごとに展開したもの。
 *   6表を写すより条文の形で持つほうが、表の写し間違いが起きない（tests/nenkin-kojo.test.ts が
 *   No.1600 の帯の境目の値と突き合わせて見張る）。
 *
 * ■ 年金以外の合計所得金額
 *   表を選ぶ「公的年金等に係る雑所得以外の合計所得金額」は、**公的年金等の収入が無いものとして
 *   計算した合計所得金額**（所得税法35条4項1号）。給与がある人は**給与所得を含める**。
 *   年金の収入が無いものとして計算するので、所得金額調整控除（租税特別措置法41条の3の11第2項。
 *   給与と年金の両方がある人の最大10万円）は効かない（給与所得をそのまま使う）。
 *
 * ■ 年齢
 *   65歳以上かどうかは**その年の12月31日時点の年齢**（租税特別措置法41条の15の3第4項）。
 *
 * 【データ更新箇所】控除額が改正されたら PENSION_DEDUCTION_BANDS / BASE_BY_TIER /
 * MINIMUM_UNDER_65 / MINIMUM_65_AND_OVER / OTHER_INCOME_TIERS。
 * 280万円上限（所得税法35条5項）は表の外の調整なので lib/kyuyo-nenkin-kojo.ts に置いている。
 */

/** 年金収入から引く定額（35条4項1号ロの「五十万円」） */
const PENSION_BASE_OFFSET = 500_000;

/**
 * 35条4項1号ロ：（年金収入 − 50万円）の残額に応じた額。
 * `upTo` 以下の帯で `base + (残額 − from) × rate`。
 * 【データ更新箇所】
 */
const PENSION_DEDUCTION_BANDS: { from: number; upTo: number; base: number; rate: number }[] = [
  { from: 0, upTo: 3_600_000, base: 0, rate: 0.25 },
  { from: 3_600_000, upTo: 7_200_000, base: 900_000, rate: 0.15 },
  { from: 7_200_000, upTo: 9_500_000, base: 1_440_000, rate: 0.05 },
  { from: 9_500_000, upTo: Infinity, base: 1_555_000, rate: 0 },
];

/**
 * 年金以外の合計所得金額の区分（35条4項1号〜3号）。
 * 0: 1,000万円以下 / 1: 1,000万円超 2,000万円以下 / 2: 2,000万円超
 */
const OTHER_INCOME_TIERS = [10_000_000, 20_000_000] as const;

export type OtherIncomeTier = 0 | 1 | 2;

/** 35条4項各号のイ（年金以外の合計所得の区分ごとの定額）。【データ更新箇所】 */
const BASE_BY_TIER: Record<OtherIncomeTier, number> = { 0: 400_000, 1: 300_000, 2: 200_000 };

/** 65歳未満の最低額（35条4項各号のかっこ書き）。【データ更新箇所】 */
const MINIMUM_UNDER_65: Record<OtherIncomeTier, number> = { 0: 600_000, 1: 500_000, 2: 400_000 };

/** 65歳以上の最低額（租税特別措置法41条の15の3第1項の読み替え）。【データ更新箇所】 */
const MINIMUM_65_AND_OVER: Record<OtherIncomeTier, number> = {
  0: 1_100_000,
  1: 1_000_000,
  2: 900_000,
};

/** 年金以外の合計所得金額から、どの表を使うか */
export function otherIncomeTier(otherIncome: number): OtherIncomeTier {
  if (otherIncome <= OTHER_INCOME_TIERS[0]) return 0;
  if (otherIncome <= OTHER_INCOME_TIERS[1]) return 1;
  return 2;
}

/** 35条4項1号ロの額（年金収入 − 50万円 の残額に応じた額） */
function bandAmount(pension: number): number {
  const rest = Math.max(0, pension - PENSION_BASE_OFFSET);
  const band = PENSION_DEDUCTION_BANDS.find((b) => rest <= b.upTo) ?? PENSION_DEDUCTION_BANDS[3];
  return band.base + (rest - band.from) * band.rate;
}

/**
 * 公的年金等控除額（280万円上限を適用する前の額）。
 *
 * @param age65 その年の12月31日時点で65歳以上か
 * @param pension 公的年金等の収入金額（老齢基礎・老齢厚生・企業年金などの合計）
 * @param otherIncome 公的年金等に係る雑所得以外の合計所得金額（**給与所得を含める**）
 * @returns 控除額（円・整数）。年金収入を超えない（雑所得がマイナスにならない）
 */
export function publicPensionDeduction(
  age65: boolean,
  pension: number,
  otherIncome: number,
): number {
  if (!(pension > 0)) return 0;
  const tier = otherIncomeTier(Math.max(0, otherIncome));
  const minimum = (age65 ? MINIMUM_65_AND_OVER : MINIMUM_UNDER_65)[tier];
  const amount = Math.max(minimum, BASE_BY_TIER[tier] + bandAmount(pension));
  // 雑所得は1円未満を切り捨てるので、控除額の側は切り上げにしておく（収入 − 控除 が整数になる）
  return Math.min(pension, Math.ceil(amount));
}

/** 公的年金等に係る雑所得（収入 − 控除。0未満にならない） */
export function pensionIncome(pension: number, deduction: number): number {
  return Math.max(0, Math.floor(pension - deduction));
}
