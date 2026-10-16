/**
 * 減価償却 計算機（個人事業・副業。令和8年4月からの40万円未満の特例に対応）
 *
 * 仕様: docs/features/genka-shokyaku-keisan.md
 *
 * 1つの買い物について、次の4つの方法のどれが使えるかを判定し、今年の経費と年ごとの償却表を出す。
 *
 * | 方法 | 条件 | 根拠 |
 * |---|---|---|
 * | 少額の減価償却資産（全額） | 10万円未満。青色・白色・雑所得すべて | 所得税法施行令138条 |
 * | 一括償却資産（3年均等） | 20万円未満。青色・白色・雑所得すべて。月割しない | 所得税法施行令139条 |
 * | 中小事業者の少額減価償却資産の特例（全額） | 40万円未満（2026-03-31以前の取得は30万円未満）。青色申告の事業所得だけ。年300万円まで | 租税特別措置法28条の2・同施行令18条の5 |
 * | 通常の減価償却 | 上のどれも使わない／使えない | 所得税法49条・同施行令120条の2・132条 |
 *
 * ■ 一次確認（e-Gov 法令API v2、2026-10-16 取得）
 * - 措法28条の2①：「令和十一年三月三十一日までの間に取得し…取得価額が四十万円未満…（十万円未満…を除く。）」。
 *   年の合計が300万円を超えるときは300万円に達するまでの物が限度。業務を開始・廃止した年は 300万円 ÷ 12 × 月数
 *   （1か月未満は1か月。同条2項）
 * - 令和8年法律第12号 附則1条（2026-04-01施行）・35条：新法は施行日以後に取得した物に適用し、
 *   施行日前に取得した物は従前の例（30万円未満）。**令和8年分は取得日で 30万円／40万円が混ざる**
 * - 耐用年数省令 別表第八（定額法の償却率）・別表第十（平成24年4月1日以後取得の定率法）は、
 *   版 340M50000040015_20260522_508M60000040029 の2〜50年の行をそのまま写した（1/n で計算しない。3年は0.334、9年は0.112）
 * - 同省令3条（中古資産の簡便法）：全部経過は 法定×20%、一部経過は 法定 − 経過 + 経過×20%。1年未満切捨て・2年未満は2年
 * - 地方税法施行令49条：所令138条・139条の資産は償却資産（固定資産税）から除く ⇒ 措法28条の2で全額経費にした物は除かれない
 *
 * ■ 端数（仕様書の要確認1）
 * 償却費・必要経費算入額の1円未満は、令和8年分の「青色申告決算書の書き方」で確かめるまで **1円未満切捨て**
 * （経費を多めに出さない側）。画面に「会計ソフト・税務署の案内に合わせて」と書く。
 * 計算は円・千分率・十万分率の整数で行い、浮動小数の掛け算を通さない（0.3 × 3 のような誤差で1円ずれないように）。
 *
 * 【データ更新箇所】冒頭の定数（10万・20万・30万／40万・切り替え日・期限・年300万円）と、別表の2表・ASSETS の耐用年数。
 */

/** データ全体の最終確認日 'YYYY-MM-DD' */
export const DATA_CHECKED_AT = '2026-10-16';

// 【データ更新箇所】2026-10-16 e-Gov で確認
/** 所得税法施行令138条：この額**未満**は全額をその年の経費 */
export const SHOGAKU_LIMIT = 100_000;
/** 所得税法施行令139条：この額**未満**は一括償却資産（3年均等）にできる */
export const IKKATSU_LIMIT = 200_000;
/** 令和8年法律第12号 附則1条・35条：この日以後に取得した物から 40万円未満 */
export const TOKUREI_SWITCH_DATE = '2026-04-01';
/** 〜2026-03-31 取得の上限（未満） */
export const TOKUREI_LIMIT_BEFORE = 300_000;
/** 2026-04-01〜 取得の上限（未満） */
export const TOKUREI_LIMIT_AFTER = 400_000;
/** 措法28条の2①：この日までに取得した物が対象（令和11年3月31日） */
export const TOKUREI_END_DATE = '2029-03-31';
/** 措法28条の2①：年の合計の上限（業務を開始・廃止した年は月割） */
export const TOKUREI_ANNUAL_CAP = 3_000_000;
/** 措法28条の2の始まり（平成18年4月1日）。これより前の取得は特例の対象外 */
export const TOKUREI_START_DATE = '2006-04-01';
/** この日より前に取得した物は旧定額法・旧定率法なので扱わない（平成19年4月1日） */
export const SUPPORTED_FROM = '2007-04-01';
/** 200%定率法（別表第十）の始まり。これより前（2007-04-01〜2012-03-31）は250%定率法なので扱わない */
export const TEIRITSU_200_FROM = '2012-04-01';
/** 耐用年数を直接入れるときの範囲（別表第八・第十を写した範囲） */
export const MIN_LIFE = 2;
export const MAX_LIFE = 50;

/** 別表第十の1行。2年は改定償却率・保証率が無い（―――）ので null */
export interface TeiritsuRate {
  rate: number;
  revised: number | null;
  guarantee: number | null;
}

/** 減価償却資産の耐用年数等に関する省令 別表第八（定額法の償却率）。2〜50年 */
export const TEIGAKU_RATE: Record<number, number> = {
  2: 0.5,
  3: 0.334,
  4: 0.25,
  5: 0.2,
  6: 0.167,
  7: 0.143,
  8: 0.125,
  9: 0.112,
  10: 0.1,
  11: 0.091,
  12: 0.084,
  13: 0.077,
  14: 0.072,
  15: 0.067,
  16: 0.063,
  17: 0.059,
  18: 0.056,
  19: 0.053,
  20: 0.05,
  21: 0.048,
  22: 0.046,
  23: 0.044,
  24: 0.042,
  25: 0.04,
  26: 0.039,
  27: 0.038,
  28: 0.036,
  29: 0.035,
  30: 0.034,
  31: 0.033,
  32: 0.032,
  33: 0.031,
  34: 0.03,
  35: 0.029,
  36: 0.028,
  37: 0.028,
  38: 0.027,
  39: 0.026,
  40: 0.025,
  41: 0.025,
  42: 0.024,
  43: 0.024,
  44: 0.023,
  45: 0.023,
  46: 0.022,
  47: 0.022,
  48: 0.021,
  49: 0.021,
  50: 0.02,
};

/** 同 別表第十（平成24年4月1日以後に取得をされた減価償却資産の定率法の償却率、改定償却率及び保証率）。2〜50年 */
export const TEIRITSU_200: Record<number, TeiritsuRate> = {
  2: { rate: 1.0, revised: null, guarantee: null },
  3: { rate: 0.667, revised: 1.0, guarantee: 0.11089 },
  4: { rate: 0.5, revised: 1.0, guarantee: 0.12499 },
  5: { rate: 0.4, revised: 0.5, guarantee: 0.108 },
  6: { rate: 0.333, revised: 0.334, guarantee: 0.09911 },
  7: { rate: 0.286, revised: 0.334, guarantee: 0.0868 },
  8: { rate: 0.25, revised: 0.334, guarantee: 0.07909 },
  9: { rate: 0.222, revised: 0.25, guarantee: 0.07126 },
  10: { rate: 0.2, revised: 0.25, guarantee: 0.06552 },
  11: { rate: 0.182, revised: 0.2, guarantee: 0.05992 },
  12: { rate: 0.167, revised: 0.2, guarantee: 0.05566 },
  13: { rate: 0.154, revised: 0.167, guarantee: 0.0518 },
  14: { rate: 0.143, revised: 0.167, guarantee: 0.04854 },
  15: { rate: 0.133, revised: 0.143, guarantee: 0.04565 },
  16: { rate: 0.125, revised: 0.143, guarantee: 0.04294 },
  17: { rate: 0.118, revised: 0.125, guarantee: 0.04038 },
  18: { rate: 0.111, revised: 0.112, guarantee: 0.03884 },
  19: { rate: 0.105, revised: 0.112, guarantee: 0.03693 },
  20: { rate: 0.1, revised: 0.112, guarantee: 0.03486 },
  21: { rate: 0.095, revised: 0.1, guarantee: 0.03335 },
  22: { rate: 0.091, revised: 0.1, guarantee: 0.03182 },
  23: { rate: 0.087, revised: 0.091, guarantee: 0.03052 },
  24: { rate: 0.083, revised: 0.084, guarantee: 0.02969 },
  25: { rate: 0.08, revised: 0.084, guarantee: 0.02841 },
  26: { rate: 0.077, revised: 0.084, guarantee: 0.02716 },
  27: { rate: 0.074, revised: 0.077, guarantee: 0.02624 },
  28: { rate: 0.071, revised: 0.072, guarantee: 0.02568 },
  29: { rate: 0.069, revised: 0.072, guarantee: 0.02463 },
  30: { rate: 0.067, revised: 0.072, guarantee: 0.02366 },
  31: { rate: 0.065, revised: 0.067, guarantee: 0.02286 },
  32: { rate: 0.063, revised: 0.067, guarantee: 0.02216 },
  33: { rate: 0.061, revised: 0.063, guarantee: 0.02161 },
  34: { rate: 0.059, revised: 0.063, guarantee: 0.02097 },
  35: { rate: 0.057, revised: 0.059, guarantee: 0.02051 },
  36: { rate: 0.056, revised: 0.059, guarantee: 0.01974 },
  37: { rate: 0.054, revised: 0.056, guarantee: 0.0195 },
  38: { rate: 0.053, revised: 0.056, guarantee: 0.01882 },
  39: { rate: 0.051, revised: 0.053, guarantee: 0.0186 },
  40: { rate: 0.05, revised: 0.053, guarantee: 0.01791 },
  41: { rate: 0.049, revised: 0.05, guarantee: 0.01741 },
  42: { rate: 0.048, revised: 0.05, guarantee: 0.01694 },
  43: { rate: 0.047, revised: 0.048, guarantee: 0.01664 },
  44: { rate: 0.045, revised: 0.046, guarantee: 0.01664 },
  45: { rate: 0.044, revised: 0.046, guarantee: 0.01634 },
  46: { rate: 0.043, revised: 0.044, guarantee: 0.01601 },
  47: { rate: 0.043, revised: 0.044, guarantee: 0.01532 },
  48: { rate: 0.042, revised: 0.044, guarantee: 0.01499 },
  49: { rate: 0.041, revised: 0.042, guarantee: 0.01475 },
  50: { rate: 0.04, revised: 0.042, guarantee: 0.0144 },
};

/** 選択肢に出す資産の種類（仕様書「耐用年数」の表。別表から e-Gov で確認） */
export interface AssetDef {
  id: string;
  label: string;
  /** 法定耐用年数。'other' は利用者が入れる */
  years: number;
  /** 別表の区分 */
  basis: string;
  /** ソフトウエアは定額法だけ（所得税法施行令120条の2第1項6号） */
  software?: boolean;
  /** 家事と兼用しやすい物（事業割合の注記を出す） */
  shared?: boolean;
}

// 【データ更新箇所】耐用年数（別表第一・第三）
export const ASSETS: AssetDef[] = [
  {
    id: 'pc',
    label: 'パソコン（サーバー用を除く）',
    years: 4,
    basis: '別表第一 器具及び備品 2 電子計算機',
    shared: true,
  },
  {
    id: 'phone',
    label: 'スマートフォン・携帯電話・ルーター',
    years: 10,
    basis: '別表第一 器具及び備品 2 電話設備その他の通信機器 その他のもの',
    shared: true,
  },
  {
    id: 'copier',
    label: '複写機・プリンター複合機',
    years: 5,
    basis: '別表第一 器具及び備品 2 複写機、計算機…その他これらに類するもの',
  },
  { id: 'camera', label: 'カメラ・レンズ', years: 5, basis: '別表第一 器具及び備品 4 カメラ、映画撮影機…' },
  { id: 'tv', label: 'テレビ・音響機器', years: 5, basis: '別表第一 器具及び備品 1 ラジオ、テレビジョン…' },
  {
    id: 'aircon',
    label: 'エアコン（家庭用の置き型・壁掛け）',
    years: 6,
    basis: '別表第一 器具及び備品 1 冷房用又は暖房用機器',
  },
  { id: 'fridge', label: '冷蔵庫・洗濯機', years: 6, basis: '別表第一 器具及び備品 1 電気冷蔵庫、電気洗濯機…' },
  {
    id: 'deskMetal',
    label: '事務机・椅子（主として金属製）',
    years: 15,
    basis: '別表第一 器具及び備品 1 事務机、事務いす及びキャビネット 主として金属製のもの',
  },
  {
    id: 'deskOther',
    label: '事務机・椅子（金属製以外）',
    years: 8,
    basis: '別表第一 器具及び備品 1 事務机、事務いす及びキャビネット その他のもの',
  },
  {
    id: 'software',
    label: 'ソフトウエア（市販・自社利用）',
    years: 5,
    basis: '別表第三 ソフトウエア その他のもの',
    software: true,
  },
  {
    id: 'car',
    label: '普通自動車（一般用）',
    years: 6,
    basis: '別表第一 車両及び運搬具 前掲のもの以外 自動車 その他のもの',
    shared: true,
  },
  {
    id: 'kei',
    label: '軽自動車（0.66L以下）',
    years: 4,
    basis: '別表第一 車両及び運搬具 前掲のもの以外 自動車 小型車',
    shared: true,
  },
  {
    id: 'bike',
    label: '二輪車（バイク）',
    years: 3,
    basis: '別表第一 車両及び運搬具 前掲のもの以外 自動車 二輪又は三輪自動車',
    shared: true,
  },
  { id: 'bicycle', label: '自転車', years: 2, basis: '別表第一 車両及び運搬具 前掲のもの以外 自転車', shared: true },
  { id: 'other', label: 'その他（耐用年数を直接入れる）', years: 0, basis: '—' },
];

export function assetById(id: string): AssetDef | undefined {
  return ASSETS.find((a) => a.id === id);
}

/** 申告の種類。不動産所得は初版の対象外（仕様書「やらないこと」） */
export type Filing = 'aoiro' | 'shiro' | 'zatsu';
export type DepMethod = 'teigaku' | 'teiritsu';
export type MethodId = 'shogaku' | 'ikkatsu' | 'tokurei' | 'normal';

export interface GenkaInput {
  /** ASSETS の id */
  assetId: string;
  /** assetId が 'other' のときの耐用年数（2〜50） */
  customYears?: number;
  /** 取得価額（円）。経理方式に合わせて税込か税抜で */
  cost: number;
  /** 買った日 'YYYY-MM-DD'。特例の上限はこの日で決まる */
  acquiredOn: string;
  /** 使い始めた年月。月割はこちらで決まる（既定は買った日の年月） */
  startYear?: number;
  startMonth?: number;
  filing: Filing;
  /** （青色のみ）今年この特例で全額経費にした物の合計（円） */
  tokureiUsedThisYear?: number;
  /** （青色のみ）業務を開始・廃止した年なら、その年に営業した月数（1〜12。1か月未満は1か月） */
  businessMonths?: number;
  /** 中古なら前の持ち主が使っていた月数 */
  usedElapsedMonths?: number;
  /** 事業で使う割合（%）。未入力は100 */
  businessRatio?: number;
  /** 償却方法。届け出ていなければ定額法 */
  depMethod?: DepMethod;
}

export interface ScheduleRow {
  year: number;
  /** その年に償却した月数（一括償却は月割しないので 12） */
  months: number;
  /** 償却費（事業割合をかける前） */
  depreciation: number;
  /** うち経費（償却費 × 事業割合。1円未満切捨て） */
  expense: number;
  /** 年末の未償却残高（償却費の全額で減らす） */
  endBalance: number;
  /** 定率法で改定償却率に切り替わったあとの年 */
  revised?: boolean;
  /** 償却の基礎になる金額（定額法は取得価額、定率法は期首の未償却残高か改定取得価額） */
  base: number;
  /** その年に使った償却率 */
  rate: number;
}

export interface MethodResult {
  id: MethodId;
  /** 今年（使い始めた年）の経費 */
  thisYearExpense: number;
  schedule: ScheduleRow[];
  /** 償却資産（固定資産税）の申告に載るか */
  inShokyakuShisan: boolean;
}

export type TokureiNg = 'zatsu' | 'shiro' | 'before' | 'expired' | 'overLimit' | 'overCap';

export interface Unavailable {
  id: MethodId;
  reason: 'over100k' | 'over200k' | TokureiNg;
}

export type GenkaResult =
  | {
      ok: true;
      /** 使い始めた年（「今年」） */
      year: number;
      /** 特例の上限（取得日で決まる）。期限後・期限前は null */
      tokureiLimit: number | null;
      /** 年の上限（開業・廃業の年は月割） */
      annualCap: number;
      legalYears: number;
      /** 実際に使う耐用年数（中古は簡便法） */
      life: number;
      used: boolean;
      depMethod: DepMethod;
      /** ソフトウエアで定率法を選んだので定額法にした */
      depMethodForced: boolean;
      businessRatio: number;
      /** 使える方法（今年の経費が多い順：全額 → 特例 → 一括 → 通常） */
      methods: MethodResult[];
      unavailable: Unavailable[];
      /** 結果の一番上に出す方法 */
      primary: MethodResult;
      /** 令和8年分（買った日が2026年）の 30万円／40万円の注意を出すか */
      mixedYearNotice: boolean;
    }
  | {
      ok: false;
      error: 'cost' | 'date' | 'startBeforeAcquired' | 'tooOld' | 'teiritsu250' | 'years' | 'asset';
    };

/** 令和の年（2019 = 元年） */
export const reiwa = (year: number) => year - 2018;

/** 取得日で決まる特例の上限（未満）。期限後・始まる前は null */
export function tokureiLimit(acquiredOn: string): number | null {
  if (acquiredOn < TOKUREI_START_DATE || acquiredOn > TOKUREI_END_DATE) return null;
  return acquiredOn >= TOKUREI_SWITCH_DATE ? TOKUREI_LIMIT_AFTER : TOKUREI_LIMIT_BEFORE;
}

/** 年の上限。業務を開始・廃止した年は 300万円 ÷ 12 × 月数（措法28条の2①かっこ書き） */
export function annualCap(businessMonths?: number): number {
  if (businessMonths === undefined) return TOKUREI_ANNUAL_CAP;
  const m = Math.min(12, Math.max(1, Math.ceil(businessMonths)));
  return (TOKUREI_ANNUAL_CAP * m) / 12;
}

/**
 * 中古資産の簡便法の耐用年数（耐用年数省令3条1項2号）。
 * 全部経過 → 法定 × 20%、一部経過 → 法定 − 経過 + 経過 × 20%。1年未満切捨て・2年未満は2年。
 * 3.00 を浮動小数で 2.999… にしないよう、**月数を5倍した整数**で計算する：
 * (法定月数 × 5 − 経過月数 × 4) ÷ 60 を切捨て（全部経過は経過月数 = 法定月数として同じ式になる）
 */
export function usedLife(legalYears: number, elapsedMonths: number): number {
  const legalMonths = legalYears * 12;
  const e = Math.min(Math.max(0, Math.floor(elapsedMonths)), legalMonths);
  return Math.max(MIN_LIFE, Math.floor((legalMonths * 5 - e * 4) / 60));
}

/** 千分率の整数（0.334 → 334） */
const mille = (rate: number) => Math.round(rate * 1000);
/** 十万分率の整数（0.10800 → 10800） */
const lakh = (rate: number) => Math.round(rate * 100_000);
/** 償却費 × 事業割合（1円未満切捨て） */
const expenseOf = (dep: number, ratio: number) => Math.floor((dep * ratio) / 100);

/**
 * 定額法（所得税法施行令120条の2第1項1号ロ・132条）。
 * 毎年 取得価額 × 償却率、初年は × 月数/12。未償却残高が1円になるまで（最後の年は1円を残す）
 */
export function straightLine(
  cost: number,
  life: number,
  startYear: number,
  startMonth: number,
  ratio = 100,
): ScheduleRow[] {
  const rateM = mille(TEIGAKU_RATE[life]);
  const rows: ScheduleRow[] = [];
  let balance = cost;
  for (let year = startYear; balance > 1; year++) {
    const months = year === startYear ? 13 - startMonth : 12;
    const dep = Math.min(Math.floor((cost * rateM * months) / 12_000), balance - 1);
    balance -= dep;
    rows.push({
      year,
      months,
      depreciation: dep,
      expense: expenseOf(dep, ratio),
      endBalance: balance,
      base: cost,
      rate: rateM / 1000,
    });
  }
  return rows;
}

/**
 * 200%定率法（所得税法施行令120条の2第1項2号・別表第十）。
 * 調整前償却額 = 期首未償却残高 × 償却率。償却保証額 = 取得価額 × 保証率。
 * 調整前償却額が償却保証額に満たない年の期首残高を改定取得価額とし、以後 改定取得価額 × 改定償却率。
 * 初年は × 月数/12。最後の年は1円を残す
 */
export function decliningBalance(
  cost: number,
  life: number,
  startYear: number,
  startMonth: number,
  ratio = 100,
): ScheduleRow[] {
  const t = TEIRITSU_200[life];
  const rateM = mille(t.rate);
  const revisedM = t.revised === null ? null : mille(t.revised);
  const guaranteeL = t.guarantee === null ? null : lakh(t.guarantee);
  const rows: ScheduleRow[] = [];
  let balance = cost;
  let revisedBase: number | null = null;
  for (let year = startYear; balance > 1; year++) {
    const months = year === startYear ? 13 - startMonth : 12;
    // 調整前償却額 < 償却保証額 を整数で比べる（balance × rate/1000 < cost × guarantee/100000）
    if (revisedBase === null && revisedM !== null && guaranteeL !== null && balance * rateM * 100 < cost * guaranteeL) {
      revisedBase = balance;
    }
    const base = revisedBase ?? balance;
    const useM = revisedBase !== null && revisedM !== null ? revisedM : rateM;
    const dep = Math.min(Math.floor((base * useM * months) / 12_000), balance - 1);
    balance -= dep;
    rows.push({
      year,
      months,
      depreciation: dep,
      expense: expenseOf(dep, ratio),
      endBalance: balance,
      revised: revisedBase !== null,
      base,
      rate: useM / 1000,
    });
  }
  return rows;
}

/** 一括償却資産（所得税法施行令139条）：3年間 1/3 ずつ。月割しない。3年目に端数を寄せる */
export function ikkatsuSchedule(cost: number, startYear: number, ratio = 100): ScheduleRow[] {
  const third = Math.floor(cost / 3);
  const amounts = [third, third, cost - third * 2];
  let balance = cost;
  return amounts.map((dep, i) => {
    balance -= dep;
    return {
      year: startYear + i,
      months: 12,
      depreciation: dep,
      expense: expenseOf(dep, ratio),
      endBalance: balance,
      base: cost,
      rate: 1 / 3,
    };
  });
}

/** 全額をその年の経費にする方法（少額の減価償却資産・特例）の1行 */
function fullSchedule(cost: number, startYear: number, ratio: number): ScheduleRow[] {
  return [
    {
      year: startYear,
      months: 12,
      depreciation: cost,
      expense: expenseOf(cost, ratio),
      endBalance: 0,
      base: cost,
      rate: 1,
    },
  ];
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** 特例が使えるか。使えないときは理由 */
export function tokureiCheck(input: {
  cost: number;
  acquiredOn: string;
  filing: Filing;
  tokureiUsedThisYear?: number;
  businessMonths?: number;
}): { ok: true } | { ok: false; reason: TokureiNg } {
  if (input.filing === 'zatsu') return { ok: false, reason: 'zatsu' };
  if (input.filing === 'shiro') return { ok: false, reason: 'shiro' };
  if (input.acquiredOn < TOKUREI_START_DATE) return { ok: false, reason: 'before' };
  const limit = tokureiLimit(input.acquiredOn);
  if (limit === null) return { ok: false, reason: 'expired' };
  if (input.cost >= limit) return { ok: false, reason: 'overLimit' };
  // 物ごとに判定し、一部だけ使うことはしない（300万円に達するまでの物が限度）
  if ((input.tokureiUsedThisYear ?? 0) + input.cost > annualCap(input.businessMonths)) {
    return { ok: false, reason: 'overCap' };
  }
  return { ok: true };
}

/** 判定と計算の本体 */
export function calculate(input: GenkaInput): GenkaResult {
  const asset = assetById(input.assetId);
  if (!asset) return { ok: false, error: 'asset' };
  if (!Number.isFinite(input.cost) || input.cost < 1 || !Number.isInteger(input.cost)) {
    return { ok: false, error: 'cost' };
  }
  if (!validDate(input.acquiredOn)) return { ok: false, error: 'date' };
  if (input.acquiredOn < SUPPORTED_FROM) return { ok: false, error: 'tooOld' };

  const acqYear = Number(input.acquiredOn.slice(0, 4));
  const acqMonth = Number(input.acquiredOn.slice(5, 7));
  const startYear = input.startYear ?? acqYear;
  const startMonth = input.startMonth ?? acqMonth;
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12 || !Number.isInteger(startYear)) {
    return { ok: false, error: 'date' };
  }
  if (startYear * 12 + startMonth < acqYear * 12 + acqMonth) return { ok: false, error: 'startBeforeAcquired' };

  const legalYears = asset.id === 'other' ? (input.customYears ?? 0) : asset.years;
  if (!Number.isInteger(legalYears) || legalYears < MIN_LIFE || legalYears > MAX_LIFE) {
    return { ok: false, error: 'years' };
  }
  const used = input.usedElapsedMonths !== undefined && input.usedElapsedMonths > 0;
  const life = used ? usedLife(legalYears, input.usedElapsedMonths!) : legalYears;

  const wanted = input.depMethod ?? 'teigaku';
  const depMethodForced = wanted === 'teiritsu' && !!asset.software;
  const depMethod: DepMethod = depMethodForced ? 'teigaku' : wanted;
  if (depMethod === 'teiritsu' && input.acquiredOn < TEIRITSU_200_FROM) return { ok: false, error: 'teiritsu250' };

  const ratioRaw = input.businessRatio ?? 100;
  const businessRatio = Number.isFinite(ratioRaw) ? Math.min(100, Math.max(0, Math.floor(ratioRaw))) : 100;
  const { cost } = input;

  const methods: MethodResult[] = [];
  const unavailable: Unavailable[] = [];

  if (cost < SHOGAKU_LIMIT) {
    // 10万円未満は全額（どの申告でも）。通常償却・一括償却も選べるが、初版は比較表に出さない
    methods.push({
      id: 'shogaku',
      thisYearExpense: expenseOf(cost, businessRatio),
      schedule: fullSchedule(cost, startYear, businessRatio),
      inShokyakuShisan: false,
    });
  } else {
    unavailable.push({ id: 'shogaku', reason: 'over100k' });
    const t = tokureiCheck({ ...input, cost });
    if (t.ok) {
      methods.push({
        id: 'tokurei',
        thisYearExpense: expenseOf(cost, businessRatio),
        schedule: fullSchedule(cost, startYear, businessRatio),
        inShokyakuShisan: true,
      });
    } else {
      unavailable.push({ id: 'tokurei', reason: t.reason });
    }
    if (cost < IKKATSU_LIMIT) {
      const schedule = ikkatsuSchedule(cost, startYear, businessRatio);
      methods.push({ id: 'ikkatsu', thisYearExpense: schedule[0].expense, schedule, inShokyakuShisan: false });
    } else {
      unavailable.push({ id: 'ikkatsu', reason: 'over200k' });
    }
    const schedule =
      depMethod === 'teiritsu'
        ? decliningBalance(cost, life, startYear, startMonth, businessRatio)
        : straightLine(cost, life, startYear, startMonth, businessRatio);
    methods.push({ id: 'normal', thisYearExpense: schedule[0].expense, schedule, inShokyakuShisan: true });
  }

  return {
    ok: true,
    year: startYear,
    tokureiLimit: tokureiLimit(input.acquiredOn),
    annualCap: annualCap(input.businessMonths),
    legalYears,
    life,
    used,
    depMethod,
    depMethodForced,
    businessRatio,
    methods,
    unavailable,
    primary: methods[0],
    mixedYearNotice: acqYear === 2026,
  };
}

/** 一次情報へのリンク */
export interface Source {
  label: string;
  url: string;
  /** このURLで内容を確認した日 'YYYY-MM-DD' */
  checkedAt: string;
}

export const SOURCES: Source[] = [
  {
    label: '国税庁 タックスアンサー No.2100「減価償却のあらまし」',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2100.htm',
    checkedAt: DATA_CHECKED_AT,
  },
  {
    label: '国税庁 タックスアンサー No.2106「定額法と定率法による減価償却（平成19年4月1日以後に取得する場合）」',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2106.htm',
    checkedAt: DATA_CHECKED_AT,
  },
  {
    label: '国税庁「令和7年分 青色申告の決算の手引き（一般用）」',
    url: 'https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2025/pdf/025.pdf',
    checkedAt: DATA_CHECKED_AT,
  },
  {
    label: '中小企業庁「少額減価償却資産の特例」',
    url: 'https://www.chusho.meti.go.jp/zaimu/zeisei/pamphlet/syougaku_shisan.pdf',
    checkedAt: DATA_CHECKED_AT,
  },
  {
    label: 'e-Gov法令検索「租税特別措置法」（28条の2・附則〔令和8年法律第12号〕35条）',
    url: 'https://laws.e-gov.go.jp/law/332AC0000000026',
    checkedAt: DATA_CHECKED_AT,
  },
  {
    label: 'e-Gov法令検索「所得税法施行令」（120条の2・125条・132条・138条・139条）',
    url: 'https://laws.e-gov.go.jp/law/340CO0000000096',
    checkedAt: DATA_CHECKED_AT,
  },
  {
    label: 'e-Gov法令検索「減価償却資産の耐用年数等に関する省令」（3条・別表第一・第三・第八・第十）',
    url: 'https://laws.e-gov.go.jp/law/340M50000040015',
    checkedAt: DATA_CHECKED_AT,
  },
  {
    label: 'e-Gov法令検索「地方税法施行令」（49条）',
    url: 'https://laws.e-gov.go.jp/law/325CO0000000245',
    checkedAt: DATA_CHECKED_AT,
  },
];

/** 方法の名前（画面・決算書の説明で使う） */
export const METHOD_LABEL: Record<MethodId, string> = {
  shogaku: '少額の減価償却資産（10万円未満・全額）',
  ikkatsu: '一括償却資産（20万円未満・3年で均等）',
  tokurei: '中小事業者の少額減価償却資産の特例（全額）',
  normal: '通常の減価償却（耐用年数で按分）',
};

/**
 * 青色申告決算書 3ページ・収支内訳書 2ページ「減価償却費の計算」欄の書き方（今年の分）。
 * 列名は令和7年分の様式の名前（欄の記号は令和8年分の様式で確かめてから書く。仕様書の要確認2）。
 * 10万円未満の全額は減価償却費の欄に載せず、消耗品費などで経費にするので null
 */
export function kessanshoRows(
  r: Extract<GenkaResult, { ok: true }>,
  m: MethodResult,
): { label: string; value: string }[] | null {
  if (m.id === 'shogaku') return null;
  const y = m.schedule[0];
  const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;
  if (m.id === 'tokurei') {
    return [
      { label: '取得価額', value: yen(y.base) },
      { label: '償却の基礎になる金額', value: yen(y.base) },
      { label: '本年分の普通償却費', value: yen(y.depreciation) },
      { label: '事業専用割合', value: `${r.businessRatio}%` },
      { label: '本年分の必要経費算入額', value: yen(y.expense) },
      { label: '未償却残高', value: '0円' },
      { label: '摘要', value: '措法28条の2' },
    ];
  }
  if (m.id === 'ikkatsu') {
    return [
      { label: '取得価額', value: yen(y.base) },
      { label: '償却の基礎になる金額', value: yen(y.base) },
      { label: '耐用年数', value: '3年' },
      { label: '本年中の償却期間', value: '12/12' },
      { label: '本年分の普通償却費', value: yen(y.depreciation) },
      { label: '事業専用割合', value: `${r.businessRatio}%` },
      { label: '本年分の必要経費算入額', value: yen(y.expense) },
      { label: '未償却残高', value: yen(y.endBalance) },
      { label: '摘要', value: '一括償却資産' },
    ];
  }
  return [
    // 1年目は定額法・定率法とも、取得価額 = 償却の基礎になる金額（定率法は期首の未償却残高）
    { label: '取得価額', value: yen(y.base) },
    { label: '償却の基礎になる金額', value: yen(y.base) },
    { label: '償却方法', value: r.depMethod === 'teigaku' ? '定額法' : '定率法' },
    { label: '耐用年数', value: `${r.life}年` },
    { label: r.depMethod === 'teiritsu' && y.revised ? '改定償却率' : '償却率', value: y.rate.toFixed(3) },
    { label: '本年中の償却期間', value: `${y.months}/12` },
    { label: '本年分の普通償却費', value: yen(y.depreciation) },
    { label: '事業専用割合', value: `${r.businessRatio}%` },
    { label: '本年分の必要経費算入額', value: yen(y.expense) },
    { label: '未償却残高', value: yen(y.endBalance) },
    { label: '摘要', value: r.used ? `中古（簡便法・法定${r.legalYears}年）` : '' },
  ];
}
