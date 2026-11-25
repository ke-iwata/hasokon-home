/**
 * 報酬・料金の源泉徴収税額 計算（10.21%・20.42%）
 *
 * 仕様: docs/features/gensen-hoshu-keisan.md
 *
 * ■ 税額の式（国税庁 タックスアンサー No.2795・No.2798、2026-11-25 確認）
 *   支払金額 A が 100万円以下 … A × 10.21%
 *   100万円超            … (A − 100万円) × 20.42% ＋ 102,100円
 *   1円未満の端数は切り捨て（国税通則法119条。Q&A Q6 は「合計額で」切り捨てる）
 * 100万円は**同一人に対し1回に支払われる金額**で判定する（所得税法205条1号）。
 * 司法書士・土地家屋調査士・海事代理士は (1回の支払金額 − 1万円) × 10.21%
 * （所得税法205条2号・所得税法施行令322条）。こちらに 20% の段はない。
 *
 * ■ 10.21% / 20.42% を直書きしない
 * 合計税率は「所得税率 × (1000 + 付加税の千分率) / 1000」（Q&A Q5：所得税率 × 102.1%）。
 * 付加税の千分率は lib/boei-tokubetsu-shotokuzei.ts の surtaxPermille(year, 'after') を使い、
 * ここで率・日付を持ち直さない（二重管理にしない）。
 * 2027年以後は 防衛特別 1% ＋ 復興特別 1.1% ＝ 2.1% で、合計は変わらない（Q&A Q1）。
 * したがって**税額は支払日によらず同じ**で、変わるのは内訳の呼び方だけ。
 *
 * ■ 支払日で内訳を切り替える（判定の根拠はまだ確定させていない）
 * 防衛特別所得税は「令和9年1月1日以後に生ずる所得」に対する所得税に適用される。
 * 国税庁 Q&A（令和8年5月）の（注）は**給与等**についてだけ「支給日」で判定すると説明していて、
 * 報酬・料金を支払日で判定するとは書いていない（2026-11-25 時点。「源泉徴収のあらまし
 * 令和9年版」も未確認）。報酬の源泉徴収は「支払の際」に行う（所得税法204条1項）ので、
 * このツールは**支払日（源泉徴収する日）**から年を取り出して内訳を出すが、
 * 改正の境目（2026年12月〜2027年1月の支払）では断定しない注記を出す（PAID_ON_RULE_CONFIRMED）。
 * 一次情報で確かめられたら PAID_ON_RULE_CONFIRMED を true にする。
 *
 * ■ 消費税（タックスアンサー No.2795 の 5）
 * 報酬と消費税等の額が請求書等で明確に区分されていれば、報酬の額だけに源泉してよい。
 * 区分していなければ税込額に源泉する。インボイス制度の開始後も取扱いは同じ。
 * 税率は 10% 固定（報酬・料金に軽減税率が当たる場面はまず無い。仕様書「入力」）。
 *
 * ■ 一次情報（条番号は 2026-11-25 に e-Gov 法令API v2 で本文を確認）
 * - 所得税法（昭和40年法律第33号）204条1項（支払の際に徴収・翌月10日までに納付）・
 *   205条1号（百分の十、同一人に1回に支払われる金額が百万円を超える部分は百分の二十）・2号
 * - 所得税法施行令（昭和40年政令第96号）322条（司法書士・土地家屋調査士・海事代理士は
 *   同一人に対し1回に支払われる金額につき1万円を控除）
 * - 国税庁 タックスアンサー No.2795 原稿料や講演料等を支払ったとき
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2795.htm
 * - 国税庁 タックスアンサー No.2798 弁護士や税理士等に支払う報酬・料金
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2798.htm
 * - 国税庁 タックスアンサー No.2792 源泉徴収が必要な報酬・料金等とは
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2792.htm
 * - 国税庁「防衛特別所得税及び復興特別所得税（源泉徴収関係）Ｑ＆Ａ」（令和8年5月）
 *   https://www.nta.go.jp/publication/pamph/pdf/0026005-024_03.pdf
 *   → Q5: 合計税率＝所得税率×102.1%（10%→10.21%、20%→20.42%）／Q6: 端数は合計額で／
 *     Q6 例1: 222,222円→22,688円、例2: 1,333,333円→170,166円／
 *     Q10: 手取り100,000円 → 支払金額111,370円・税額11,370円（グロスアップ）
 *
 * 【データ更新箇所】所得税率と100万円・1万円の区切りは INCOME_TAX の1か所。
 * 付加税の率と期間は lib/boei-tokubetsu-shotokuzei.ts の SURTAX_PERIODS（ここには持たない）。
 */

import { DEFENSE_START_YEAR, surtaxAmount, surtaxPermille } from '@/lib/boei-tokubetsu-shotokuzei';

/**
 * 所得税の率（千分率）と区切り。
 *
 * 【データ更新箇所】所得税法205条が改正されたらここ。
 */
export const INCOME_TAX = {
  /** ふつうの報酬の税率（‰）。100 = 10% */
  basePermille: 100,
  /** 100万円を超える部分の税率（‰）。200 = 20% */
  overPermille: 200,
  /** 税率が上がる区切り（同一人に1回に支払う額） */
  threshold: 1_000_000,
  /** 司法書士・土地家屋調査士・海事代理士の控除（1回の支払につき） */
  shihoshoshiDeduction: 10_000,
} as const;

/** 消費税率（%）。報酬・料金は 10% 固定 */
export const CONSUMPTION_TAX_PERCENT = 10;

/** 入力金額の上限（円）。100億円。整数演算が 2^53 を超えないため */
export const MAX_AMOUNT = 10_000_000_000;

/** 報酬が改正の境目かどうかの判定を一次情報で確かめたか（上の JSDoc） */
export const PAID_ON_RULE_CONFIRMED = false;

/** 支払う相手 */
export type PayeeKind = 'normal' | 'shihoshoshi';

/**
 * 入力金額の意味（消費税の扱い）。
 * - exclusive: 税抜で入れる（消費税を別に足す。請求書で区分している）
 * - inclusiveSeparated: 税込で入れる（請求書で報酬と消費税を区分している）
 * - inclusiveUnseparated: 税込で入れる（区分していない。税込額に源泉する）
 */
export type TaxMode = 'exclusive' | 'inclusiveSeparated' | 'inclusiveUnseparated';

/** 'YYYY-MM-DD' の年 */
export function yearOf(ymd: string): number {
  const y = Number(ymd.slice(0, 4));
  return Number.isInteger(y) && y > 0 ? y : DEFENSE_START_YEAR;
}

/** 付加税の千分率の合計（2.1% → 21） */
function surtaxTotalPermille(year: number): number {
  return surtaxPermille(year, 'after').total;
}

/**
 * 合計税率（％の表示用の数値）。10 → 10.21、20 → 20.42。
 * 率は所得税率と付加税の千分率から組み立てる（直書きしない）。
 */
export function combinedRatePercent(incomePermille: number, year: number): number {
  // 所得税率(‰) × (1000 + 付加税‰) / 1000 を、% にするため 10 で割る。
  // 100 × 1021 = 102,100 → 10.21
  return (incomePermille * (1000 + surtaxTotalPermille(year))) / 10_000;
}

/** 源泉の対象額を区切りごとに分けたもの */
export interface WithholdingPart {
  /** この段の対象額（円） */
  base: number;
  /** 所得税率（‰） */
  incomePermille: number;
  /** 合計税率（%。10.21 など） */
  ratePercent: number;
}

/** 源泉の対象額を段に分ける（式の表示とテストの両方に使う） */
export function withholdingParts(base: number, kind: PayeeKind): WithholdingPart[] {
  const b = Math.max(0, Math.floor(base));
  if (kind === 'shihoshoshi') {
    return [{ base: Math.max(0, b - INCOME_TAX.shihoshoshiDeduction), incomePermille: INCOME_TAX.basePermille, ratePercent: 0 }];
  }
  const parts: WithholdingPart[] = [
    { base: Math.min(b, INCOME_TAX.threshold), incomePermille: INCOME_TAX.basePermille, ratePercent: 0 },
  ];
  if (b > INCOME_TAX.threshold) {
    parts.push({ base: b - INCOME_TAX.threshold, incomePermille: INCOME_TAX.overPermille, ratePercent: 0 });
  }
  return parts;
}

/**
 * 源泉徴収税額（所得税＋付加税の合計。1円未満切捨て）。
 *
 * 浮動小数の誤差を避けるため整数で計算する：
 *   Σ(対象額 × 所得税率‰) × (1000 + 付加税‰) / 1,000,000 を切り捨て
 * 端数は段ごとに切らず、合計額で1回だけ切る（Q&A Q6 例2）。
 *
 * @param base 源泉の対象額（円。消費税を区分していれば税抜の報酬額）
 * @param year 支払う年（税額は 2027 年の前後で変わらない）
 */
export function withholding(base: number, kind: PayeeKind = 'normal', year: number = DEFENSE_START_YEAR): number {
  const incomeTimesPermille = withholdingParts(base, kind).reduce((s, p) => s + p.base * p.incomePermille, 0);
  return Math.floor((incomeTimesPermille * (1000 + surtaxTotalPermille(year))) / 1_000_000);
}

/** 1つの計算の条件 */
export interface HoshuOptions {
  taxMode: TaxMode;
  kind: PayeeKind;
  /** 支払日（源泉徴収する日）'YYYY-MM-DD' */
  paidOn: string;
}

/** 内訳の1行（参考表示） */
export interface BreakdownRow {
  label: '所得税' | '防衛特別所得税' | '復興特別所得税';
  amount: number;
  /** 所得税額に対する率（‰）。所得税の行は 0 */
  permille: number;
}

/**
 * 源泉徴収税額の参考の内訳。**納付は合計額で行う**（Q&A Q4）ので、ここは表示のためだけ。
 *
 * 付加税は2つの税の**合計額**で端数を切る（lib/boei-tokubetsu-shotokuzei.ts の surtaxAmount と同じ。
 * Q&A Q6・防衛財確法5の29②）。そのため、所得税の額 I を
 * 「I ＋ surtaxAmount(I) ≦ 合計」となる最大の整数として逆に求め、付加税の合計は「合計 − I」とする
 * （内訳の和が必ず源泉徴収税額に一致する）。防衛特別と復興特別の分け方は率の比で按分し、
 * 端数は復興特別の側に寄せる。
 *
 * @param total 源泉徴収税額（withholding の値）
 * @param paidOn 支払日。DEFENSE_START_YEAR 以後なら3行、それより前なら2行
 */
export function breakdown(total: number, paidOn: string): BreakdownRow[] {
  const year = yearOf(paidOn);
  const t = Math.max(0, Math.floor(total));
  const rates = surtaxPermille(year, 'after');
  // I + floor(I × s / 1000) ≦ t となる最大の I。目星をつけてから前後を確かめる
  let income = Math.floor((t * 1000) / (1000 + rates.total));
  while (income + 1 + surtaxAmount(income + 1, year, 'after') <= t) income += 1;
  while (income > 0 && income + surtaxAmount(income, year, 'after') > t) income -= 1;
  const surtax = t - income;
  const rows: BreakdownRow[] = [{ label: '所得税', amount: income, permille: 0 }];
  if (rates.defense > 0) {
    const defense = Math.floor((surtax * rates.defense) / rates.total);
    rows.push({ label: '防衛特別所得税', amount: defense, permille: rates.defense });
    rows.push({ label: '復興特別所得税', amount: surtax - defense, permille: rates.reconstruction });
  } else if (rates.reconstruction > 0) {
    rows.push({ label: '復興特別所得税', amount: surtax, permille: rates.reconstruction });
  }
  return rows;
}

/** 計算の結果 */
export interface HoshuResult {
  /** 入力した金額（taxMode の意味で） */
  amount: number;
  /** 報酬の額（税抜。区分なしのときも参考として税抜に割り戻した額） */
  fee: number;
  /** 消費税の額（区分なしのときも参考として割り戻した額） */
  consumptionTax: number;
  /** 請求額（税込） */
  gross: number;
  /** 源泉の対象額 */
  withholdingBase: number;
  /** 源泉徴収税額 */
  withholding: number;
  /** 差引の振込額（請求額 − 源泉徴収税額） */
  net: number;
  /** 式の段 */
  parts: WithholdingPart[];
  /** 参考の内訳 */
  breakdown: BreakdownRow[];
  /**
   * 区分なしで税込額に源泉したとき、区分して書けば源泉がいくら減るか（円）。
   * それ以外のモードでは 0
   */
  unseparatedExtra: number;
}

/** 入力金額を 0〜MAX_AMOUNT の整数にそろえる */
function clampAmount(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(MAX_AMOUNT, Math.max(0, Math.floor(v)));
}

/** 税込額から消費税（10%）を割り戻す（1円未満切捨て） */
function taxFromInclusive(gross: number): number {
  return Math.floor((gross * CONSUMPTION_TAX_PERCENT) / (100 + CONSUMPTION_TAX_PERCENT));
}

/**
 * 請求額から源泉徴収税額と振込額を出す。
 *
 * @param amount taxMode の意味での金額。exclusive なら税抜の報酬額、それ以外は税込の請求額
 */
export function calcHoshu(amount: number, opts: HoshuOptions): HoshuResult {
  const a = clampAmount(amount);
  const year = yearOf(opts.paidOn);
  let fee: number;
  let consumptionTax: number;
  if (opts.taxMode === 'exclusive') {
    fee = a;
    consumptionTax = Math.floor((a * CONSUMPTION_TAX_PERCENT) / 100);
  } else {
    consumptionTax = taxFromInclusive(a);
    fee = a - consumptionTax;
  }
  const gross = fee + consumptionTax;
  const withholdingBase = opts.taxMode === 'inclusiveUnseparated' ? gross : fee;
  const w = withholding(withholdingBase, opts.kind, year);
  const parts = withholdingParts(withholdingBase, opts.kind).map((p) => ({
    ...p,
    ratePercent: combinedRatePercent(p.incomePermille, year),
  }));
  const unseparatedExtra = opts.taxMode === 'inclusiveUnseparated' ? w - withholding(fee, opts.kind, year) : 0;
  return {
    amount: a,
    fee,
    consumptionTax,
    gross,
    withholdingBase,
    withholding: w,
    net: gross - w,
    parts,
    breakdown: breakdown(w, opts.paidOn),
    unseparatedExtra,
  };
}

/** 振込額から逆算した結果 */
export interface FromNetResult {
  /** その振込額になる最小の入力金額（taxMode の意味で） */
  amount: number;
  result: HoshuResult;
  /** ちょうどその振込額になる金額があったか（false なら1円多い振込額になる最小の金額） */
  exact: boolean;
  /** 1円多く請求しても同じ振込額になる（切り捨ての境目） */
  sameNetAtNext: boolean;
}

/**
 * 手取り（振込額）から請求額を逆算する。
 *
 * 振込額は入力金額に対して減らない（1円増やすと 0〜2円増える）ので、
 * 「振込額 ≧ 目標」となる最小の金額を二分探索で求める。切り捨ての都合で
 * 同じ振込額になる金額が2つあるときは小さいほう（Q&A Q10 の 111,370円と同じ）、
 * ちょうどの金額が無いときは目標を1円超える最小の金額を返して exact=false にする。
 */
export function fromNet(net: number, opts: HoshuOptions): FromNetResult {
  const target = clampAmount(net);
  let lo = 0;
  let hi = MAX_AMOUNT;
  if (calcHoshu(hi, opts).net < target) {
    const result = calcHoshu(hi, opts);
    return { amount: hi, result, exact: false, sameNetAtNext: false };
  }
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (calcHoshu(mid, opts).net >= target) hi = mid;
    else lo = mid + 1;
  }
  const result = calcHoshu(lo, opts);
  const exact = result.net === target;
  const sameNetAtNext = exact && lo < MAX_AMOUNT && calcHoshu(lo + 1, opts).net === target;
  return { amount: lo, result, exact, sameNetAtNext };
}

/**
 * 支払日が改正の境目（2026年12月〜2027年1月）にあって、内訳を断定しない注記を出すか。
 * 一次情報で支払日での判定が確かめられたら PAID_ON_RULE_CONFIRMED を true にして出さない。
 */
export function needsPaidOnNotice(paidOn: string): boolean {
  if (PAID_ON_RULE_CONFIRMED) return false;
  const ym = paidOn.slice(0, 7);
  return ym === `${DEFENSE_START_YEAR - 1}-12` || ym === `${DEFENSE_START_YEAR}-01`;
}

/** 請求書の1行 */
export interface InvoiceLine {
  label: string;
  amount: number;
}

/**
 * 請求書の書き方の例。区分ありは「報酬・消費税・小計・源泉徴収税額・差引請求額」の5行、
 * 区分なしは消費税の行を立てない3行（区分すると源泉が減ることは画面で別に出す）。
 * 源泉徴収税額は負の数で持つ。
 */
export function invoiceLines(r: HoshuResult, taxMode: TaxMode): InvoiceLine[] {
  if (taxMode === 'inclusiveUnseparated') {
    return [
      { label: '報酬（消費税込み）', amount: r.gross },
      { label: '源泉徴収税額', amount: -r.withholding },
      { label: '差引請求額', amount: r.net },
    ];
  }
  return [
    { label: '報酬', amount: r.fee },
    { label: `消費税（${CONSUMPTION_TAX_PERCENT}%）`, amount: r.consumptionTax },
    { label: '小計', amount: r.gross },
    { label: '源泉徴収税額', amount: -r.withholding },
    { label: '差引請求額', amount: r.net },
  ];
}

/** 請求書の例をコピー用のテキストにする（タブ区切り。表計算・請求書ソフトに貼れる） */
export function invoiceText(lines: InvoiceLine[]): string {
  return lines
    .map((l) => `${l.label}\t${l.amount < 0 ? '−' : ''}${Math.abs(l.amount).toLocaleString('ja-JP')}円`)
    .join('\n');
}

/** 万分率の整数 numerator / 10,000 を、余分な0を落とした小数の文字列にする（桁区切りつき） */
function decimalText(numerator: number): string {
  const intPart = Math.floor(numerator / 10_000);
  const frac = String(numerator % 10_000).padStart(4, '0').replace(/0+$/, '');
  return `${intPart.toLocaleString('ja-JP')}${frac ? `.${frac}` : ''}`;
}

/**
 * 式の表示。実際の数字で
 * 「(1,000,000 × 10.21%) ＋ (200,000 × 20.42%) ＝ 102,100 ＋ 40,840 ＝ 142,940円」。
 * 端数があるときは「＝ 170,166.5986 ⇒ 170,166円」と切り捨てを見せる（Q&A Q6 例2 の書き方）。
 */
export function formulaText(r: HoshuResult): string {
  const n = (v: number) => v.toLocaleString('ja-JP');
  // 合計税率の万分率（10.21% → 1021）。ratePercent は組み立てた値なので丸めて整数に戻す
  const nums = r.parts.map((p) => p.base * Math.round(p.ratePercent * 100));
  const terms = r.parts.map((p) => `(${n(p.base)} × ${p.ratePercent}%)`).join(' ＋ ');
  const sum = nums.reduce((a, b) => a + b, 0);
  const steps = r.parts.length > 1 ? ` ＝ ${nums.map(decimalText).join(' ＋ ')}` : '';
  const exact = sum % 10_000 === 0;
  return exact
    ? `${terms}${steps} ＝ ${n(r.withholding)}円`
    : `${terms}${steps} ＝ ${decimalText(sum)} ⇒ ${n(r.withholding)}円（1円未満切捨て）`;
}
