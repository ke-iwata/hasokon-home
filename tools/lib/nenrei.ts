/**
 * 年齢計算・西暦⇔和暦変換のロジック
 *
 * 仕様: docs/features/nenrei-keisan.md
 *
 * 扱うのは次の4つ。すべて純関数で、DOM・React・現在時刻に依存しない
 * （「今日」は呼び出し側から基準日として渡す）。
 *
 * 1. 満年齢（年齢計算ニ関スル法律・民法143条の考え方にそろえる）
 * 2. 西暦⇔和暦の相互変換（明治以降）
 * 3. 干支（十二支・十干十二支）
 * 4. 学年の目安（早生まれ＝1月1日〜4月1日の繰り上がりを含む）
 * 5. 満◯歳◯ヶ月と、年齢早見表・逆引き早見表
 *    （仕様: docs/features/nenrei-hayamihyo-seo.md）
 *
 * 日付そのものの扱い（DateParts・うるう年・日数の差・曜日）は
 * `lib/date-parts.ts` に切り出してある。日数計算ツール（`lib/nissu-keisan.ts`）と
 * 共有するため。ここからは従来どおりの名前で再エクスポートしている。
 */

import {
  compareDate,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  formatDate,
  formatJa,
  isLeapYear,
  isValidDate,
  parseDate,
  WEEKDAY_LABELS,
  type DateParts,
} from './date-parts';

// 年齢計算の利用側（Calculator・テスト）が従来どおり @/lib/nenrei から引けるようにする
export {
  compareDate,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  formatDate,
  formatJa,
  isLeapYear,
  isValidDate,
  parseDate,
  WEEKDAY_LABELS,
} from './date-parts';
export type { DateParts } from './date-parts';

// ---------------------------------------------------------------- 元号データ

/**
 * 【データ更新箇所】元号（明治以降）。
 *
 * 改元があったら、現行元号（end を持たない要素）に `end` を入れ、
 * 新元号を配列の末尾に足す。開始日・終了日はどちらも「その元号だった日」で、
 * 改元日は新元号側の `start` と旧元号側の `end` の翌日が一致する。
 *
 * 例: 昭和は 1989-01-07 まで、平成は 1989-01-08 から。
 * 1989年は「昭和64年」と「平成元年」の両方が存在する（早見表で重複を明示している）。
 *
 * 明治より前（慶応以前）は扱わない。旧暦（太陰太陽暦）で運用されていて、
 * 西暦の月日と1対1で対応しないため。
 */
export const ERAS: Era[] = [
  { name: '明治', initial: 'M', start: '1868-01-25', end: '1912-07-29' },
  { name: '大正', initial: 'T', start: '1912-07-30', end: '1926-12-24' },
  { name: '昭和', initial: 'S', start: '1926-12-25', end: '1989-01-07' },
  { name: '平成', initial: 'H', start: '1989-01-08', end: '2019-04-30' },
  { name: '令和', initial: 'R', start: '2019-05-01' },
];

export interface Era {
  /** 元号名（'令和' など） */
  name: string;
  /** 頭文字（S63 のような略記に使う） */
  initial: string;
  /** その元号の初日 'YYYY-MM-DD' */
  start: string;
  /** その元号の最終日 'YYYY-MM-DD'。現行元号は持たない */
  end?: string;
}

/**
 * 【データ更新箇所】日本がグレゴリオ暦（新暦）を採用した日。
 *
 * 明治5年12月2日の翌日が明治6年1月1日＝1873-01-01。
 * これより前の和暦の月日は旧暦なので、西暦の月日へ機械的に変換できない
 * （年の対応だけを示し、月日については注記を出す）。
 */
export const GREGORIAN_START = '1873-01-01';

/**
 * 【データ更新箇所】西暦⇔和暦 早見表の、現行元号側の掲載上限。
 *
 * 「令和◯年は西暦何年」を先の年まで引けるようにするための余白。
 * ビルド時刻から作ると、ビルドのたびに表の行数が変わってテストが不安定になるので
 * 固定値で持つ。表の末尾に近づいたら伸ばす。
 */
export const TABLE_END_YEAR = 2040;

/**
 * 【データ更新箇所】年齢早見表・逆引き早見表の基準年（「◯年版」の◯）。
 *
 * 「今年の誕生日で何歳になるか」「18歳は何年生まれか」は**基準年が変わると答えが変わる**。
 * 静的書き出しのサイトなので `new Date()` をページに埋めると、ビルドし直さないかぎり
 * 前の年のまま配信されつづける。かといってビルド時刻から作ると、
 * 年をまたいだときに title の「【◯年版】」や本文の言い回しだけが取り残されて
 * 表と食い違う（表は新しい年、文章は去年、という腐り方をする）。
 *
 * そこで**基準年を1つの定数に固定し、`tests/nenrei.test.ts` で
 * `new Date().getFullYear()` と一致することを検証している**。
 * 年が変わると最初のテスト実行で落ちるので、更新が強制される
 * （`lib/saitei-chingin.ts` の `DATA_CHECKED_AT` と同じ「鮮度を見張る」やり方）。
 *
 * 年が変わったらこの値だけを直せば、title・見出し・本文・2つの表がまとめて追随する。
 */
export const HAYAMIHYO_BASE_YEAR = 2026;

/** 逆引き早見表（年齢→生まれ年）に載せる最大の年齢 */
export const GYAKUBIKI_MAX_AGE = 100;

/** 元号名から Era を引く */
export function findEra(name: string): Era | undefined {
  return ERAS.find((e) => e.name === name);
}

/** その元号の元年にあたる西暦年 */
export function eraBaseYear(era: Era): number {
  return Number(era.start.slice(0, 4));
}

/**
 * その元号に存在する最大の和暦年。
 * 現行元号は TABLE_END_YEAR まで（実際には改元まで続く）。
 */
export function maxEraYear(era: Era): number {
  const last = era.end ? Number(era.end.slice(0, 4)) : TABLE_END_YEAR;
  return last - eraBaseYear(era) + 1;
}

/** 和暦の年の表記。1年は「元年」と書く */
export function eraYearLabel(eraName: string, eraYear: number): string {
  return `${eraName}${eraYear === 1 ? '元' : eraYear}年`;
}

// ---------------------------------------------------------------- 西暦⇔和暦

/** 和暦の日付 */
export interface WarekiDate {
  era: string;
  /** 和暦の年（元年は1） */
  eraYear: number;
  month: number;
  day: number;
  /** '平成10年5月3日' の形 */
  label: string;
  /** 'H10.5.3' の形（書類でよく使う略記） */
  short: string;
  /** 旧暦（明治5年12月2日以前）で、月日が西暦と対応しないか */
  lunisolar: boolean;
}

/**
 * 西暦 → 和暦。明治より前は null（旧暦なので変換しない）。
 *
 * 改元日はその日から新元号になる（1989-01-07=昭和64年、1989-01-08=平成元年）。
 */
export function toWareki(date: DateParts): WarekiDate | null {
  const iso = formatDate(date);
  const era = ERAS.find((e) => iso >= e.start && (!e.end || iso <= e.end));
  if (!era) return null;
  const eraYear = date.year - eraBaseYear(era) + 1;
  return {
    era: era.name,
    eraYear,
    month: date.month,
    day: date.day,
    label: `${eraYearLabel(era.name, eraYear)}${date.month}月${date.day}日`,
    short: `${era.initial}${eraYear}.${date.month}.${date.day}`,
    lunisolar: iso < GREGORIAN_START,
  };
}

/** 和暦→西暦の変換に失敗した理由。UIでそのまま出せる文にしてある */
export interface WarekiError {
  error: string;
}

/**
 * 和暦 → 西暦。存在しない和暦（昭和64年1月8日など）は理由つきで返す。
 *
 * 「昭和64年1月8日」のような入力は、単に弾くのではなく
 * 「1月8日からは平成元年」と示す。書類の記入で迷いやすいところなので。
 */
export function fromWareki(
  eraName: string,
  eraYear: number,
  month: number,
  day: number
): DateParts | WarekiError {
  const era = findEra(eraName);
  if (!era) return { error: `「${eraName}」は扱える元号ではありません（明治以降に対応）。` };
  if (!Number.isInteger(eraYear) || eraYear < 1) {
    return { error: '和暦の年は1以上の整数で入力してください（元年は1）。' };
  }
  const year = eraBaseYear(era) + eraYear - 1;
  const parts = { year, month, day };
  if (!isValidDate(parts)) {
    return { error: `${eraYearLabel(eraName, eraYear)}${month}月${day}日は存在しない日付です。` };
  }
  const iso = formatDate(parts);
  if (iso < era.start) {
    const from = toWareki(parseDate(era.start) as DateParts);
    return {
      error: `${eraYearLabel(eraName, eraYear)}${month}月${day}日は存在しません（${eraName}は${from?.month}月${from?.day}日から）。`,
    };
  }
  if (era.end && iso > era.end) {
    const next = ERAS[ERAS.indexOf(era) + 1];
    const nextStart = next ? (parseDate(next.start) as DateParts) : null;
    const suffix = nextStart
      ? `（${formatJa(nextStart)}から${next.name}）`
      : '';
    return {
      error: `${eraYearLabel(eraName, eraYear)}${month}月${day}日は存在しません${suffix}。`,
    };
  }
  return parts;
}

/** fromWareki の戻り値が失敗かどうか */
export function isWarekiError(value: DateParts | WarekiError): value is WarekiError {
  return 'error' in value;
}

/** 西暦の年に対応する和暦の年ラベル。年の途中で改元した年は両方返す */
export function warekiYearLabels(year: number): string[] {
  return ERAS.filter((e) => {
    const base = eraBaseYear(e);
    const last = e.end ? Number(e.end.slice(0, 4)) : TABLE_END_YEAR;
    return year >= base && year <= last;
  }).map((e) => eraYearLabel(e.name, year - eraBaseYear(e) + 1));
}

/**
 * その年月の和暦ラベル（1つだけ）。入学・卒業年の表示に使う。
 * 改元した年でも月まで見て決まるので1つに定まる。
 */
export function warekiYearLabelAt(year: number, month: number): string | null {
  const w = toWareki({ year, month, day: 1 });
  return w ? eraYearLabel(w.era, w.eraYear) : null;
}

// ---------------------------------------------------------------- 早見表

/** 西暦⇔和暦 早見表の1行 */
export interface WarekiTableRow {
  /** '昭和64年' の形 */
  label: string;
  eraYear: number;
  year: number;
  /** 十干十二支（'己巳' など） */
  eto: string;
  /** 十二支だけ（'巳'） */
  zodiac: string;
  /** 改元・旧暦の注記。無い年は undefined */
  note?: string;
}

/**
 * 元号ごとの早見表。改元した年は「◯月◯日まで／から」を注記に入れる。
 *
 * 例: 1912年は「明治45年（7月29日まで）」と「大正元年（7月30日から）」の
 * 2行に現れる。どちらの表記も書類で使われるため、重複を隠さない。
 */
export function warekiTable(eraName: string): WarekiTableRow[] {
  const era = findEra(eraName);
  if (!era) return [];
  const base = eraBaseYear(era);
  const startParts = parseDate(era.start) as DateParts;
  const endParts = era.end ? (parseDate(era.end) as DateParts) : null;

  const rows: WarekiTableRow[] = [];
  for (let eraYear = 1; eraYear <= maxEraYear(era); eraYear++) {
    const year = base + eraYear - 1;
    const notes: string[] = [];
    if (year === startParts.year && !(startParts.month === 1 && startParts.day === 1)) {
      notes.push(`${startParts.month}月${startParts.day}日から`);
    }
    if (endParts && year === endParts.year) {
      notes.push(`${endParts.month}月${endParts.day}日まで`);
    }
    if (`${year}-12-31` < GREGORIAN_START) notes.push('月日は旧暦');
    rows.push({
      label: eraYearLabel(era.name, eraYear),
      eraYear,
      year,
      eto: sexagenary(year),
      zodiac: zodiac(year),
      ...(notes.length > 0 ? { note: notes.join('・') } : {}),
    });
  }
  return rows;
}

// ------------------------------------------------------- 年齢早見表・逆引き

/** ある年に生まれた人が、基準年に何歳になるか */
export interface AgeInYear {
  /** 基準年の誕生日を迎えたあとの満年齢 */
  after: number;
  /** 基準年の誕生日をまだ迎えていない人の満年齢。生まれ年＝基準年のときは null */
  before: number | null;
}

/**
 * 生まれ年（西暦）→ 基準年の満年齢。年齢早見表の「年齢」列に使う。
 *
 * 満年齢は誕生日で変わるので、1つの生まれ年に対して答えは2つある
 * （誕生日を迎えたか、まだか）。表では両方を並べて出す。
 *
 * @returns 基準年より後に生まれる年（未来）は null
 */
export function ageForBirthYear(birthYear: number, baseYear: number): AgeInYear | null {
  const after = baseYear - birthYear;
  if (after < 0) return null;
  return { after, before: after > 0 ? after - 1 : null };
}

/** 逆引き早見表（年齢→生まれ年）の1行 */
export interface GyakubikiRow {
  /** 満年齢 */
  age: number;
  /** 基準年の誕生日を迎えていれば、この年の生まれ */
  bornAfter: number;
  /** bornAfter の和暦表記。改元のあった年は2つ並ぶ（'昭和64年・平成元年'） */
  bornAfterWareki: string;
  /** 基準年の誕生日がまだなら、この年の生まれ */
  bornBefore: number;
  /** bornBefore の和暦表記 */
  bornBeforeWareki: string;
}

/**
 * 「◯歳は何年生まれ？」の逆引き早見表。
 *
 * 満年齢は誕生日で変わるため、同じ年齢でも生まれ年は2つにまたがる
 * （基準年に誕生日を迎えた人と、まだの人）。両方を列で出す。
 */
export function gyakubikiTable(
  baseYear: number,
  maxAge: number = GYAKUBIKI_MAX_AGE
): GyakubikiRow[] {
  const label = (year: number): string => warekiYearLabels(year).join('・');
  const rows: GyakubikiRow[] = [];
  for (let age = 0; age <= maxAge; age++) {
    const bornAfter = baseYear - age;
    const bornBefore = bornAfter - 1;
    rows.push({
      age,
      bornAfter,
      bornAfterWareki: label(bornAfter),
      bornBefore,
      bornBeforeWareki: label(bornBefore),
    });
  }
  return rows;
}

// ---------------------------------------------------------------- 干支

/** 十干 */
export const STEMS = ['庚', '辛', '壬', '癸', '甲', '乙', '丙', '丁', '戊', '己'] as const;

/** 十二支（西暦年を12で割った余りの順。0=申） */
export const BRANCHES = [
  '申',
  '酉',
  '戌',
  '亥',
  '子',
  '丑',
  '寅',
  '卯',
  '辰',
  '巳',
  '午',
  '未',
] as const;

/** 十二支の読み（'子（ね）' の形で出すため） */
export const BRANCH_READINGS: Record<string, string> = {
  子: 'ね',
  丑: 'うし',
  寅: 'とら',
  卯: 'う',
  辰: 'たつ',
  巳: 'み',
  午: 'うま',
  未: 'ひつじ',
  申: 'さる',
  酉: 'とり',
  戌: 'いぬ',
  亥: 'い',
};

/**
 * 十二支。西暦年だけで決まる（1月1日で切り替える暦年の数え方）。
 * 占いで使う「立春から」の数え方はここでは採らない。
 */
export function zodiac(year: number): string {
  return BRANCHES[((year % 12) + 12) % 12];
}

/** 十干十二支（60年周期）。'2026年→丙午' のように使う */
export function sexagenary(year: number): string {
  return STEMS[((year % 10) + 10) % 10] + zodiac(year);
}

// ---------------------------------------------------------------- 満年齢

/**
 * 基準日時点の満年齢。
 *
 * 誕生日の応当日と比べて求める。年齢計算ニ関スル法律では
 * 「誕生日の前日が終わる時点（24時）」に1つ増えるので、
 * **誕生日の当日にはもう新しい年齢になっている**＝この比較と一致する。
 *
 * 2月29日生まれの平年の扱いもこの比較で決まる（2月28日はまだ増えず、
 * 3月1日に増える）。民法143条2項ただし書きで期間は2月28日の終了時に満了するため、
 * 「年齢に達した日」は2月28日、その年齢で過ごす初日は3月1日になる。
 *
 * @returns 基準日が生年月日より前なら負の数（UI側で入力エラーとして扱う）
 */
export function ageAt(birth: DateParts, base: DateParts): number {
  let age = base.year - birth.year;
  if (base.month < birth.month || (base.month === birth.month && base.day < birth.day)) {
    age -= 1;
  }
  return age;
}

/**
 * 生年月日から n ヶ月後の「応当日」。
 *
 * 民法143条2項ただし書きにより、応当日が無い月（31日生まれの4月など）は
 * **その月の末日の終了時**に期間が満了する。満了した状態で過ごす初日は翌月1日なので、
 * 満年齢で2月29日生まれが平年は3月1日に増えるのと同じ流儀にそろえてある
 * （`nextBirthday()` 参照）。
 *
 * 例: 1月31日生まれの1ヶ月後は3月1日（2月28日の終了時に満了するため）。
 */
export function monthAnniversary(birth: DateParts, months: number): DateParts {
  const index = birth.year * 12 + (birth.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  if (birth.day <= daysInMonth(year, month)) return { year, month, day: birth.day };
  return month === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: month + 1, day: 1 };
}

/** 満◯歳◯ヶ月◯日の内訳 */
export interface AgeDetail {
  /** 満年齢（年）。`ageAt()` と同じ値 */
  years: number;
  /** 年の端数の月数（0〜11） */
  months: number;
  /** 月の端数の日数（0以上。月の長さによって最大30） */
  days: number;
  /** 生まれてからの通算月数（「生後◯ヶ月」に使う） */
  totalMonths: number;
}

/**
 * 基準日時点の「満◯歳◯ヶ月◯日」。
 *
 * 月の数え方は満年齢と同じで、**応当日を迎えていない月は数えない**。
 * 通算月数は「月の差 − （基準日の日が誕生日の日より前なら1）」で求まり、
 * これは `monthAnniversary()` を満たす最大の n と一致する
 * （31日生まれ・2月29日生まれの繰り上がりも含めて一致することはテストで固定している）。
 *
 * @returns 基準日が生年月日より前なら null（未来の生年月日は計算しない）
 */
export function ageDetail(birth: DateParts, base: DateParts): AgeDetail | null {
  if (compareDate(base, birth) < 0) return null;
  let totalMonths = (base.year - birth.year) * 12 + (base.month - birth.month);
  if (base.day < birth.day) totalMonths -= 1;
  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days: daysBetween(monthAnniversary(birth, totalMonths), base),
    totalMonths,
  };
}

/** 次の誕生日 */
export interface NextBirthday {
  /** 次に年齢が増える日 */
  date: DateParts;
  /** 基準日からの日数（基準日が誕生日当日なら0） */
  days: number;
  /** 基準日が誕生日当日か */
  isToday: boolean;
  /** その日に迎える年齢 */
  age: number;
  /** 2月29日生まれで、平年のため3月1日に繰り下がっているか */
  shifted: boolean;
}

/**
 * 基準日から見た次の誕生日。
 *
 * 2月29日生まれは、平年には応当日が無いので3月1日を「年齢が増える日」とする
 * （民法143条2項ただし書きで2月28日の終了時に満了＝3月1日から新しい年齢）。
 */
export function nextBirthday(birth: DateParts, base: DateParts): NextBirthday {
  const anniversary = (year: number): { date: DateParts; shifted: boolean } => {
    if (birth.month === 2 && birth.day === 29 && !isLeapYear(year)) {
      return { date: { year, month: 3, day: 1 }, shifted: true };
    }
    return { date: { year, month: birth.month, day: birth.day }, shifted: false };
  };

  let candidate = anniversary(base.year);
  if (compareDate(candidate.date, base) < 0) candidate = anniversary(base.year + 1);

  return {
    date: candidate.date,
    days: daysBetween(base, candidate.date),
    isToday: compareDate(candidate.date, base) === 0,
    age: candidate.date.year - birth.year,
    shifted: candidate.shifted,
  };
}

// ---------------------------------------------------------------- 学年

/** 学年の節目1つ */
export interface SchoolMilestone {
  /** '小学校 入学' など */
  label: string;
  year: number;
  /** 4（入学）または3（卒業） */
  month: number;
  /** '2032年（令和14年）4月' の形 */
  text: string;
}

/** 学年の目安 */
export interface SchoolYears {
  /** 早生まれ（1月1日〜4月1日生まれ）か */
  hayaumare: boolean;
  /**
   * 学年のまとまりを表す年度（4月2日〜翌年4月1日生まれが同じ学年）。
   * この年度に生まれた子が、その7年後の4月に小学校へ入学する。
   */
  cohortYear: number;
  milestones: SchoolMilestone[];
}

/**
 * 【データ更新箇所】学年の節目（小学校入学を0年目としたときの経過年数と月）。
 * 学校教育法の年限（小6・中3・高3）と、4年制大学を前提にしている。
 */
const MILESTONES: { label: string; offset: number; month: number }[] = [
  { label: '小学校 入学', offset: 0, month: 4 },
  { label: '小学校 卒業', offset: 6, month: 3 },
  { label: '中学校 入学', offset: 6, month: 4 },
  { label: '中学校 卒業', offset: 9, month: 3 },
  { label: '高校 入学', offset: 9, month: 4 },
  { label: '高校 卒業', offset: 12, month: 3 },
  { label: '大学 入学（現役）', offset: 12, month: 4 },
  { label: '大学 卒業（4年制）', offset: 16, month: 3 },
];

/**
 * 生年月日から、入学・卒業年の目安を求める。
 *
 * 学校教育法17条は「満6歳に達した日の翌日以後における最初の学年の初め」から
 * 就学すると定める。年齢は誕生日の前日の終了時に増えるので、
 * **4月1日生まれは3月31日に6歳に達し、その年の4月に入学する**
 * （4月2日生まれの1年上＝早生まれ）。
 *
 * したがって「4月2日〜翌年4月1日生まれ」が同じ学年になる。
 */
export function schoolYears(birth: DateParts): SchoolYears {
  // 4月1日までに生まれた人は前年度のまとまりに入る
  const cohortYear =
    birth.month > 4 || (birth.month === 4 && birth.day >= 2) ? birth.year : birth.year - 1;
  const entryYear = cohortYear + 7;

  return {
    hayaumare: birth.month < 4 || (birth.month === 4 && birth.day === 1),
    cohortYear,
    milestones: MILESTONES.map((m) => {
      const year = entryYear + m.offset;
      const wareki = warekiYearLabelAt(year, m.month);
      return {
        label: m.label,
        year,
        month: m.month,
        text: `${year}年${wareki ? `（${wareki}）` : ''}${m.month}月`,
      };
    }),
  };
}

// ---------------------------------------------------------------- まとめ

/** 年齢計算の結果 */
export interface NenreiResult {
  birth: DateParts;
  base: DateParts;
  /** 基準日時点の満年齢 */
  age: number;
  /** 満◯歳◯ヶ月◯日の内訳（`age` と `detail.years` は同じ値） */
  detail: AgeDetail;
  /** 生年月日の和暦。明治より前は null */
  birthWareki: WarekiDate | null;
  /** 生まれた日の曜日（'金' など） */
  birthWeekday: string;
  /** 十二支（'午'） */
  zodiac: string;
  /** 十干十二支（'丙午'） */
  eto: string;
  nextBirthday: NextBirthday;
  /** 生まれてからの日数（基準日まで） */
  livedDays: number;
  school: SchoolYears;
}

/**
 * 年齢計算のひとまとめ。基準日は呼び出し側が渡す（既定値を持たない）。
 * 静的書き出しのサイトなので、ビルド時刻を「今日」として埋め込まないため。
 *
 * @returns 基準日が生年月日より前のときは null（未来の生年月日は計算しない）
 */
export function calcNenrei(birth: DateParts, base: DateParts): NenreiResult | null {
  if (compareDate(base, birth) < 0) return null;
  return {
    birth,
    base,
    age: ageAt(birth, base),
    detail: ageDetail(birth, base) as AgeDetail,
    birthWareki: toWareki(birth),
    birthWeekday: WEEKDAY_LABELS[dayOfWeek(birth)],
    zodiac: zodiac(birth.year),
    eto: sexagenary(birth.year),
    nextBirthday: nextBirthday(birth, base),
    livedDays: daysBetween(birth, base),
    school: schoolYears(birth),
  };
}
