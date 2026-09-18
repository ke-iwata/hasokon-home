/**
 * 出産手当金・出産育児一時金 計算ロジック
 *
 * 仕様: docs/features/shussan-teate-keisan.md
 *
 * 一次情報:
 * - 全国健康保険協会（協会けんぽ）「出産で会社を休んだとき（出産手当金）」
 *   https://www.kyoukaikenpo.or.jp/benefit/childbirth/001/index.html
 * - 全国健康保険協会（協会けんぽ）「子どもが生まれたとき（出産育児一時金）」
 *   https://www.kyoukaikenpo.or.jp/benefit/childbirth/002/index.html
 * - 健康保険法 102条（出産手当金。2項が99条2項＝傷病手当金の額を準用）・
 *   101条（出産育児一時金）・104条（資格喪失後の継続給付）・62条（公課の禁止）・
 *   159条の3（産前産後休業期間中の保険料免除）、健康保険法施行令36条（一時金の額）
 *
 * **日額の計算は傷病手当金と同一**（102条2項が99条2項を準用）なので、
 * `lib/kenpo-daily-amount.ts` から import している。ここで新しく書くのは
 * 「予定日・出産日・多胎から支給期間を出す」部分と一時金の分岐だけ。
 *
 * すべて純関数で、DOM・React・現在時刻に依存しない。
 * 日付は `lib/date-parts.ts` の DateParts（年月日の3つ組）で扱い、`Date` を直接いじらない
 * （ローカルタイムの `Date` で日付を組み立てるとタイムゾーンで1日ずれる）。
 */

import { addDays, compareDate, daysBetween, type DateParts } from './date-parts';
import { kenpoDailyAmount } from '@/lib/kenpo-daily-amount';

export type { DateParts } from './date-parts';
export { SHORT_TENURE_CAP } from '@/lib/kenpo-daily-amount';

// ------------------------------------------------------------ 制度データ

/** 産前の支給日数（単胎）。出産の日以前42日（健康保険法102条1項） */
export const BEFORE_DAYS_SINGLE = 42;

/** 産前の支給日数（多胎妊娠）。出産の日以前98日 */
export const BEFORE_DAYS_MULTIPLE = 98;

/** 産後の支給日数。出産の日の翌日以後56日 */
export const AFTER_DAYS = 56;

/**
 * 【データ更新箇所】出産育児一時金の額（1児あたり・円）。
 *
 * 産科医療補償制度に加入する医療機関等で妊娠週数22週以降に出産した場合は50万円
 * （2023年4月1日以降の出産。健康保険法施行令36条）。
 * 制度に未加入の医療機関での出産・妊娠22週未満の出産は48.8万円。
 *
 * **出産費用の自己負担無償化**（健康保険法等の一部を改正する法律・2026年6月5日公布）が
 * 施行されるとこの額の扱いが変わる可能性がある。施行日は「公布の日から起算して
 * 2年を超えない範囲内において政令で定める日」で、2026年9月時点で政令は未制定。
 * **無償化後に一時金が残るのか・全国一律価格がいくらになるのかは一次資料で
 * 確認できるまで書かない。** 政令が出たらここと `REFORM` を直す
 */
export const LUMP_SUM_PER_CHILD = 500_000;

/** 産科医療補償制度に未加入の医療機関等・妊娠22週未満の場合の出産育児一時金（1児あたり・円） */
export const LUMP_SUM_PER_CHILD_WITHOUT_COMPENSATION = 488_000;

/** 出産育児一時金の対象になる最短の妊娠日数（妊娠85日＝4か月以降。死産・流産を含む） */
export const LUMP_SUM_MIN_PREGNANCY_DAYS = 85;

/**
 * 【データ更新箇所】出産費用の自己負担無償化（施行待ち）。
 *
 * 画面に書いてよいのは**法律名・公布日・「施行日は政令で定める（未定）」**まで。
 * 無償化後の一時金の扱い（廃止か・経過措置で併存か）と全国一律価格の額は
 * 一次資料（改正法の条文・厚労省の資料）で確認できるまで書かない。
 *
 * `lawNumber` は e-Gov 法令検索で確認できたら埋める（未確認のうちは null のまま。
 * 画面は null なら法律番号を出さない）。
 */
export const REFORM = {
  lawName: '健康保険法等の一部を改正する法律',
  /** 成立日 */
  enactedOn: '2026-05-29',
  /** 公布日 */
  promulgatedOn: '2026-06-05',
  /**
   * 令和8年法律第31号（e-Gov 法令API の健康保険法 `current_revision_info` で確認。
   * 改正法題名「健康保険法等の一部を改正する法律」・公布 2026-06-05）。
   * 画面は null なら法律番号を出さない
   */
  lawNumber: '令和8年法律第31号' as string | null,
  /** 施行日の定め方（条文どおりの表現） */
  effectiveRule: '公布の日から起算して2年を超えない範囲内において政令で定める日',
} as const;

/** 制度データを最後に確認した日 */
export const DATA_CHECKED_AT = '2026-09-18';

// ------------------------------------------------------------ 入出力

export interface ShussanTeateInput {
  /** 出産予定日 */
  dueDate: DateParts;
  /** 実際の出産日。省略（未確定）なら予定日どおりに生まれたものとして計算する */
  birthDate?: DateParts;
  /**
   * 胎児数（1=単胎、2=双子…）。2以上が多胎妊娠で、産前が98日になり、
   * 出産育児一時金は胎児数分が支給される
   */
  fetusCount?: number;
  /** 直近12ヶ月の平均月収（額面・円） */
  monthlyIncome: number;
  /** 支給開始日以前の被保険者期間が12ヶ月未満か */
  under12Months?: boolean;
  /** 産休中に会社から支払われる給与（月額・円）。0 なら調整しない */
  salaryDuringLeave?: number;
  /** 産科医療補償制度に加入している医療機関等での出産か（既定 true） */
  obstetricCompensation?: boolean;
}

export interface ShussanTeateResult {
  /** 計算に使った出産予定日 */
  dueDate: DateParts;
  /** 計算に使った出産日（入力が無ければ予定日と同じ） */
  birthDate: DateParts;
  /** 実際の出産日が入力されていたか（false なら予定日で計算した見込み額） */
  birthDateGiven: boolean;
  /** 胎児数 */
  fetusCount: number;
  /** 多胎妊娠か（胎児数2以上） */
  multiple: boolean;

  /** 予定日より遅れた日数（産前に上乗せされる。早い場合は0） */
  overdueDays: number;
  /** 予定日より早かった日数（産前日数は増えず、開始日が前にずれるだけ。遅い場合は0） */
  earlyDays: number;
  /** 産前の支給日数（42日または98日＋予定日超過分） */
  beforeDays: number;
  /** 産後の支給日数（56日） */
  afterDays: number;
  /** 支給日数の合計 */
  totalDays: number;
  /** 産前の支給開始日 */
  startDate: DateParts;
  /** 産後の支給終了日（出産日の翌日から56日目） */
  endDate: DateParts;
  /** 産後休業が明けて育児休業に入れる日（産後56日の翌日） */
  childcareLeaveFrom: DateParts;

  /**
   * 出産予定日を基準に産休へ入った場合の開始日（予定日 − 41日。多胎は −97日）。
   * 産前休業は予定日基準で請求するのが普通なので、**早産のときは実際の休み始めがこの日**になる。
   */
  leaveFromDue: DateParts;
  /**
   * 予定日基準で産休に入った場合の産前日数（= beforeDays − earlyDays）。
   *
   * 法102条の支給期間は早産のとき「出産日 − 41日」から始まるが、
   * 予定日の42日前から休んでいた人は**それより前の日は出勤日＝支給されない**ので、
   * 産前は早まった日数分だけ短くなる。`earlyDays === 0` なら `beforeDays` と一致する
   */
  beforeDaysIfLeaveFromDue: number;
  /** 同上の支給日数の合計 */
  totalDaysIfLeaveFromDue: number;
  /** 同上の出産手当金の総額（円） */
  allowanceTotalIfLeaveFromDue: number;

  /** 算定に使った標準報酬月額（円） */
  standardMonthly: number;
  /** 被保険者期間12ヶ月未満の上限が適用されたか */
  capped: boolean;
  /** 標準報酬日額（÷30・10円未満四捨五入・円） */
  standardDaily: number;
  /** 出産手当金の日額（×2/3・1円未満四捨五入・円） */
  dailyAmount: number;

  /** 産休中に支払われる給与の日額（月額÷30。当サイト側の換算・円） */
  salaryDaily: number;
  /** 実際に支給される日額（給与が出る場合は差額・円） */
  payableDaily: number;
  /** 給与との差額支給になっているか */
  salaryAdjusted: boolean;
  /** 給与が日額以上で出産手当金が支給されない状態か */
  fullyOffset: boolean;

  /** 出産手当金の総額（円） */
  allowanceTotal: number;
  /** 出産育児一時金の1児あたりの額（円） */
  lumpSumPerChild: number;
  /** 出産育児一時金の総額（1児あたり×胎児数・円） */
  lumpSumTotal: number;
  /** 出産手当金＋出産育児一時金（円） */
  total: number;
}

// ------------------------------------------------------------ 計算

/**
 * 出産手当金の支給額と出産育児一時金を計算する。
 *
 * 支給期間の数え方（協会けんぽ「出産手当金」）:
 * - 産前は「出産の日以前42日（多胎98日）」。**実際の出産が予定日より後のときは
 *   出産予定日**を起点に数え、遅れた日数分も支給される
 * - 産後は「出産の日の翌日以後56日」
 *
 * 起点の日を含めて数えるので、開始日は「起点 − 41日（多胎は −97日）」になる。
 *
 * @returns 入力が不正（予定日・出産日が組めない等）なら null
 */
export function calcShussanTeate(input: ShussanTeateInput): ShussanTeateResult | null {
  const { dueDate } = input;
  const birthDateGiven = input.birthDate !== undefined;
  const birthDate = input.birthDate ?? dueDate;

  const fetusCount = Math.max(1, Math.floor(input.fetusCount ?? 1));
  const multiple = fetusCount >= 2;

  // 予定日と出産日が離れすぎている入力（打ち間違い）は計算しない。
  // 早産・過期産でも1年ずれることはないので、1年を超える差は入力ミスとみなす
  const diff = daysBetween(dueDate, birthDate);
  if (!Number.isFinite(diff) || Math.abs(diff) > 365) return null;

  // 予定日より遅れた分は産前に上乗せされる。早い分は上乗せされない（開始日が前にずれるだけ）
  const overdueDays = Math.max(0, diff);
  const earlyDays = Math.max(0, -diff);

  const baseBeforeDays = multiple ? BEFORE_DAYS_MULTIPLE : BEFORE_DAYS_SINGLE;
  const beforeDays = baseBeforeDays + overdueDays;
  const afterDays = AFTER_DAYS;
  const totalDays = beforeDays + afterDays;

  // 産前の起点は「出産日と予定日の早いほう」。起点の日を含めて数えるので −(日数−1)
  const beforeAnchor = compareDate(birthDate, dueDate) <= 0 ? birthDate : dueDate;
  const startDate = addDays(beforeAnchor, -(baseBeforeDays - 1));
  const endDate = addDays(birthDate, AFTER_DAYS);
  const childcareLeaveFrom = addDays(endDate, 1);

  // 産前休業は出産予定日を基準に請求するので、早産のときは実際の休み始めが予定日基準になる。
  // そのぶん「出産日 − 41日」からの数日は出勤日で支給されないため、産前は earlyDays だけ短くなる
  const leaveFromDue = addDays(dueDate, -(baseBeforeDays - 1));
  const beforeDaysIfLeaveFromDue = beforeDays - earlyDays;
  const totalDaysIfLeaveFromDue = beforeDaysIfLeaveFromDue + afterDays;

  // 日額の計算は傷病手当金と同一（健康保険法102条2項が99条2項を準用）
  const { standardMonthly, capped, standardDaily, dailyAmount } = kenpoDailyAmount(
    Math.max(0, input.monthlyIncome),
    input.under12Months === true,
  );

  // 給与が出る場合は差額支給。「給与日額 = 月額 ÷ 30」は当サイト側の換算で、
  // 実際の申請では事業主が証明する日額が使われる（画面では「目安」と添える）
  const salary = Math.max(0, input.salaryDuringLeave ?? 0);
  const salaryDaily = Math.round(salary / 30);
  const payableDaily = Math.max(0, dailyAmount - salaryDaily);
  const salaryAdjusted = salaryDaily > 0;
  const fullyOffset = salaryDaily > 0 && payableDaily === 0;

  const lumpSumPerChild =
    input.obstetricCompensation === false
      ? LUMP_SUM_PER_CHILD_WITHOUT_COMPENSATION
      : LUMP_SUM_PER_CHILD;
  const lumpSumTotal = lumpSumPerChild * fetusCount;
  const allowanceTotal = payableDaily * totalDays;

  return {
    dueDate,
    birthDate,
    birthDateGiven,
    fetusCount,
    multiple,
    overdueDays,
    earlyDays,
    beforeDays,
    afterDays,
    totalDays,
    startDate,
    endDate,
    childcareLeaveFrom,
    leaveFromDue,
    beforeDaysIfLeaveFromDue,
    totalDaysIfLeaveFromDue,
    allowanceTotalIfLeaveFromDue: payableDaily * totalDaysIfLeaveFromDue,
    standardMonthly,
    capped,
    standardDaily,
    dailyAmount,
    salaryDaily,
    payableDaily,
    salaryAdjusted,
    fullyOffset,
    allowanceTotal,
    lumpSumPerChild,
    lumpSumTotal,
    total: allowanceTotal + lumpSumTotal,
  };
}
