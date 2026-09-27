/**
 * 通勤手当 非課税限度額チェッカーの本文の早見表の行データ。
 *
 * 仕様: docs/features/tsukin-teate-hikazei.md・docs/features/thin-tool-content.md
 *
 * 本文に額を手で書くと、限度額が改正されたときに計算機の結果と食い違う。
 * 行の額は必ず lib/tsukin-teate.ts の表と関数から作る。一致は tests/tsukin-teate.test.ts が見張る
 */

import {
  DISTANCE_BANDS,
  DISTANCE_BANDS_BEFORE_2026_04,
  bandLabel,
  calcTsukinTeate,
  distanceLimit,
  monthlyParkingFee,
  type ParkingFee,
} from '@/lib/tsukin-teate';

export interface DistanceRow {
  label: string;
  /** 改正後（令和8年4月1日以後） */
  after: number;
  /** 改正前（同じ距離に当てた額） */
  before: number;
  /** 改正で区分が分かれた・額が変わった行（55km以上。国税庁の表で赤枠の5行） */
  changed: boolean;
}

/** 距離区分の改正前後（2km未満の「全額課税」は本文で別に書く） */
export const DISTANCE_ROWS: DistanceRow[] = DISTANCE_BANDS.map((band) => ({
  label: bandLabel(band),
  after: band.limit,
  before: distanceLimit(band.fromKm, 'before-2026-04'),
  changed: band.fromKm >= 55,
}));

export interface ParkingExample {
  /** Q&A の区分（'(1)' など） */
  rule: string;
  /** どんな料金か */
  case: string;
  /** 換算の式 */
  formula: string;
  monthly: number;
}

const example = (rule: string, kase: string, formula: string, fee: ParkingFee): ParkingExample => ({
  rule,
  case: kase,
  formula,
  monthly: monthlyParkingFee(fee),
});

/** 駐車場料金の月額換算の例（国税庁 Q&A Q3-3 の例をそのまま） */
export const PARKING_EXAMPLES: ParkingExample[] = [
  example('(1) 月単位', '3か月で24,000円', '24,000円 ÷ 3', { unit: 'months', amount: 24_000, months: 3 }),
  example('(2) 年単位', '1年で79,200円', '79,200円 ÷ 12', { unit: 'years', amount: 79_200, years: 1 }),
  example('(2) 年単位', '2年で168,960円', '168,960円 ÷ (12 × 2)', {
    unit: 'years',
    amount: 168_960,
    years: 2,
  }),
  example('(3) 利用の都度', 'コインパーキングに1か月で払った合計が8,000円', 'その合計', {
    unit: 'months',
    amount: 8_000,
    months: 1,
  }),
  example('(3) 利用の都度', '11枚綴り1,200円の回数券で駐輪場を月20日', '1,200円 ÷ 11 × 20（1円未満切上げ）', {
    unit: 'per-use',
    amount: 1_200 / 11,
    usesPerMonth: 20,
  }),
  example('(3) 利用の都度', '1時間200円のコインパーキングに平均8時間・月20日', '200円 × 8 × 20', {
    unit: 'per-use',
    amount: 200 * 8,
    usesPerMonth: 20,
  }),
  example('(4) その他', '7日で5,880円', '5,880円 × 365 ÷ 7 ÷ 12', { unit: 'days', amount: 5_880, days: 7 }),
];

/** 本文の計算例（国税庁 Q&A ケースA）。額を本文に手で書かないため lib から出す */
export const CASE_A = (() => {
  const input = {
    mode: 'vehicle' as const,
    distanceKm: 50,
    allowance: 40_300,
    fare: 0,
    parking: { fee: { unit: 'months' as const, amount: 8_000, months: 1 }, nearWorkOrStation: true },
    period: 'from-2026-04' as const,
  };
  return { input, result: calcTsukinTeate(input) };
})();

/** FAQ の計算例（Q&A Q4-2。会社が駐車場代 6,000円を負担） */
export const CASE_Q4_2 = (() => {
  const distanceAllowance = distanceLimit(50, 'from-2026-04');
  const companyPaidParking = 6_000;
  const result = calcTsukinTeate({
    mode: 'vehicle',
    distanceKm: 50,
    allowance: distanceAllowance + companyPaidParking,
    fare: 0,
    parking: {
      fee: { unit: 'months', amount: companyPaidParking, months: 1 },
      nearWorkOrStation: true,
    },
    period: 'from-2026-04',
  });
  return { distanceAllowance, companyPaidParking, result };
})();

/** 改正前の55km以上の一律の額と、改正後の最高額 */
export const BEFORE_MAX = DISTANCE_BANDS_BEFORE_2026_04[DISTANCE_BANDS_BEFORE_2026_04.length - 1].limit;
export const AFTER_MAX = DISTANCE_BANDS[DISTANCE_BANDS.length - 1].limit;
