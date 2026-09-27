/**
 * 国民年金 産前産後・育児期間の保険料免除 計算ロジック
 *
 * 仕様: docs/features/kokunen-ikuji-menjo.md
 *
 * 一次情報:
 * - 日本年金機構「令和8年（2026年）10月から国民年金保険料の育児免除制度が始まります!」
 *   https://www.nenkin.go.jp/tokusetsu/ikujimenjo.html
 * - 日本年金機構「国民年金保険料の育児免除制度」
 *   https://www.nenkin.go.jp/service/kokunen/menjo/ikujimenjo.html
 * - 日本年金機構「国民年金保険料の産前産後期間の免除制度」
 *   https://www.nenkin.go.jp/service/kokunen/menjo/20180810.html
 * - 日本年金機構「国民年金保険料」（月額）
 *   https://www.nenkin.go.jp/service/kokunen/hokenryo/hokenryo.html
 * - 国民年金法 88条の2（産前産後免除。e-Gov で条文確認済み）
 *
 * 「月」はすべて `YYYY-MM` の文字列で受け渡し、内部では通し月番号
 * （年 × 12 + 月 − 1）で数える。`Date` は使わない（タイムゾーンで月がずれるのを避ける）。
 * すべて純関数で、DOM・React・現在時刻に依存しない。
 */

import type { DateParts } from './date-parts';

// ------------------------------------------------------------ 制度データ

/**
 * 【データ更新箇所】国民年金保険料の月額（年度 → 円）。
 *
 * 年度は 4 月始まり（'2026' は令和8年度＝2026年4月〜2027年3月）。
 * 毎年 1 月ごろに翌年度の額が公表されるので、そのとき 1 行足して `DATA_CHECKED_AT` を直す。
 * ここに無い年度は、未来なら最新年度の額・過去なら最古年度の額で**概算**し、
 * 結果に `estimated` を立てる（画面は「4 月に改定」と添える）
 */
export const MONTHLY_PREMIUM: Readonly<Record<string, number>> = {
  '2025': 17_510,
  '2026': 17_920,
};

/** 付加保険料の月額（円）。免除中も納付できる。額には入れず注記だけに使う */
export const FUKA_PREMIUM = 400;

/** 制度データ（保険料額・施行日）を最後に一次情報と突き合わせた日 */
export const DATA_CHECKED_AT = '2026-09-27';

/** 育児免除の施行月（令和8年10月1日施行。これより前の月は育児免除の対象外） */
export const IKUJI_START = '2026-10';

/** 産前産後免除の施行月（平成31年4月1日施行） */
export const SANZEN_START = '2019-04';

/** 産前産後免除の月数（単胎：出産予定月の前月から 4 か月） */
export const SANZEN_MONTHS_SINGLE = 4;

/** 産前産後免除の月数（多胎：出産予定月の 3 か月前から 6 か月） */
export const SANZEN_MONTHS_MULTIPLE = 6;

/** 実母の育児免除の上限（産前産後免除に引き続く 9 か月） */
export const IKUJI_MONTHS_MOTHER = 9;

/** 実父・養父母の育児免除の上限（1 歳の誕生日の前月まで最大 12 か月） */
export const IKUJI_MONTHS_OTHERS = 12;

// ------------------------------------------------------------ 月の算術

/** 'YYYY-MM' → 通し月番号。不正なら null */
export function parseMonth(ym: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return Number(m[1]) * 12 + month - 1;
}

/** 通し月番号 → 'YYYY-MM' */
export function formatMonth(index: number): string {
  const y = Math.floor(index / 12);
  const m = index - y * 12 + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** 'YYYY-MM' → '2026年10月' */
export function formatMonthJa(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${y}年${m}月`;
}

/** 日付 → その日の属する月の通し月番号 */
function monthOf(d: DateParts): number {
  return d.year * 12 + d.month - 1;
}

/** 'YYYY-MM' の属する年度（4 月始まり）。'2027-03' → 2026 */
export function fiscalYearOf(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return m >= 4 ? y : y - 1;
}

/** 令和の年度表記。2026 → '令和8年度' */
export function reiwaFiscalYear(fy: number): string {
  return `令和${fy - 2018}年度`;
}

/**
 * その月の保険料月額。表に無い年度は最寄りの年度の額で概算し `estimated: true` を返す
 */
export function premiumFor(ym: string): { amount: number; fiscalYear: number; estimated: boolean } {
  const fy = fiscalYearOf(ym);
  const known = MONTHLY_PREMIUM[String(fy)];
  if (known !== undefined) return { amount: known, fiscalYear: fy, estimated: false };
  const years = Object.keys(MONTHLY_PREMIUM).map(Number).sort((a, b) => a - b);
  const nearest = fy > years[years.length - 1] ? years[years.length - 1] : years[0];
  return { amount: MONTHLY_PREMIUM[String(nearest)], fiscalYear: fy, estimated: true };
}

// ------------------------------------------------------------ 計算

/** 誰の分を出すか */
export type Role = 'mother' | 'father' | 'adoptive';

export const ROLE_LABELS: Record<Role, string> = {
  mother: '出産した本人（実母）',
  father: '実父',
  adoptive: '養父母',
};

/** 国民年金の区分。第1号被保険者以外は計算しない */
export type Category = 'first' | 'other';

export interface MenjoInput {
  /** 子の生年月日（生まれる前なら出産予定日） */
  birthDate: DateParts;
  role: Role;
  category: Category;
  /** 多胎妊娠（実母の産前産後免除が 6 か月になる） */
  multiple?: boolean;
  /** 養父母のみ：養育を始めた日（縁組の日）。省略時は子の生年月日 */
  adoptionDate?: DateParts;
  /**
   * 実母のみ：産前産後免除の期間が無い（出産のころ第1号被保険者でなかった等）。
   * 年金機構のページどおり、実父と同じく生まれた月から最大 12 か月で数える
   */
  noSanzen?: boolean;
}

/** 月の帯の 1 マス */
export interface MonthCell {
  ym: string;
  /**
   * - `sanzen`: 産前産後免除
   * - `ikuji`: 育児免除
   * - `before-enforcement`: 本来なら免除の期間だが施行日より前なので対象外
   */
  kind: 'sanzen' | 'ikuji' | 'before-enforcement';
  /** その月の保険料（`before-enforcement` は 0 扱いで合計に入れない） */
  premium: number;
  /** 保険料が未公表の年度の概算か */
  estimated: boolean;
}

/** 連続する期間（どちらも 'YYYY-MM'。月数 0 なら null で表す） */
export interface Period {
  from: string;
  to: string;
  months: number;
}

export interface MenjoResult {
  /** 第1号被保険者か。false なら以下は空 */
  eligible: boolean;
  role: Role;
  /** 産前産後免除（実母のみ。施行日前の月を除いたあと） */
  sanzen: Period | null;
  /** 育児免除（施行日の壁を当てたあと） */
  ikuji: Period | null;
  /** 施行日の壁で落ちた育児免除の月数 */
  ikujiDroppedMonths: number;
  /** 帯に並べる月（産前産後・育児・施行日前の対象外） */
  cells: MonthCell[];
  /** 免除される月数（産前産後 + 育児） */
  exemptMonths: number;
  /** 免除される保険料の合計（円） */
  amount: number;
  /** 概算の月（保険料が未公表の年度）の数と、その範囲 */
  estimatedMonths: number;
  estimatedPeriod: Period | null;
  /** 免除額の内訳（年度ごと） */
  byFiscalYear: { fiscalYear: number; months: number; premium: number; estimated: boolean }[];
  /**
   * 育児免除の届出が不要になりうるか（産前産後免除の期間が 2026-09 以降に終わる実母。
   * 産前産後免除を届け出ていれば、年金機構から該当通知書が届く）
   */
  noFilingIfSanzenFiled: boolean;
}

function period(months: number[]): Period | null {
  if (months.length === 0) return null;
  return {
    from: formatMonth(months[0]),
    to: formatMonth(months[months.length - 1]),
    months: months.length,
  };
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

const EMPTY = (role: Role): MenjoResult => ({
  eligible: false,
  role,
  sanzen: null,
  ikuji: null,
  ikujiDroppedMonths: 0,
  cells: [],
  exemptMonths: 0,
  amount: 0,
  estimatedMonths: 0,
  estimatedPeriod: null,
  byFiscalYear: [],
  noFilingIfSanzenFiled: false,
});

/**
 * 免除される月と額を出す。
 *
 * - 産前産後免除（実母のみ）＝ 出産（予定）月の前月から 4 か月（多胎：3 か月前から 6 か月）
 * - 育児免除の始まり ＝ 実母：産前産後免除の翌月 ／ 実父：生まれた月 ／ 養父母：縁組の月
 * - 育児免除の終わり ＝ 1 歳の誕生日の前月（実母は始まりから 9 か月目と早いほう）
 * - 施行日の壁：2026-10 より前の月は育児免除の対象外
 *
 * **施行日の壁は、終わりを決めたあとで当てる。** 施行日前に生まれた子の実母は
 * 「10 月から 9 か月」ではなく「産前産後免除の翌月から 9 か月目まで」のうち 10 月以降だけ
 * （年金機構の「施行時点で 1 歳未満なら令和8年10月分から」は始まりを繰り下げるだけ）。
 *
 * 「1 歳の誕生日の前月」は誕生日の月で数える。**1 日生まれも同じ**（年金機構の育児免除ページの例：
 * 令和9年5月1日生まれの実父は令和9年5月〜令和10年4月。年齢計算法の前日到達で前々月にしない）。
 * 施行日前の実母の読み方も同ページの例（令和8年1月1日生まれ → 令和8年10〜12月の 3 か月）で確認済み。
 */
export function calcMenjo(input: MenjoInput): MenjoResult {
  const { role, birthDate } = input;
  if (input.category !== 'first') return EMPTY(role);

  const birth = monthOf(birthDate);
  const oneYearBefore = birth + 11; // 1 歳の誕生日の前月
  const ikujiStartWall = parseMonth(IKUJI_START)!;
  const sanzenStartWall = parseMonth(SANZEN_START)!;

  // 産前産後免除（実母のみ）
  const withSanzen = role === 'mother' && !input.noSanzen;
  let sanzenAll: number[] = [];
  if (withSanzen) {
    const len = input.multiple ? SANZEN_MONTHS_MULTIPLE : SANZEN_MONTHS_SINGLE;
    const start = birth - (input.multiple ? 3 : 1);
    sanzenAll = range(start, start + len - 1);
  }
  const sanzenMonths = sanzenAll.filter((m) => m >= sanzenStartWall);

  // 育児免除（施行日の壁を当てる前）
  let ikujiFrom: number;
  let ikujiTo: number;
  if (withSanzen) {
    ikujiFrom = sanzenAll[sanzenAll.length - 1] + 1;
    ikujiTo = Math.min(oneYearBefore, ikujiFrom + IKUJI_MONTHS_MOTHER - 1);
  } else {
    const start = role === 'adoptive' && input.adoptionDate ? monthOf(input.adoptionDate) : birth;
    ikujiFrom = Math.max(start, birth);
    ikujiTo = Math.min(oneYearBefore, ikujiFrom + IKUJI_MONTHS_OTHERS - 1);
  }
  const ikujiAll = range(ikujiFrom, ikujiTo);
  const ikujiMonths = ikujiAll.filter((m) => m >= ikujiStartWall);
  const dropped = ikujiAll.filter((m) => m < ikujiStartWall);

  const cells: MonthCell[] = [];
  const push = (m: number, kind: MonthCell['kind']) => {
    const ym = formatMonth(m);
    const p = premiumFor(ym);
    cells.push({
      ym,
      kind,
      premium: kind === 'before-enforcement' ? 0 : p.amount,
      estimated: kind === 'before-enforcement' ? false : p.estimated,
    });
  };
  for (const m of sanzenAll) push(m, m >= sanzenStartWall ? 'sanzen' : 'before-enforcement');
  for (const m of ikujiAll) push(m, m >= ikujiStartWall ? 'ikuji' : 'before-enforcement');

  const exempt = cells.filter((c) => c.kind !== 'before-enforcement');
  const amount = exempt.reduce((s, c) => s + c.premium, 0);
  const estimated = exempt.filter((c) => c.estimated).map((c) => parseMonth(c.ym)!);

  const fyMap = new Map<number, { months: number; premium: number; estimated: boolean }>();
  for (const c of exempt) {
    const fy = fiscalYearOf(c.ym);
    const e = fyMap.get(fy) ?? { months: 0, premium: c.premium, estimated: c.estimated };
    e.months += 1;
    fyMap.set(fy, e);
  }

  const sanzenEnd = sanzenAll.length ? sanzenAll[sanzenAll.length - 1] : -1;

  return {
    eligible: true,
    role,
    sanzen: period(sanzenMonths),
    ikuji: period(ikujiMonths),
    ikujiDroppedMonths: dropped.length,
    cells,
    exemptMonths: exempt.length,
    amount,
    estimatedMonths: estimated.length,
    estimatedPeriod: period(estimated),
    byFiscalYear: [...fyMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([fiscalYear, v]) => ({ fiscalYear, ...v })),
    noFilingIfSanzenFiled: withSanzen && sanzenEnd >= ikujiStartWall - 1,
  };
}

/**
 * 配偶者の分。実母 ↔ 実父、養父母 ↔ 養父母で組む。
 * 配偶者も第1号被保険者のときだけ呼ぶ
 */
export function spouseRole(role: Role): Role {
  if (role === 'mother') return 'father';
  if (role === 'father') return 'mother';
  return 'adoptive';
}

/**
 * 月の帯を段に分ける。**12 マスを超えるときは年度の境（4 月）で折り返す**
 * （多胎の実母は最大 15 マス。360px 幅で 1 段に並べると潰れるため）
 */
export function splitRows(cells: MonthCell[]): MonthCell[][] {
  if (cells.length <= 12) return [cells];
  const rows: MonthCell[][] = [];
  let current: MonthCell[] = [];
  for (const c of cells) {
    if (current.length > 0 && c.ym.endsWith('-04')) {
      rows.push(current);
      current = [];
    }
    current.push(c);
  }
  if (current.length) rows.push(current);
  return rows;
}

