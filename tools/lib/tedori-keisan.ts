/**
 * 手取り計算機（年収 → 手取り。令和8年分の基礎控除引上げに対応）
 *
 * 仕様: docs/features/tedori-keisan.md
 *
 * ■ このファイルが自分で計算していないこと（重要）
 * 手取りの本体（社会保険料・所得税・住民税）は **lib/hatarakizon.ts の
 * calcTakeHome() をそのまま呼んでいる**。同じ「年収 → 手取り」の計算を2つ書くと、
 * 毎年3月の協会けんぽの料率改定で片方だけが更新され、同じ年収に対して
 * サイト内に違う数字が2つ並ぶ（目安ツールとして一番効く信頼を落とす）。
 * このファイルが持っているのは次の3つだけ。
 *
 *   1. 令和7年分の控除で計算した場合との比較（TAX_RULES_R7）
 *   2. 月あたりへの換算と手取り率
 *   3. 早見表の刻み（TABLE_INCOMES）
 *
 * ■ 計算の前提（結果に必ず添えること）
 * - 給与収入のみ・独身・扶養なし・各種控除なしの目安。細かい控除がある人は
 *   年末調整還付金計算機（/nenmatsu-chosei/）へ
 * - 社会保険は協会けんぽの全国平均の料率（都道府県で少し変わる）。
 *   組合健保・公務員共済は料率が異なる
 * - 賞与を分けず「年間総額の12分の1」を標準報酬月額に当てているため、
 *   **賞与がある人ほど社会保険料を過大に見積もる向きにずれる**
 *   （標準賞与額は月額とは別の上限で計算されるため）
 * - 住民税は前年の所得に課税される。ここで出しているのは
 *   **「同じ年収が続いた場合」の目安**で、新社会人の1年目とは一致しない
 *
 * ■ 令和8年の改正が「月々の手取り」に効くのは2027年1月から
 * 令和8年度改正（基礎控除の引上げ等）は令和8年12月1日施行で、国税庁は
 * 「令和8年11月までの給与等の源泉徴収事務に変更は生じません」と明記している。
 * 源泉徴収税額表そのものの改正は令和9年1月1日施行。
 * つまり2026年中に給与明細を見ても月々の天引きは改正前のままで、
 * このツールが出す「月あたりの手取り」とは必ずずれる。
 * 2026年分の減税は**12月の年末調整でまとめて精算される**。
 * 一次情報の整理は lib/nenmatsu-chosei.ts の冒頭コメントにある。
 *
 * ■ 一次情報
 * - 国税庁「令和8年度税制改正による所得税の基礎控除の引上げ等について」
 *   https://www.nta.go.jp/users/gensen/2026kiso/index.htm
 * - 国税庁「令和8年4月 源泉所得税の改正のあらまし」
 *   https://www.nta.go.jp/publication/pamph/gensen/2026kaisei.pdf
 * - 全国健康保険協会「令和8年度の都道府県毎の保険料率」
 *   https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html
 * - 日本年金機構「厚生年金保険の保険料」
 *   https://www.nenkin.go.jp/service/kounen/hokenryo/
 *
 * 【データ更新箇所】このファイルに料率・控除額は**持たない**。
 * 協会けんぽの料率改定は lib/hatarakizon.ts の HEALTH_RATE / KAIGO_RATE、
 * 控除額の改正は lib/furusato-nozei.ts と lib/nenmatsu-chosei.ts を直せば
 * こちらにも効く。ここで年ごとに増える持ち物は、令和10年分以降の比較対象を
 * 切り替えるときの TAX_RULES_R7 の差し替えだけ。
 */

import { basicDeductionResidentTax } from '@/lib/furusato-nozei';
import {
  TAX_RULES_R8,
  calcTakeHome,
  type TakeHome,
  type TaxYearRules,
} from '@/lib/hatarakizon';
import { basicDeductionIncomeTaxR7, salaryDeductionR7 } from '@/lib/nenmatsu-chosei';
import { GRADES, PENSION_STANDARD_MAX } from '@/lib/shaho-grades';

/** 令和7年分の給与所得（給与収入 − 給与所得控除。最低保障65万円） */
function salaryIncomeR7(income: number): number {
  const i = Math.max(0, income);
  return Math.max(0, Math.floor(i - salaryDeductionR7(i)));
}

/**
 * 改正前（令和7年分）の控除。「2026年の改正でいくら増えたか」の比較対象。
 *
 * 住民税の基礎控除（43万円）は令和8年度改正でも据え置かれているので R8 と共通で、
 * 年分で変わるのは給与所得控除と所得税の基礎控除のほう。
 */
export const TAX_RULES_R7: TaxYearRules = {
  label: '令和7年分',
  salaryIncome: salaryIncomeR7,
  basicDeductionIncomeTax: basicDeductionIncomeTaxR7,
  basicDeductionResidentTax,
};

export { TAX_RULES_R8 };

/**
 * 令和8年度改正の施行日。この日から令和8年分の所得税に改正後の控除が適用される。
 * 12月の年末調整で1年分がまとめて精算される。
 */
export const REFORM_EFFECTIVE_ON = '2026-12-01';

/**
 * 改正後の「源泉徴収税額表」が使われ始める日。
 * **月々の給与天引きが変わるのはここから**で、2026年11月までの源泉徴収事務は改正前のまま。
 */
export const WITHHOLDING_TABLE_EFFECTIVE_ON = '2027-01-01';

/**
 * 厚生年金の標準報酬月額が上限（65万円）に張り付く年収。
 * これを超えて稼いでも厚生年金保険料は増えない。等級表から導いているので、
 * 等級が追加されたら自動で追随する。
 */
export const PENSION_CAP_INCOME =
  (GRADES.find((g) => g[1] === PENSION_STANDARD_MAX)?.[2] ?? 0) * 12;

/** 健康保険の標準報酬月額が上限（50等級・139万円）に張り付く年収 */
export const HEALTH_CAP_INCOME = GRADES[GRADES.length - 1][2] * 12;

export interface TedoriInput {
  /** 年収（額面。賞与込みの年間総額・円） */
  income: number;
  /** 40〜64歳（介護保険料がかかる） */
  kaigo: boolean;
}

export interface TedoriResult {
  /** 令和8年分の控除で計算した手取りと内訳（これが主役の数字） */
  current: TakeHome;
  /** 令和7年分の控除で計算した場合（改正前との比較用。社会保険料は同額） */
  previous: TakeHome;
  /** 改正で増える手取り（年額）。current.net − previous.net */
  reformGain: number;
  /** 月あたりの手取り（賞与なしで12分割した目安・円） */
  monthlyNet: number;
  /** 手取り率（手取り ÷ 額面）。額面が0のときは0 */
  netRate: number;
  /** 額面から引かれる合計（社会保険料 + 所得税 + 住民税・年額） */
  totalDeducted: number;
  /** 厚生年金の標準報酬月額が上限に張り付いているか */
  pensionCapped: boolean;
  /** 健康保険の標準報酬月額が上限（50等級）に張り付いているか */
  healthCapped: boolean;
}

/**
 * 年収から手取りを計算する。
 *
 * 社会保険に加入している会社員が対象なので enrolled は常に true。
 * 年収0のときだけ false にしているのは、等級表の下限（1等級・標準報酬月額58,000円）に
 * 当たって「年収0円なのに保険料が引かれる」結果になるのを避けるため。
 */
export function calcTedori(input: TedoriInput): TedoriResult {
  const income = Math.max(0, input.income);
  const enrolled = income > 0;

  const current = calcTakeHome(income, enrolled, input.kaigo, TAX_RULES_R8);
  const previous = calcTakeHome(income, enrolled, input.kaigo, TAX_RULES_R7);

  return {
    current,
    previous,
    reformGain: current.net - previous.net,
    monthlyNet: Math.floor(current.net / 12),
    netRate: income > 0 ? current.net / income : 0,
    totalDeducted: income - current.net,
    pensionCapped: current.premiums.pensionStandardMonthly >= PENSION_STANDARD_MAX,
    healthCapped: current.premiums.grade === GRADES.length,
  };
}

/**
 * 早見表の年収の刻み（円）。
 *
 * 100万〜1,000万円を50万円刻みで並べ、そこに**基礎控除が下がる境目の前後**を足している。
 * 令和8年分の基礎控除は合計所得489万円超で104万→67万、655万円超で62万に下がる。
 * 給与収入に直すとおよそ665.6万円と850万円で、50万円刻みだけだと境目が
 * 刻みの間に隠れてしまい、控除表を書き換えたときに差分が動かない。
 * 境目をまたぐ2行を入れておくと、改定のときにスナップショットの差分で気づける。
 */
export const TABLE_INCOMES: readonly number[] = (() => {
  const grid: number[] = [];
  for (let v = 1_000_000; v <= 10_000_000; v += 500_000) grid.push(v);
  // 665.6万円（104万→67万）と850万円（67万→62万）の境目をまたぐ行
  const boundaries = [6_600_000, 6_700_000, 8_600_000];
  return [...new Set([...grid, ...boundaries])].sort((a, b) => a - b);
})();

/** 早見表の1行 */
export interface TableRow {
  /** 年収（額面・円） */
  gross: number;
  /** 手取り（年額・円） */
  net: number;
  /** 月あたりの手取り（円） */
  monthlyNet: number;
  /** 令和7年分の控除で計算した場合との差（円） */
  reformGain: number;
  /** 手取り率 */
  netRate: number;
}

/**
 * 年収ごとの手取り早見表。
 *
 * @param kaigo 40〜64歳（介護保険料がかかる）
 */
export function takeHomeTable(kaigo = false): TableRow[] {
  return TABLE_INCOMES.map((gross) => {
    const r = calcTedori({ income: gross, kaigo });
    return {
      gross,
      net: r.current.net,
      monthlyNet: r.monthlyNet,
      reformGain: r.reformGain,
      netRate: r.netRate,
    };
  });
}
