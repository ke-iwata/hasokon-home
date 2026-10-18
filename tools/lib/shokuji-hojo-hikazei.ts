/**
 * 食事補助の非課税 判定（所得税基本通達 36-38 の 2・令和8年4月から月7,500円）
 *
 * 仕様: docs/features/shokuji-hojo-hikazei.md
 *
 * 会社が出す食事（弁当・社員食堂・条件を満たす食券など）の 1 か月分から、
 * 「本人が半分以上を負担」と「会社負担が税抜き月 7,500 円以下」の 2 条件を確かめる。
 * 満たさなければ**会社負担（税込み）の全額**が給与になる（超えた分だけではない）。
 *
 * - 税抜きへの換算は**税率ごとに合計してから**行い、足した額の 10 円未満を切り捨てる
 *   （タックスアンサー No.2594-1）。行ごとに換算して切り捨てない
 * - 小数で割ると二進小数の誤差が出るので、内部では「円 × 108 × 110」の整数で持ち、最後に割る
 * - 条件 1 の「食事の価額」は税込みで比べる（No.2594 の価額は「業者に支払う購入金額」。
 *   在宅勤務FAQ 問12 も額面 16,200 円の半額 8,100 円で判定している）
 */

/** 消費税率（%）。8% は持ち帰り・配達・弁当、10% は店内・社員食堂、0 は消費税がかからない材料費など */
export type MealKind = 'reduced' | 'standard' | 'exempt';

export const RATE_OF: Record<MealKind, number> = { reduced: 8, standard: 10, exempt: 0 };

export const MEAL_KIND_LABELS: Record<MealKind, string> = {
  reduced: '持ち帰り・配達・弁当（8%）',
  standard: '店内・社員食堂（10%）',
  exempt: '消費税がかからない（自社の材料費で作る など）',
};

/** この食事を出した期間。限度額は「令和8年4月1日以後に支給する食事」で切り替わる */
export type Period = 'from-2026-04' | 'before-2026-04';

// ============================================================
// 【データ更新箇所】限度額（消費税等を除いた額）
// 国税庁「食事の現物支給に係る所得税の非課税限度額の引上げについて」
//   https://www.nta.go.jp/users/gensen/2026shokuji/index.htm
// タックスアンサー No.2594 https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2594.htm
// 夜食代: 個別通達（昭和59年7月26日直法6-5 ほか、令和8年3月31日改正）
//   https://www.nta.go.jp/law/tsutatsu/kobetsu/shotoku/gensen/840726/01.htm
// ============================================================
export const LIMIT_FROM_2026_04 = 7500;
export const LIMIT_BEFORE = 3500;
export const YASHOKU_FROM_2026_04 = 650;
export const YASHOKU_BEFORE = 300;

/** 出典を最後に確かめた日 */
export const DATA_CHECKED_AT = '2026-10-18';

export const MAX_ROWS = 5;

export function limitFor(period: Period): number {
  return period === 'from-2026-04' ? LIMIT_FROM_2026_04 : LIMIT_BEFORE;
}

export function yashokuLimitFor(period: Period): number {
  return period === 'from-2026-04' ? YASHOKU_FROM_2026_04 : YASHOKU_BEFORE;
}

/**
 * 入力欄の文字列を 0 以上の整数に直す。全角数字・カンマを受け付け、空や数字以外は 0。
 * 小数点以下は捨てる（円・食数の欄なので）
 */
export function parseCount(text: string): number {
  const half = text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，、\s]/g, '');
  const m = half.match(/^\d+/);
  return m ? Number(m[0]) : 0;
}

export interface MealRow {
  kind: MealKind;
  /** 1 食の価額（税込み。社員食堂は材料費などの合計） */
  price: number;
  /** 1 食の本人負担額 */
  selfPay: number;
  /** その月の食数 */
  count: number;
}

/** 税率ごとの会社負担（税込み） */
export type ByKind = Record<MealKind, number>;

/** 1/108 と 1/110 を整数で扱うための共通の分母（108 × 110） */
const DENOM = 108 * 110;

/** 税率ごとの会社負担（税込み）を、税抜きの額 × DENOM の整数にする */
function exclScaled(by: ByKind): number {
  return by.reduced * 100 * 110 + by.standard * 100 * 108 + by.exempt * DENOM;
}

/**
 * 税率ごとの会社負担（税込み）から、税抜きの会社負担（10 円未満切り捨て）を出す。
 * No.2594-1 の手順：税率ごとに合計 → それぞれ税抜きに直す → 足す → 10 円未満を切り捨て
 */
export function taxExclusiveFloor10(by: ByKind): number {
  return Math.floor(exclScaled(by) / (DENOM * 10)) * 10;
}

export interface ShokujiResult {
  period: Period;
  limit: number;
  /** Σ 価額 × 食数 */
  totalPrice: number;
  /** Σ 本人負担 × 食数 */
  totalSelf: number;
  /** 食数の合計 */
  totalCount: number;
  /** 税率ごとの会社負担（税込み） */
  companyByKind: ByKind;
  /** 会社負担の合計（税込み） */
  companyTaxIncl: number;
  /** 会社負担（税抜き・10 円未満切り捨て） */
  companyTaxExcl: number;
  /** 条件 1：本人が半分以上を負担（等号は満たす側） */
  cond1: boolean;
  /** 条件 2：税抜きの会社負担が限度額以下 */
  cond2: boolean;
  hikazei: boolean;
  /** 給与に足す額（税込みの会社負担の全額。非課税なら 0） */
  taxableAmount: number;
  /** 会社負担が 0 以下（給与になる額は無い） */
  noCompanyBurden: boolean;
  /**
   * 条件 2 を外しているとき、会社負担（税込み）を税率の割合を変えずにあと何円減らせば満たすか
   */
  reduceToPass?: number;
  /** 8% と 10% など税率が混ざっているか（あと何円の文言を変える） */
  mixedRates: boolean;
  /** 税率が 1 種類だけのとき、1 食あたりの会社負担を何円以下にすれば条件 2 を満たすか（いまの食数のまま） */
  perMealCompanyMax?: number;
  /** 条件 1 を外しているとき、本人負担を 1 食あたり平均何円以上にすればよいか */
  selfPayPerMealNeeded?: number;
  /** 条件 1 を外しているとき、本人負担の合計にあと何円足りないか */
  selfShortfall?: number;
  /** 4 月以後の食事のとき、改正前の限度額（3,500 円）だったら非課税だったか */
  hikazeiBeforeReform?: boolean;
}

/** 条件 2 を満たす最大の会社負担の税抜き×DENOM（これ未満なら floor10 が限度額以下） */
function exclBound(limit: number): number {
  return (limit + 10) * DENOM;
}

/**
 * 会社負担（税込み）を割合を変えずに d 円減らしたあと、条件 2 を満たすか。
 * 減らしたあとの税率ごとの額は小数になりうるので、割合のまま比べる
 */
export function passesAfterProportionalReduction(by: ByKind, d: number, limit: number): boolean {
  const c = by.reduced + by.standard + by.exempt;
  if (c <= 0) return true;
  const remain = Math.max(0, c - d);
  // excl × remain / c < (limit + 10)  ⇔  exclScaled × remain < (limit + 10) × DENOM × c
  return BigInt(exclScaled(by)) * BigInt(remain) < BigInt(exclBound(limit)) * BigInt(c);
}

function minimalReduction(by: ByKind, limit: number): number {
  const c = by.reduced + by.standard + by.exempt;
  const n = BigInt(exclScaled(by));
  if (n === BigInt(0)) return 0;
  // 残してよい最大の額 k： k × n < bound × c を満たす最大の整数
  const ma = BigInt(exclBound(limit)) * BigInt(c);
  const k = (ma - BigInt(1)) / n;
  return Math.max(0, c - Number(k));
}

export function judgeShokuji(rows: MealRow[], period: Period): ShokujiResult {
  const limit = limitFor(period);
  const companyByKind: ByKind = { reduced: 0, standard: 0, exempt: 0 };
  let totalPrice = 0;
  let totalSelf = 0;
  let totalCount = 0;
  for (const r of rows) {
    const price = Math.max(0, Math.floor(r.price));
    // 本人負担が価額を超える行は、価額までを負担したものとして扱う
    const self = Math.min(price, Math.max(0, Math.floor(r.selfPay)));
    const count = Math.max(0, Math.floor(r.count));
    totalPrice += price * count;
    totalSelf += self * count;
    totalCount += count;
    companyByKind[r.kind] += (price - self) * count;
  }
  const companyTaxIncl = companyByKind.reduced + companyByKind.standard + companyByKind.exempt;
  const companyTaxExcl = taxExclusiveFloor10(companyByKind);
  const cond1 = totalSelf * 2 >= totalPrice;
  const cond2 = companyTaxExcl <= limit;
  const noCompanyBurden = companyTaxIncl <= 0;
  const hikazei = noCompanyBurden || (cond1 && cond2);

  const kindsUsed = (Object.keys(companyByKind) as MealKind[]).filter((k) =>
    rows.some((r) => r.kind === k && r.count > 0 && r.price > 0),
  );
  const mixedRates = new Set(kindsUsed.map((k) => RATE_OF[k])).size > 1;

  const result: ShokujiResult = {
    period,
    limit,
    totalPrice,
    totalSelf,
    totalCount,
    companyByKind,
    companyTaxIncl,
    companyTaxExcl,
    cond1,
    cond2,
    hikazei,
    taxableAmount: hikazei ? 0 : companyTaxIncl,
    noCompanyBurden,
    mixedRates,
  };

  if (!noCompanyBurden && !cond2) {
    result.reduceToPass = minimalReduction(companyByKind, limit);
    if (!mixedRates && kindsUsed.length > 0 && totalCount > 0) {
      const rate = RATE_OF[kindsUsed[0]];
      // p × 食数 × 100 / (100 + rate) < limit + 10 を満たす最大の整数 p
      result.perMealCompanyMax = Math.floor(
        ((limit + 10) * (100 + rate) - 1) / (100 * totalCount),
      );
    }
  }
  if (!noCompanyBurden && !cond1 && totalCount > 0) {
    result.selfShortfall = Math.ceil(totalPrice / 2) - totalSelf;
    result.selfPayPerMealNeeded = Math.ceil(totalPrice / (2 * totalCount));
  }
  if (period === 'from-2026-04' && !noCompanyBurden) {
    result.hikazeiBeforeReform = cond1 && companyTaxExcl <= LIMIT_BEFORE;
  }
  return result;
}

// ============================================================
// お金で渡す場合（夜食代）
// ============================================================

export interface YashokuInput {
  /** 勤務 1 回（1 食）当たりの支給額 */
  amountPerShift: number;
  period: Period;
  /** 正規の勤務時間の一部か全部が午後10時〜翌午前5時の深夜勤務者か */
  lateNightWorker: boolean;
  /** 通常の給与に加算して勤務 1 回ごとの定額で支給しているか */
  fixedPerShift: boolean;
  /** 夜食を現物で出すのが著しく困難か（調理施設が無いなど） */
  hardToProvide: boolean;
}

/** hikazei: 非課税／pending: 判定を保留（換算の税率で結論が分かれる）／kazei: 課税 */
export type YashokuVerdict = 'hikazei' | 'pending' | 'kazei';

export interface YashokuResult {
  verdict: YashokuVerdict;
  limit: number;
  /** 8% で除いて限度額以下になる最大の額 */
  maxWith8: number;
  /** 10% で除いて限度額以下になる最大の額 */
  maxWith10: number;
  /** 3 条件のどれかを外しているか */
  conditionsMissing: boolean;
}

/**
 * 夜食代の判定。通達は「消費税及び地方消費税相当額を除いた金額により判定」とだけ書き、
 * 換算に使う税率を書いていないので、8% と 10% で結論が分かれる帯は判定を保留する。
 */
export function judgeYashoku(input: YashokuInput): YashokuResult {
  const limit = yashokuLimitFor(input.period);
  const maxWith8 = Math.floor((limit * 108) / 100);
  const maxWith10 = Math.floor((limit * 110) / 100);
  const conditionsMissing = !(input.lateNightWorker && input.fixedPerShift && input.hardToProvide);
  const a = Math.max(0, Math.floor(input.amountPerShift));
  let verdict: YashokuVerdict;
  if (conditionsMissing) verdict = 'kazei';
  else if (a <= limit) verdict = 'hikazei';
  else if (a <= maxWith10) verdict = 'pending';
  else verdict = 'kazei';
  return { verdict, limit, maxWith8, maxWith10, conditionsMissing };
}

/**
 * お金で渡す食事代の判定。夜食代の例外に当たらなければ**全額が給与**（質疑応答事例
 * 「使用者が使用人等に対し食事代として金銭を支給した場合」）。
 */
export function judgeCash(
  input: { yashoku: false } | ({ yashoku: true } & YashokuInput),
): YashokuVerdict {
  if (!input.yashoku) return 'kazei';
  return judgeYashoku(input).verdict;
}
