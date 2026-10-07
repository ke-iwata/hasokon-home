/**
 * 七五三・厄年・長寿祝い（年祝い）の年を出すロジック
 *
 * 仕様: docs/features/shichigosan-yakudoshi-hayamihyo.md
 *
 * 2 ページ（`/shichigosan/`・`/yakudoshi/`）で共有する。すべて純関数で、
 * DOM・React・現在時刻に依存しない（「今日」は呼び出し側から渡す）。
 *
 * 計算の芯は **数え年 ＝ 対象の年 − 生まれ年 ＋ 1** だけ。誕生日に依らない。
 * 満年齢・和暦・学年（早生まれ）は年齢計算（`lib/nenrei.ts`）が持ち主で、ここは import するだけ。
 *
 * 宗教的な主張はしない。出すのは「年齢と年の対応（暦の計算）」だけで、
 * 厄年の年齢・区切り（1 月 1 日か立春か）が寺社・地域で違うことは画面の注記で断る。
 */

import {
  dayOfWeek,
  schoolYears,
  TABLE_END_YEAR,
  WEEKDAY_LABELS,
  warekiYearLabels,
  type DateParts,
} from './nenrei';

// ---------------------------------------------------------------- 年の定数

/**
 * 【データ更新箇所】七五三のページの title・description・早見表（SSR）の年。11 月 15 日の当年。
 *
 * **11-16 以降、年内に翌年へ上げる**（11-15 を過ぎると「今年の七五三」の検索は終わり、
 * 翌年の準備の検索に変わる）。上げる作業はこの 1 行と registry の `updatedAt`。
 * `tests/toshi-iwai.test.ts` が「今年か来年」であることを見張っている。
 *
 * `HAYAMIHYO_BASE_YEAR`（年齢計算）は「今年と一致する」ことを強制されているので使わない。
 */
export const SHICHIGOSAN_YEAR = 2026;

/**
 * 【データ更新箇所】厄年・長寿祝いのページの title・description・早見表（SSR）の年。
 * 厄除けの時期（1〜2 月）の年。
 *
 * **10 月に翌年へ上げる**（厄除けの検索は 12 月から翌年の表を探す。2026 年は初版から 2027）。
 * 1〜2 月はその年＝定数の年なのでそのまま。次の切り替えは 2027-10 に 2028 へ。
 */
export const YAKUDOSHI_YEAR = 2027;

/** 入力できる生まれ年の下限。表示する年の上限は年齢計算の早見表と同じ `TABLE_END_YEAR` */
export const MIN_BIRTH_YEAR = 1900;
export const MAX_BIRTH_YEAR = TABLE_END_YEAR;

/** 七五三を祝う日（その年の 11 月 15 日） */
export const SHICHIGOSAN_MONTH = 11;
export const SHICHIGOSAN_DAY = 15;

/** 生まれ年が扱える範囲か（1900〜2040） */
export function isBirthYearInRange(birthYear: number): boolean {
  return Number.isInteger(birthYear) && birthYear >= MIN_BIRTH_YEAR && birthYear <= MAX_BIRTH_YEAR;
}

function assertBirthYear(birthYear: number): void {
  if (!isBirthYearInRange(birthYear)) {
    throw new RangeError(
      `生まれ年は${MIN_BIRTH_YEAR}年〜${MAX_BIRTH_YEAR}年で入力してください（${birthYear}）`
    );
  }
}

// ---------------------------------------------------------------- 数え年

/** 数え年。対象の年 − 生まれ年 + 1（誕生日に依らない） */
export function kazoeAge(birthYear: number, year: number): number {
  assertBirthYear(birthYear);
  return year - birthYear + 1;
}

/** 数え年 n になる年 */
export function yearOfKazoe(birthYear: number, n: number): number {
  assertBirthYear(birthYear);
  return birthYear + n - 1;
}

/** その年中に満年齢 n になる年（その年の誕生日で n 歳） */
export function yearOfMan(birthYear: number, n: number): number {
  assertBirthYear(birthYear);
  return birthYear + n;
}

/** 西暦の年に和暦を添えた表記。改元の年は両方（'2019年（平成31年／令和元年）'） */
export function yearWithWareki(year: number): string {
  const labels = warekiYearLabels(year);
  return labels.length > 0 ? `${year}年（${labels.join('／')}）` : `${year}年`;
}

// ---------------------------------------------------------------- 年またぎ（基準の年の既定値）

/**
 * 日本の暦日での「今日」。`new Date('YYYY-MM-DD')` の UTC 解釈や、
 * 端末のタイムゾーンで 1 日ずれないよう Asia/Tokyo で取り出す。
 */
export function todayInJapan(now: Date): DateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * 七五三のページの「基準の年」の既定値（ブラウザでマウント後だけに使う）。
 * 11-16〜12-31 は来年、それ以外は今年。
 */
export function defaultShichigosanYear(today: DateParts): number {
  const afterDay =
    today.month > SHICHIGOSAN_MONTH ||
    (today.month === SHICHIGOSAN_MONTH && today.day > SHICHIGOSAN_DAY);
  return afterDay ? today.year + 1 : today.year;
}

/**
 * 厄年のページの「基準の年」の既定値（ブラウザでマウント後だけに使う）。
 * 10-01〜12-31 は来年、それ以外は今年。
 */
export function defaultYakudoshiYear(today: DateParts): number {
  return today.month >= 10 ? today.year + 1 : today.year;
}

/** 「基準の年」の選択肢（今年・来年）。既定値が外れていれば足す */
export function baseYearChoices(thisYear: number, ...extra: number[]): number[] {
  return [...new Set([thisYear, thisYear + 1, ...extra])].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- 七五三

export type ShichigosanAge = 3 | 5 | 7;
/** 七五三の性別の選択。'both' は両方表示 */
export type ChildSex = 'boy' | 'girl' | 'both';

/** 一般に、男の子は 3・5 歳、女の子は 3・7 歳（男の子の 3 歳を祝うかは地域で違う） */
export const SHICHIGOSAN_AGES: Record<ChildSex, readonly ShichigosanAge[]> = {
  boy: [3, 5],
  girl: [3, 7],
  both: [3, 5, 7],
};

/** 七五三の年 1 つ */
export interface ShichigosanYear {
  age: ShichigosanAge;
  /** 数え年でその年齢になる年 */
  kazoe: number;
  /** その年中に満年齢でその年齢になる年 */
  man: number;
}

/** 七五三：子の生まれ年から、数え・満それぞれで 3/5/7 歳になる年 */
export function shichigosanYears(
  birthYear: number,
  sex: ChildSex = 'both'
): ShichigosanYear[] {
  assertBirthYear(birthYear);
  return SHICHIGOSAN_AGES[sex].map((age) => ({
    age,
    kazoe: yearOfKazoe(birthYear, age),
    man: yearOfMan(birthYear, age),
  }));
}

/**
 * 早生まれの子が「同じ学年のお友だちと揃えるなら」の年。
 *
 * 学年で揃える年 ＝ `cohortYear + n`。`cohortYear` は「何年度生まれの学年か」で、
 * 早生まれ（1/1〜4/1）なら生まれ年 − 1。同じ学年の多数派（4/2〜12/31 生まれ）が
 * その年中に満 n 歳になる年で、早生まれの子自身の満 n の年の前年（＝数え年の年と同じ）。
 *
 * 早生まれでなければ null（行を出さない）。年だけの入力では判定できないので、呼ばない。
 */
export function cohortAlignedYear(birth: DateParts, age: number): number | null {
  assertBirthYear(birth.year);
  const school = schoolYears(birth);
  return school.hayaumare ? school.cohortYear + age : null;
}

/** 早生まれの子の学年（何年度生まれか）。早生まれでなければ null */
export function hayaumareCohort(birth: DateParts): number | null {
  const school = schoolYears(birth);
  return school.hayaumare ? school.cohortYear : null;
}

/** 七五三の早見表の 1 行（その年に祝う子の生まれ年） */
export interface ShichigosanTableRow {
  age: ShichigosanAge;
  /** 数え年で祝うなら、この年に生まれた子 */
  kazoeBirthYear: number;
  /** 満年齢で祝うなら（その年中にその年齢になる）、この年に生まれた子 */
  manBirthYear: number;
}

/** その年の七五三の早見表 */
export function shichigosanTable(year: number): ShichigosanTableRow[] {
  return SHICHIGOSAN_AGES.both.map((age) => ({
    age,
    kazoeBirthYear: year - age + 1,
    manBirthYear: year - age,
  }));
}

/** その年の 11 月 15 日の曜日（'日'〜'土'） */
export function shichigosanWeekday(year: number): string {
  return WEEKDAY_LABELS[dayOfWeek({ year, month: SHICHIGOSAN_MONTH, day: SHICHIGOSAN_DAY })];
}

// ---------------------------------------------------------------- 厄年

export type Sex = 'male' | 'female';
export type YakuKind = 'mae' | 'hon' | 'ato';

export const YAKU_KIND_LABELS: Record<YakuKind, string> = {
  mae: '前厄',
  hon: '本厄',
  ato: '後厄',
};

/**
 * 【データ更新箇所】本厄の数え年。一般に男性 25・42・61、女性 19・33・37。
 * 女性の 61 は含める寺社もあるので `FEMALE_61` を option で足す（既定は含めない）。
 */
export const HON_YAKU: Record<Sex, readonly number[]> = {
  male: [25, 42, 61],
  female: [19, 33, 37],
};

/** 厄年の固定の注記（画面・早見表の下に必ず出す） */
export const YAKU_NOTE =
  '厄年の年齢や数え方（1月1日で区切るか立春で区切るか）は寺社・地域によって異なります。お参りの時期や作法は、お参りする寺社に確認してください。';

/** 女性で option として本厄に含める数え年 */
export const FEMALE_61 = 61;

/** 大厄（男性 42・女性 33） */
export const TAIYAKU: Record<Sex, number> = {
  male: 42,
  female: 33,
};

export interface YakuOptions {
  /** 女性の数え 61 を本厄に含めるか（既定 false） */
  female61?: boolean;
}

/** その性別の本厄の数え年（option を反映） */
export function honYakuAges(sex: Sex, opts: YakuOptions = {}): number[] {
  return sex === 'female' && opts.female61 ? [...HON_YAKU.female, FEMALE_61] : [...HON_YAKU[sex]];
}

const KIND_OFFSET: Record<YakuKind, number> = { mae: -1, hon: 0, ato: 1 };
const KINDS: YakuKind[] = ['mae', 'hon', 'ato'];

/** 厄 1 つ */
export interface Yaku {
  kind: YakuKind;
  /** その年の数え年 */
  age: number;
  /** 本厄の数え年（前厄・後厄の行でもどの本厄の前後かが分かるように） */
  honAge: number;
  /** 大厄（の前後）か */
  taiyaku: boolean;
}

/** その年の厄（無ければ null） */
export function yakuOf(
  birthYear: number,
  year: number,
  sex: Sex,
  opts: YakuOptions = {}
): Yaku | null {
  const age = kazoeAge(birthYear, year);
  for (const honAge of honYakuAges(sex, opts)) {
    for (const kind of KINDS) {
      if (honAge + KIND_OFFSET[kind] === age) {
        return { kind, age, honAge, taiyaku: honAge === TAIYAKU[sex] };
      }
    }
  }
  return null;
}

/** 一生分の厄年の 1 行 */
export interface YakuYear extends Yaku {
  year: number;
}

/** 一生分（数え 100 まで）の前厄・本厄・後厄の年 */
export function lifetimeYaku(birthYear: number, sex: Sex, opts: YakuOptions = {}): YakuYear[] {
  assertBirthYear(birthYear);
  return honYakuAges(sex, opts).flatMap((honAge) =>
    KINDS.map((kind) => {
      const age = honAge + KIND_OFFSET[kind];
      return {
        kind,
        age,
        honAge,
        taiyaku: honAge === TAIYAKU[sex],
        year: yearOfKazoe(birthYear, age),
      };
    })
  );
}

/**
 * 基準の年の厄、無ければ次の厄（どちらも無ければ null）。
 * 画面の太字 1 行「あなたは 2027 年が本厄」「次の厄年は 2031 年（前厄）」に使う。
 */
export function currentOrNextYaku(
  birthYear: number,
  year: number,
  sex: Sex,
  opts: YakuOptions = {}
): { yaku: YakuYear; current: boolean } | null {
  const next = lifetimeYaku(birthYear, sex, opts).find((y) => y.year >= year);
  return next ? { yaku: next, current: next.year === year } : null;
}

/** 厄年の早見表の 1 行 */
export interface YakudoshiTableRow {
  /** その年の数え年 */
  age: number;
  kind: YakuKind;
  honAge: number;
  taiyaku: boolean;
  /** この年に生まれた人が、その年に当たる */
  birthYear: number;
}

/** その年に厄年に当たる生まれ年の表（早見表用）。本厄の年齢ごとに前厄・本厄・後厄の順 */
export function yakudoshiTable(
  year: number,
  sex: Sex,
  opts: YakuOptions = {}
): YakudoshiTableRow[] {
  return honYakuAges(sex, opts).flatMap((honAge) =>
    KINDS.map((kind) => {
      const age = honAge + KIND_OFFSET[kind];
      return {
        age,
        kind,
        honAge,
        taiyaku: honAge === TAIYAKU[sex],
        birthYear: year - age + 1,
      };
    })
  );
}

// ---------------------------------------------------------------- 長寿祝い

/** 長寿祝い 1 つ */
export interface Choju {
  name: string;
  reading: string;
  /** 祝う年齢（数え年の伝統の年齢。緑寿は満年齢） */
  age: number;
  /** 'both'＝数え・満の両方を出す、'man'＝満のみ（緑寿） */
  basis: 'both' | 'man';
  /** 満年齢で祝うときの年齢。還暦だけ 60（干支が一巡する満 60＝数え 61） */
  manAge: number;
}

/**
 * 【データ更新箇所】長寿祝い。還暦（数え 61・満 60）〜百寿。
 *
 * 緑寿は 2002 年に提唱された新しい呼び方で、満 66 で祝うものとされるのが一般的なので
 * `basis: 'man'`（数え年の列を出さない）。ほかは数え年が伝統で、満年齢で祝うことも多いので両方。
 */
export const CHOJU: readonly Choju[] = [
  { name: '還暦', reading: 'かんれき', age: 61, basis: 'both', manAge: 60 },
  { name: '緑寿', reading: 'ろくじゅ', age: 66, basis: 'man', manAge: 66 },
  { name: '古希', reading: 'こき', age: 70, basis: 'both', manAge: 70 },
  { name: '喜寿', reading: 'きじゅ', age: 77, basis: 'both', manAge: 77 },
  { name: '傘寿', reading: 'さんじゅ', age: 80, basis: 'both', manAge: 80 },
  { name: '米寿', reading: 'べいじゅ', age: 88, basis: 'both', manAge: 88 },
  { name: '卒寿', reading: 'そつじゅ', age: 90, basis: 'both', manAge: 90 },
  { name: '白寿', reading: 'はくじゅ', age: 99, basis: 'both', manAge: 99 },
  { name: '百寿', reading: 'ひゃくじゅ', age: 100, basis: 'both', manAge: 100 },
];

/** 長寿祝いの年 1 つ */
export interface ChojuYear {
  choju: Choju;
  /** 数え年で祝う年。満のみ（緑寿）は null */
  kazoe: number | null;
  /** 満年齢で祝う年 */
  man: number;
}

/** 生まれ年から、長寿祝いの年（数え・満） */
export function chojuYears(birthYear: number): ChojuYear[] {
  assertBirthYear(birthYear);
  return CHOJU.map((choju) => ({
    choju,
    kazoe: choju.basis === 'both' ? yearOfKazoe(birthYear, choju.age) : null,
    man: yearOfMan(birthYear, choju.manAge),
  }));
}

/** 長寿祝いの早見表の 1 行 */
export interface ChojuTableRow {
  choju: Choju;
  /** 数え年で祝うなら、この年に生まれた人。満のみは null */
  kazoeBirthYear: number | null;
  /** 満年齢で祝うなら、この年に生まれた人 */
  manBirthYear: number;
}

/** その年の長寿祝いの早見表 */
export function chojuTable(year: number): ChojuTableRow[] {
  return CHOJU.map((choju) => ({
    choju,
    kazoeBirthYear: choju.basis === 'both' ? year - choju.age + 1 : null,
    manBirthYear: year - choju.manAge,
  }));
}

// ---------------------------------------------------------------- ページの文言

/** 本厄の行だけを引く（description・h1 直下の 1 行に使う） */
function honBirthYear(year: number, sex: Sex, honAge: number): number {
  const row = yakudoshiTable(year, sex).find((r) => r.honAge === honAge && r.kind === 'hon');
  if (!row) throw new Error(`本厄 ${honAge} が無い`);
  return row.birthYear;
}

/** 大厄（本厄）の生まれ年（男性・女性） */
export function taiyakuBirthYears(year: number): Record<Sex, number> {
  return {
    male: honBirthYear(year, 'male', TAIYAKU.male),
    female: honBirthYear(year, 'female', TAIYAKU.female),
  };
}

/**
 * 七五三のページの description。年を含む文言は定数から組み立てる（毎年の手直しを 1 か所に）。
 * 数字は `shichigosanTable()` から取り、手書きしない。
 */
export function shichigosanDescription(year: number): string {
  const rows = shichigosanTable(year);
  const kazoe = rows.map((r) => r.kazoeBirthYear).join('・');
  const man = rows.map((r) => r.manBirthYear).join('・');
  return `${year}年の七五三（3歳・5歳・7歳）は、数え年なら${kazoe}年生まれ、満年齢なら${man}年生まれ。子どもの生年月日を入れると、数え年・満年齢それぞれで七五三の年と11月15日の曜日が分かります。早生まれの子が同じ学年と揃える年も表示する無料の早見表・計算ツールです。`;
}

/**
 * 厄年のページの description。数字は `yakudoshiTable()`・`chojuTable()` から取る。
 */
export function yakudoshiDescription(year: number): string {
  const taiyaku = taiyakuBirthYears(year);
  const kanreki = chojuTable(year).find((r) => r.choju.name === '還暦');
  return `${year}年の大厄（本厄）は男性${taiyaku.male}年生まれ・女性${taiyaku.female}年生まれ。生年月日を入れると、数え年で前厄・本厄・後厄の年を一生分の表で出します。還暦（${year}年は${kanreki?.manBirthYear}年生まれ）・古希・喜寿・米寿など長寿祝いの年も数え年・満年齢の両方で分かる無料の早見表です。`;
}
