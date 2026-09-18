/**
 * 残業代（割増賃金）計算ロジック
 *
 * 仕様: docs/features/zangyodai-keisan.md
 *
 * 一次情報:
 * - 労働基準法 37条1項（時間外・休日の割増賃金）・同項ただし書（月60時間超は5割以上）
 * - 労働基準法 37条4項（深夜は2割5分以上）・37条5項（算定基礎から除外できる賃金）
 * - 労働基準法施行規則 19条1項4号（月給制の1時間あたりの賃金＝月給÷1か月平均所定労働時間）
 * - 労働基準法施行規則 20条（深夜に及ぶ時間外は5割以上・うち月60時間超は7割5分以上、
 *   深夜に及ぶ休日労働は6割以上）
 * - 労働基準法施行規則 21条（除外できる手当の限定列挙。7つ）
 * - 労働基準法第三十七条第一項の時間外及び休日の割増賃金に係る率の最低限度を定める政令
 *   （平成6年政令第5号。時間外2割5分・休日3割5分）
 * - 昭和63年3月14日 基発第150号（1か月の時間数・金額の端数処理の簡便法）
 * - 厚生労働省・東京労働局「しっかりマスター 労働基準法 割増賃金編」
 *   https://jsite.mhlw.go.jp/tokyo-roudoukyoku/content/contents/000501860.pdf
 *   （**このPDFはテキスト層を持たない画像PDFで、機械的には読めていない**。
 *   率と条番号は下の e-Gov の条文本文で確認した）
 *
 * 条文は e-Gov 法令API（2026-09-18 取得）で1行ずつ確認した:
 * 37条1項の「二割五分以上五割以下の範囲内で政令で定める率」とただし書の「六十時間を超えた
 * ……五割以上」、37条4項の「午後十時から午前五時……二割五分以上」、37条5項の
 * 「家族手当、通勤手当その他厚生労働省令で定める賃金は算入しない」、施行規則19条1項4号の
 * 「月によつて定められた賃金……一年間における一月平均所定労働時間数で除した金額」、
 * 施行規則20条の5割／7割5分／6割、施行規則21条の5号（別居・子女教育・住宅の各手当、
 * 臨時に支払われた賃金、1か月を超える期間ごとに支払われる賃金）、政令の「二割五分」「三割五分」、
 * 115条の5年と143条3項の「当分の間……三年間」。
 * **月60時間超の中小企業への猶予（旧138条）は条文から削除済み**（2023年4月1日から適用）。
 *
 * 【データ更新箇所】割増賃金令・労基法37条が改正されたら PREMIUM_RATES と
 * MONTHLY_OVERTIME_THRESHOLD を直す。率はすべて「法定の最低限度」で、
 * 就業規則がこれを上回る場合はそちらが優先する（このツールは最低限度だけを出す）。
 *
 * 対象は**月給制と時給制だけ**。日給制・週給制・年俸制・出来高払（歩合給）は
 * 施行規則19条1項の号が別で、とくに年俸制は賞与相当分も算定基礎に入るため、
 * 月給制の式を流用すると単価が過小になる。ここでは扱わない。
 */

import { checkWage, prefectureByCode, type WageCheck } from '@/lib/saitei-chingin';

/** 賃金の形態。日給制・年俸制・歩合給は対象外（施行規則19条の号が別） */
export type WageType = 'monthly' | 'hourly';

/**
 * 端数処理の方式。
 *
 * - `strict`（法令どおり）: 丸めない。lib は小数のまま返し、表示側で切り上げる
 * - `simplified`（通達の簡便法）: 基発150号が認めている(1)〜(3)を順に当てる
 */
export type RoundingMode = 'strict' | 'simplified';

/** 1日の所定労働時間の既定値（法定労働時間と同じ8時間） */
export const DEFAULT_DAILY_HOURS = 8;

/** 年間所定労働日数の既定値（年間休日120日の会社の目安） */
export const DEFAULT_ANNUAL_WORK_DAYS = 245;

/** 月60時間を超える時間外労働は5割以上になる（2023年4月1日から中小企業も対象） */
export const MONTHLY_OVERTIME_THRESHOLD = 60;

/**
 * 割増率（法定の最低限度）。
 *
 * 深夜（22時〜5時）は**他の率に +0.25 が乗るだけ**なので、
 * 「深夜の加算」を独立した1項目として持っている。
 * こうすると時間外（1.25 / 1.50）・法定休日（1.35）のどちらと重なっても
 * 同じ式で足せるうえ、月60時間の枠に深夜分をどう割り当てるかという
 * （入力からは決まらない）問題が金額に影響しなくなる。
 *
 * - 時間外＋深夜 = 1.25 + 0.25 = 1.50（施行規則20条1項「五割以上」）
 * - 60時間超＋深夜 = 1.50 + 0.25 = 1.75（同項かっこ書「七割五分以上」）
 * - 法定休日＋深夜 = 1.35 + 0.25 = 1.60（同条2項「六割以上」）
 */
export const PREMIUM_RATES = {
  /** 法定内残業（所定〜8時間）。割増は不要で1.0のまま払う */
  withinStatutory: 1.0,
  /** 時間外労働（法定労働時間を超えた分）のうち月60時間まで */
  overtime: 1.25,
  /** 時間外労働のうち月60時間を超えた分 */
  overtimeOver60: 1.5,
  /**
   * 法定休日労働。**8時間を超えても1.35のまま**（休日労働に「時間外」の概念はなく、
   * 1.25 を重ねない）。月60時間の算定にも含めない。
   * 政令が休日労働の率を「三割五分」とだけ定め、施行規則20条2項も深夜と重なる場合の
   * 「六割以上」しか置いていないことが根拠
   */
  holiday: 1.35,
  /** 深夜（22時〜5時）の加算。所定労働時間内の深夜はこれだけが乗る */
  night: 0.25,
} as const;

/**
 * 算定基礎から除外できる手当。
 *
 * 施行規則21条の7つ（家族・通勤・別居・子女教育・住宅の各手当、臨時に支払われた賃金、
 * 1か月を超える期間ごとに支払われる賃金）は**限定列挙**で、名前が同じでも
 * 一律支給なら除外できない。臨時の賃金・賞与は月給に含まれない前提なので入力しない。
 *
 * **割増賃金と最低賃金で除外の範囲が違う**ので3つの枝に分ける。
 * 1つの合計にすると最低賃金との比較ができない。
 */
export interface Allowances {
  /** (i) 通勤手当・家族手当：割増の算定基礎からも、最低賃金の対象賃金からも除く */
  commuteFamily: number;
  /** (ii) 住宅手当・別居手当・子女教育手当：割増の算定基礎からは除くが、最低賃金の対象賃金には含める */
  housing: number;
  /** (iii) 精皆勤手当：割増の算定基礎には含めるが、最低賃金の対象賃金からは除く */
  attendance: number;
}

/** 1か月の労働時間（時間単位の小数。30分なら 0.5） */
export interface OvertimeHours {
  /** 法定内残業（所定労働時間〜1日8時間の分）。割増は不要で1.0 */
  withinStatutory: number;
  /** 時間外労働（1日8時間・週40時間を超えた分）の1か月合計。深夜の分も含めた総量 */
  overtime: number;
  /** 上の時間外労働のうち、深夜（22〜5時）に当たる時間 */
  overtimeNight: number;
  /** 法定休日（週1日または4週4日）の労働時間。深夜の分も含めた総量 */
  holiday: number;
  /** 上の法定休日労働のうち、深夜に当たる時間 */
  holidayNight: number;
  /** 所定労働時間内の深夜労働（夜勤など）。割増分の0.25だけが乗る */
  scheduledNight: number;
}

/** 固定残業代（みなし残業） */
export interface FixedOvertime {
  /** 毎月支払われている固定残業代（円） */
  amount: number;
  /** その固定残業代が「何時間分」とされているか */
  hours: number;
}

export interface ZangyodaiInput {
  /** 賃金の形態（既定は月給制） */
  wageType?: WageType;
  /** 月給（額面・基本給＋手当の合計・円）。月給制のときに使う */
  monthlyWage?: number;
  /** 時給（円）。時給制のときに使う */
  hourlyWage?: number;
  /** 1日の所定労働時間 */
  dailyHours?: number;
  /** 年間の所定労働日数 */
  annualWorkDays?: number;
  /** 除外できる手当の月額 */
  allowances?: Partial<Allowances>;
  /** 1か月の労働時間 */
  hours?: Partial<OvertimeHours>;
  /** 端数処理の方式（既定は法令どおり＝丸めない） */
  rounding?: RoundingMode;
  /** 固定残業代（みなし残業）。無ければ省略 */
  fixedOvertime?: FixedOvertime | null;
  /** 最低賃金と比べる都道府県コード。未指定なら比較しない */
  prefectureCode?: number | null;
  /** 最低賃金の判定の基準日（改定の発効判定に使う） */
  asOf?: Date;
}

/** 内訳表の1行 */
export interface ZangyodaiRow {
  key: 'withinStatutory' | 'overtime' | 'overtimeOver60' | 'holiday' | 'night';
  /** 種類の表示名 */
  label: string;
  /** 割増率（深夜の加算は 0.25） */
  rate: number;
  /** 時間数 */
  hours: number;
  /** 金額（円）。strict では丸めない小数 */
  amount: number;
}

/** 固定残業代との突き合わせ */
export interface FixedOvertimeResult {
  /** 入力された固定残業代（円） */
  amount: number;
  /** 入力された「何時間分」 */
  hours: number;
  /** その時間数を法定どおり（1時間あたりの賃金×1.25）払うと必要な額（円） */
  requiredYen: number;
  /** 固定残業代が上の必要額を満たしているか */
  sufficient: boolean;
  /** 満たしていないときの不足額（円）。満たしていれば0 */
  shortfallYen: number;
  /** 今月の残業代が固定残業代を超えた分（円）。超えていなければ0 */
  differenceYen: number;
  /** 今月の残業時間（時間外＋法定休日）が固定分の時間数を超えているか */
  exceedsHours: boolean;
}

export interface ZangyodaiResult {
  wageType: WageType;
  /** 1か月平均所定労働時間（年間所定労働日数 × 1日の所定労働時間 ÷ 12）。時給制では0 */
  monthlyAverageHours: number;
  /** 割増賃金の算定基礎になる賃金（月給 −(i)−(ii)・円）。時給制では0 */
  baseWage: number;
  /** 1時間あたりの賃金（円）。strict では丸めない */
  hourlyRate: number;
  /** 最低賃金の対象になる賃金（月給 −(i)−(iii)・円）。時給制では0 */
  minWageBaseWage: number;
  /** 最低賃金と比べる時給（円） */
  minWageHourly: number;
  /** 計算に使った時間数（簡便法では丸めたあとの値） */
  hours: OvertimeHours;
  /** 時間外労働のうち月60時間までの時間 */
  overtimeWithin60: number;
  /** 時間外労働のうち月60時間を超えた時間 */
  overtimeOver60: number;
  /** 深夜（22〜5時）の合計時間（時間外・法定休日・所定内のすべて） */
  nightHours: number;
  /** 内訳（時間数が0の行は含まない） */
  rows: ZangyodaiRow[];
  /** 残業代の合計（円）。strict では丸めない */
  total: number;
  /** 残業代込みの今月の額面（円）。時給制では undefined（所定内賃金が分からないため） */
  grossWithOvertime?: number;
  /** 今月と同じ残業が12か月続いたときの残業代（円） */
  annualOvertime: number;
  /** 固定残業代との突き合わせ。入力が無ければ undefined */
  fixedOvertime?: FixedOvertimeResult;
  /** 最低賃金との比較。都道府県が未指定なら undefined */
  minWageCheck?: WageCheck;
}

/** 時間と分から時間単位の小数を作る（90分 → 1.5） */
export function hoursFrom(hours: number, minutes: number): number {
  return Math.max(0, hours) + Math.max(0, minutes) / 60;
}

/** 1か月平均所定労働時間 = 年間所定労働日数 × 1日の所定労働時間 ÷ 12 */
export function monthlyAverageHours(annualWorkDays: number, dailyHours: number): number {
  return (Math.max(0, annualWorkDays) * Math.max(0, dailyHours)) / 12;
}

/**
 * 年間休日数から年間所定労働日数の目安を出す（365 − 休日数）。
 *
 * **閏年は366日**なので、これはあくまで目安。正確には就業規則の
 * 年間所定労働日数を入れてもらう。
 */
export const DAYS_PER_YEAR_FOR_ESTIMATE = 365;

/** 年間休日数 → 年間所定労働日数の目安 */
export function workDaysFromHolidays(annualHolidays: number): number {
  return Math.max(0, DAYS_PER_YEAR_FOR_ESTIMATE - Math.max(0, annualHolidays));
}

/**
 * 基発150号(1): 1か月の時間数の合計に1時間未満の端数があるとき、
 * 30分未満を切り捨て、30分以上を1時間に切り上げる。
 * **1日ごとの端数を切り捨てるのは違法**なので、月の合計にだけ当てる。
 */
export function roundHoursSimplified(h: number): number {
  const whole = Math.floor(h);
  // 浮動小数の誤差で 0.5 をわずかに下回ることがあるため、分に直してから比べる
  const minutes = Math.round((h - whole) * 60);
  return minutes >= 30 ? whole + 1 : whole;
}

/**
 * 基発150号(2)(3): 円未満の端数は50銭未満を切り捨て、50銭以上を1円に切り上げる
 * （＝円未満の四捨五入）。
 */
export function roundYenSimplified(yen: number): number {
  return Math.round(yen);
}

/**
 * 表示用に円へ丸める。
 *
 * 法令どおり（`strict`）のときは**切り上げ**にする。労働者に不利になる
 * 切り捨ては採らない（法令は円未満の切り捨てを認めていない）。
 * 簡便法のときは lib の時点で円になっているのでそのまま返る。
 */
export function displayYen(yen: number, rounding: RoundingMode = 'strict'): number {
  return rounding === 'simplified' ? Math.round(yen) : Math.ceil(yen - 1e-9);
}

const ROW_LABELS: Record<ZangyodaiRow['key'], string> = {
  withinStatutory: '法定内残業',
  overtime: '時間外労働',
  overtimeOver60: '時間外労働（月60時間超）',
  holiday: '法定休日労働',
  night: '深夜労働の加算',
};

function num(v: number | undefined, fallback = 0): number {
  return Number.isFinite(v) ? Math.max(0, v as number) : fallback;
}

function normalizeHours(input: Partial<OvertimeHours> | undefined): OvertimeHours {
  const overtime = num(input?.overtime);
  const holiday = num(input?.holiday);
  return {
    withinStatutory: num(input?.withinStatutory),
    overtime,
    // 「うち深夜」は親の時間を超えられない（超える入力は親で頭打ちにする）
    overtimeNight: Math.min(num(input?.overtimeNight), overtime),
    holiday,
    holidayNight: Math.min(num(input?.holidayNight), holiday),
    scheduledNight: num(input?.scheduledNight),
  };
}

/**
 * 残業代（割増賃金）を計算する。
 *
 * 金額は
 * `1時間あたりの賃金 ×（1.00×法定内 + 1.25×60時間まで + 1.50×60時間超 + 1.35×法定休日 + 0.25×深夜）`
 * で出す。深夜を独立した加算として足すのは、時間外・法定休日のどちらと重なっても
 * +0.25 で同じだからで、時間外70時間のうち深夜が「60時間まで」と「60時間超」の
 * どちらに入るかを決めなくても金額が変わらない（入力からは決まらない情報）。
 */
export function calcZangyodai(input: ZangyodaiInput): ZangyodaiResult {
  const wageType: WageType = input.wageType ?? 'monthly';
  const rounding: RoundingMode = input.rounding ?? 'strict';
  const dailyHours = num(input.dailyHours, DEFAULT_DAILY_HOURS) || DEFAULT_DAILY_HOURS;
  const annualWorkDays =
    num(input.annualWorkDays, DEFAULT_ANNUAL_WORK_DAYS) || DEFAULT_ANNUAL_WORK_DAYS;

  const allowances: Allowances = {
    commuteFamily: num(input.allowances?.commuteFamily),
    housing: num(input.allowances?.housing),
    attendance: num(input.allowances?.attendance),
  };

  const monthlyWage = num(input.monthlyWage);
  const hourlyWage = num(input.hourlyWage);

  // 単価（1時間あたりの賃金）。月給制は施行規則19条1項4号の式、時給制は時給そのまま
  const avgHours = wageType === 'monthly' ? monthlyAverageHours(annualWorkDays, dailyHours) : 0;
  const baseWage =
    wageType === 'monthly'
      ? Math.max(0, monthlyWage - allowances.commuteFamily - allowances.housing)
      : 0;
  const rawRate = wageType === 'monthly' ? (avgHours > 0 ? baseWage / avgHours : 0) : hourlyWage;
  const hourlyRate = rounding === 'simplified' ? roundYenSimplified(rawRate) : rawRate;

  // 最低賃金の対象賃金は除外の範囲が違う（最低賃金法4条3項・同法施行規則1条）。
  // 精皆勤手当は除き、住宅手当は含める（割増賃金とちょうど逆になる）
  const minWageBaseWage =
    wageType === 'monthly'
      ? Math.max(0, monthlyWage - allowances.commuteFamily - allowances.attendance)
      : 0;
  const minWageHourly =
    wageType === 'monthly' ? (avgHours > 0 ? minWageBaseWage / avgHours : 0) : hourlyWage;

  // 簡便法では「時間外」「休日」「深夜」の1か月の合計それぞれに30分ルールを当てる
  const raw = normalizeHours(input.hours);
  const rawNight = raw.overtimeNight + raw.holidayNight + raw.scheduledNight;
  const hours: OvertimeHours =
    rounding === 'simplified'
      ? {
          withinStatutory: roundHoursSimplified(raw.withinStatutory),
          overtime: roundHoursSimplified(raw.overtime),
          overtimeNight: raw.overtimeNight,
          holiday: roundHoursSimplified(raw.holiday),
          holidayNight: raw.holidayNight,
          scheduledNight: raw.scheduledNight,
        }
      : raw;
  const nightHours = rounding === 'simplified' ? roundHoursSimplified(rawNight) : rawNight;

  // 60時間の枠に入れるのは時間外労働だけ。法定休日労働は含めない（労基法37条1項ただし書）
  const overtimeWithin60 = Math.min(hours.overtime, MONTHLY_OVERTIME_THRESHOLD);
  const overtimeOver60 = Math.max(0, hours.overtime - MONTHLY_OVERTIME_THRESHOLD);

  const amountOf = (rate: number, h: number) => {
    const yen = hourlyRate * rate * h;
    return rounding === 'simplified' ? roundYenSimplified(yen) : yen;
  };

  const candidates: Array<{ key: ZangyodaiRow['key']; rate: number; hours: number }> = [
    { key: 'withinStatutory', rate: PREMIUM_RATES.withinStatutory, hours: hours.withinStatutory },
    { key: 'overtime', rate: PREMIUM_RATES.overtime, hours: overtimeWithin60 },
    { key: 'overtimeOver60', rate: PREMIUM_RATES.overtimeOver60, hours: overtimeOver60 },
    { key: 'holiday', rate: PREMIUM_RATES.holiday, hours: hours.holiday },
    { key: 'night', rate: PREMIUM_RATES.night, hours: nightHours },
  ];

  const rows: ZangyodaiRow[] = candidates
    .filter((c) => c.hours > 0)
    .map((c) => ({
      key: c.key,
      label: ROW_LABELS[c.key],
      rate: c.rate,
      hours: c.hours,
      amount: amountOf(c.rate, c.hours),
    }));

  // (3) 1か月の割増賃金の総額の円未満も四捨五入。各行が円になっているので和も円
  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  const fixed = input.fixedOvertime;
  let fixedOvertime: FixedOvertimeResult | undefined;
  if (fixed && (num(fixed.amount) > 0 || num(fixed.hours) > 0)) {
    const amount = num(fixed.amount);
    const fixedHours = num(fixed.hours);
    // 固定残業代は「何時間分」を法定どおり払える額でなければならない（1時間あたりの賃金×1.25）
    const requiredRaw = hourlyRate * PREMIUM_RATES.overtime * fixedHours;
    const requiredYen = rounding === 'simplified' ? roundYenSimplified(requiredRaw) : requiredRaw;
    fixedOvertime = {
      amount,
      hours: fixedHours,
      requiredYen,
      sufficient: amount + 1e-9 >= requiredYen,
      shortfallYen: Math.max(0, requiredYen - amount),
      differenceYen: Math.max(0, total - amount),
      exceedsHours: hours.overtime + hours.holiday > fixedHours,
    };
  }

  const pref =
    input.prefectureCode == null ? undefined : prefectureByCode(Number(input.prefectureCode));
  const minWageCheck =
    pref && minWageHourly > 0 ? checkWage(pref, minWageHourly, input.asOf) : undefined;

  return {
    wageType,
    monthlyAverageHours: avgHours,
    baseWage,
    hourlyRate,
    minWageBaseWage,
    minWageHourly,
    hours,
    overtimeWithin60,
    overtimeOver60,
    nightHours,
    rows,
    total,
    grossWithOvertime: wageType === 'monthly' ? monthlyWage + total : undefined,
    annualOvertime: total * 12,
    fixedOvertime,
    minWageCheck,
  };
}
