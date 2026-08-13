/**
 * iDeCo 拠出限度額・節税額 計算ロジック（2026年12月1日施行の改正対応）
 *
 * 仕様: docs/features/ideco-kyoshutsu-gendogaku.md
 *
 * ■ この改正の本質は「引き上げ」ではなく「合算ルールへの切り替え」
 *
 * 2026年12月1日施行の確定拠出年金法等の改正で、第2号被保険者（会社員・公務員）の
 * iDeCoの拠出限度額は月2.3万円／2.0万円から月6.2万円になる。
 * ただし**6.2万円は「iDeCo単体の上限」ではなく、企業年金と合わせた枠**である。
 *
 *   iDeCoの拠出限度額 ＝ 62,000円 −（企業型DCの事業主掛金 ＋ DB等の他制度掛金相当額）
 *
 * つまり会社員のiDeCo上限は、**勤め先の制度と事業主掛金の額で一人ひとり違う額**になる。
 * 改正前は「会社員は2.3万円」と暗記で済んだものが、改正後は引き算をしないと分からない。
 * これがこの計算機の存在理由である。
 *
 * ■ 改正前（〜2026年11月）の限度額
 * - 第1号被保険者: 月68,000円（国民年金基金の掛金・付加保険料と合算）
 * - 第2号・企業年金なし: 月23,000円
 * - 第2号・企業年金あり: min(55,000円 −（事業主掛金 ＋ 他制度掛金相当額）, 20,000円)
 *   2024年12月の改正で導入された式で、**20,000円という内枠の上限**があった。
 *   2026年12月の改正でこの内枠が撤廃され、枠が55,000円から62,000円に広がる
 * - 第3号被保険者: 月23,000円（改正後も変わらない）
 *
 * ■ 加入可能年齢は65歳未満 → 70歳未満
 * 老齢基礎年金・iDeCoの老齢給付金を受給していないことが条件。
 * 積み立てられる期間が5年延びるので、累計の節税額はその分だけ変わる。
 *
 * ■ 適用の時期（この計算機で必ず併記すること）
 * 施行は2026年12月1日で、**新しい限度額は2026年12月拠出分（2027年1月引落分）から**。
 * それより前は改正前の額のままなので、「いま出せる額」と「2026年12月から出せる額」を
 * 必ず並べて出す。新しい額だけを見せると、いますぐ6.2万円出せると誤解される。
 *
 * ■ 節税額
 * iDeCoの掛金は**全額が小規模企業共済等掛金控除**として所得控除になる。
 * 税率を掛けるのではなく、掛金を引く前と引いた後の税額の差で出している
 * （税率の区分をまたぐ人でも正しい額になるため）。
 * 所得税には復興特別所得税（2.1%）が乗り、住民税の所得割は一律10%。
 *
 * ■ 一次情報・確認先（2026-08-13 取得）
 * - 厚生労働省 社会保障審議会 企業年金・個人年金部会 資料
 *   https://www.mhlw.go.jp/content/10600000/001365075.pdf
 * - 楽天証券「【2026年12月制度改正】iDeCoの加入可能年齢・拠出限度額が引き上げ」
 *   https://dc.rakuten-sec.co.jp/about/revised/202505/
 * - マネックス証券「iDeCo拠出限度額および加入可能年齢の引き上げ（2026年12月制度改正）」
 *   https://info.monex.co.jp/news/2026/20260514_01.html
 * - iDeCo公式「拠出限度額の見直しに伴うiDeCo掛金額変更の事前受付について」（2024年12月改正）
 *   https://www.ideco-koushiki.jp/library/pdf/advance_booking_20240830.pdf
 *
 * ■ このロジックで計算しないもの
 * - 運用商品の選択・利回りのシミュレーション（投資助言の領域に入るため）
 * - 受取時の税金（退職所得控除・公的年金等控除）
 * - マッチング拠出との選択
 *
 * 【データ更新箇所】限度額が改定されたら LIMITS / SHARED_FRAME_* / INNER_CAP_BEFORE、
 * 加入可能年齢が変わったら JOIN_AGE_LIMIT_*、施行日が動いたら REFORM_EFFECTIVE_FROM。
 * 所得税の速算表・給与所得控除・基礎控除は lib/furusato-nozei.ts のものを再利用しているので、
 * 税制改正のときはそちらを直せばこの計算機にも効く。
 */

import {
  RECONSTRUCTION_RATE,
  RESIDENT_RATE,
  basicDeductionIncomeTax,
  basicDeductionResidentTax,
  estimateSocialInsurance,
  incomeTaxAmount,
  incomeTaxRate,
  salaryDeduction,
  salaryIncome,
} from '@/lib/furusato-nozei';

/**
 * 改正の施行日（暦日）。この日以後の拠出分から新しい限度額になる。
 * 実際の掛金は2026年12月拠出分＝2027年1月引落分から変わる。
 */
export const REFORM_EFFECTIVE_FROM = '2026-12-01';

/** 新しい限度額が最初に適用される掛金の説明（画面に出す文言と揃えるための定数） */
export const REFORM_FIRST_CONTRIBUTION = '2026年12月拠出分（2027年1月引落分）';

/** 国民年金の被保険者区分 */
export type InsuredType =
  /** 第1号（自営業・フリーランス・学生など） */
  | 'type1'
  /** 第2号（会社員・公務員） */
  | 'type2'
  /** 第3号（第2号に扶養されている配偶者） */
  | 'type3';

/** 勤め先の企業年金（第2号被保険者のみ意味を持つ） */
export type CorporatePension =
  /** 企業年金なし */
  | 'none'
  /** 企業型確定拠出年金（企業型DC）のみ */
  | 'dc'
  /** 確定給付企業年金（DB）・厚生年金基金・公務員の年金払い退職給付など */
  | 'db'
  /** 企業型DCとDB等の両方 */
  | 'both';

/** 改正の前後どちらの制度で計算するか */
export type Era = 'before' | 'after';

/**
 * 区分ごとの拠出限度額（月額・円）。
 * 【データ更新箇所】限度額の改定はここ。
 */
export const LIMITS = {
  /** 改正前（〜2026年11月拠出分） */
  before: {
    /** 第1号。国民年金基金の掛金・付加保険料と合算した枠 */
    type1: 68_000,
    /** 第2号・企業年金なし */
    type2NoPension: 23_000,
    /** 第3号 */
    type3: 23_000,
  },
  /** 改正後（2026年12月拠出分〜） */
  after: {
    type1: 75_000,
    /** 第2号。企業年金の有無にかかわらず、事業主掛金と合算した枠になる */
    type2: 62_000,
    /** 第3号は据え置き */
    type3: 23_000,
  },
} as const;

/** 改正後の第2号の合算枠（円・月額）。ここから事業主掛金を引く */
export const SHARED_FRAME_AFTER = LIMITS.after.type2;

/** 改正前の第2号・企業年金ありの合算枠（円・月額） */
export const SHARED_FRAME_BEFORE = 55_000;

/**
 * 改正前の第2号・企業年金ありの内枠上限（円・月額）。
 * 引き算の結果がこれより大きくても2万円までしか出せなかった。改正で撤廃される。
 */
export const INNER_CAP_BEFORE = 20_000;

/** 加入可能年齢の上限（この年齢「未満」）。改正前 */
export const JOIN_AGE_LIMIT_BEFORE = 65;

/** 同・改正後。老齢基礎年金・iDeCoの老齢給付金を受給していないことが条件 */
export const JOIN_AGE_LIMIT_AFTER = 70;

/** 掛金の最低額（円・月額） */
export const MIN_CONTRIBUTION = 5_000;

/** 掛金の刻み（円）。1,000円単位でしか申し込めない */
export const CONTRIBUTION_UNIT = 1_000;

/** 拠出限度額の内訳。引き算をそのまま画面に出せる形で返す */
export interface LimitBreakdown {
  /** どちらの制度か */
  era: Era;
  /** 合算枠（円・月額）。引き算の左辺 */
  frame: number;
  /**
   * 枠から差し引く額（円・月額）。
   * 第2号は事業主掛金＋他制度掛金相当額、第1号は国民年金基金の掛金＋付加保険料
   */
  deducted: number;
  /** 差し引いた額（円・月額）。0未満にはしない */
  afterDeduction: number;
  /** 別に定められた上限（円・月額）。無ければ null（改正前の第2号・企業年金ありだけ） */
  cap: number | null;
  /** 拠出限度額（円・月額） */
  monthly: number;
  /** 同・年額（円） */
  yearly: number;
  /**
   * 実際に申し込める月額（円）。掛金は5,000円以上・1,000円単位のため、
   * 限度額の端数は切り捨てになる。5,000円に届かなければ0
   */
  contributableMonthly: number;
  /** 差し引きが効いているか（枠より小さくなったか） */
  reducedByDeduction: boolean;
  /** 内枠上限で頭打ちになっているか */
  cappedByInner: boolean;
  /** 1円も拠出できないか（枠を事業主掛金が食い切っている等） */
  blocked: boolean;
}

/** 限度額を決めるための入力 */
export interface LimitInput {
  insured: InsuredType;
  /** 勤め先の企業年金（第2号のみ） */
  pension: CorporatePension;
  /**
   * 企業型DCの事業主掛金と、DB等の他制度掛金相当額の合計（円・月額）。
   * 他制度掛金相当額は勤め先から通知される
   */
  employerContribution: number;
  /** 国民年金基金の掛金・付加保険料の合計（円・月額。第1号のみ） */
  nationalPensionFund?: number;
}

/** 1,000円単位に切り下げ、最低額に届かなければ0にする */
function toContributable(limit: number): number {
  const floored = Math.floor(limit / CONTRIBUTION_UNIT) * CONTRIBUTION_UNIT;
  return floored >= MIN_CONTRIBUTION ? floored : 0;
}

/** 内訳から LimitBreakdown を組み立てる（frame / deducted / cap の3つで表現できる） */
function breakdown(era: Era, frame: number, deducted: number, cap: number | null): LimitBreakdown {
  const d = Math.max(0, deducted);
  const afterDeduction = Math.max(0, frame - d);
  const monthly = cap === null ? afterDeduction : Math.min(afterDeduction, cap);
  return {
    era,
    frame,
    deducted: d,
    afterDeduction,
    cap,
    monthly,
    yearly: monthly * 12,
    contributableMonthly: toContributable(monthly),
    reducedByDeduction: d > 0,
    cappedByInner: cap !== null && afterDeduction > cap,
    blocked: monthly <= 0,
  };
}

/**
 * 拠出限度額を求める。
 *
 * 第2号の改正後は「62,000円 − 事業主掛金」の一本になり、内枠の上限は無くなる。
 * 改正前は企業年金の有無で式そのものが違う（無しは23,000円の固定、有りは
 * 55,000円からの引き算に20,000円の頭打ち）。この違いを1箇所に閉じ込めている。
 */
export function contributionLimit(input: LimitInput, era: Era): LimitBreakdown {
  const employer = Math.max(0, input.employerContribution);
  const fund = Math.max(0, input.nationalPensionFund ?? 0);

  if (input.insured === 'type1') {
    // 第1号は国民年金基金の掛金・付加保険料との合算枠。改正で68,000円→75,000円
    return breakdown(era, era === 'after' ? LIMITS.after.type1 : LIMITS.before.type1, fund, null);
  }

  if (input.insured === 'type3') {
    // 第3号は改正の対象外（23,000円のまま）
    return breakdown(era, era === 'after' ? LIMITS.after.type3 : LIMITS.before.type3, 0, null);
  }

  // 第2号
  if (era === 'after') {
    // 企業年金が無ければ差し引く事業主掛金も無いので、枠がそのまま限度額になる
    return breakdown(era, SHARED_FRAME_AFTER, input.pension === 'none' ? 0 : employer, null);
  }
  if (input.pension === 'none') {
    return breakdown(era, LIMITS.before.type2NoPension, 0, null);
  }
  return breakdown(era, SHARED_FRAME_BEFORE, employer, INNER_CAP_BEFORE);
}

/** 節税額を出すための課税所得の入れ方 */
export type IncomeMode =
  /** 年収（給与収入）から課税所得を推計する */
  | 'salary'
  /** 課税所得（所得税の課税総所得金額）を直接入れる */
  | 'taxable';

export interface IdecoInput extends LimitInput {
  /** 年齢（歳）。加入可能年齢までの累計に使う */
  age: number;
  incomeMode: IncomeMode;
  /** 給与収入（額面・年間・円。incomeMode が 'salary' のとき） */
  income: number;
  /** 課税所得（所得税・年間・円。incomeMode が 'taxable' のとき） */
  taxableIncome: number;
  /** 社会保険料の年間合計（円）。null なら年収から推計する */
  socialInsurance: number | null;
  /** 40〜64歳（介護保険料がかかる）。社会保険料を推計するときだけ使う */
  kaigo: boolean;
  /**
   * 実際に拠出する月額（円）。null なら改正後の限度額いっぱいで計算する。
   * 限度額を超える額を渡した場合は限度額まで切り下げる
   */
  contributionMonthly: number | null;
  /** 基準日。省略時は現在日。施行日を過ぎているかの判定に使う */
  asOf?: Date;
}

/** 掛金による節税額 */
export interface SavingResult {
  /** 課税所得（所得税・1,000円未満切捨て） */
  taxableIncomeTax: number;
  /** 課税所得（住民税・1,000円未満切捨て） */
  taxableResidentTax: number;
  /** 適用される所得税率（0〜0.45） */
  rate: number;
  /** 所得税の軽減額（復興特別所得税を含む・年・円） */
  incomeTax: number;
  /** 住民税の軽減額（年・円） */
  residentTax: number;
  /** 合計（年・円） */
  total: number;
  /** 節税額 ÷ 拠出額。掛金が0なら0 */
  effectiveRate: number;
  /** 課税所得が無く、所得控除を使っても税が減らない状態か */
  noTaxableIncome: boolean;
  /** 社会保険料（入力値または推計値・年・円） */
  socialInsurance: number;
  /** 社会保険料が推計値か。true なら結果に「概算」と明示する */
  socialInsuranceEstimated: boolean;
}

/** 加入可能年齢までの累計 */
export interface Cumulative {
  /** 加入できる上限年齢（この年齢「未満」） */
  untilAge: number;
  /** 残りの加入可能月数 */
  months: number;
  /** 累計の拠出額（円） */
  contribution: number;
  /** 累計の節税額（円） */
  saving: number;
}

export interface IdecoResult {
  /** 基準日に改正後の限度額が適用されているか */
  reformApplied: boolean;
  /** 改正後（2026年12月拠出分〜）の限度額 */
  after: LimitBreakdown;
  /** 改正前（〜2026年11月拠出分）の限度額 */
  before: LimitBreakdown;
  /** 基準日に適用される限度額（reformApplied で after / before を選んだもの） */
  current: LimitBreakdown;
  /** 改正で増える限度額（円・月額）。減ることはないが0未満にはしない */
  gainMonthly: number;
  /** 同・年額（円） */
  gainYearly: number;
  /** 改正で限度額が何倍になるか。改正前が0なら null */
  gainRatio: number | null;
  /** 実際に拠出する月額（円。改正後の限度額でクランプ済み） */
  contributionMonthly: number;
  /** 同・年額（円） */
  contributionYearly: number;
  /** 拠出額が限度額に張り付いているか */
  contributionAtLimit: boolean;
  /** 拠出額による節税額 */
  saving: SavingResult;
  /** 改正前の限度額いっぱいで拠出した場合の節税額（比較用） */
  savingBefore: SavingResult;
  /** 加入可能年齢（改正前・65歳未満）までの累計 */
  cumulativeBefore: Cumulative;
  /** 加入可能年齢（改正後・70歳未満）までの累計 */
  cumulativeAfter: Cumulative;
  /** 加入可能年齢の延長で増える累計の節税額（円） */
  cumulativeSavingGain: number;
}

/** 課税所得は1,000円未満を切り捨てる */
const floorTo1000 = (v: number) => Math.max(0, Math.floor(v / 1000) * 1000);

/**
 * 施行日の判定は「日本の暦日」で行う。
 * Date どうしを比較すると `new Date('2026-12-01')` がUTCの深夜と解釈され、
 * 日本時間では11月30日中に切り替わってしまう（lib/nenshu-kabe.ts と同じ理由）。
 */
function toYmd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 基準日に改正後の限度額が適用されているか */
export function isReformApplied(asOf: Date = new Date()): boolean {
  return toYmd(asOf) >= REFORM_EFFECTIVE_FROM;
}

/**
 * 掛金による節税額を計算する。
 *
 * 税率を掛けるのではなく、**掛金を引く前と引いた後の税額の差**で出している。
 * 税率の区分をまたぐ人（たとえば掛金で課税所得が330万円を下回る人）に、
 * 「税率20%だから ×20%」と単純に掛けると実際より大きな節税額が出るため。
 *
 * 住民税の所得割は一律10%なので、課税所得が残っている限りは掛金 ×10% になる。
 * 課税所得を直接入れるモードでは、所得税の課税総所得金額を住民税側にも使う。
 * 住民税の基礎控除（43万円）は所得税（最大104万円）より小さく、実際の住民税の
 * 課税所得はこれより大きいので、節税額を多めに見積もることはない。
 */
export function calcSaving(
  input: IdecoInput,
  contributionYearly: number,
): SavingResult {
  const contribution = Math.max(0, contributionYearly);

  const socialInsuranceEstimated = input.incomeMode === 'salary' && input.socialInsurance === null;
  let socialInsurance = 0;
  let taxableIncomeTax = 0;
  let taxableResidentTax = 0;

  if (input.incomeMode === 'salary') {
    const income = Math.max(0, input.income);
    const totalIncome = salaryIncome(income);
    socialInsurance = Math.max(
      0,
      socialInsuranceEstimated
        ? estimateSocialInsurance(income, input.kaigo)
        : (input.socialInsurance ?? 0),
    );
    // 給与収入のみ・所得控除は社会保険料と基礎控除だけという前提の概算。
    // 扶養控除・生命保険料控除などがある人は課税所得を直接入れてもらう
    taxableIncomeTax = floorTo1000(
      totalIncome - socialInsurance - basicDeductionIncomeTax(totalIncome),
    );
    taxableResidentTax = floorTo1000(
      totalIncome - socialInsurance - basicDeductionResidentTax(totalIncome),
    );
  } else {
    taxableIncomeTax = floorTo1000(input.taxableIncome);
    taxableResidentTax = taxableIncomeTax;
  }

  const afterIncomeTax = floorTo1000(taxableIncomeTax - contribution);
  const afterResidentTax = floorTo1000(taxableResidentTax - contribution);

  // 所得税は速算表の差額に復興特別所得税（2.1%）を乗せる
  const incomeTax = Math.floor(
    (incomeTaxAmount(taxableIncomeTax) - incomeTaxAmount(afterIncomeTax)) * RECONSTRUCTION_RATE,
  );
  // 住民税の所得割は一律10%。課税所得が無くなればそこで止まる
  const residentTax = Math.floor(
    (taxableResidentTax - afterResidentTax) * RESIDENT_RATE,
  );

  const total = Math.max(0, incomeTax) + Math.max(0, residentTax);

  return {
    taxableIncomeTax,
    taxableResidentTax,
    rate: incomeTaxRate(taxableIncomeTax),
    incomeTax: Math.max(0, incomeTax),
    residentTax: Math.max(0, residentTax),
    total,
    effectiveRate: contribution > 0 ? total / contribution : 0,
    noTaxableIncome: taxableIncomeTax <= 0 && taxableResidentTax <= 0,
    socialInsurance,
    socialInsuranceEstimated,
  };
}

/**
 * 加入可能年齢までの累計。
 *
 * 年齢は歳単位でしか受け取らないので、残り月数は（上限年齢 − 年齢）×12 の概算。
 * 節税額は「いまの課税所得のまま拠出し続けた場合」で、昇給・税制改正は織り込まない。
 */
function cumulativeUntil(
  age: number,
  untilAge: number,
  contributionMonthly: number,
  savingYearly: number,
): Cumulative {
  const months = Math.max(0, Math.round((untilAge - Math.max(0, age)) * 12));
  return {
    untilAge,
    months,
    contribution: contributionMonthly * months,
    saving: Math.round((savingYearly / 12) * months),
  };
}

/**
 * iDeCoの拠出限度額と節税額を計算する。
 *
 * 改正後・改正前の限度額を必ず両方返す。UIはこの2つを並べて出すこと
 * （新しい額だけを見せると、いますぐ6.2万円出せると誤解されるため）。
 */
export function calcIdeco(input: IdecoInput): IdecoResult {
  const after = contributionLimit(input, 'after');
  const before = contributionLimit(input, 'before');
  const reformApplied = isReformApplied(input.asOf ?? new Date());
  const current = reformApplied ? after : before;

  // 拠出額は改正後の限度額（＝この計算機の主題）でクランプする。
  // 未指定なら申し込める最大額（1,000円単位）を使う
  const requested =
    input.contributionMonthly === null
      ? after.contributableMonthly
      : Math.max(0, input.contributionMonthly);
  const contributionMonthly = Math.min(requested, after.monthly);
  const contributionYearly = contributionMonthly * 12;

  const saving = calcSaving(input, contributionYearly);
  const savingBefore = calcSaving(input, before.monthly * 12);

  const cumulativeBefore = cumulativeUntil(
    input.age,
    JOIN_AGE_LIMIT_BEFORE,
    contributionMonthly,
    saving.total,
  );
  const cumulativeAfter = cumulativeUntil(
    input.age,
    JOIN_AGE_LIMIT_AFTER,
    contributionMonthly,
    saving.total,
  );

  return {
    reformApplied,
    after,
    before,
    current,
    gainMonthly: Math.max(0, after.monthly - before.monthly),
    gainYearly: Math.max(0, after.monthly - before.monthly) * 12,
    gainRatio: before.monthly > 0 ? after.monthly / before.monthly : null,
    contributionMonthly,
    contributionYearly,
    contributionAtLimit: contributionMonthly >= after.monthly && after.monthly > 0,
    saving,
    savingBefore,
    cumulativeBefore,
    cumulativeAfter,
    cumulativeSavingGain: Math.max(0, cumulativeAfter.saving - cumulativeBefore.saving),
  };
}
