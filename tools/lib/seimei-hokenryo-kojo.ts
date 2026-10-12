/**
 * 生命保険料控除 計算機（令和8年分）のロジック。純関数のみ。
 *
 * 仕様: docs/features/seimei-hokenryo-kojo.md
 *
 * - 所得税：国税庁 No.1140・「令和8年分 年末調整のしかた」24ページ
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1140.htm
 * - 23歳未満の扶養親族がいる場合の特例（一般・新契約の上限 4万円 → 6万円）：
 *   租税特別措置法 41条の15の5 第1項。**令和8年分・令和9年分の2年分だけ**
 *   （令和7年度改正で創設、令和8年度改正で令和9年分まで延長）
 * - 住民税：地方税法 314条の2。**23歳未満の特例は無い**（所得税だけの改正）
 *
 * 一般の生命保険料の控除額は「新だけ」「旧だけ」「新＋旧（上限あり）」の
 * **3つを出して最大を採る**（申告書の「いずれか大きい金額 又は ⑤の金額」と同じ）。
 * 「旧が6万円超なら旧だけ」と分岐すると、特例ありのときに誤る。
 */

// ============================================================
// 【データ更新箇所】年分ごとの特例の有無
// ============================================================

/** 既定の年分（令和8年分） */
export const DEFAULT_YEAR = 2026;

/**
 * 年分ごとの規則。ここに無い年分は**特例なし**で計算する
 * （令和10年分以降は、延長の改正が確認できたら1行足す）
 */
export const RULES_BY_YEAR: Readonly<Record<number, { under23Tokurei: boolean }>> = {
  2026: { under23Tokurei: true },
  2027: { under23Tokurei: true },
};

export function hasUnder23Tokurei(year: number): boolean {
  return RULES_BY_YEAR[year]?.under23Tokurei ?? false;
}

// ============================================================
// 【データ更新箇所】控除額の表
// ============================================================

/** 表の1段。`upTo` 以下なら `支払額 × rate + add` */
export interface Bracket {
  upTo: number;
  rate: 1 | 0.5 | 0.25;
  add: number;
}

export interface Table {
  brackets: readonly Bracket[];
  /** 最後の段を超えたときの額（＝その表の上限） */
  max: number;
}

/** 所得税・新契約（一般・介護医療・個人年金） */
export const SHOTOKU_NEW: Table = {
  brackets: [
    { upTo: 20_000, rate: 1, add: 0 },
    { upTo: 40_000, rate: 0.5, add: 10_000 },
    { upTo: 80_000, rate: 0.25, add: 20_000 },
  ],
  max: 40_000,
};

/** 所得税・旧契約（一般・個人年金） */
export const SHOTOKU_OLD: Table = {
  brackets: [
    { upTo: 25_000, rate: 1, add: 0 },
    { upTo: 50_000, rate: 0.5, add: 12_500 },
    { upTo: 100_000, rate: 0.25, add: 25_000 },
  ],
  max: 50_000,
};

/** 所得税・新契約の一般で、23歳未満の扶養親族がいる場合（令和8・9年分） */
export const SHOTOKU_NEW_TOKUREI: Table = {
  brackets: [
    { upTo: 30_000, rate: 1, add: 0 },
    { upTo: 60_000, rate: 0.5, add: 15_000 },
    { upTo: 120_000, rate: 0.25, add: 30_000 },
  ],
  max: 60_000,
};

/** 住民税・新契約 */
export const JUMIN_NEW: Table = {
  brackets: [
    { upTo: 12_000, rate: 1, add: 0 },
    { upTo: 32_000, rate: 0.5, add: 6_000 },
    { upTo: 56_000, rate: 0.25, add: 14_000 },
  ],
  max: 28_000,
};

/** 住民税・旧契約 */
export const JUMIN_OLD: Table = {
  brackets: [
    { upTo: 15_000, rate: 1, add: 0 },
    { upTo: 40_000, rate: 0.5, add: 7_500 },
    { upTo: 70_000, rate: 0.25, add: 17_500 },
  ],
  max: 35_000,
};

/** 所得税：新＋旧を合算したときの上限（特例ありの一般は 6万円） */
export const SHOTOKU_COMBINED_CAP = 40_000;
export const SHOTOKU_COMBINED_CAP_TOKUREI = 60_000;
/** 所得税：3区分の合計の上限（特例があっても変わらない） */
export const SHOTOKU_TOTAL_CAP = 120_000;

/** 住民税：新＋旧を合算したときの上限 */
export const JUMIN_COMBINED_CAP = 28_000;
/** 住民税：3区分の合計の上限 */
export const JUMIN_TOTAL_CAP = 70_000;

/**
 * 所得税に上乗せされる復興特別所得税（令和9年分からは防衛特別所得税と合わせて同じ 2.1%）。
 * 千分率の整数で持つ（`× 1.021` の小数で掛けると 2,042 が 2,041.99… になって1円ずれる）
 */
export const SURTAX_PER_MILLE = 1021;
/** 住民税の所得割の税率（%。市町村民税6%＋道府県民税4%） */
export const JUMIN_RATE_PERCENT = 10;
/** 所得税の税率（速算表の段） */
export const INCOME_TAX_RATES = [5, 10, 20, 23, 33, 40, 45] as const;
export type IncomeTaxRate = (typeof INCOME_TAX_RATES)[number];

// ============================================================
// 計算
// ============================================================

/** 表に当てはめた控除額。1円未満の端数は切り上げ（申告書の記載どおり） */
export function applyTable(table: Table, paid: number): number {
  const x = Math.max(0, Math.floor(paid));
  for (const b of table.brackets) {
    if (x <= b.upTo) return Math.ceil(x * b.rate + b.add);
  }
  return table.max;
}

/** 新旧のどれを採ったか */
export type Choice = 'none' | 'new' | 'old' | 'combined';

export interface CategoryResult {
  /** 採った控除額 */
  amount: number;
  choice: Choice;
  /** 新だけで計算した額 */
  newOnly: number;
  /** 旧だけで計算した額 */
  oldOnly: number;
  /** 新＋旧（上限あり）の額。新・旧の両方を払っていないときは 0 */
  combined: number;
}

/**
 * 新旧両方がありうる区分の控除額。3つの額を出して最大を採る。
 * 同額のときは、新だけ → 新＋旧 → 旧だけ の順で表示上の採り方を決める（額は同じ）
 */
export function pickCategory(newOnly: number, oldOnly: number, cap: number, hasNew: boolean, hasOld: boolean): CategoryResult {
  if (!hasNew && !hasOld) return { amount: 0, choice: 'none', newOnly: 0, oldOnly: 0, combined: 0 };
  if (!hasOld) return { amount: newOnly, choice: 'new', newOnly, oldOnly: 0, combined: 0 };
  if (!hasNew) return { amount: oldOnly, choice: 'old', newOnly: 0, oldOnly, combined: 0 };
  const combined = Math.min(newOnly + oldOnly, cap);
  const amount = Math.max(newOnly, oldOnly, combined);
  const choice: Choice = amount === newOnly ? 'new' : amount === combined ? 'combined' : 'old';
  return { amount, choice, newOnly, oldOnly, combined };
}

/** 入力：控除証明書の「申告額」（年間の支払額。12月まで払う見込み額でよい） */
export interface Payments {
  /** 一般の生命保険料・新契約（2012-01-01 以後の契約） */
  ippanNew: number;
  /** 一般の生命保険料・旧契約（旧契約の医療保険もここ） */
  ippanOld: number;
  /** 介護医療保険料（新契約のみ） */
  kaigo: number;
  /** 個人年金保険料・新契約 */
  nenkinNew: number;
  /** 個人年金保険料・旧契約 */
  nenkinOld: number;
}

export interface ShotokuzeiInput extends Payments {
  /** 年分（西暦）。既定は令和8年分 */
  year?: number;
  /** 23歳未満の扶養親族がいる（その年の12月31日時点） */
  under23: boolean;
}

export interface KojoResult {
  ippan: CategoryResult;
  kaigo: CategoryResult;
  nenkin: CategoryResult;
  /** 3区分の単純合計（上限を当てる前） */
  sum: number;
  /** 控除額（3区分の合計に上限を当てたもの） */
  total: number;
  /** 一般の新契約に特例の表を使ったか */
  tokureiApplied: boolean;
}

const pos = (n: number) => (n > 0 ? n : 0);

function finish(ippan: CategoryResult, kaigo: CategoryResult, nenkin: CategoryResult, cap: number, tokureiApplied: boolean): KojoResult {
  const sum = ippan.amount + kaigo.amount + nenkin.amount;
  return { ippan, kaigo, nenkin, sum, total: Math.min(sum, cap), tokureiApplied };
}

/** 所得税（年末調整の保険料控除申告書）の生命保険料控除 */
export function kojoShotokuzei(input: ShotokuzeiInput): KojoResult {
  const year = input.year ?? DEFAULT_YEAR;
  const tokureiApplied = input.under23 && hasUnder23Tokurei(year);
  const ippanNew = pos(input.ippanNew);
  const ippanOld = pos(input.ippanOld);
  const kaigo = pos(input.kaigo);
  const nenkinNew = pos(input.nenkinNew);
  const nenkinOld = pos(input.nenkinOld);

  const ippan = pickCategory(
    applyTable(tokureiApplied ? SHOTOKU_NEW_TOKUREI : SHOTOKU_NEW, ippanNew),
    applyTable(SHOTOKU_OLD, ippanOld),
    tokureiApplied ? SHOTOKU_COMBINED_CAP_TOKUREI : SHOTOKU_COMBINED_CAP,
    ippanNew > 0,
    ippanOld > 0,
  );
  const kaigoR = pickCategory(applyTable(SHOTOKU_NEW, kaigo), 0, SHOTOKU_COMBINED_CAP, kaigo > 0, false);
  const nenkin = pickCategory(
    applyTable(SHOTOKU_NEW, nenkinNew),
    applyTable(SHOTOKU_OLD, nenkinOld),
    SHOTOKU_COMBINED_CAP,
    nenkinNew > 0,
    nenkinOld > 0,
  );
  return finish(ippan, kaigoR, nenkin, SHOTOKU_TOTAL_CAP, tokureiApplied);
}

/** 住民税の生命保険料控除（23歳未満の特例は無い） */
export function kojoJuminzei(input: Payments): KojoResult {
  const ippanNew = pos(input.ippanNew);
  const ippanOld = pos(input.ippanOld);
  const kaigo = pos(input.kaigo);
  const nenkinNew = pos(input.nenkinNew);
  const nenkinOld = pos(input.nenkinOld);

  const ippan = pickCategory(applyTable(JUMIN_NEW, ippanNew), applyTable(JUMIN_OLD, ippanOld), JUMIN_COMBINED_CAP, ippanNew > 0, ippanOld > 0);
  const kaigoR = pickCategory(applyTable(JUMIN_NEW, kaigo), 0, JUMIN_COMBINED_CAP, kaigo > 0, false);
  const nenkin = pickCategory(applyTable(JUMIN_NEW, nenkinNew), applyTable(JUMIN_OLD, nenkinOld), JUMIN_COMBINED_CAP, nenkinNew > 0, nenkinOld > 0);
  return finish(ippan, kaigoR, nenkin, JUMIN_TOTAL_CAP, false);
}

export interface Summary {
  shotoku: KojoResult;
  jumin: KojoResult;
  /** 特例を使わなかった場合の所得税の控除額 */
  shotokuWithoutTokurei: number;
  /** 特例で増えた所得税の控除額（使わない場合との差） */
  tokureiGain: number;
}

/** 画面で使う一式。特例を使わない場合との差も出す */
export function calcSeimeiHokenryoKojo(input: ShotokuzeiInput): Summary {
  const shotoku = kojoShotokuzei(input);
  const without = kojoShotokuzei({ ...input, under23: false });
  return {
    shotoku,
    jumin: kojoJuminzei(input),
    shotokuWithoutTokurei: without.total,
    tokureiGain: shotoku.total - without.total,
  };
}

/**
 * 税額の目安（控除でどれだけ税が軽くなるか）。
 * 所得税 = 控除額 × 税率 × 1.021、住民税 = 住民税の控除額 × 10%。それぞれ1円未満切り捨て
 */
export function zeigakuMeyasu(shotokuKojo: number, juminKojo: number, ratePercent: number) {
  const incomeTax = Math.floor((shotokuKojo * ratePercent * SURTAX_PER_MILLE) / 100_000);
  const residentTax = Math.floor((juminKojo * JUMIN_RATE_PERCENT) / 100);
  return { incomeTax, residentTax, total: incomeTax + residentTax };
}

// ============================================================
// 年末調整の計算機への引き継ぎ（?life=<所得税の控除額>）
// ============================================================

/** 引き継ぎ先（年末調整 還付金 計算機）のパス。basePath（/tools）は next/link が付ける */
export function nenmatsuHandoffHref(shotokuKojo: number): string {
  return `/nenmatsu-chosei/?life=${Math.max(0, Math.floor(shotokuKojo))}`;
}

/**
 * 引き継ぎのクエリを読む（受け側：`app/nenmatsu-chosei/Calculator.tsx`）。
 * **整数 0〜120,000 以外は捨てる**（小数・負・上限超え・数字以外）。読めなければ undefined
 *
 * @param search `window.location.search`（先頭の `?` はあってもなくてもよい）
 */
export function parseLifeQuery(search: string): number | undefined {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('life');
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return n <= SHOTOKU_TOTAL_CAP ? n : undefined;
}
