/**
 * 賞与に対する源泉徴収税額の算出率の表（令和8年分）
 *
 * 仕様: docs/features/shoyo-tedori-keisan.md
 *
 * ■ 一次情報
 * - 国税庁「令和8年分 源泉徴収税額表」15〜16ページ
 *   https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/data/15-16.pdf
 *   （平成24年3月31日財務省告示第115号別表第三（令和7年4月30日財務省告示第122号改正））
 *   2026-09-27 に PDF から転記した。
 * - 国税庁 タックスアンサー No.2523「賞与に対する源泉徴収」
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2523.htm
 *
 * ■ 表の引き方
 * 「前月の社会保険料等控除後の給与等の金額」が、扶養親族等の数の列で
 * どの行（以上〜未満）に当たるかを求め、その行の率を賞与（社会保険料控除後）に掛ける。
 * 扶養控除等申告書を出していない人は乙欄を使う。
 *
 * 【データ更新箇所】毎年分ごとに差し替わる。
 * - **令和9年分（2027年1月1日以後に支払う賞与）の表は既に公開済み**
 *   https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2027/01.htm
 *   2027年6〜7月の夏賞与の前に、`TABLE_YEAR_LABEL` と下の2つの表をこの PDF の
 *   算出率の表で差し替える（tests/shoyo-tedori.test.ts の突き合わせも一緒に直す）
 */

/** この表が何年分か（画面の「適用した率」に添える） */
export const TABLE_YEAR_LABEL = '令和8年分';

/**
 * 「賞与の金額に乗ずべき率」（千分の1パーセント単位の整数。2042 = 2.042%）。
 * 小数のまま掛けると 0.02042 が二進小数で表せず、1円未満切り捨てがぶれるため整数で持つ。
 */
export const KOU_RATES_MILLI: readonly number[] = [
  0, 2042, 4084, 6126, 8168, 10210, 12252, 14294, 16336, 18378, 20420, 22462, 24504, 26546,
  28588, 30630, 32672, 35735, 38798, 41861, 45945,
];

/**
 * 甲欄。扶養親族等の数（0〜7人以上）ごとの、各行の下限（以上・千円）。
 * `KOU_LOWER_BOUNDS[扶養][i]` が `KOU_RATES_MILLI[i]` の行の下限で、上限（未満）は次の行の下限。
 * 0行目（0.000%）は下限なし（「◯千円未満」）なので 0 を置く。
 */
export const KOU_LOWER_BOUNDS: readonly (readonly number[])[] = [
  // 0人
  [0, 82, 94, 260, 309, 342, 372, 402, 433, 520, 605, 684, 715, 752, 795, 854, 922, 1318, 1521, 2621, 3495],
  // 1人
  [0, 107, 250, 289, 346, 373, 401, 430, 463, 520, 621, 705, 739, 778, 821, 882, 952, 1342, 1526, 2645, 3527],
  // 2人
  [0, 143, 276, 321, 377, 400, 426, 457, 492, 525, 636, 728, 764, 804, 848, 910, 983, 1367, 1526, 2669, 3559],
  // 3人
  [0, 181, 300, 354, 405, 424, 452, 484, 517, 550, 651, 751, 788, 830, 876, 938, 1013, 1391, 1538, 2693, 3590],
  // 4人
  [0, 218, 300, 387, 431, 452, 477, 509, 540, 577, 666, 774, 813, 856, 903, 966, 1044, 1416, 1555, 2716, 3622],
  // 5人
  [0, 251, 304, 412, 457, 479, 503, 531, 564, 604, 681, 798, 838, 881, 930, 994, 1074, 1440, 1555, 2740, 3654],
  // 6人
  [0, 284, 343, 438, 483, 505, 527, 553, 589, 630, 697, 821, 862, 907, 957, 1022, 1104, 1464, 1555, 2764, 3685],
  // 7人以上
  [0, 317, 383, 463, 508, 529, 552, 578, 614, 657, 708, 845, 887, 933, 985, 1051, 1135, 1489, 1583, 2788, 3717],
];

/** 甲欄で引ける扶養親族等の数の上限（「7人以上」の列） */
export const MAX_DEPENDENTS = KOU_LOWER_BOUNDS.length - 1;

/** 乙欄の率（千分の1パーセント単位） */
export const OTSU_RATES_MILLI: readonly number[] = [10210, 20420, 30630, 38798, 45945];

/** 乙欄の各行の下限（以上・千円）。0行目は「224千円未満」 */
export const OTSU_LOWER_BOUNDS: readonly number[] = [0, 224, 295, 527, 1118];

/** 表の1行（画面に「どの行に当たったか」を出すため、範囲も一緒に返す） */
export interface RateRow {
  /** 率（千分の1パーセント単位） */
  rateMilli: number;
  /** 行の下限（以上・円）。0行目は 0 */
  from: number;
  /** 行の上限（未満・円）。最後の行は null（「◯千円以上」） */
  below: number | null;
}

function pick(rates: readonly number[], bounds: readonly number[], amount: number): RateRow {
  let i = 0;
  for (let k = 0; k < bounds.length; k++) {
    if (amount >= bounds[k] * 1000) i = k;
  }
  return {
    rateMilli: rates[i],
    from: bounds[i] * 1000,
    below: i + 1 < bounds.length ? bounds[i + 1] * 1000 : null,
  };
}

/**
 * 算出率の表の行を引く。
 * @param afterSocial 前月の社会保険料等控除後の給与等の金額（円）
 * @param dependents 扶養親族等の数（甲欄）。7以上は「7人以上」の列
 * @param otsu 扶養控除等申告書を出していない（乙欄）
 */
export function lookupRate(afterSocial: number, dependents: number, otsu: boolean): RateRow {
  if (otsu) return pick(OTSU_RATES_MILLI, OTSU_LOWER_BOUNDS, afterSocial);
  const d = Math.min(MAX_DEPENDENTS, Math.max(0, Math.floor(dependents)));
  return pick(KOU_RATES_MILLI, KOU_LOWER_BOUNDS[d], afterSocial);
}
