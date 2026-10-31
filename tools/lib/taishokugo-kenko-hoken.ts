/**
 * 退職後の健康保険 比較（任意継続・国民健康保険・家族の扶養）の計算ロジック。
 *
 * 仕様: docs/features/taishokugo-kenko-hoken-hikaku.md
 *
 * 退職日・生年月日・前年の所得・扶養に入れるかから、退職日の翌日の属する月から
 * 24か月の月ごとに 3 つの入り方の保険料（と国民年金）を並べ、24か月の合計が
 * いちばん小さい入り方（途中で任意継続を脱退して国保・扶養へ移る組み合わせを含む）を選ぶ。
 *
 * ■ 端数の約束
 * lib は円単位の値を返す（国保は区分ごとに円未満切り捨て）。100円単位に丸めるのは
 * 画面（app/taishokugo-kenko-hoken/Calculator.tsx）だけ。テストは丸める前の値で見る。
 *
 * ■ 料率の持ち方
 * - 協会けんぽの健康保険料率（47支部・全額）は lib/shaho-ryoritsu.ts にデータとして置き、
 *   ここで介護（KAIGO_RATE × 2）・子ども・子育て支援金（FISCAL_YEARS）と組み立てる
 * - 子ども・子育て支援金率は lib/kosodate-shienkin.ts の FISCAL_YEARS が唯一の定義。
 *   **0.23% をここに書かない**（令和9年度の更新で取り残されるため）
 * - 国保は市区町村ごとに違う。既定は特別区（東京23区）の共通基準で、年度つきの表で持つ。
 *   表に無い年度は直前の年度で代用し、その月に「代用」の印を付ける
 *
 * ■ 一次情報（2026-10-31 に確認）
 * - e-Gov 法令検索「健康保険法」（3条4項・7項、37条、38条、47条）
 *   https://laws.e-gov.go.jp/law/211AC0000000070
 * - e-Gov 法令検索「国民健康保険法」（76条）・同施行令（29条の7・29条の7の2）
 *   https://laws.e-gov.go.jp/law/333AC0000000192
 * - 協会けんぽ「令和8年度の任意継続被保険者の標準報酬月額の上限について」（32万円）
 *   https://www.kyoukaikenpo.or.jp/news/r07_dec/1259.html
 * - 大田区「保険料の計算方法」（特別区の令和8年度の確定した料率。豊島区の改正案の表と一致）
 *   https://www.city.ota.tokyo.jp/seikatsu/kokunen/kokuho/hokenryou/keisan.html
 * - 豊島区「豊島区国民健康保険条例の一部を改正する条例について」（軽減の基準額）
 *   https://www.city.toshima.lg.jp/documents/55129/20260327165423.pdf
 * - 新宿区「非自発的失業者の国民健康保険料の軽減」
 *   https://www.city.shinjuku.lg.jp/hoken/hoken02_000102.html
 * - 日本年金機構「国民年金保険料」 https://www.nenkin.go.jp/service/kokunen/hokenryo/hokenryo.html
 */

import { addDays, compareDate, daysInMonth, type DateParts } from '@/lib/date-parts';
import { FISCAL_YEARS, type FiscalYearRate } from '@/lib/kosodate-shienkin';
import { KAIGO_RATE, KYOKAI_HEALTH_RATE_TABLES, type Prefecture } from '@/lib/shaho-ryoritsu';
import { roundPremium, standardMonthly } from '@/lib/shaho-grades';
import { salaryIncomeByTable } from '@/lib/furusato-nozei';
import { salaryIncomeByTableR7 } from '@/lib/nenmatsu-chosei';
import { premiumFor } from '@/lib/kokunen-ikuji-menjo';
import {
  buildSchedule,
  prescribedDaysFor,
  restrictionFor,
  tenureBandFor,
} from '@/lib/shitsugyo-hoken';

// ================================================================ 定数

/** 制度データを最後に一次情報と突き合わせた日 */
export const DATA_CHECKED_AT = '2026-10-31';

/** 比べる月数（任意継続の最長2年） */
export const MONTHS = 24;

/**
 * 【データ更新箇所】協会けんぽの任意継続の標準報酬月額の上限（年度 → 円）。
 * 令和8年度は32万円（令和7年度から据え置き）。表に無い年度は最寄りの年度で代用する。
 * https://www.kyoukaikenpo.or.jp/news/r07_dec/1259.html
 */
export const NINKEI_CAP_BY_FY: Readonly<Record<number, number>> = {
  2026: 320_000,
};

/** 任意継続の申出期限（退職日の翌日から20日以内。健康保険法37条1項） */
export const NINKEI_APPLY_DAYS = 20;

/** 任意継続の加入要件（資格喪失日の前日まで継続して2か月以上。健康保険法3条4項） */
export const NINKEI_REQUIRED_MONTHS = 2;

/** 国保の加入の届出（資格を得た日から14日以内。国民健康保険法施行規則） */
export const KOKUHO_NOTIFY_DAYS = 14;

/** 扶養の年収の基準（60歳未満・60歳以上）と、失業給付の日額に直した線 */
export const FUYO_INCOME_LIMIT = 1_300_000;
export const FUYO_INCOME_LIMIT_60 = 1_800_000;
/** 130万円 ÷ 360 の切り上げ。日額がこれ以上だと受給中は扶養に入れない */
export const FUYO_DAILY_LIMIT = 3_612;
/** 180万円 ÷ 360 */
export const FUYO_DAILY_LIMIT_60 = 5_000;

/** 非自発的失業者の軽減：給与所得を 30/100 とみなす（離職日に65歳未満） */
export const INVOLUNTARY_RATIO_PERCENT = 30;
export const INVOLUNTARY_AGE_LIMIT = 65;

/** 求職の申込みの既定（退職日の翌日から14日後。離職票が届くのを待つ） */
export const DEFAULT_APPLY_AFTER_DAYS = 14;

// ------------------------------------------------------------ 国保の料率

/** 国保の 1 区分の料率。率は「万分率」（7.51% → 751）で持つ（小数の誤差を避けるため） */
export interface KokuhoPart {
  /** 所得割率（万分率） */
  rate: number;
  /** 均等割額（1人。未就学児・18歳未満の扱いは区分ごと） */
  perCapita: number;
  /** 賦課限度額 */
  cap: number;
}

export interface KokuhoTable {
  /** 年度（4月始まり） */
  fiscalYear: number;
  /** 表の名前（画面の注記に出す） */
  label: string;
  /** 医療（基礎）分。未就学児の均等割は5割 */
  iryo: KokuhoPart;
  /** 後期高齢者支援金分。未就学児の均等割は5割 */
  shien: KokuhoPart;
  /** 介護納付金分（40〜64歳だけ） */
  kaigo: KokuhoPart;
  /** 子ども・子育て支援納付金分。perCapita は18歳以上の額（18歳未満は0円） */
  kodomo: KokuhoPart;
  /** 所得割の基礎の控除（旧ただし書き所得＝総所得金額等 − これ） */
  baseDeduction: number;
  /** 均等割の軽減の基準額 */
  keigen: { base: number; perMember5: number; perMember2: number; perEarner: number };
}

/**
 * 【データ更新箇所】特別区（東京23区）の共通基準の国保の料率（年度つき）。
 *
 * 令和8年度の値は大田区「保険料の計算方法」（確定した料率）で 2026-10-31 に確認し、
 * 豊島区の国保運営協議会資料（改正案の表1・表2）と一致した。
 * 子ども・子育て支援納付金分の均等割 1,873円は 1,800円＋18歳未満の10割軽減分の加算73円。
 * 令和9年度の数字（2027年1〜3月に各区が決める）が出たら、表を1つ足すだけで
 * 2027-04 以降の月がそちらで計算される。
 *
 * **被用者保険の支援金率（FISCAL_YEARS）と国保の子ども分の率は別物**なので、ここで持つ。
 */
export const KOKUHO_TABLES: readonly KokuhoTable[] = [
  {
    fiscalYear: 2026,
    label: '特別区（東京23区）令和8年度',
    iryo: { rate: 751, perCapita: 47_600, cap: 670_000 },
    shien: { rate: 280, perCapita: 17_600, cap: 260_000 },
    kaigo: { rate: 243, perCapita: 17_800, cap: 170_000 },
    kodomo: { rate: 27, perCapita: 1_873, cap: 30_000 },
    baseDeduction: 430_000,
    keigen: { base: 430_000, perMember5: 310_000, perMember2: 570_000, perEarner: 100_000 },
  },
];

// ================================================================ 年月の部品

/** 'YYYY-MM' */
export type YearMonth = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function ymOf(d: DateParts): YearMonth {
  return `${d.year}-${pad(d.month)}`;
}

export function addMonthsYm(ym: YearMonth, n: number): YearMonth {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

/** 'YYYY-MM' の属する年度（4月始まり） */
export function fiscalYearOfYm(ym: YearMonth): number {
  const [y, m] = ym.split('-').map(Number);
  return m >= 4 ? y : y - 1;
}

/** '2027-04' → '2027年4月' */
export function ymJa(ym: YearMonth): string {
  const [y, m] = ym.split('-').map(Number);
  return `${y}年${m}月`;
}

/** 令和の年度表記。2026 → '令和8年度' */
export function reiwaFy(fy: number): string {
  return `令和${fy - 2018}年度`;
}

function lastDayOf(ym: YearMonth): DateParts {
  const [y, m] = ym.split('-').map(Number);
  return { year: y, month: m, day: daysInMonth(y, m) };
}

/** 普通の満年齢（誕生日に1つ上がる） */
export function ageOn(birth: DateParts, on: DateParts): number {
  let age = on.year - birth.year;
  if (on.month < birth.month || (on.month === birth.month && on.day < birth.day)) age -= 1;
  return age;
}

/**
 * その月の保険料を決める年齢。年齢は**誕生日の前日**に達するので（年齢計算ニ関スル法律）、
 * 「月末までに達した年齢」＝翌月1日の満年齢。介護（40歳に達した月から・65歳に達した月の前月まで）と
 * 国民年金（20歳に達した月から・60歳に達した月の前月まで）はこれで判定する。
 */
export function ageForPremiumMonth(birth: DateParts, ym: YearMonth): number {
  const next = addDays(lastDayOf(ym), 1);
  return ageOn(birth, next);
}

const isKaigoAge = (age: number) => age >= 40 && age < 65;

// ================================================================ 任意継続

export type ShienkinMark = '見込み' | '政府試算' | null;

export interface ShienkinLookup {
  /** 支援金率（労使折半前・全額） */
  rate: number;
  /** FISCAL_YEARS の status が確定でないときの印（同じ言葉で出す） */
  mark: ShienkinMark;
  /** FISCAL_YEARS に無い年度で、最後の年度の値で代用したか */
  substituted: boolean;
}

/**
 * 子ども・子育て支援金率をその年度で引く。FISCAL_YEARS にあればその rate と status、
 * 無い年度は最後の年度の値で代用。制度が始まる前（令和7年度以前）は0。
 */
export function shienkinFor(
  fy: number,
  years: readonly FiscalYearRate[] = FISCAL_YEARS,
): ShienkinLookup {
  const hit = years.find((y) => y.fiscalYear === fy);
  if (hit) return { rate: hit.rate, mark: hit.status === '確定' ? null : hit.status, substituted: false };
  const sorted = [...years].sort((a, b) => a.fiscalYear - b.fiscalYear);
  if (sorted.length === 0 || fy < sorted[0].fiscalYear) return { rate: 0, mark: null, substituted: false };
  const last = sorted[sorted.length - 1];
  return { rate: last.rate, mark: last.status === '確定' ? null : last.status, substituted: true };
}

/** 年度つきの表から、その年度の行を引く（無ければ最寄りで代用） */
function pickByFy<T extends { fiscalYear: number }>(
  tables: readonly T[],
  fy: number,
): { table: T; substituted: boolean } {
  const sorted = [...tables].sort((a, b) => a.fiscalYear - b.fiscalYear);
  const hit = sorted.find((t) => t.fiscalYear === fy);
  if (hit) return { table: hit, substituted: false };
  const before = sorted.filter((t) => t.fiscalYear < fy);
  const table = before.length > 0 ? before[before.length - 1] : sorted[0];
  return { table, substituted: true };
}

export interface NinkeiRateLookup {
  /** 全額の料率（健保＋支援金＋介護）。小数 */
  rate: number;
  health: number;
  shienkin: number;
  kaigo: number;
  /** 健保料率の表に無い年度で代用したか（代用した年度の名前） */
  healthSubstitutedFrom: string | null;
  shienkin_: ShienkinLookup;
}

/**
 * 任意継続の全額の料率を組み立てる（会社負担が無くなるので全額自己負担）。
 * 健保（47支部・全額）＋ 支援金（FISCAL_YEARS のその年度）＋ 40〜64歳は介護（KAIGO_RATE × 2）
 */
export function ninkeiFullRate(
  pref: Prefecture,
  fy: number,
  age: number,
  opts: {
    healthTables?: typeof KYOKAI_HEALTH_RATE_TABLES;
    shienkinYears?: readonly FiscalYearRate[];
  } = {},
): NinkeiRateLookup {
  const { table, substituted } = pickByFy(opts.healthTables ?? KYOKAI_HEALTH_RATE_TABLES, fy);
  const health = table.rates[pref];
  const s = shienkinFor(fy, opts.shienkinYears);
  // 介護は本人負担（折半）の値しか持っていないので2倍して全額にする。小数の誤差は万分率で丸める
  const kaigo = isKaigoAge(age) ? Math.round(KAIGO_RATE * 2 * 10_000) / 10_000 : 0;
  const rate = Math.round((health + s.rate + kaigo) * 100_000) / 100_000;
  return {
    rate,
    health,
    shienkin: s.rate,
    kaigo,
    healthSubstitutedFrom: substituted ? reiwaFy(table.fiscalYear) : null,
    shienkin_: s,
  };
}

/** 任意継続の上限（その年度。無ければ最寄りの年度） */
export function ninkeiCapFor(fy: number): number {
  const years = Object.keys(NINKEI_CAP_BY_FY).map(Number).sort((a, b) => a - b);
  const hit = NINKEI_CAP_BY_FY[fy];
  if (hit !== undefined) return hit;
  const before = years.filter((y) => y < fy);
  return NINKEI_CAP_BY_FY[before.length > 0 ? before[before.length - 1] : years[0]];
}

/** 任意継続の月額 ＝ min(標準報酬月額, 上限) × 全額の料率 */
export function ninkeiMonthly(standard: number, cap: number, rate: number): number {
  return roundPremium(Math.min(standard, cap) * rate);
}

// ================================================================ 国保

/** 一緒に国保に入る家族（本人を除く）。所得は無いものとして扱う */
export interface Family {
  /** 未就学児 */
  preschool: number;
  /** 18歳未満（未就学児を除く） */
  minor: number;
  /** 40〜64歳 */
  kaigo: number;
  /** それ以外の18歳以上 */
  adult: number;
}

export const NO_FAMILY: Family = { preschool: 0, minor: 0, kaigo: 0, adult: 0 };

export const familyCount = (f: Family) => f.preschool + f.minor + f.kaigo + f.adult;

export interface KokuhoIncome {
  /** 本人の給与所得（給与収入 − 給与所得控除） */
  salaryIncome: number;
  /** 本人の給与以外の所得 */
  otherIncome: number;
  /** 給与所得者等か（給与収入があるか）。軽減の基準額の「給与所得者等の数」に使う */
  hasSalary: boolean;
  /** 非自発的失業者の軽減（給与所得を 30/100 とみなす）をかけるか */
  involuntary: boolean;
}

export interface KokuhoBreakdown {
  iryo: number;
  shien: number;
  kaigo: number;
  kodomo: number;
  total: number;
  /** 均等割の軽減割合（0・2・5・7割） */
  keigenTenths: 0 | 2 | 5 | 7;
  /** 所得割の基礎（旧ただし書き所得） */
  base: number;
}

/**
 * 国保の年額（その年度に12か月入っていた場合）。
 * 区分ごとに min(所得割 + 均等割（軽減後）, 限度額)。所得割・軽減後の均等割はそれぞれ円未満切り捨て。
 */
export function kokuhoAnnual(input: {
  income: KokuhoIncome;
  family: Family;
  /** 本人が介護分の対象（40〜64歳）か */
  selfKaigo: boolean;
  table: KokuhoTable;
}): KokuhoBreakdown {
  const { income, family, selfKaigo, table } = input;
  const salary = income.involuntary
    ? Math.floor((income.salaryIncome * INVOLUNTARY_RATIO_PERCENT) / 100)
    : income.salaryIncome;
  const total = Math.max(0, salary + Math.max(0, income.otherIncome));
  const base = Math.max(0, total - table.baseDeduction);

  const members = 1 + familyCount(family);
  const earners = income.hasSalary ? 1 : 0;
  const earnerAdd = table.keigen.perEarner * Math.max(0, earners - 1);
  const keigenTenths: 0 | 2 | 5 | 7 =
    total <= table.keigen.base + earnerAdd
      ? 7
      : total <= table.keigen.base + table.keigen.perMember5 * members + earnerAdd
        ? 5
        : total <= table.keigen.base + table.keigen.perMember2 * members + earnerAdd
          ? 2
          : 0;

  const shotokuwari = (part: KokuhoPart) => Math.floor((base * part.rate) / 10_000);
  const reduce = (raw: number) => Math.floor((raw * (10 - keigenTenths)) / 10);

  // 医療・後期：未就学児は均等割5割
  const fullHeads = 1 + family.minor + family.kaigo + family.adult;
  const capitaIryoShien = (p: KokuhoPart) =>
    p.perCapita * fullHeads + (p.perCapita / 2) * family.preschool;

  const part = (p: KokuhoPart, kintouRaw: number, hasShotoku: boolean) =>
    Math.min(p.cap, (hasShotoku ? shotokuwari(p) : 0) + reduce(kintouRaw));

  const iryo = part(table.iryo, capitaIryoShien(table.iryo), true);
  const shien = part(table.shien, capitaIryoShien(table.shien), true);

  const kaigoHeads = (selfKaigo ? 1 : 0) + family.kaigo;
  const kaigo = kaigoHeads === 0 ? 0 : part(table.kaigo, table.kaigo.perCapita * kaigoHeads, selfKaigo);

  // 子ども分：18歳未満は均等割0円
  const adults = 1 + family.kaigo + family.adult;
  const kodomo = part(table.kodomo, table.kodomo.perCapita * adults, true);

  return { iryo, shien, kaigo, kodomo, total: iryo + shien + kaigo + kodomo, keigenTenths, base };
}

/**
 * 給与収入 → 給与所得（その所得の年の給与所得控除。別表第五）。
 * 令和7年分以前は最低保障65万円、令和8年分以後は74万円の表を使う
 */
export function salaryIncomeOf(salary: number, incomeYear: number): number {
  const s = Math.floor(Math.max(0, salary));
  if (s <= 0) return 0;
  return incomeYear <= 2025 ? salaryIncomeByTableR7(s) : salaryIncomeByTable(s);
}

/**
 * 非自発的失業者の軽減がかかる年度か。
 * 離職日の翌日の属する月から、その月の属する年度の**翌年度末まで**
 */
export function involuntaryCovers(leaveDate: DateParts, fy: number): boolean {
  const startFy = fiscalYearOfYm(ymOf(addDays(leaveDate, 1)));
  return fy >= startFy && fy <= startFy + 1;
}

// ================================================================ 扶養と失業給付

export type LeaveKind = 'self' | 'company';

/**
 * 給付制限と所定給付日数の既定値（lib/shitsugyo-hoken.ts の表から引く。同じ表を2か所に書かない）。
 * 会社都合など（特定受給資格者・特定理由離職者）は特定受給資格者の表で引く
 */
export function defaultBenefitTerms(input: {
  leaveKind: LeaveKind;
  age: number;
  tenureYears: number;
  leaveDate: DateParts;
}): { restrictionMonths: number; prescribedDays: number } {
  const restriction = restrictionFor({
    reason: input.leaveKind === 'company' ? 'company' : 'self',
    leaveDate: `${input.leaveDate.year}-${pad(input.leaveDate.month)}-${pad(input.leaveDate.day)}`,
  });
  const prescribed = prescribedDaysFor({
    category: input.leaveKind === 'company' ? 'tokutei' : 'ippan',
    age: input.age,
    tenure: tenureBandFor(input.tenureYears),
  });
  return { restrictionMonths: restriction.months, prescribedDays: prescribed.days };
}

export interface FuyoInput {
  /** 扶養してくれる家族がいる */
  available: boolean;
  /** 扶養してくれるのは配偶者（会社員・公務員）か、それ以外の家族か */
  supporter: 'spouse' | 'other';
  /** 失業給付の日額（受けないなら 0） */
  benefitDaily: number;
  /** ハローワークで求職の申込みをする日 */
  applyDate: DateParts;
  /** 給付制限（月） */
  restrictionMonths: number;
  /** 所定給付日数 */
  prescribedDays: number;
}

export interface BenefitPeriod {
  start: DateParts;
  end: DateParts;
}

/** 失業給付を受ける期間（待期7日・給付制限のあとから所定給付日数ぶん）。buildSchedule() と同じ数え方 */
export function benefitPeriodOf(leaveDate: DateParts, fuyo: FuyoInput): BenefitPeriod | null {
  if (fuyo.benefitDaily <= 0 || fuyo.prescribedDays <= 0) return null;
  const s = buildSchedule({
    leaveDate,
    applyDate: fuyo.applyDate,
    restrictionMonths: fuyo.restrictionMonths,
    prescribedDays: fuyo.prescribedDays,
  });
  return { start: s.benefitStartDate, end: s.benefitEndDate };
}

/** 扶養の判定に使う日額の線（60歳以上は 180万円 ÷ 360） */
export const fuyoDailyLimitFor = (age: number) => (age >= 60 ? FUYO_DAILY_LIMIT_60 : FUYO_DAILY_LIMIT);

/**
 * その月に扶養に入っていられるか。月の途中で切り替わる月は**月末にどちらにいるか**で数える。
 * 待期・給付制限の間は失業給付を受けていないので入れる
 */
export function fuyoOkInMonth(
  ym: YearMonth,
  period: BenefitPeriod | null,
  benefitDaily: number,
  age: number,
): boolean {
  if (!period) return true;
  if (benefitDaily < fuyoDailyLimitFor(age)) return true;
  const end = lastDayOf(ym);
  const inPeriod = compareDate(period.start, end) <= 0 && compareDate(end, period.end) <= 0;
  return !inPeriod;
}

// ================================================================ 全体の入力と結果

export type HealthPlan =
  | { kind: 'kyokai'; prefecture: Prefecture }
  | {
      kind: 'kumiai';
      /** 健保＋支援金の全額の料率（%） */
      ratePercent: number;
      /** 介護の全額の料率（%） */
      kaigoRatePercent: number;
      /** 任意継続の標準報酬月額の上限（円） */
      cap: number;
    };

export interface CalcInput {
  /** 退職日 */
  leaveDate: DateParts;
  birthDate: DateParts;
  /** 退職時の月給（標準報酬月額は等級表で引く） */
  monthlySalary: number;
  health: HealthPlan;
  /** 任意継続の加入要件（退職日まで継続して2か月以上） */
  ninkeiEligible: boolean;
  /** 退職した年の前年の給与収入 */
  salaryPrevYear: number;
  /** 退職した年の給与収入 */
  salaryLeaveYear: number;
  /** 退職翌年以降の見込みの給与収入（年） */
  salaryAfter: number;
  /** 給与以外の所得（毎年同じとみなす） */
  otherIncome: number;
  leaveKind: LeaveKind;
  family: Family;
  fuyo: FuyoInput;
  /** 国保の料率。省略すると特別区の表（年度つき）。入れると全年度でこの料率を使う */
  kokuhoCustom?: Omit<KokuhoTable, 'fiscalYear' | 'label'>;
  /** テスト用：年度つきの表を差し替える */
  kokuhoTables?: readonly KokuhoTable[];
  healthTables?: typeof KYOKAI_HEALTH_RATE_TABLES;
  shienkinYears?: readonly FiscalYearRate[];
}

export type Choice = 'ninkei' | 'kokuho' | 'fuyo';

export interface MonthRow {
  ym: YearMonth;
  fiscalYear: number;
  /** 保険料を決める年齢（月末までに達した年齢） */
  age: number;
  /** 75歳で後期高齢者医療に移る月（以降は比較しない） */
  kouki: boolean;
  /** 任意継続の月額（加入要件を満たさないときは null） */
  ninkei: number | null;
  /** 国保の月額（年額 ÷ 12） */
  kokuho: number;
  /** 国保の年額（その年度の基準。月割りの元） */
  kokuhoAnnual: number;
  /** 国保の基準になる所得の年（その年度の前年） */
  kokuhoIncomeYear: number;
  /** 非自発的失業者の軽減がかかっている月か */
  involuntary: boolean;
  /** 扶養に入っていられる月か（扶養してくれる家族がいないときは false） */
  fuyoOk: boolean;
  /** 国民年金（第1号）の月額。20〜59歳でなければ 0 */
  pension: number;
  /** 扶養の列の国民年金（配偶者の扶養で20〜59歳なら第3号で 0） */
  pensionFuyo: number;
  /** その月の行に付ける印（「令和8年度の料率で代用」「見込み」など） */
  marks: string[];
}

export interface PlanResult {
  key: 'ninkei' | 'kokuho' | 'fuyo' | 'switch';
  label: string;
  choices: Choice[];
  segments: { choice: Choice; from: YearMonth; to: YearMonth; months: number }[];
  health: number;
  pension: number;
  total: number;
  /** 任意継続を脱退して乗り換える月（無ければ null） */
  switchAt: YearMonth | null;
}

export interface CalcResult {
  months: MonthRow[];
  /** 任意継続の申出期限（退職日の翌日から20日） */
  ninkeiDeadline: DateParts;
  /** 任意継続の標準報酬月額（上限をかける前） */
  standard: number;
  benefitPeriod: BenefitPeriod | null;
  /** 扶養に入れない理由（見込みの年収が基準以上など）。入れる・家族がいないなら null */
  fuyoBlockedReason: string | null;
  /** 非自発的失業者の軽減の対象か（会社都合・離職日に65歳未満） */
  involuntary: boolean;
  plans: PlanResult[];
  best: PlanResult;
  ninkeiOnly: PlanResult | null;
  kokuhoOnly: PlanResult;
}

const CHOICE_LABEL: Record<Choice, string> = { ninkei: '任意継続', kokuho: '国保', fuyo: '家族の扶養' };
export const choiceLabel = (c: Choice) => CHOICE_LABEL[c];

function segmentsOf(months: MonthRow[], choices: Choice[]): PlanResult['segments'] {
  const segs: PlanResult['segments'] = [];
  months.forEach((m, i) => {
    if (m.kouki) return;
    const c = choices[i];
    const last = segs[segs.length - 1];
    if (last && last.choice === c) {
      last.to = m.ym;
      last.months += 1;
    } else segs.push({ choice: c, from: m.ym, to: m.ym, months: 1 });
  });
  return segs;
}

function costOf(m: MonthRow, c: Choice): { health: number; pension: number } {
  if (m.kouki) return { health: 0, pension: 0 };
  if (c === 'fuyo') return { health: 0, pension: m.pensionFuyo };
  if (c === 'ninkei') return { health: m.ninkei ?? 0, pension: m.pension };
  return { health: m.kokuho, pension: m.pension };
}

function makePlan(
  key: PlanResult['key'],
  months: MonthRow[],
  choices: Choice[],
  label?: string,
): PlanResult {
  let health = 0;
  let pension = 0;
  months.forEach((m, i) => {
    const c = costOf(m, choices[i]);
    health += c.health;
    pension += c.pension;
  });
  const segments = segmentsOf(months, choices);
  const switchIdx = choices.findIndex((c, i) => i > 0 && choices[i - 1] === 'ninkei' && c !== 'ninkei');
  return {
    key,
    label: label ?? segments.map((s) => CHOICE_LABEL[s.choice]).join(' → '),
    choices,
    segments,
    health,
    pension,
    total: health + pension,
    switchAt: switchIdx > 0 ? months[switchIdx].ym : null,
  };
}

/** 退職日・生年月日などから、24か月の月ごとの表とおすすめの入り方を出す */
export function calc(input: CalcInput): CalcResult {
  const { leaveDate, birthDate } = input;
  const firstDay = addDays(leaveDate, 1);
  const startYm = ymOf(firstDay);
  const leaveYear = leaveDate.year;
  const ageAtLeave = ageOn(birthDate, leaveDate);
  const involuntary = input.leaveKind === 'company' && ageAtLeave < INVOLUNTARY_AGE_LIMIT;
  const standard = standardMonthly(Math.max(0, input.monthlySalary));

  // 扶養
  const futureLimit = ageAtLeave >= 60 ? FUYO_INCOME_LIMIT_60 : FUYO_INCOME_LIMIT;
  let fuyoBlockedReason: string | null = null;
  if (input.fuyo.available && input.salaryAfter + Math.max(0, input.otherIncome) >= futureLimit) {
    fuyoBlockedReason = `退職後の見込みの年収が${(futureLimit / 10_000).toLocaleString('ja-JP')}万円以上なので、扶養に入れません`;
  }
  const fuyoUsable = input.fuyo.available && fuyoBlockedReason === null;
  const period = fuyoUsable ? benefitPeriodOf(leaveDate, input.fuyo) : null;

  const kokuhoTables = input.kokuhoTables ?? KOKUHO_TABLES;

  const months: MonthRow[] = [];
  for (let i = 0; i < MONTHS; i += 1) {
    const ym = addMonthsYm(startYm, i);
    const fy = fiscalYearOfYm(ym);
    const age = ageForPremiumMonth(birthDate, ym);
    const kouki = ageOn(birthDate, lastDayOf(ym)) >= 75;
    const marks: string[] = [];

    // ---- 任意継続
    let ninkei: number | null = null;
    if (input.ninkeiEligible) {
      if (input.health.kind === 'kyokai') {
        const r = ninkeiFullRate(input.health.prefecture, fy, age, {
          healthTables: input.healthTables,
          shienkinYears: input.shienkinYears,
        });
        ninkei = ninkeiMonthly(standard, ninkeiCapFor(fy), r.rate);
        if (r.healthSubstitutedFrom) marks.push(`健保料率は${r.healthSubstitutedFrom}で代用`);
        if (r.shienkin_.substituted) marks.push('支援金率は最後の年度で代用');
        if (r.shienkin_.mark) marks.push(`支援金率は${r.shienkin_.mark}`);
      } else {
        const rate =
          (input.health.ratePercent + (isKaigoAge(age) ? input.health.kaigoRatePercent : 0)) / 100;
        ninkei = ninkeiMonthly(standard, input.health.cap, rate);
      }
    }

    // ---- 国保
    const incomeYear = fy - 1;
    const salary =
      incomeYear < leaveYear
        ? input.salaryPrevYear
        : incomeYear === leaveYear
          ? input.salaryLeaveYear
          : input.salaryAfter;
    const monthInvoluntary = involuntary && involuntaryCovers(leaveDate, fy);
    let table: KokuhoTable;
    if (input.kokuhoCustom) {
      table = { ...input.kokuhoCustom, fiscalYear: fy, label: '入力した料率' };
    } else {
      const picked = pickByFy(kokuhoTables, fy);
      table = picked.table;
      if (picked.substituted) marks.push(`国保の料率は${reiwaFy(picked.table.fiscalYear)}で代用`);
    }
    const annual = kokuhoAnnual({
      income: {
        salaryIncome: salaryIncomeOf(salary, incomeYear),
        otherIncome: input.otherIncome,
        hasSalary: salary > 0,
        involuntary: monthInvoluntary,
      },
      family: input.family,
      selfKaigo: isKaigoAge(age),
      table,
    }).total;

    // ---- 国民年金
    const p = premiumFor(ym);
    if (p.estimated && age >= 20 && age < 60) marks.push(`国民年金は${reiwaFy(fy)}の額が未公表のため概算`);
    const pension = age >= 20 && age < 60 ? p.amount : 0;
    const pensionFuyo = input.fuyo.supporter === 'spouse' ? 0 : pension;

    months.push({
      ym,
      fiscalYear: fy,
      age,
      kouki,
      ninkei: kouki ? null : ninkei,
      kokuho: kouki ? 0 : Math.round(annual / 12),
      kokuhoAnnual: annual,
      kokuhoIncomeYear: incomeYear,
      involuntary: monthInvoluntary,
      fuyoOk: fuyoUsable && !kouki && fuyoOkInMonth(ym, period, input.fuyo.benefitDaily, age),
      pension: kouki ? 0 : pension,
      pensionFuyo: kouki ? 0 : pensionFuyo,
      marks,
    });
  }

  // ---- 入り方の候補
  const follower: Choice[] = months.map((m) => (m.fuyoOk ? 'fuyo' : 'kokuho'));
  const plans: PlanResult[] = [];
  const ninkeiOnly = input.ninkeiEligible
    ? makePlan('ninkei', months, months.map(() => 'ninkei'), '任意継続 2年')
    : null;
  if (ninkeiOnly) plans.push(ninkeiOnly);
  const kokuhoOnly = makePlan('kokuho', months, months.map(() => 'kokuho'), '国保 2年');
  plans.push(kokuhoOnly);
  if (follower.some((c) => c === 'fuyo')) {
    const allFuyo = follower.every((c) => c === 'fuyo');
    plans.push(makePlan('fuyo', months, follower, allFuyo ? '家族の扶養 2年' : undefined));
  }
  if (input.ninkeiEligible) {
    // 任意継続は最初からしか入れず、一度脱退すると戻れない → 先頭 k か月だけ任意継続
    let bestSwitch: PlanResult | null = null;
    for (let k = 1; k < MONTHS; k += 1) {
      const choices = months.map((_, i) => (i < k ? 'ninkei' : follower[i])) as Choice[];
      const plan = makePlan('switch', months, choices);
      if (!bestSwitch || plan.total < bestSwitch.total) bestSwitch = plan;
    }
    if (bestSwitch) plans.push(bestSwitch);
  }
  // 合計がいちばん小さいもの。同額なら乗り換えの少ない（並びの先の）ほう
  const best = plans.reduce((a, b) => (b.total < a.total ? b : a));

  return {
    months,
    ninkeiDeadline: addDays(leaveDate, NINKEI_APPLY_DAYS),
    standard,
    benefitPeriod: period,
    fuyoBlockedReason,
    involuntary,
    plans,
    best,
    ninkeiOnly,
    kokuhoOnly,
  };
}

/** 退職した年の給与収入の既定（その年の1月から退職月までの月給。12-31 なら ×12） */
export function defaultLeaveYearSalary(monthlySalary: number, leaveDate: DateParts): number {
  const monthsWorked = leaveDate.day === daysInMonth(leaveDate.year, leaveDate.month)
    ? leaveDate.month
    : leaveDate.month - 1;
  return Math.max(0, monthlySalary) * Math.max(0, monthsWorked);
}

/** 求職の申込みの既定日（退職日の翌日から14日後） */
export function defaultApplyDate(leaveDate: DateParts): DateParts {
  return addDays(leaveDate, 1 + DEFAULT_APPLY_AFTER_DAYS);
}

/** 乗り換えの手順の日付：脱退の申出をする月（乗り換え月の前月）と、喪失日（乗り換え月の1日） */
export function switchSteps(switchAt: YearMonth): { applyMonth: YearMonth; lossDate: DateParts } {
  const [y, m] = switchAt.split('-').map(Number);
  return { applyMonth: addMonthsYm(switchAt, -1), lossDate: { year: y, month: m, day: 1 } };
}
