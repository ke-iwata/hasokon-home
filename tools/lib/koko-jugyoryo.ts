/**
 * 高校授業料 実質負担 計算ロジック（高等学校等就学支援金）
 *
 * 「高校無償化」と呼ばれる高等学校等就学支援金は、**授業料に充てるための制度**で、
 * 現金が家庭に振り込まれるものではない。授業料が支給限度額を超える分と、
 * 入学金・施設費・制服・教材などの授業料以外は家庭の負担として残る。
 * その「結局いくら払うのか」を出すのがこのツール。
 *
 * ■ 2026年4月（令和8年4月1日）の改正
 * 令和8年3月31日に「高等学校等就学支援金の支給に関する法律の一部を改正する法律」が
 * 成立し、4月1日施行で**所得制限が撤廃**された。あわせて施行令の改正で
 * 支給限度額が引き上げられ、私立全日制は39.6万円 → **45万7,200円**、
 * 私立通信制は29.7万円 → **33万7,200円**（定額授業料の場合）になった。
 *
 * そのため「もらえるかどうか」の判定（世帯年収の入力）は不要になり、
 * 論点は「授業料のうちいくらが自己負担で残るか」に移った。
 * **このツールは世帯年収を入力させない。**入力項目を増やしても結果が変わらないため。
 *
 * ■ 支給限度額（令和8年4月1日〜・年額）
 * | 区分 | 国立 | 公立 | 私立 |
 * |---|---|---|---|
 * | 高等学校 全日制 | 115,200 | 118,800 | 457,200 |
 * | 高等学校 定時制 | (115,200) | 32,400 | 457,200 |
 * | 高等学校 通信制 | (115,200) | 6,240 | 337,200 |
 *
 * 単位制の授業料を設定している学校では、月額ではなく**1単位あたり**で支給される
 * （年間30単位・通算74単位まで）。私立通信制は 13,668円/単位。
 *
 * ■ このツールが扱う3つの進路
 * 仕様（docs/features/koko-jugyoryo-mushoka.md）どおり、検索需要のある
 * 公立全日制・私立全日制・私立通信制（単位制）の3つに絞っている。
 * 国立・定時制・専修学校・各種学校は入れていない（選択肢が増えるわりに需要が薄い）。
 *
 * ■ 就学支援金は授業料を超えて支給されない
 * 支給額は授業料債権に充てられるものなので、支給限度額より授業料が安ければ
 * 授業料の額までしか出ない（差額が現金でもらえるわけではない）。
 * 計算では必ず `Math.min(限度額, 実際の授業料)` を取る。
 *
 * ■ 一次情報（2026-08-14 取得）
 * - 文部科学省「令和8年度高等学校等就学支援金制度等に関する都道府県担当者等説明会」
 *   （令和8年4月8日）資料【第1部】
 *   https://www.mext.go.jp/a_menu/shotou/mushouka/202604013-mxt_shuukyo03-1342601_2.pdf
 *   - p.4「改正後の支給限度額の年額」（施行令改正・令和8年4月1日施行）
 *   - p.24「高等学校等就学支援金・新制度 支給期間・支給限度額」
 *     （定額授業料の場合の月額と、単位制授業料の場合の1単位あたりの額。
 *      ※2 として「通算74単位、年間30単位まで」の注記）
 * - 文部科学省「高校生等への修学支援」
 *   https://www.mext.go.jp/a_menu/shotou/mushouka/index.htm
 *
 * 【データ更新箇所】支給限度額が改定されたら SUPPORT_LIMITS を更新する。
 * 単位制の上限単位数は UNITS_PER_YEAR_CAP / UNITS_TOTAL_CAP。
 * 授業料以外の目安（OTHER_COST_PRESETS）は概算なので、実額を入力してもらう前提。
 */

/**
 * 進路の種別。
 * 就学支援金の支給限度額は「設置者（公立/私立）× 課程（全日制/定時制/通信制）」で
 * 決まるので、その組み合わせをそのままIDにしている。
 */
export type SchoolType = 'public-fulltime' | 'private-fulltime' | 'private-correspondence';

/** 高校の在学年数。3年間の総額を出すための既定値 */
export const DEFAULT_YEARS = 3;

/**
 * 単位制授業料の学校で、1年間に支給対象となる単位数の上限。
 * 文科省資料 p.24 の注記「通算74単位、年間30単位まで」による。
 */
export const UNITS_PER_YEAR_CAP = 30;

/** 単位制授業料の学校で、在学期間を通じて支給対象となる単位数の上限 */
export const UNITS_TOTAL_CAP = 74;

/** 定額授業料の学校の支給限度額（年額・円） */
interface FlatLimit {
  kind: 'flat';
  /** 年額の支給限度額（円） */
  yearly: number;
}

/** 単位制授業料の学校の支給限度額（1単位あたり・円） */
interface UnitLimit {
  kind: 'unit';
  /** 1単位あたりの支給限度額（円） */
  perUnit: number;
}

/**
 * 進路ごとの支給限度額。
 *
 * 【データ更新箇所】改正で額が変わったらここだけを直す。
 * 出典は上のヘッダコメント（文科省・都道府県担当者等説明会資料 p.4 / p.24）。
 */
export const SUPPORT_LIMITS: Record<SchoolType, FlatLimit | UnitLimit> = {
  // 公立全日制: 月9,900円 × 12
  'public-fulltime': { kind: 'flat', yearly: 118_800 },
  // 私立全日制: 月38,100円 × 12（全国平均授業料相当額）
  'private-fulltime': { kind: 'flat', yearly: 457_200 },
  // 私立通信制の単位制授業料: 13,668円/単位（年30単位・通算74単位まで）
  'private-correspondence': { kind: 'unit', perUnit: 13_668 },
};

/**
 * 公立高校（全日制）の授業料。
 * 全国一律で年額118,800円（月9,900円）に定められており、支給限度額と一致するため
 * 就学支援金で全額まかなえる。比較の基準としても使う。
 */
export const PUBLIC_FULLTIME_TUITION = 118_800;

/**
 * 私立高校（全日制）の年間授業料の初期値。
 * 支給上限の45万7,200円は「全国授業料平均相当額」として設定されたものなので、
 * 平均的な学校を選ぶと授業料の自己負担はほぼ残らない、という出発点になる。
 * 実際の授業料は学校ごとに違うので、学校案内の数字に差し替えてもらう前提。
 */
export const PRIVATE_FULLTIME_AVERAGE_TUITION = 457_200;

/** 通信制（単位制）の年間履修単位数の初期値。3年で74単位を無理なく満たせる標準的な組み方 */
export const CORRESPONDENCE_DEFAULT_UNITS = 25;

/** 通信制（単位制）の1単位あたり授業料の初期値（円）。学校案内の数字に差し替える前提 */
export const CORRESPONDENCE_DEFAULT_TUITION_PER_UNIT = 10_000;

/**
 * 「授業料以外」の年間費用のざっくりした目安（円）。
 *
 * **これは公式の統計値そのものではない。**文部科学省「令和5年度子供の学習費調査」の
 * 学習費総額（全日制・公立 約59.8万円／私立 約103.0万円）から、授業料と
 * 学校外活動費（塾・習い事）を除いた残りをならしたおおよその額で、
 * 入学年は入学金・制服でこれより大きく膨らむ。
 * 入力欄の初期値には使わず（0を初期値にする）、目安ボタンとしてだけ提示すること。
 */
export const OTHER_COST_PRESETS: { label: string; yearly: number }[] = [
  { label: '公立の目安', yearly: 150_000 },
  { label: '私立の目安', yearly: 300_000 },
];

export interface KokoJugyoryoInput {
  schoolType: SchoolType;
  /** 全日制の年間授業料（円）。省略時は種別の既定値 */
  yearlyTuition?: number;
  /** 通信制: 1年間に履修する単位数 */
  unitsPerYear?: number;
  /** 通信制: 1単位あたりの授業料（円） */
  tuitionPerUnit?: number;
  /** 授業料以外の年間費用（入学金・施設費・制服・教材など・円） */
  otherCostsYearly?: number;
  /** 在学年数。既定は3年 */
  years?: number;
}

/** 1年分の内訳 */
export interface YearBreakdown {
  /** 学年（1始まり） */
  year: number;
  /** その年の授業料（円） */
  tuition: number;
  /** その年の就学支援金（円） */
  support: number;
  /** 授業料のうち自己負担として残る額（円） */
  tuitionOutOfPocket: number;
  /** 授業料以外の費用（円） */
  otherCosts: number;
  /** その年の実質負担の合計（円） */
  outOfPocket: number;
  /** 通信制で支給対象になった単位数（全日制では undefined） */
  supportedUnits?: number;
}

export interface KokoJugyoryoResult {
  schoolType: SchoolType;
  years: number;
  /** 学年ごとの内訳 */
  perYear: YearBreakdown[];
  /** 在学期間の授業料合計（円） */
  totalTuition: number;
  /** 在学期間の就学支援金の合計（円） */
  totalSupport: number;
  /** 在学期間の授業料の自己負担合計（円） */
  totalTuitionOutOfPocket: number;
  /** 在学期間の授業料以外の合計（円） */
  totalOtherCosts: number;
  /** 在学期間の実質負担の総額（授業料の自己負担 ＋ 授業料以外・円） */
  totalOutOfPocket: number;
  /** 年間30単位の上限で支給対象の単位が削られたか（通信制のみ） */
  cappedByYearlyUnits: boolean;
  /** 通算74単位の上限で支給対象の単位が削られたか（通信制のみ） */
  cappedByTotalUnits: boolean;
  /** 同じ年数を公立全日制に通った場合の比較（授業料のみ） */
  publicComparison: {
    /** 授業料の合計（円） */
    totalTuition: number;
    /** 就学支援金の合計（円） */
    totalSupport: number;
    /** 授業料の自己負担合計（円） */
    totalTuitionOutOfPocket: number;
  };
  /** 公立全日制に比べて授業料の自己負担がいくら多いか（円）。「私立にした場合の追い金」 */
  extraVsPublicTuition: number;
}

/** 0以上の数に丸める。NaN・負の入力を0として扱う */
function nonNegative(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;
}

/** 0以上の整数に丸める（単位数など） */
function nonNegativeInt(value: number | undefined): number {
  return Math.floor(nonNegative(value));
}

/**
 * 進路と授業料から、就学支援金と実質自己負担を計算する。
 *
 * 通信制（単位制）は年30単位・通算74単位の上限があり、**在学年数をまたいで効く**。
 * 年30単位を3年続けると90単位になるが、支給されるのは74単位分まで。
 * 学年ごとに残り単位数を減らしながら積んでいく。
 *
 * @param input 進路・授業料・授業料以外の費用
 */
export function calcKokoJugyoryo(input: KokoJugyoryoInput): KokoJugyoryoResult {
  const years = Math.max(1, nonNegativeInt(input.years ?? DEFAULT_YEARS) || DEFAULT_YEARS);
  const otherCosts = nonNegative(input.otherCostsYearly);
  const limit = SUPPORT_LIMITS[input.schoolType];

  const perYear: YearBreakdown[] = [];
  let cappedByYearlyUnits = false;
  let cappedByTotalUnits = false;
  // 通算74単位のうち、まだ支給に使える残り
  let remainingUnits = UNITS_TOTAL_CAP;

  for (let year = 1; year <= years; year++) {
    let tuition: number;
    let support: number;
    let supportedUnits: number | undefined;

    if (limit.kind === 'unit') {
      const enrolled = nonNegativeInt(input.unitsPerYear ?? CORRESPONDENCE_DEFAULT_UNITS);
      const perUnitTuition = nonNegative(
        input.tuitionPerUnit ?? CORRESPONDENCE_DEFAULT_TUITION_PER_UNIT
      );
      tuition = enrolled * perUnitTuition;

      // 年間30単位が先に効き、そのうえで通算74単位の残りで頭打ちになる
      const withinYear = Math.min(enrolled, UNITS_PER_YEAR_CAP);
      if (enrolled > UNITS_PER_YEAR_CAP) cappedByYearlyUnits = true;
      supportedUnits = Math.min(withinYear, remainingUnits);
      if (supportedUnits < withinYear) cappedByTotalUnits = true;
      remainingUnits -= supportedUnits;

      // 支給は授業料を超えない（授業料債権への充当であり現金給付ではない）
      support = Math.min(supportedUnits * limit.perUnit, tuition);
    } else {
      tuition = nonNegative(input.yearlyTuition ?? defaultTuitionFor(input.schoolType));
      support = Math.min(limit.yearly, tuition);
    }

    const tuitionOutOfPocket = tuition - support;
    perYear.push({
      year,
      tuition,
      support,
      tuitionOutOfPocket,
      otherCosts,
      outOfPocket: tuitionOutOfPocket + otherCosts,
      ...(supportedUnits === undefined ? {} : { supportedUnits }),
    });
  }

  const sum = (pick: (y: YearBreakdown) => number) => perYear.reduce((a, y) => a + pick(y), 0);
  const totalTuitionOutOfPocket = sum((y) => y.tuitionOutOfPocket);

  // 公立全日制は授業料と支給限度額がどちらも118,800円なので自己負担は0になるが、
  // 「授業料は3年で35.6万円かかっていて、それが全額まかなわれている」ことを
  // 見せたいので、合計額も一緒に返す
  const publicSupportPerYear = Math.min(
    (SUPPORT_LIMITS['public-fulltime'] as FlatLimit).yearly,
    PUBLIC_FULLTIME_TUITION
  );

  return {
    schoolType: input.schoolType,
    years,
    perYear,
    totalTuition: sum((y) => y.tuition),
    totalSupport: sum((y) => y.support),
    totalTuitionOutOfPocket,
    totalOtherCosts: sum((y) => y.otherCosts),
    totalOutOfPocket: sum((y) => y.outOfPocket),
    cappedByYearlyUnits,
    cappedByTotalUnits,
    publicComparison: {
      totalTuition: PUBLIC_FULLTIME_TUITION * years,
      totalSupport: publicSupportPerYear * years,
      totalTuitionOutOfPocket: (PUBLIC_FULLTIME_TUITION - publicSupportPerYear) * years,
    },
    extraVsPublicTuition:
      totalTuitionOutOfPocket - (PUBLIC_FULLTIME_TUITION - publicSupportPerYear) * years,
  };
}

/** 進路ごとの年間授業料の初期値（全日制のみ。通信制は単位数×単位あたり授業料で出す） */
export function defaultTuitionFor(schoolType: SchoolType): number {
  switch (schoolType) {
    case 'public-fulltime':
      return PUBLIC_FULLTIME_TUITION;
    case 'private-fulltime':
      return PRIVATE_FULLTIME_AVERAGE_TUITION;
    default:
      return 0;
  }
}

/** 進路の表示名。画面と解説で同じ言い方をするために1か所に置く */
export const SCHOOL_TYPE_LABELS: Record<SchoolType, string> = {
  'public-fulltime': '公立（全日制）',
  'private-fulltime': '私立（全日制）',
  'private-correspondence': '私立（通信制・単位制）',
};
