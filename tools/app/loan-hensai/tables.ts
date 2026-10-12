/**
 * ローン返済シミュレーションの本文・FAQ に出す計算例。
 *
 * 本文に額を手で書かないため、lib の関数を呼んで作る（docs/features/thin-tool-content.md）。
 * 例の条件は仕様書「テスト」の表と同じ（3,000万円・35年・1.0%）。
 */
import { prepayEffect, simulate, type LoanInput } from '@/lib/loan-hensai';

const BASE: LoanInput = { principal: 30_000_000, years: 35, ratePercent: 1.0, method: 'ganri' };

function must<T>(v: T | null): T {
  if (v === null) throw new Error('loan-hensai: 計算例の入力が範囲外');
  return v;
}

const ganri = must(simulate(BASE));
const gankin = must(simulate({ ...BASE, method: 'gankin' }));
const plus1 = must(simulate({ ...BASE, ratePercent: 2.0 }));
const rise3 = must(simulate({ ...BASE, rule125: true, rateChanges: [{ fromPayment: 61, ratePercent: 3.0 }] }));
const PREPAY = { afterPayment: 120, amount: 1_000_000 };
const shorten = must(prepayEffect({ ...BASE, prepayments: [{ ...PREPAY, type: 'shorten' }] }));
const reduce = must(prepayEffect({ ...BASE, prepayments: [{ ...PREPAY, type: 'reduce' }] }));

export const EXAMPLE = {
  ganriMonthly: ganri.firstMonthlyPayment,
  ganriTotalInterest: ganri.totalInterest,
  gankinFirst: gankin.firstMonthlyPayment,
  gankinTotalInterest: gankin.totalInterest,
  plus1Monthly: plus1.firstMonthlyPayment,
  rise3Review: rise3.monthly.reviews[0],
  rise3Final: rise3.monthly.finalPayment,
  shorten,
  reduce,
};
