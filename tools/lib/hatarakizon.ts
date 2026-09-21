/**
 * 社会保険の「働き損」計算ロジック
 *
 * 「扶養内に抑える場合」と「勤務先の社会保険に加入して働く場合」の手取りを
 * 年収の軸で並べ、手取りの逆転区間（働き損ゾーン）と損益分岐点を出す。
 *
 * 2026年10月1日に短時間労働者の賃金要件（月額8.8万円＝年収106万円相当）が撤廃され、
 * 短時間労働者が加入対象の勤務先で週20時間以上働く人は年収に関係なく加入する。
 * 「壁がどこにあるか」は lib/nenshu-kabe.ts が答える。こちらは
 * 「加入すると手取りがいくら減り、いくら稼げば取り戻せるか」に答える。
 *
 * 同じ2026年10月1日に**保険料調整制度**が始まる。50人以下で新たに短時間労働者を
 * 加入対象にした事業所が申し出ると、標準報酬月額12.6万円以下の人の厚生年金保険料・
 * 健康保険料の本人負担が、労使折半（全体の50%）ではなく 25〜48% になる（通算3年）。
 * 対象者の「働き損ゾーン」「損益分岐点」はこの軽減後の保険料で決まるので、
 * 折半のまま出すと**実際より広い働き損ゾーン**を見せることになる。
 * 仕様は docs/features/hokenryo-chosei-seido.md。
 *
 * ■ 計算の前提
 * - 給与収入のみ・賞与なし・本人に扶養親族なし（扶養される側の人が対象のため）
 * - 税額は令和8年分（給与所得控除74万円・所得税の基礎控除104万円・住民税43万円）。
 *   計算式は lib/furusato-nozei.ts のものをそのまま再利用している
 * - 社会保険料は標準報酬月額（lib/shaho-grades.ts の等級表）にもとづく本人負担分。
 *   健康保険料率は協会けんぽの全国平均で、都道府県により数%変わる。
 *   実際の標準報酬月額は4〜6月の報酬から決まる（定時決定）が、ここでは年収の12分の1で引く
 * - 標準報酬月額は等級の階段なので、境目をまたぐと年収が1万円増えても手取りが数千円下がる。
 *   住民税の均等割（119万円超で5,000円）も同じく階段になる。
 *   実際に起きることなので、曲線を滑らかに均したりはしていない
 * - 国民健康保険・国民年金は計算しない。扶養内であれば本人負担は0のため、
 *   「扶養内 → 勤務先の社保に加入」の比較には効かない
 *
 * ■ 一次情報
 * - 厚生労働省「社会保険適用拡大特設サイト」 https://www.mhlw.go.jp/tekiyoukakudai/
 * - 日本年金機構「厚生年金保険の保険料」 https://www.nenkin.go.jp/service/kounen/hokenryo/
 * - 年金制度改正法（令和7年6月成立）による賃金要件の撤廃
 * - 保険料率（健康保険・介護・子ども・子育て支援金・厚生年金・雇用保険）の出典は
 *   lib/shaho-ryoritsu.ts にまとめてある。ここでは持たない
 *
 * 【データ更新箇所】**保険料率はここに持たない。** lib/shaho-ryoritsu.ts が唯一の定義で、
 * ここは同名で re-export しているだけ（既存の import 元を変えずに済ませるため）。
 * 年金の給付乗率が変わったら PENSION_ACCRUAL_RATE を、住民税の均等割が変わったら
 * RESIDENT_PER_CAPITA を更新する。
 */

import {
  BASIC_DEDUCTION_DIFF,
  adjustmentDeduction,
  basicDeductionIncomeTax,
  basicDeductionResidentTax,
  incomeTaxAmount,
  salaryIncome,
} from '@/lib/furusato-nozei';
import {
  WAGE_REQUIREMENT_ABOLISHED_ON,
  evaluateShaho,
  type KabeInput,
  type Position,
  toYmd,
  type ShahoStatus,
  type Workplace,
} from '@/lib/nenshu-kabe';
import { gradeOf, pensionStandardMonthly, roundPremium } from '@/lib/shaho-grades';
import {
  EMPLOYMENT_RATE,
  HEALTH_RATE,
  HOKENRYO_CHOSEI_SHARES,
  HOKENRYO_CHOSEI_STARTS_ON,
  KAIGO_RATE,
  PENSION_RATE,
  SHIENKIN_RATE,
} from '@/lib/shaho-ryoritsu';
import { calcShobyoTeate } from '@/lib/shobyo-teate';

/**
 * 保険料率は lib/shaho-ryoritsu.ts が持つ（一次情報と改定時期もあちらのコメント）。
 * ここは同名で re-export して、既存の import 元（lib/tedori-keisan.ts・tests）を
 * そのまま動かすためのもの。**数字をこちらに書き戻さないこと。**
 */
export {
  EMPLOYMENT_RATE,
  HEALTH_RATE,
  KAIGO_RATE,
  PENSION_RATE,
  SHIENKIN_RATE,
  ratePercent,
  HOKENRYO_CHOSEI_EXCLUDED_NOTE,
  HOKENRYO_CHOSEI_SHARES,
  HOKENRYO_CHOSEI_STARTS_ON,
  HOKENRYO_CHOSEI_YEARS,
} from '@/lib/shaho-ryoritsu';

/**
 * 保険料調整制度（2026年10月1日〜）を、勤務先が何年目まで使っているか。
 *
 * 年数は**本人が加入してから**ではなく**事業所が制度の利用を申し出てから**数える。
 * 途中で加入した人は自分の加入年数と一致せず、事業所の残り期間しか軽減されない
 * （パンフレット Q4-1 の例：2027年8月加入の被保険者Bは2年2か月で終わる）。
 *
 * - `none`: 使っていない・わからない（労使折半のまま）
 * - `y12`: 勤務先の利用開始から1〜2年目
 * - `y3`: 勤務先の利用開始から3年目（軽減幅が半分になる）
 */
export type ChoseiStage = 'none' | 'y12' | 'y3';

/**
 * 標準報酬月額と年目から、本人負担の割合（保険料の全体に対する割合）を引く。
 *
 * 対象外なら null。折半は 0.5 なので、`share / 0.5` が「本来の本人負担に対する倍率」になる。
 * 割合の表そのものは lib/shaho-ryoritsu.ts が持つ（このファイルは当てはめだけ）。
 */
export function choseiShare(standardMonthly: number, stage: ChoseiStage): number | null {
  if (stage === 'none') return null;
  const row = HOKENRYO_CHOSEI_SHARES.find((r) => standardMonthly <= r.standardMax);
  // 標準報酬月額 12.6万円（月収13万円未満）を超える人は制度の対象外
  if (!row) return null;
  return stage === 'y3' ? row.y3 : row.y12;
}

/**
 * 老齢厚生年金（報酬比例部分）の給付乗率。平成15年4月以降の総報酬制で 5.481/1000。
 * 年金額 = 平均標準報酬額 × 5.481/1000 × 被保険者期間の月数
 */
export const PENSION_ACCRUAL_RATE = 5.481 / 1000;

/** 住民税の均等割（市町村民税3,500円 + 道府県民税1,500円 + 森林環境税1,000円） */
export const RESIDENT_PER_CAPITA = 5_000;

/**
 * 住民税の非課税限度額（合計所得金額）。扶養親族のいない単身者は45万円。
 * 給与収入では 45万 + 給与所得控除74万 = 119万円（lib/nenshu-kabe.ts の「119万円の壁」）。
 */
export const RESIDENT_TAX_FREE_INCOME = 450_000;

/** 復興特別所得税（基準所得税額の2.1%。平成25年〜令和19年） */
const RECONSTRUCTION_RATE = 1.021;

/** 年収の刻み。画面も万円単位で見せるので1万円で揃える */
export const STEP = 10_000;

/** 手取り曲線を描く年収の範囲（円） */
export const CURVE_MIN = 500_000;
export const CURVE_MAX = 3_000_000;

/** 賃金要件（月額8.8万円）を年収に直した額。撤廃日までの加入ライン */
export const WAGE_GATE_INCOME = 1_060_000;

/** 社会保険の扶養認定基準（年収）。19〜22歳の学生は150万円 */
export const DEPENDENT_LIMIT = 1_300_000;
export const DEPENDENT_LIMIT_STUDENT = 1_500_000;

/** 課税所得は1,000円未満を切り捨てる */
const floorTo1000 = (v: number) => Math.max(0, Math.floor(v / 1000) * 1000);

/**
 * 年分によって変わる控除だけをまとめたもの。
 *
 * 手取り計算機（lib/tedori-keisan.ts）が「令和7年分の控除額だったらいくらだったか」を
 * **同じ計算式で**出せるようにするための差し込み口。年分の違いをここに閉じ込めることで、
 * 所得税・住民税の式そのものは1実装のままにしている
 * （2実装が並ぶと料率改定のたびに片方だけ更新されて、同じ年収に対して
 * サイト内に違う数字が2つ出る）。
 *
 * 既定は TAX_RULES_R8（このサイトの現行）なので、既存の呼び出しは何も変わらない。
 */
export interface TaxYearRules {
  /** 表示用の年分（'令和8年分'） */
  label: string;
  /** 給与収入 → 給与所得（＝給与のみの人の合計所得金額） */
  salaryIncome: (income: number) => number;
  /** 所得税の基礎控除 */
  basicDeductionIncomeTax: (totalIncome: number) => number;
  /** 住民税の基礎控除 */
  basicDeductionResidentTax: (totalIncome: number) => number;
}

/** 令和8年分（このサイトの現行。lib/furusato-nozei.ts の表をそのまま使う） */
export const TAX_RULES_R8: TaxYearRules = {
  label: '令和8年分',
  salaryIncome,
  basicDeductionIncomeTax,
  basicDeductionResidentTax,
};

/** 社会保険料の内訳（本人負担・年額） */
export interface Premiums {
  /** 算定に使った標準報酬月額（健康保険） */
  standardMonthly: number;
  /** 健康保険の等級（1〜50） */
  grade: number;
  /** 厚生年金の標準報酬月額（88,000〜650,000円に丸めたもの） */
  pensionStandardMonthly: number;
  /** 健康保険料（子ども・子育て支援金・介護保険料を含む・年額） */
  health: number;
  /** 厚生年金保険料（年額） */
  pension: number;
  /** 雇用保険料（年額） */
  employment: number;
  /** 合計（年額） */
  total: number;
  /**
   * 保険料調整制度で適用された本人負担の割合（保険料の全体に対する割合）。
   * 制度を使っていない・対象外なら null
   */
  choseiShare: number | null;
  /** 保険料調整制度で軽くなっている額（労使折半だった場合との差・年額）。適用が無ければ0 */
  choseiSavings: number;
}

const NO_PREMIUMS: Premiums = {
  standardMonthly: 0,
  grade: 0,
  pensionStandardMonthly: 0,
  health: 0,
  pension: 0,
  employment: 0,
  total: 0,
  choseiShare: null,
  choseiSavings: 0,
};

/**
 * 勤務先の社会保険に加入した場合の保険料（本人負担・年額）。
 *
 * 健康保険・厚生年金は標準報酬月額に料率をかけて月額を出し、
 * 端数処理してから12倍する（実際の給与天引きと同じ順序）。
 * 雇用保険だけは標準報酬月額ではなく実際の賃金にかかるので年収から直接計算する。
 *
 * 子ども・子育て支援金は給与明細でも健康保険料に含めて徴収されるため、別建てにせず
 * 健康保険料と同じ端数処理に入れる（先に月額を足してから丸める）。
 *
 * **保険料調整制度（`chosei`）が効くのは健康保険料と厚生年金保険料の本体だけ。**
 * 同じ行に足している子ども・子育て支援金と介護保険料、それに雇用保険料は制度の対象外で、
 * 軽減されない（パンフレット Q5 の注記。2026-09-19 確認）。割合を健保の料率にだけ
 * 掛けているのはこのため。**支援金まで巻き込むと軽減額が過大に出る。**
 *
 * @param gross 年収（額面・円）
 * @param kaigo 40〜64歳（介護保険料がかかる）
 * @param chosei 保険料調整制度を勤務先が使っている年目。既定は使っていない
 */
export function calcPremiums(gross: number, kaigo = false, chosei: ChoseiStage = 'none'): Premiums {
  const income = Math.max(0, gross);
  const monthly = income / 12;
  const [grade, std] = gradeOf(monthly);
  const pensionStd = pensionStandardMonthly(monthly);

  // 折半（全体の50%）に対する倍率。制度を使わない・対象外なら等倍
  const share = choseiShare(std, chosei);
  const factor = share === null ? 1 : share / 0.5;

  const otherHealthRate = SHIENKIN_RATE + (kaigo ? KAIGO_RATE : 0);
  const health = roundPremium(std * (HEALTH_RATE * factor + otherHealthRate)) * 12;
  const pension = roundPremium(pensionStd * PENSION_RATE * factor) * 12;
  const employment = Math.round(income * EMPLOYMENT_RATE);

  // 軽減額は「折半だったら」との差。等倍のときは計算せず0にする
  const fullHealth = roundPremium(std * (HEALTH_RATE + otherHealthRate)) * 12;
  const fullPension = roundPremium(pensionStd * PENSION_RATE) * 12;
  const choseiSavings = share === null ? 0 : fullHealth - health + (fullPension - pension);

  return {
    standardMonthly: std,
    grade,
    pensionStandardMonthly: pensionStd,
    health,
    pension,
    employment,
    total: health + pension + employment,
    choseiShare: share,
    choseiSavings,
  };
}

/**
 * 年収に対する所得税額（復興特別所得税込み・円）
 *
 * @param rules 年分ごとの控除。既定は令和8年分
 */
export function calcIncomeTax(
  gross: number,
  socialInsurance: number,
  rules: TaxYearRules = TAX_RULES_R8,
): number {
  const totalIncome = rules.salaryIncome(gross);
  const taxable = floorTo1000(
    totalIncome - socialInsurance - rules.basicDeductionIncomeTax(totalIncome),
  );
  return Math.floor(incomeTaxAmount(taxable) * RECONSTRUCTION_RATE);
}

/**
 * 年収に対する住民税額（所得割 + 均等割・円）。
 *
 * 合計所得金額が非課税限度額（単身45万円）以下なら所得割・均等割とも課税されない。
 * 非課税限度額は所得控除を引く前の合計所得金額で判定するため、社会保険料が
 * 増えても非課税になるわけではない（所得割だけが減る）。
 */
export function calcResidentTax(
  gross: number,
  socialInsurance: number,
  rules: TaxYearRules = TAX_RULES_R8,
): number {
  const totalIncome = rules.salaryIncome(gross);
  if (totalIncome <= RESIDENT_TAX_FREE_INCOME) return 0;

  const taxable = floorTo1000(
    totalIncome - socialInsurance - rules.basicDeductionResidentTax(totalIncome),
  );
  const levy = Math.max(
    0,
    Math.floor(taxable * 0.1) - adjustmentDeduction(taxable, BASIC_DEDUCTION_DIFF, totalIncome),
  );
  return levy + RESIDENT_PER_CAPITA;
}

/** ある年収での手取りの内訳 */
export interface TakeHome {
  /** 年収（額面・円） */
  gross: number;
  /** 勤務先の社会保険に加入している状態か */
  enrolled: boolean;
  premiums: Premiums;
  /** 所得税（復興特別所得税込み・年額） */
  incomeTax: number;
  /** 住民税（所得割 + 均等割・年額） */
  residentTax: number;
  /** 手取り（年額） */
  net: number;
}

/**
 * 年収と加入状態から手取りを計算する。
 *
 * @param gross 年収（額面・円）
 * @param enrolled 勤務先の社会保険に加入しているか
 * @param kaigo 40〜64歳（介護保険料がかかる）
 * @param rules 年分ごとの控除。既定は令和8年分（手取り計算機だけが令和7年分を渡す）
 * @param chosei 保険料調整制度の年目。加入していない場合は効かない
 */
export function calcTakeHome(
  gross: number,
  enrolled: boolean,
  kaigo = false,
  rules: TaxYearRules = TAX_RULES_R8,
  chosei: ChoseiStage = 'none',
): TakeHome {
  const income = Math.max(0, gross);
  const premiums = enrolled ? calcPremiums(income, kaigo, chosei) : NO_PREMIUMS;
  const incomeTax = calcIncomeTax(income, premiums.total, rules);
  const residentTax = calcResidentTax(income, premiums.total, rules);
  return {
    gross: income,
    enrolled,
    premiums,
    incomeTax,
    residentTax,
    net: income - premiums.total - incomeTax - residentTax,
  };
}

/** 加入することで増える給付 */
export interface Benefits {
  /** 厚生年金の算定に使った標準報酬月額 */
  standardMonthly: number;
  /** 本人が1年間に払う厚生年金保険料（円） */
  pensionPremiumYearly: number;
  /** 1年加入するごとに増える老齢厚生年金の年額（終身・円） */
  pensionPerYearEnrolled: number;
  /** 10年加入した場合に増える老齢厚生年金の年額（円） */
  pensionAfter10Years: number;
  /**
   * 受給が始まってから何年で、払った厚生年金保険料を年金の増分で取り戻せるか。
   * 保険料も年金額も標準報酬月額に比例するため、年収によらずほぼ一定になる。
   */
  pensionPaybackYears: number;
  /** 傷病手当金・出産手当金の日額（円）。加入していない間は受け取れない */
  sickBenefitDaily: number;
}

/**
 * 加入によって増える給付を金額で出す。
 *
 * 老齢基礎年金は第3号被保険者（扶養内）でも満額の対象なので増えない。
 * 増えるのは老齢厚生年金の報酬比例部分だけで、そこだけを計算している。
 *
 * **保険料調整制度は「増える給付」を1円も動かさない。** 本人負担が減っても
 * 標準報酬月額は同じなので、将来の年金額も傷病手当金の日額も変わらない
 * （パンフレットも「被保険者が将来受け取る年金額への影響はありません」と明記）。
 * 動くのは `pensionPremiumYearly`（実際に払う額）と、そこから出る
 * `pensionPaybackYears`（払った保険料を年金で取り戻すまでの年数）だけで、
 * **軽減されるぶん早く取り戻せる**。ここがこの制度の「得」の核心なので、
 * 取り戻す年数は本人負担の実額で計算する。
 * この取り違えがいちばん起きやすいところなので tests/hatarakizon.test.ts で固定している。
 */
export function calcBenefits(gross: number, kaigo = false, chosei: ChoseiStage = 'none'): Benefits {
  const premiums = calcPremiums(gross, kaigo, chosei);
  const std = premiums.pensionStandardMonthly;
  const perYear = Math.round(std * PENSION_ACCRUAL_RATE * 12);
  return {
    standardMonthly: std,
    pensionPremiumYearly: premiums.pension,
    pensionPerYearEnrolled: perYear,
    pensionAfter10Years: Math.round(std * PENSION_ACCRUAL_RATE * 120),
    pensionPaybackYears: perYear > 0 ? premiums.pension / perYear : 0,
    sickBenefitDaily: calcShobyoTeate({ monthlyIncome: gross / 12, restDays: 0 }).dailyAmount,
  };
}

export interface HatarakizonInput {
  /** 加入して働く場合の年収（額面・円） */
  income: number;
  /** 立場。'none'（扶養に入っていない）はこのツールの対象外 */
  position: Position;
  /** 勤務先が短時間労働者を社会保険に加入させる事業所か */
  workplace: Workplace;
  /** 週の所定労働時間が20時間以上 */
  hours20: boolean;
  /**
   * 勤務先が保険料調整制度を使い始めてから何年目か。既定は使っていない。
   *
   * 対象外の勤務先（`workplace: 'over51'`）や施行日前は、値にかかわらず効かない
   * （`calcHatarakizon()` が落とす）。
   */
  chosei?: ChoseiStage;
  /** 40〜64歳（介護保険料がかかる） */
  kaigo: boolean;
  /**
   * 扶養内に抑える場合の年収（円）。null なら上限ぎりぎり（上限 − 1万円）を使う。
   * 「実際にはそこまで働けない」人が自分の数字で比べられるようにするための入力。
   */
  baselineIncome: number | null;
  /** 判定の基準日。省略時は実行時の現在日（施行日をまたぐと結果が変わる） */
  asOf?: Date;
}

/** 手取り曲線の1点 */
export interface CurvePoint {
  gross: number;
  net: number;
  enrolled: boolean;
}

export type HatarakizonResult =
  | {
      kind: 'not-applicable';
      /** 比較できない理由（そのまま画面に出す） */
      reason: string;
      shaho: ShahoStatus;
    }
  | {
      kind: 'compare';
      shaho: ShahoStatus;
      /** 基準日の時点で賃金要件が撤廃済みか */
      wageRequirementAbolished: boolean;
      /** 扶養内に抑える場合の上限 */
      ceiling: {
        /** 上限額（円）。この額に達すると加入する・扶養から外れる */
        limit: number;
        /** 上限の根拠（例:「106万円の壁（賃金要件）」） */
        label: string;
      };
      /** 扶養内に抑える場合の手取り（比較の基準） */
      baseline: TakeHome;
      /** 入力した年収で加入して働く場合の手取り */
      target: TakeHome;
      /** target.net − baseline.net。マイナスなら働き損 */
      netDiff: number;
      /**
       * 手取りの逆転区間（働き損ゾーン）。
       * baseline より年収が高いのに手取りが baseline を下回る年収帯。
       * 逆転が起きないときは null
       */
      lossZone: { from: number; to: number } | null;
      /**
       * 損益分岐点（円）。この年収まで働けば baseline の手取り以上になる。
       * CURVE_MAX までに追いつかないときは null
       */
      breakEven: number | null;
      /** 手取り曲線（加入して働く場合。グラフ用） */
      curve: CurvePoint[];
      /** 加入して増える給付 */
      benefits: Benefits;
      /** 保険料調整制度が実際に効いているか（勤務先が対象・施行後・標準報酬月額が12.6万円以下） */
      choseiApplied: boolean;
      /** 制度で軽くなっている額（労使折半だった場合との差・年額）。効いていなければ0 */
      choseiSavings: number;
      /** 画面に制度のセレクトを出してよいか（勤務先が対象で、かつ施行日以降） */
      choseiSelectable: boolean;
    };

/** 基準日にその年収で勤務先の社会保険に加入するか */
function enrolledAt(gross: number, shaho: ShahoStatus): boolean {
  if (shaho.kind === 'enrolled') return true;
  if (shaho.kind === 'wage-gate') return gross >= shaho.threshold;
  return false;
}

/**
 * 扶養内に抑える場合の上限。
 *
 * 賃金要件が残っている間（〜2026年9月30日）は106万円で加入してしまうので、そこが上限。
 * 撤廃後（2026年10月1日〜）は週20時間未満に抑えるしかなく、金額の上限は
 * 家族の扶養認定基準（130万円。19〜22歳の学生は150万円）になる。
 */
function ceilingFor(input: HatarakizonInput, shaho: ShahoStatus): { limit: number; label: string } {
  if (shaho.kind === 'wage-gate') {
    return { limit: shaho.threshold, label: '106万円の壁（社会保険の賃金要件）' };
  }
  return input.position === 'student'
    ? { limit: DEPENDENT_LIMIT_STUDENT, label: '150万円の壁（学生の扶養認定基準）' }
    : { limit: DEPENDENT_LIMIT, label: '130万円の壁（社会保険の扶養認定基準）' };
}

/**
 * 「扶養内に抑える場合」と「加入して働く場合」の手取りを比較する。
 *
 * 逆転区間・損益分岐点は1万円刻みの手取り曲線から求める。連続的な方程式を解かず
 * 刻みで探しているのは、住民税の非課税限度額や標準報酬月額の等級のように
 * 手取りが階段状に動く要素があり、解析的に解いても実態を表さないため。
 */
export function calcHatarakizon(input: HatarakizonInput): HatarakizonResult {
  const asOf = input.asOf ?? new Date();
  const kabeInput: KabeInput = {
    income: Math.max(0, input.income),
    position: input.position,
    workplace: input.workplace,
    hours20: input.hours20,
    asOf,
  };
  const shaho = evaluateShaho(kabeInput);

  if (shaho.kind === 'not-applicable') {
    return { kind: 'not-applicable', reason: shaho.reason, shaho };
  }

  // 保険料調整制度は 2026年10月1日開始。勤務先が対象（50人以下で新たに加入対象になった
  // 事業所）でなければ、セレクトに何が入っていても折半のまま。
  // 施行日の判定は「画面を開いた日」で、賃金要件の撤廃と同じ仕組みに乗せる
  const choseiSelectable = shaho.choseiEligible && toYmd(asOf) >= HOKENRYO_CHOSEI_STARTS_ON;
  const chosei: ChoseiStage = choseiSelectable ? (input.chosei ?? 'none') : 'none';

  const ceiling = ceilingFor(input, shaho);
  // 扶養内の手取りは「上限ぎりぎりまで働いた場合」を既定にする。
  // 上限ちょうどだと加入する側・扶養から外れる側になるので1刻み手前を取る
  const baselineGross =
    input.baselineIncome === null
      ? ceiling.limit - STEP
      : Math.max(0, Math.min(input.baselineIncome, ceiling.limit - STEP));
  const baseline = calcTakeHome(baselineGross, false, input.kaigo);

  const income = Math.max(0, input.income);
  const target = calcTakeHome(income, enrolledAt(income, shaho), input.kaigo, TAX_RULES_R8, chosei);

  const curve: CurvePoint[] = [];
  for (let g = CURVE_MIN; g <= CURVE_MAX; g += STEP) {
    const enrolled = enrolledAt(g, shaho);
    curve.push({
      gross: g,
      // 働き損ゾーンと損益分岐点も軽減後の保険料で引く。ここを折半のままにすると、
      // 制度の対象者に「実際より広い働き損ゾーン」を見せることになる（この改修の主目的）
      net: calcTakeHome(g, enrolled, input.kaigo, TAX_RULES_R8, chosei).net,
      enrolled,
    });
  }

  // 基準より年収が高いのに手取りが基準を下回る区間を、曲線から拾う
  const above = curve.filter((p) => p.gross > baselineGross);
  const losing = above.filter((p) => p.net < baseline.net);
  const lossZone =
    losing.length > 0
      ? { from: losing[0].gross, to: losing[losing.length - 1].gross }
      : null;
  // 損益分岐点は逆転区間を抜けた最初の年収。逆転が起きないときは基準のすぐ上になる
  const breakEven =
    above.find((p) => p.gross > (lossZone?.to ?? -Infinity) && p.net >= baseline.net)?.gross ??
    null;

  return {
    kind: 'compare',
    shaho,
    wageRequirementAbolished: shaho.kind === 'enrolled',
    ceiling,
    baseline,
    target,
    netDiff: target.net - baseline.net,
    lossZone,
    breakEven,
    curve,
    benefits: calcBenefits(income, input.kaigo, chosei),
    choseiApplied: target.premiums.choseiShare !== null,
    choseiSavings: target.premiums.choseiSavings,
    choseiSelectable,
  };
}

export { WAGE_REQUIREMENT_ABOLISHED_ON };
