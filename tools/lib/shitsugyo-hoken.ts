/**
 * 失業保険（雇用保険の基本手当）計算ロジック
 *
 * 仕様: docs/features/shitsugyo-hoken-kihon-teate.md
 *
 * 「退職したらいくら・いつからもらえるか」を出す。中身は4つに分かれる。
 *
 * 1. 賃金日額 = 退職前6ヶ月の賃金総額 ÷ 180（年齢区分ごとの上限・下限を当てる）
 * 2. 基本手当日額 = 賃金日額に法定の算式（80%→50%／60〜64歳は80%→45%）を当てた額
 * 3. 所定給付日数 = 離職理由 × 年齢 × 被保険者であった期間 の法定テーブル
 * 4. 待期7日と給付制限を踏まえた「いつから支給対象になるか」のスケジュール
 *
 * ■ よくある誤解（このツールで正したいこと）
 * - **自己都合の給付制限は「2ヶ月」ではない。** 令和7年4月1日以降の離職は
 *   原則1ヶ月。古い「2ヶ月（または3ヶ月）」のまま書かれた解説がまだ多い
 * - 教育訓練等を受けた（受けている）場合は給付制限そのものが解除される。
 *   ただし**重責解雇はこの取扱いの対象外**
 * - 計算に使うのは手取りではなく**額面**。賞与（3ヶ月を超える期間ごとに
 *   支払われる賃金）は賃金総額に含めない
 *
 * ■ 一次情報（2026-08-19 取得）
 * - 厚生労働省「雇用保険の基本手当日額の変更（令和8年8月1日から）」
 *   https://www.mhlw.go.jp/stf/newpage_74837.html
 * - 厚生労働省「令和8年8月1日からの基本手当日額等の適用について」
 *   https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000160564_00050.html
 *   → 参考1「基本手当日額の計算式及び金額(令和8年8月1日～)」
 *     https://www.mhlw.go.jp/content/001726936.pdf
 *     （賃金日額の下限3,203円・逓減の屈折点5,480円/13,490円/12,120円・
 *       年齢区分ごとの上限額・端数は1円未満切り捨て）
 *   → リーフレット「雇用保険の基本手当日額が変更になります」
 *     https://www.mhlw.go.jp/content/001726934.pdf
 *     （賃金日額の上限額 14,900 / 16,540 / 18,220 / 17,400 円）
 * - ハローワークインターネットサービス「基本手当の所定給付日数」
 *   https://www.hellowork.mhlw.go.jp/insurance/insurance_benefitdays.html
 * - 厚生労働省「令和7年4月以降に教育訓練等を受ける場合、給付制限が解除され、
 *   基本手当を受給できます」 https://www.mhlw.go.jp/content/001441564.pdf
 *   （注1: 令和7年4月1日以降の離職は原則1ヶ月／5年内に2回以上の自己都合離職と
 *     重責解雇は3ヶ月。注2: 重責解雇は解除の対象外）
 *
 * ■ このツールで計算しないもの（仕様書の「やらないこと」）
 * - 受給資格の有無の判定（被保険者期間12ヶ月・6ヶ月要件はハローワークの決定事項）
 * - 再就職手当・教育訓練給付・高年齢求職者給付金などの他の給付
 * - 住民税・国民健康保険・年金の減免
 *
 * 【データ更新箇所】賃金日額・基本手当日額の上限下限と給付率の屈折点は
 * **毎年8月1日に改定される**（毎月勤労統計の平均定期給与額の増減による）。
 * 官報公布後に厚労省が出す「基本手当日額の計算式及び金額」のPDFを正とし、
 * BENEFIT_RATE_RULES・WAGE_DAILY_MIN・TAPER_FROM を入れ替えて
 * RATE_TABLE_LABEL / RATE_TABLE_EFFECTIVE_FROM / DATA_CHECKED_AT を直す。
 * 所定給付日数のテーブルは法律（雇用保険法22条・23条）なので毎年は変わらない。
 */

import { addDays, addMonths, daysBetween, formatDate, type DateParts } from './date-parts';

// ------------------------------------------------------------ データの版

/** このファイルの数値を一次情報と突き合わせた日 'YYYY-MM-DD' */
export const DATA_CHECKED_AT = '2026-08-19';

/** いま持っている賃金日額・基本手当日額の表が適用される最初の日 */
export const RATE_TABLE_EFFECTIVE_FROM = '2026-08-01';

/** 表の見出しに使う適用期間の名前。「現行」と書かない（静的書き出しのため） */
export const RATE_TABLE_LABEL = '令和8年8月1日〜';

// -------------------------------------------------- 賃金日額と基本手当日額

/**
 * 賃金日額の下限額（円・全年齢共通）。
 * これを下回る賃金日額はこの額まで引き上げて計算する。
 */
export const WAGE_DAILY_MIN = 3_203;

/**
 * 基本手当日額の下限額（円・全年齢共通）。
 * `WAGE_DAILY_MIN × 80%` を1円未満切り捨てした額と一致する（3,203 × 0.8 = 2,562.4）。
 * 一次情報にも額そのものが載っているので、導出せず定数として持ちテストで突き合わせる。
 */
export const BENEFIT_DAILY_MIN = 2_562;

/** 給付率が80%から逓減しはじめる賃金日額（円・全年齢共通） */
export const TAPER_FROM = 5_480;

/** 賃金日額を出すときの割る数（退職前6ヶ月 = 180日） */
export const WAGE_DAILY_DIVISOR = 180;

/** 賃金日額・基本手当日額の年齢区分 */
export type BenefitAgeBand = 'under30' | 'age30to44' | 'age45to59' | 'age60to64';

/** 年齢区分ごとの基本手当日額の算式 */
export interface BenefitRateRule {
  band: BenefitAgeBand;
  /** 画面に出す区分名 */
  label: string;
  /** この区分に入る年齢の下限（含む） */
  minAge: number;
  /** この区分に入る年齢の上限（含む） */
  maxAge: number;
  /** 賃金日額の上限額（円） */
  wageDailyMax: number;
  /** 基本手当日額の上限額（円） */
  benefitDailyMax: number;
  /** 逓減帯の上端の賃金日額（円）。ここを超えると定率になる */
  taperTo: number;
  /** 逓減の幅。80% から何ポイント下げきるか（0.3 なら 80%→50%） */
  taperDrop: number;
  /** 逓減帯より上の定率（0.5 / 0.45） */
  flatRate: number;
  /**
   * 60〜64歳だけが持つもう一つの算式（`y = slope × w + intercept`）。
   * 逓減帯では**この式と逓減式の低いほうの額**が基本手当日額になる。
   * intercept は一次情報では `12,120 × 0.4` と書かれている（= 4,848円）。
   */
  altFormula?: { slope: number; intercept: number };
}

/**
 * 年齢区分ごとの算式。**厚労省「基本手当日額の計算式及び金額(令和8年8月1日～)」
 * の表をそのまま写したもの。**
 *
 * 【データ更新箇所】毎年8月1日に改定される。
 */
export const BENEFIT_RATE_RULES: readonly BenefitRateRule[] = [
  {
    band: 'under30',
    label: '30歳未満',
    minAge: 0,
    maxAge: 29,
    wageDailyMax: 14_900,
    benefitDailyMax: 7_450,
    taperTo: 13_490,
    taperDrop: 0.3,
    flatRate: 0.5,
  },
  {
    band: 'age30to44',
    label: '30歳以上45歳未満',
    minAge: 30,
    maxAge: 44,
    wageDailyMax: 16_540,
    benefitDailyMax: 8_270,
    taperTo: 13_490,
    taperDrop: 0.3,
    flatRate: 0.5,
  },
  {
    band: 'age45to59',
    label: '45歳以上60歳未満',
    minAge: 45,
    maxAge: 59,
    wageDailyMax: 18_220,
    benefitDailyMax: 9_110,
    taperTo: 13_490,
    taperDrop: 0.3,
    flatRate: 0.5,
  },
  {
    band: 'age60to64',
    label: '60歳以上65歳未満',
    minAge: 60,
    maxAge: 64,
    wageDailyMax: 17_400,
    benefitDailyMax: 7_830,
    taperTo: 12_120,
    taperDrop: 0.35,
    flatRate: 0.45,
    // 12,120 × 0.4。一次情報の書き方に合わせて計算結果ではなく式の意味を残す
    altFormula: { slope: 0.05, intercept: 12_120 * 0.4 },
  },
];

/** 画面で受け付ける年齢の下限（中学卒業＝働き始められる年齢） */
export const AGE_MIN = 15;

/**
 * 画面で受け付ける年齢の上限。
 * 65歳以上の離職は基本手当ではなく高年齢求職者給付金（一時金）になるため、
 * このツールの対象外（`KihonTeateResult.age65OrOver` で注意を出す）。
 */
export const AGE_MAX = 64;

/** 離職時の年齢から算式を引く。65歳以上は上限区分（60〜64歳）として扱う */
export function benefitRuleFor(age: number): BenefitRateRule {
  const a = Math.min(Math.max(Math.floor(age), 0), AGE_MAX);
  return BENEFIT_RATE_RULES.find((r) => a >= r.minAge && a <= r.maxAge) ?? BENEFIT_RATE_RULES[0];
}

/** 賃金日額に上限・下限を当てた結果 */
export interface WageDailyResult {
  /** 賃金総額 ÷ 180 を1円未満切り捨てした額（上限下限を当てる前） */
  raw: number;
  /** 上限・下限を当てたあとの賃金日額（円） */
  value: number;
  /** 上限に当たったか・下限に当たったか */
  cap: 'min' | 'max' | null;
}

/**
 * 退職前6ヶ月の賃金総額から賃金日額を出す。
 *
 * 賃金総額は**額面**で、賞与（3ヶ月を超える期間ごとに支払われる賃金）を含めない。
 * 1円未満は切り捨て（基本手当日額の端数処理に合わせている）。
 */
export function wageDailyFrom(totalWage6m: number, rule: BenefitRateRule): WageDailyResult {
  const raw = Math.floor(Math.max(0, totalWage6m) / WAGE_DAILY_DIVISOR);
  if (raw > rule.wageDailyMax) return { raw, value: rule.wageDailyMax, cap: 'max' };
  if (raw < WAGE_DAILY_MIN) return { raw, value: WAGE_DAILY_MIN, cap: 'min' };
  return { raw, value: raw, cap: null };
}

/**
 * 賃金日額から基本手当日額を出す。**法定の算式をそのまま実装している。**
 *
 * ```
 *   w < 5,480円          y = 0.8w
 *   5,480円 ≦ w ≦ 上端   y = 0.8w − drop{(w − 5,480)/(上端 − 5,480)}w
 *                        （60〜64歳は y = 0.05w + 4,848 との低いほう）
 *   上端 < w ≦ 上限額     y = 定率 × w
 *   上限額 < w           y = 基本手当日額の上限額
 * ```
 *
 * 端数は1円未満切り捨て（一次情報の注記2）。
 * 上限額ちょうどの賃金日額に定率を掛けると基本手当日額の上限額に一致するので、
 * 上限を超える賃金日額は「上限額まで切り下げてから算式に通す」だけで足りる。
 *
 * @param wageDaily 上限・下限を当てたあとの賃金日額（円）
 */
export function benefitDailyFrom(wageDaily: number, rule: BenefitRateRule): number {
  const w = Math.min(Math.max(wageDaily, WAGE_DAILY_MIN), rule.wageDailyMax);

  if (w < TAPER_FROM) return Math.floor(0.8 * w);

  if (w <= rule.taperTo) {
    const tapered = 0.8 * w - rule.taperDrop * ((w - TAPER_FROM) / (rule.taperTo - TAPER_FROM)) * w;
    const alt = rule.altFormula
      ? rule.altFormula.slope * w + rule.altFormula.intercept
      : Number.POSITIVE_INFINITY;
    return Math.floor(Math.min(tapered, alt));
  }

  return Math.floor(rule.flatRate * w);
}

// ------------------------------------------------------------ 所定給付日数

/**
 * 離職理由の区分。所定給付日数のテーブルはこの3つに分かれている。
 *
 * - `ippan` 一般の受給資格者（自己都合・定年・契約期間満了など）
 * - `tokutei` 特定受給資格者・一部の特定理由離職者（倒産・解雇など）
 * - `konnan` 就職困難者（障害者手帳をお持ちの方など）
 */
export type LeaveCategory = 'ippan' | 'tokutei' | 'konnan';

/** 被保険者であった期間（算定基礎期間）の区分 */
export type TenureBand = 'lt1' | 'y1to5' | 'y5to10' | 'y10to20' | 'y20plus';

/** 被保険者であった期間の区分（画面の選択肢の並び順もこれ） */
export const TENURE_BANDS: readonly { value: TenureBand; label: string }[] = [
  { value: 'lt1', label: '1年未満' },
  { value: 'y1to5', label: '1年以上5年未満' },
  { value: 'y5to10', label: '5年以上10年未満' },
  { value: 'y10to20', label: '10年以上20年未満' },
  { value: 'y20plus', label: '20年以上' },
];

/** 年数から被保険者であった期間の区分を求める */
export function tenureBandFor(years: number): TenureBand {
  if (years < 1) return 'lt1';
  if (years < 5) return 'y1to5';
  if (years < 10) return 'y5to10';
  if (years < 20) return 'y10to20';
  return 'y20plus';
}

/** 特定受給資格者のテーブルだけが使う年齢区分（30〜34と35〜44を分ける） */
export type TokuteiAgeBand = 'under30' | 'age30to34' | 'age35to44' | 'age45to59' | 'age60to64';

/** 特定受給資格者の年齢区分の表示名 */
export const TOKUTEI_AGE_LABELS: Record<TokuteiAgeBand, string> = {
  under30: '30歳未満',
  age30to34: '30歳以上35歳未満',
  age35to44: '35歳以上45歳未満',
  age45to59: '45歳以上60歳未満',
  age60to64: '60歳以上65歳未満',
};

/** 離職時の年齢から特定受給資格者のテーブルの行を選ぶ */
export function tokuteiAgeBandFor(age: number): TokuteiAgeBand {
  const a = Math.floor(age);
  if (a < 30) return 'under30';
  if (a < 35) return 'age30to34';
  if (a < 45) return 'age35to44';
  if (a < 60) return 'age45to59';
  return 'age60to64';
}

/**
 * 特定受給資格者・一部の特定理由離職者の所定給付日数。
 *
 * `null` は一次情報の「―」（その年齢では起こりえない組み合わせ）。
 * 30歳未満で被保険者であった期間20年以上にはならないため、表にも日数が無い。
 */
const TOKUTEI_DAYS: Record<TokuteiAgeBand, Record<TenureBand, number | null>> = {
  under30: { lt1: 90, y1to5: 90, y5to10: 120, y10to20: 180, y20plus: null },
  age30to34: { lt1: 90, y1to5: 120, y5to10: 180, y10to20: 210, y20plus: 240 },
  age35to44: { lt1: 90, y1to5: 150, y5to10: 180, y10to20: 240, y20plus: 270 },
  age45to59: { lt1: 90, y1to5: 180, y5to10: 240, y10to20: 270, y20plus: 330 },
  age60to64: { lt1: 90, y1to5: 150, y5to10: 180, y10to20: 210, y20plus: 240 },
};

/**
 * 一般の離職者（自己都合・定年など）の所定給付日数。**年齢では変わらない。**
 *
 * 一次情報の表では1年以上5年未満と5年以上10年未満が1つのます（90日）になっている。
 * 1年未満の90日には注記があり、特定理由離職者が被保険者期間6ヶ月で受給資格を
 * 得た場合のための欄（一般の自己都合離職では原則12ヶ月の被保険者期間が要る）。
 */
const IPPAN_DAYS: Record<TenureBand, number> = {
  lt1: 90,
  y1to5: 90,
  y5to10: 90,
  y10to20: 120,
  y20plus: 150,
};

/** 就職困難者の所定給付日数。1年未満は年齢に関係なく150日 */
const KONNAN_DAYS: Record<'under45' | 'age45to64', Record<TenureBand, number>> = {
  under45: { lt1: 150, y1to5: 300, y5to10: 300, y10to20: 300, y20plus: 300 },
  age45to64: { lt1: 150, y1to5: 360, y5to10: 360, y10to20: 360, y20plus: 360 },
};

/** 所定給付日数の内訳 */
export interface PrescribedDaysResult {
  /** 所定給付日数 */
  days: number;
  /** 実際にテーブルから引いた期間の区分（`adjusted` のとき入力とずれる） */
  usedTenure: TenureBand;
  /**
   * 一次情報の表で「―」になっている組み合わせだったので、
   * 日数のある区分まで下げて引いたか（30歳未満 × 20年以上など）
   */
  adjusted: boolean;
}

/**
 * 所定給付日数を法定テーブルから引く。
 *
 * 表に「―」しかない組み合わせ（30歳未満で被保険者であった期間20年以上など）は
 * 実在しないが、画面からは選べてしまう。0日を返すと「1円ももらえない」と
 * 誤読されるので、日数のある区分まで下げて引き、`adjusted` で断る。
 */
export function prescribedDaysFor(input: {
  category: LeaveCategory;
  age: number;
  tenure: TenureBand;
}): PrescribedDaysResult {
  const order = TENURE_BANDS.map((b) => b.value);
  const index = order.indexOf(input.tenure);

  if (input.category === 'ippan') {
    return { days: IPPAN_DAYS[input.tenure], usedTenure: input.tenure, adjusted: false };
  }

  if (input.category === 'konnan') {
    const row = Math.floor(input.age) < 45 ? KONNAN_DAYS.under45 : KONNAN_DAYS.age45to64;
    return { days: row[input.tenure], usedTenure: input.tenure, adjusted: false };
  }

  const row = TOKUTEI_DAYS[tokuteiAgeBandFor(input.age)];
  for (let i = index; i >= 0; i -= 1) {
    const days = row[order[i]];
    if (days !== null) return { days, usedTenure: order[i], adjusted: i !== index };
  }
  // 全部 null になる行は無いのでここには来ない（型を満たすための保険）
  return { days: 0, usedTenure: input.tenure, adjusted: true };
}

// -------------------------------------------------------- 待期と給付制限

/** 待期期間（受給資格決定日を1日目として数える日数） */
export const WAITING_DAYS = 7;

/** 離職理由（給付制限の判定に使う区分） */
export type LeaveReason =
  /** 倒産・解雇・雇止め・正当な理由のある自己都合など。給付制限なし */
  | 'company'
  /** 正当な理由がない自己都合退職 */
  | 'self'
  /** 自己の責めに帰すべき重大な理由による解雇（重責解雇） */
  | 'grave';

/**
 * 自己都合退職の給付制限が原則1ヶ月になった離職日の境目。
 * これより前の離職は原則2ヶ月（改正前）。
 */
export const RESTRICTION_SHORTENED_FROM = '2025-04-01';

/** 令和7年4月1日以降の離職の、自己都合退職の原則の給付制限（ヶ月） */
export const RESTRICTION_MONTHS_DEFAULT = 1;

/** 令和7年3月31日以前の離職の、自己都合退職の原則の給付制限（ヶ月） */
export const RESTRICTION_MONTHS_BEFORE_REFORM = 2;

/** 5年内に自己都合離職を繰り返した場合・重責解雇の給付制限（ヶ月） */
export const RESTRICTION_MONTHS_LONG = 3;

/**
 * 給付制限が3ヶ月になる、過去5年間の自己都合離職の回数のしきい値。
 *
 * 一次情報は「退職日から遡って5年間のうちに**2回以上**正当な理由なく
 * 自己都合退職し受給資格決定を受けた場合」。今回の離職は数に入らないので、
 * 「今回を含めて3回目以降」と説明されることもある。
 */
export const RESTRICTION_REPEAT_THRESHOLD = 2;

/** 給付制限の判定結果 */
export interface RestrictionResult {
  /** 給付制限の月数（0なら待期のあと直ちに支給対象） */
  months: number;
  kind:
    /** 会社都合など。給付制限そのものが無い */
    | 'none'
    /** 自己都合の原則（令和7年4月1日以降の離職は1ヶ月） */
    | 'default'
    /** 令和7年3月31日以前の離職の原則（2ヶ月） */
    | 'legacy'
    /** 5年内に2回以上の自己都合離職（3ヶ月） */
    | 'repeat'
    /** 重責解雇（3ヶ月） */
    | 'grave'
    /** 教育訓練等で解除された */
    | 'released';
  /** 画面にそのまま出せる説明 */
  text: string;
  /** 教育訓練等を受ければ解除できる状態か（まだ受けていない場合に案内する） */
  releasableByTraining: boolean;
}

/** 給付制限の判定に必要な入力 */
export interface RestrictionInput {
  reason: LeaveReason;
  /**
   * 離職日から遡って5年間に、正当な理由なく自己都合退職して
   * 受給資格決定を受けた回数（**今回は含めない**）
   */
  pastSelfLeaves?: number;
  /**
   * 教育訓練等（令和7年4月1日以降に受講を開始したもの）を離職日前1年以内に
   * 受けた、または離職日以後に受けている
   */
  training?: boolean;
  /** 離職日 'YYYY-MM-DD'。省略すると改正後（令和7年4月1日以降）として扱う */
  leaveDate?: string;
}

/**
 * 給付制限の月数を求める。
 *
 * **教育訓練等による解除は重責解雇には効かない**（一次情報の注2）。
 * ここを一律で解除にすると、重責解雇の人に3ヶ月の空白を見せないまま
 * 「すぐもらえる」と表示してしまう。
 */
export function restrictionFor(input: RestrictionInput): RestrictionResult {
  if (input.reason === 'company') {
    return {
      months: 0,
      kind: 'none',
      text: '会社都合などの離職のため給付制限はありません。待期7日の満了後から支給対象になります。',
      releasableByTraining: false,
    };
  }

  if (input.reason === 'grave') {
    return {
      months: RESTRICTION_MONTHS_LONG,
      kind: 'grave',
      text: '重責解雇のため給付制限は3ヶ月です。重責解雇は、教育訓練等を受けても解除されません。',
      releasableByTraining: false,
    };
  }

  if (input.training === true) {
    return {
      months: 0,
      kind: 'released',
      text: '教育訓練等を受けた（受けている）ため給付制限が解除されます。待期7日の満了後から支給対象になります（ハローワークへの申し出が必要です）。',
      releasableByTraining: false,
    };
  }

  if ((input.pastSelfLeaves ?? 0) >= RESTRICTION_REPEAT_THRESHOLD) {
    return {
      months: RESTRICTION_MONTHS_LONG,
      kind: 'repeat',
      text: '離職日から遡って5年間に2回以上、正当な理由なく自己都合退職して受給資格決定を受けているため、給付制限は3ヶ月です。',
      releasableByTraining: true,
    };
  }

  const beforeReform =
    input.leaveDate !== undefined && input.leaveDate < RESTRICTION_SHORTENED_FROM;

  return beforeReform
    ? {
        months: RESTRICTION_MONTHS_BEFORE_REFORM,
        kind: 'legacy',
        text: '令和7年3月31日以前の離職のため、自己都合退職の給付制限は改正前の原則2ヶ月です。',
        releasableByTraining: true,
      }
    : {
        months: RESTRICTION_MONTHS_DEFAULT,
        kind: 'default',
        text: '令和7年4月1日以降の離職のため、自己都合退職の給付制限は原則1ヶ月です（それ以前は2ヶ月でした）。',
        releasableByTraining: true,
      };
}

// -------------------------------------------------------------- スケジュール

/** 受給期間（離職日の翌日から数える）の月数 */
export const ELIGIBILITY_MONTHS = 12;

/** 失業の認定を受ける間隔（日）。1回の振込のおおよその日数でもある */
export const CERTIFICATION_INTERVAL_DAYS = 28;

/** 申請からの流れ */
export interface Schedule {
  /** 受給資格決定日（ハローワークで求職の申込みをした日） */
  applyDate: DateParts;
  /** 待期の満了日（受給資格決定日を1日目として7日目） */
  waitingEndDate: DateParts;
  /** 給付制限の開始日（待期満了日の翌日）。給付制限が無ければ null */
  restrictionStartDate: DateParts | null;
  /** 給付制限の満了日。給付制限が無ければ null */
  restrictionEndDate: DateParts | null;
  /** 基本手当の支給対象になる最初の日 */
  benefitStartDate: DateParts;
  /** 所定給付日数を連続して受けた場合に使い切る日 */
  benefitEndDate: DateParts;
  /** 受給期間の満了日（離職日の翌日から1年） */
  eligibilityEndDate: DateParts;
  /** 所定給付日数を受給期間内に消化しきれるか */
  fitsInEligibility: boolean;
  /** 受給期間からはみ出す日数（0なら収まる） */
  overflowDays: number;
}

/**
 * 待期・給付制限・支給対象期間の日付を組み立てる。
 *
 * 待期は受給資格決定日を1日目として7日。給付制限はその翌日から起算し、
 * 応当日の前日に満了する（民法140条・143条と同じ数え方）。
 *
 * **受給期間は離職日の翌日から1年**で、給付制限が長いと所定給付日数を
 * 使い切る前に受給期間が終わることがある（`fitsInEligibility`）。
 * 「もらえるはずの日数」と「実際にもらえる日数」がずれる原因なので必ず出す。
 */
export function buildSchedule(input: {
  leaveDate: DateParts;
  applyDate: DateParts;
  restrictionMonths: number;
  prescribedDays: number;
}): Schedule {
  const { leaveDate, applyDate, restrictionMonths, prescribedDays } = input;

  const waitingEndDate = addDays(applyDate, WAITING_DAYS - 1);

  const hasRestriction = restrictionMonths > 0;
  const restrictionStartDate = hasRestriction ? addDays(waitingEndDate, 1) : null;
  const restrictionEndDate = restrictionStartDate
    ? addDays(addMonths(restrictionStartDate, restrictionMonths), -1)
    : null;

  const benefitStartDate = addDays(restrictionEndDate ?? waitingEndDate, 1);
  const benefitEndDate = addDays(benefitStartDate, Math.max(0, prescribedDays) - 1);

  // 受給期間は「離職日の翌日から1年」。翌日から数えて1年後の前日が満了日
  const eligibilityStart = addDays(leaveDate, 1);
  const eligibilityEndDate = addDays(addMonths(eligibilityStart, ELIGIBILITY_MONTHS), -1);

  const overflowDays = Math.max(0, daysBetween(eligibilityEndDate, benefitEndDate));

  return {
    applyDate,
    waitingEndDate,
    restrictionStartDate,
    restrictionEndDate,
    benefitStartDate,
    benefitEndDate,
    eligibilityEndDate,
    fitsInEligibility: overflowDays === 0,
    overflowDays,
  };
}

// ------------------------------------------------------------------ まとめ

/** 計算の入力 */
export interface KihonTeateInput {
  /** 退職前6ヶ月の賃金総額（円・額面。賞与は含めない） */
  totalWage6m: number;
  /** 離職時の年齢 */
  age: number;
  /** 被保険者であった期間（算定基礎期間）の区分 */
  tenure: TenureBand;
  /** 離職理由の区分（所定給付日数のテーブルを選ぶ） */
  category: LeaveCategory;
  /** 離職理由（給付制限の判定に使う） */
  reason: LeaveReason;
  /** 5年内に正当な理由なく自己都合退職して受給資格決定を受けた回数（今回を除く） */
  pastSelfLeaves?: number;
  /** 教育訓練等を受けた（受けている） */
  training?: boolean;
  /** 離職日 'YYYY-MM-DD'。渡すとスケジュールを組み立てる */
  leaveDate?: DateParts;
  /** 受給資格決定日 'YYYY-MM-DD'。省略すると離職日の2週間後として扱う */
  applyDate?: DateParts;
}

/** 計算の結果 */
export interface KihonTeateResult {
  /** 使った年齢区分の算式 */
  rule: BenefitRateRule;
  /** 賃金日額（上限・下限の適用前後） */
  wage: WageDailyResult;
  /** 基本手当日額（円・1日あたり） */
  benefitDaily: number;
  /** 基本手当日額が上限額に張り付いているか */
  atBenefitMax: boolean;
  /** 基本手当日額が下限額に張り付いているか */
  atBenefitMin: boolean;
  /**
   * 実際に適用された給付率（基本手当日額 ÷ 上限下限適用後の賃金日額）。
   * 上限に当たった人は0.5を大きく下回るので、率だけを見せると誤解される
   */
  effectiveRate: number;
  /** 所定給付日数 */
  prescribed: PrescribedDaysResult;
  /** 総支給額の目安（基本手当日額 × 所定給付日数） */
  total: number;
  /** 1回の認定（28日分）あたりの目安。振込1回分のイメージ */
  perCertification: number;
  /** 給付制限 */
  restriction: RestrictionResult;
  /** 申請からの流れ。離職日が渡されなかったときは null */
  schedule: Schedule | null;
  /** 65歳以上の離職（基本手当ではなく高年齢求職者給付金になる） */
  age65OrOver: boolean;
  /**
   * 一般の離職者で被保険者であった期間が1年未満。
   * 自己都合では原則、離職前2年間に被保険者期間12ヶ月以上が必要で、
   * この欄は特定理由離職者（6ヶ月で足りる）のためのもの
   */
  eligibilityCaution: boolean;
}

/** 受給資格決定日を省略したときに置く、離職日からの日数（手続きの目安） */
export const DEFAULT_APPLY_AFTER_DAYS = 14;

/**
 * 失業保険（基本手当）の日額・所定給付日数・総額とスケジュールを出す。
 *
 * 受給資格の有無は判定しない（ハローワークの決定事項）。
 * 「もらえる前提でいくらか」を出す道具として使う。
 */
export function calcKihonTeate(input: KihonTeateInput): KihonTeateResult {
  const age = Math.floor(input.age);
  const rule = benefitRuleFor(age);
  const wage = wageDailyFrom(input.totalWage6m, rule);
  const benefitDaily = benefitDailyFrom(wage.value, rule);
  const prescribed = prescribedDaysFor({ category: input.category, age, tenure: input.tenure });

  const restriction = restrictionFor({
    reason: input.reason,
    pastSelfLeaves: input.pastSelfLeaves,
    training: input.training,
    leaveDate: input.leaveDate ? formatDate(input.leaveDate) : undefined,
  });

  const schedule = input.leaveDate
    ? buildSchedule({
        leaveDate: input.leaveDate,
        applyDate: input.applyDate ?? addDays(input.leaveDate, DEFAULT_APPLY_AFTER_DAYS),
        restrictionMonths: restriction.months,
        prescribedDays: prescribed.days,
      })
    : null;

  return {
    rule,
    wage,
    benefitDaily,
    atBenefitMax: benefitDaily >= rule.benefitDailyMax,
    atBenefitMin: benefitDaily <= BENEFIT_DAILY_MIN,
    effectiveRate: wage.value > 0 ? benefitDaily / wage.value : 0,
    prescribed,
    total: benefitDaily * prescribed.days,
    perCertification: benefitDaily * CERTIFICATION_INTERVAL_DAYS,
    restriction,
    schedule,
    age65OrOver: age > AGE_MAX,
    eligibilityCaution: input.category === 'ippan' && input.tenure === 'lt1',
  };
}
