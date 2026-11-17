/**
 * BMI・適正体重 計算機のロジック（純関数のみ）。
 *
 * 仕様: docs/features/bmi-tekisei-taiju.md
 *
 * ## 数の持ち方（この計算機でいちばん大事な約束）
 *
 * 身長・体重は小数1桁で受け取り、**10倍した整数**（H＝身長cm×10、W＝体重kg×10）で持つ。
 * 境目の判定は浮動小数で割らず、整数どうしの掛け算で比べる：
 *
 *     BMI ≥ t  ⇔  W × 10⁶ ≥ (t × 10) × H²
 *
 * 浮動小数で 64 ÷ 1.6² を計算すると 1.6×1.6＝2.5600000000000005 のせいで 24.999… になり、
 * ちょうど BMI 25.0 の人が「普通体重」と出てしまう。整数なら最大でも 3×10⁹ 程度で
 * `Number` の整数の範囲（2⁵³）に収まり、誤差が出ない。
 *
 * 表示は**切り捨て**（四捨五入しない）。四捨五入だと 24.95 が「25.0・普通体重」と
 * 表示と判定が食い違う。切り捨てなら表示値が境目を越えないので、表示と判定がいつも一致する。
 */

// ─────────────────────────────────────────────
// 【データ更新箇所】
// ─────────────────────────────────────────────

/** 一次情報を最後に突き合わせた日 */
export const DATA_CHECKED_AT = '2026-11-10';

/** 入力の範囲（小数1桁） */
export const HEIGHT_MIN_CM = 100;
export const HEIGHT_MAX_CM = 250;
export const WEIGHT_MIN_KG = 10;
export const WEIGHT_MAX_KG = 300;
export const AGE_MAX = 120;

/** 標準体重の BMI（日本肥満学会。20〜60歳の健診で合併症が最も少なかった点） */
export const STANDARD_BMI = 22;

/**
 * 日本肥満学会の肥満度分類（成人）。境目は BMI×10 の整数で持つ。
 *
 * 出典：日本肥満学会 編「肥満症診療ガイドライン 2022」ライフサイエンス出版、2022年
 * の「肥満度分類」の表。**書籍の頁番号は未記入**（2026-11-10 の実装時は書籍が手元に無く、
 * 区分の値は仕様書の表のまま。広く引用される区分だが、書籍そのものとの突き合わせは未了）。
 * 書籍で確かめたらここに頁を書くこと。
 * 低体重 ＜18.5 ≦ 普通体重 ＜25 ≦ 肥満(1度) ＜30 ≦ 肥満(2度) ＜35 ≦ 肥満(3度) ＜40 ≦ 肥満(4度)
 */
export const JASSO_CLASSES = [
  { id: 'underweight', label: '低体重', short: '低体重', fromTenths: 0 },
  { id: 'normal', label: '普通体重', short: '普通体重', fromTenths: 185 },
  { id: 'obese1', label: '肥満（1度）', short: '1度', fromTenths: 250 },
  { id: 'obese2', label: '肥満（2度）', short: '2度', fromTenths: 300 },
  { id: 'obese3', label: '肥満（3度）', short: '3度', fromTenths: 350 },
  { id: 'obese4', label: '肥満（4度）', short: '4度', fromTenths: 400 },
] as const;

export type JassoClassId = (typeof JASSO_CLASSES)[number]['id'];

/** 普通体重の幅（BMI 18.5 以上 25 未満）。×10 の整数 */
export const NORMAL_LOWER_TENTHS = 185;
export const NORMAL_UPPER_TENTHS = 250;

/**
 * 目標とする BMI の範囲（18歳以上）。
 *
 * 出典：厚生労働省「日本人の食事摂取基準（2025年版）」策定検討会報告書、
 * 「エネルギー」の章（https://www.mhlw.go.jp/content/10904750/001316461.pdf）
 * 表1「目標とする BMI の範囲（18 歳以上）」。2026-11-10 に本文で確認。
 * 18〜49歳 18.5〜24.9／50〜64歳 20.0〜24.9／65〜74歳 21.5〜24.9／75歳以上 21.5〜24.9。
 * 本文の注：男女共通。あくまでも参考として使用すべきである。
 *
 * 上限の「24.9」は小数1桁の表の書き方なので、判定では「25.0 未満」として扱う
 * （`upperTenths` は「未満」の境目）。次の改定は 2030年版の予定。
 */
export const TARGET_BMI_BANDS = [
  { minAge: 18, maxAge: 49, label: '18〜49歳', lowerTenths: 185, upperTenths: 250 },
  { minAge: 50, maxAge: 64, label: '50〜64歳', lowerTenths: 200, upperTenths: 250 },
  { minAge: 65, maxAge: 74, label: '65〜74歳', lowerTenths: 215, upperTenths: 250 },
  { minAge: 75, maxAge: AGE_MAX, label: '75歳以上', lowerTenths: 215, upperTenths: 250 },
] as const;

export type TargetBand = (typeof TARGET_BMI_BANDS)[number];

/** 学校健診の肥満度で判定する年齢（満年齢）。マニュアルの係数表の範囲どおり */
export const CHILD_MIN_AGE = 5;
export const CHILD_MAX_AGE = 17;

export type Sex = 'male' | 'female';

/**
 * 性別・年齢別・身長別標準体重の係数（身長別標準体重(kg) = a × 身長(cm) − b）。
 *
 * 出典：公益財団法人 日本学校保健会「児童生徒等の健康診断マニュアル（平成27年度改訂）」
 * （文部科学省スポーツ・青少年局学校健康教育課 監修、2015年）。
 * 突き合わせ：文部科学省「学校保健統計調査」の資料「肥満・痩身傾向児の算出方法について」
 * （https://www.mext.go.jp/content/20210728-mxt_chousa01-000013187_3.pdf）に同じ表が
 * 「出典：日本学校保健会『児童生徒の健康診断マニュアル（平成27年度改訂版）』」として
 * 男女 × 5〜17 歳の 26 行すべて載っており、2026-11-10 に全行一致を確認した。
 *
 * 値は小数3桁の表をそのまま写す（1000倍した整数で持つと誤差が出ないので、計算は整数で行う）。
 */
export const CHILD_COEFFICIENTS: Record<Sex, Record<number, { a: number; b: number }>> = {
  male: {
    5: { a: 0.386, b: 23.699 },
    6: { a: 0.461, b: 32.382 },
    7: { a: 0.513, b: 38.878 },
    8: { a: 0.592, b: 48.804 },
    9: { a: 0.687, b: 61.39 },
    10: { a: 0.752, b: 70.461 },
    11: { a: 0.782, b: 75.106 },
    12: { a: 0.783, b: 75.642 },
    13: { a: 0.815, b: 81.348 },
    14: { a: 0.832, b: 83.695 },
    15: { a: 0.766, b: 70.989 },
    16: { a: 0.656, b: 51.822 },
    17: { a: 0.672, b: 53.642 },
  },
  female: {
    5: { a: 0.377, b: 22.75 },
    6: { a: 0.458, b: 32.079 },
    7: { a: 0.508, b: 38.367 },
    8: { a: 0.561, b: 45.006 },
    9: { a: 0.652, b: 56.992 },
    10: { a: 0.73, b: 68.091 },
    11: { a: 0.803, b: 78.846 },
    12: { a: 0.796, b: 76.934 },
    13: { a: 0.655, b: 54.234 },
    14: { a: 0.594, b: 43.264 },
    15: { a: 0.56, b: 37.002 },
    16: { a: 0.578, b: 39.057 },
    17: { a: 0.598, b: 42.339 },
  },
};

/**
 * 学校健診の肥満度の判定（同マニュアル）。境目は肥満度(%)の整数。
 * +20%以上 軽度肥満／+30%以上 中等度肥満／+50%以上 高度肥満／
 * −20%以下 やせ／−30%以下 高度やせ／それ以外 ふつう
 */
export type ChildClassId = 'severeThin' | 'thin' | 'normal' | 'mildObese' | 'moderateObese' | 'severeObese';

export const CHILD_CLASS_LABELS: Record<ChildClassId, string> = {
  severeThin: '高度やせ',
  thin: 'やせ',
  normal: 'ふつう',
  mildObese: '軽度肥満',
  moderateObese: '中等度肥満',
  severeObese: '高度肥満',
};

/** 判定の対象外（0〜4歳）のときに出す文 */
export const INFANT_MESSAGE =
  '乳幼児は BMI・肥満度の判定の対象外です。母子健康手帳の発育曲線で確かめてください。';

// ─────────────────────────────────────────────
// 整数の小道具
// ─────────────────────────────────────────────

/** 正の整数どうしの切り捨て除算（浮動小数の割り算の丸めに頼らない） */
function floorDiv(n: number, d: number): number {
  const r = ((n % d) + d) % d;
  return (n - r) / d;
}

function ceilDiv(n: number, d: number): number {
  return -floorDiv(-n, d);
}

/** 0 に向けて切り捨てる除算（d は正） */
function truncDiv(n: number, d: number): number {
  return n >= 0 ? floorDiv(n, d) : -floorDiv(-n, d);
}

/** 小数1桁の入力を ×10 の整数にする。小数2桁目以降は四捨五入で落とす */
export function toTenths(value: number): number {
  return Math.round(value * 10);
}

/** ×10 の整数を '24.9' の形に（負の数も） */
export function formatTenths(tenths: number): string {
  const sign = tenths < 0 ? '−' : '';
  const abs = Math.abs(tenths);
  return `${sign}${Math.floor(abs / 10)}.${abs % 10}`;
}

// ─────────────────────────────────────────────
// BMI
// ─────────────────────────────────────────────

/**
 * 「BMI ≥ t」を整数で判定する。
 * @param h10 身長(cm)×10
 * @param w10 体重(kg)×10
 * @param tTenths 境目の BMI×10（18.5 なら 185）
 */
export function bmiAtLeast(h10: number, w10: number, tTenths: number): boolean {
  return w10 * 1_000_000 >= tTenths * h10 * h10;
}

/** 表示用の BMI×10（小数第2位以下を切り捨て） */
export function bmiTenths(h10: number, w10: number): number {
  return floorDiv(w10 * 1_000_000, h10 * h10);
}

/** 日本肥満学会の判定（整数で比べる） */
export function jassoClass(h10: number, w10: number): (typeof JASSO_CLASSES)[number] {
  let found: (typeof JASSO_CLASSES)[number] = JASSO_CLASSES[0];
  for (const c of JASSO_CLASSES) {
    if (bmiAtLeast(h10, w10, c.fromTenths)) found = c;
  }
  return found;
}

/** 表示した BMI×10 から区分を引く（表示と判定が一致することのテスト用） */
export function jassoClassOfTenths(tenths: number): (typeof JASSO_CLASSES)[number] {
  let found: (typeof JASSO_CLASSES)[number] = JASSO_CLASSES[0];
  for (const c of JASSO_CLASSES) {
    if (tenths >= c.fromTenths) found = c;
  }
  return found;
}

/** 標準体重(kg)×10 ＝ 身長(m)² × 22。小数1桁に四捨五入（境目の判定には使わない） */
export function standardWeightTenths(h10: number, bmi = STANDARD_BMI): number {
  // 身長(m)² × bmi × 10 = h10² × bmi / 10⁵。四捨五入は (2n + d) / 2d の切り捨てで整数のまま行う
  return floorDiv(2 * h10 * h10 * bmi + 100_000, 200_000);
}

/** 「BMI ≥ t」になる最小の体重×10（＝表示した値が必ず幅に入るよう切り上げ） */
export function minWeightTenthsForBmi(h10: number, tTenths: number): number {
  return ceilDiv(tTenths * h10 * h10, 1_000_000);
}

/** 「BMI < t」に収まる最大の体重×10（＝ ceil(上端×10) − 1） */
export function maxWeightTenthsBelowBmi(h10: number, tTenths: number): number {
  return ceilDiv(tTenths * h10 * h10, 1_000_000) - 1;
}

export interface WeightRange {
  /** 下限の体重×10（この値ちょうどで幅に入る） */
  minTenths: number;
  /** 上限の体重×10（「◯kg まで」。この値ちょうどで幅に入る） */
  maxTenths: number;
}

/** 普通体重の幅（BMI 18.5 以上 25 未満）を、表示した値が必ず幅に入るよう内側に丸めて返す */
export function normalWeightRange(h10: number): WeightRange {
  return rangeForBmi(h10, NORMAL_LOWER_TENTHS, NORMAL_UPPER_TENTHS);
}

/** BMI が [lowerTenths, upperTenths) に入る体重の幅（内側に丸める） */
export function rangeForBmi(h10: number, lowerTenths: number, upperTenths: number): WeightRange {
  return {
    minTenths: minWeightTenthsForBmi(h10, lowerTenths),
    maxTenths: maxWeightTenthsBelowBmi(h10, upperTenths),
  };
}

/**
 * 幅までの体重の差×10。幅の中なら 0。
 * 正なら「あと ◯kg 多いと幅に入る」、負なら「◯kg 少ないと幅に入る」。
 * 切り上げた値なので、その分だけ変えれば整数の判定で必ず幅に入る。
 */
export function distanceToRangeTenths(w10: number, range: WeightRange): number {
  if (w10 < range.minTenths) return range.minTenths - w10;
  if (w10 > range.maxTenths) return range.maxTenths - w10;
  return 0;
}

// ─────────────────────────────────────────────
// 年代別の目標 BMI
// ─────────────────────────────────────────────

export function targetBandFor(age: number): TargetBand | null {
  return TARGET_BMI_BANDS.find((b) => age >= b.minAge && age <= b.maxAge) ?? null;
}

/** 目標範囲の表示（'21.5〜24.9'）。上限は「未満」の境目から 0.1 引いた表の書き方 */
export function targetBandRangeLabel(band: TargetBand): string {
  return `${formatTenths(band.lowerTenths)}〜${formatTenths(band.upperTenths - 1)}`;
}

export type TargetStatus = 'below' | 'within' | 'above';

export function targetStatus(h10: number, w10: number, band: TargetBand): TargetStatus {
  if (!bmiAtLeast(h10, w10, band.lowerTenths)) return 'below';
  if (bmiAtLeast(h10, w10, band.upperTenths)) return 'above';
  return 'within';
}

// ─────────────────────────────────────────────
// 子ども（5〜17歳）の肥満度
// ─────────────────────────────────────────────

export interface ChildResult {
  /** 身長別標準体重(kg)×10（四捨五入。表示用） */
  standardWeightTenths: number;
  /** 肥満度(%)×10（0 に向けて切り捨て。表示と判定が一致するように） */
  degreeTenths: number;
  classId: ChildClassId;
  label: string;
}

/**
 * 学校健診の肥満度。
 * 係数を1000倍した整数で計算する（a×身長 − b を 1/10000kg 単位で持つ）。
 * 標準体重が 0 以下になる身長（係数表が想定していない小ささ）は null。
 */
export function childObesity(h10: number, w10: number, age: number, sex: Sex): ChildResult | null {
  const coef = CHILD_COEFFICIENTS[sex][age];
  if (!coef) return null;
  const a1000 = Math.round(coef.a * 1000);
  const b1000 = Math.round(coef.b * 1000);
  // a × 身長(cm) − b を 1/10000 kg 単位で：a1000 × h10 − b1000 × 10
  const std = a1000 * h10 - b1000 * 10;
  if (std <= 0) return null;
  const actual = w10 * 1000; // 1/10000 kg 単位
  const diff = actual - std;
  // 肥満度 ≥ p% ⇔ diff × 100 ≥ p × std
  const atLeast = (p: number) => diff * 100 >= p * std;
  const atMost = (p: number) => diff * 100 <= p * std;
  let classId: ChildClassId = 'normal';
  if (atLeast(50)) classId = 'severeObese';
  else if (atLeast(30)) classId = 'moderateObese';
  else if (atLeast(20)) classId = 'mildObese';
  else if (atMost(-30)) classId = 'severeThin';
  else if (atMost(-20)) classId = 'thin';
  return {
    standardWeightTenths: floorDiv(2 * std + 1000, 2000),
    degreeTenths: truncDiv(diff * 1000, std),
    classId,
    label: CHILD_CLASS_LABELS[classId],
  };
}

// ─────────────────────────────────────────────
// まとめ
// ─────────────────────────────────────────────

export interface BmiInput {
  heightCm: number;
  weightKg: number;
  /** 満年齢。未入力なら null（大人の判定のみ） */
  age: number | null;
  /** 5〜17歳のときだけ使う */
  sex: Sex | null;
}

export interface AdultResult {
  kind: 'adult';
  h10: number;
  w10: number;
  bmiTenths: number;
  jasso: (typeof JASSO_CLASSES)[number];
  standardWeightTenths: number;
  normalRange: WeightRange;
  /** 普通体重の幅までの差×10（幅の中なら 0） */
  toNormalTenths: number;
  /** 年齢を入れたときだけ */
  target: { band: TargetBand; status: TargetStatus } | null;
}

export type BmiResult =
  | AdultResult
  | ({ kind: 'child'; h10: number; w10: number; age: number; sex: Sex } & ChildResult)
  | { kind: 'needSex'; age: number }
  | { kind: 'infant'; message: string }
  | { kind: 'invalid' };

export function isValidHeight(cm: number): boolean {
  return Number.isFinite(cm) && cm >= HEIGHT_MIN_CM && cm <= HEIGHT_MAX_CM;
}

export function isValidWeight(kg: number): boolean {
  return Number.isFinite(kg) && kg >= WEIGHT_MIN_KG && kg <= WEIGHT_MAX_KG;
}

export function isValidAge(age: number): boolean {
  return Number.isInteger(age) && age >= 0 && age <= AGE_MAX;
}

/** 入力から判定までをまとめて出す */
export function calcBmi(input: BmiInput): BmiResult {
  const { heightCm, weightKg, age, sex } = input;
  if (age !== null && !isValidAge(age)) return { kind: 'invalid' };
  if (age !== null && age < CHILD_MIN_AGE) return { kind: 'infant', message: INFANT_MESSAGE };
  if (!isValidHeight(heightCm) || !isValidWeight(weightKg)) return { kind: 'invalid' };
  const h10 = toTenths(heightCm);
  const w10 = toTenths(weightKg);

  if (age !== null && age <= CHILD_MAX_AGE) {
    if (!sex) return { kind: 'needSex', age };
    const child = childObesity(h10, w10, age, sex);
    if (!child) return { kind: 'invalid' };
    return { kind: 'child', h10, w10, age, sex, ...child };
  }

  const normalRange = normalWeightRange(h10);
  const band = age !== null ? targetBandFor(age) : null;
  return {
    kind: 'adult',
    h10,
    w10,
    bmiTenths: bmiTenths(h10, w10),
    jasso: jassoClass(h10, w10),
    standardWeightTenths: standardWeightTenths(h10),
    normalRange,
    toNormalTenths: distanceToRangeTenths(w10, normalRange),
    target: band ? { band, status: targetStatus(h10, w10, band) } : null,
  };
}

/**
 * 年齢を入れたときの「両方を言葉で書く」1文。
 * 例：「日本肥満学会の判定は普通体重ですが、65〜74歳の目標（21.5〜24.9）より低めです」
 */
export function targetSentence(r: AdultResult): string | null {
  if (!r.target) return null;
  const { band, status } = r.target;
  const range = `${band.label}の目標（${targetBandRangeLabel(band)}）`;
  const head = `日本肥満学会の判定は${r.jasso.label}`;
  if (status === 'within') {
    return `${head}で、${range}の範囲にも入っています。`;
  }
  const dir = status === 'below' ? '低め' : '高め';
  // 学会の判定と目標の向きが同じなら「で」、食い違うなら「ですが」
  const agrees =
    (status === 'below' && r.jasso.id === 'underweight') ||
    (status === 'above' && r.jasso.id !== 'underweight' && r.jasso.id !== 'normal');
  return `${head}${agrees ? 'で' : 'ですが'}、${range}より${dir}です。`;
}

/** 早見表の1行（本文の SSR 用） */
export interface QuickRow {
  heightCm: number;
  /** BMI 18.5 になる体重（切り上げ。普通体重の下限） */
  lowerTenths: number;
  /** BMI 22 の体重（標準体重。四捨五入） */
  standardTenths: number;
  /** BMI 25 未満に収まる最大の体重（普通体重の上限） */
  upperTenths: number;
}

export function quickTableRow(heightCm: number): QuickRow {
  const h10 = toTenths(heightCm);
  const range = normalWeightRange(h10);
  return {
    heightCm,
    lowerTenths: range.minTenths,
    standardTenths: standardWeightTenths(h10),
    upperTenths: range.maxTenths,
  };
}
