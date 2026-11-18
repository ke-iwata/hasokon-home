/**
 * 本文の早見表と例。lib の関数を呼んで作る（本文に数字を手で書かないため。docs/features/thin-tool-content.md）
 */
import {
  calcWorkDay,
  formatDecimalHours,
  formatHm,
  hayamihyo,
  hmToSec,
  isWorkError,
  roundMonthlyTotal,
  HOUR,
  MINUTE,
  type WorkDay,
} from '@/lib/jikan-keisan';

/** 15分刻み（0:15＝0.25 … 1:00＝1.00）と 5分刻み */
export const HAYAMI_15 = hayamihyo(15);
export const HAYAMI_5 = hayamihyo(5);

const day = (start: string, end: string, breakTime: string): WorkDay => {
  const r = calcWorkDay({ start, end, breakTime });
  if (isWorkError(r)) throw new Error(`例の入力が読めない: ${start}〜${end}`);
  return r;
};

/** 日またぎの例：22:00〜翌7:00・休憩60分 */
const NIGHT = day('22:00', '7:00', '60');
export const NIGHT_EXAMPLE = {
  span: formatHm(NIGHT.spanSec),
  work: formatHm(NIGHT.workSec),
  nightSpan: formatHm(NIGHT.nightSpanSec),
  nightMin: formatHm(NIGHT.nightMinSec),
  nightMax: formatHm(NIGHT.nightMaxSec),
};

/** 25時表記の例：17:00〜26:00 と 17:00〜2:00 */
export const LATE_EXAMPLE = formatHm(day('17:00', '26:00', '60').workSec);

/** 休憩の境目の例 */
export const BREAK_EXAMPLES = [
  { label: '9:00〜15:00・休憩なし', d: day('9:00', '15:00', '0') },
  { label: '9:00〜15:01・休憩なし', d: day('9:00', '15:01', '0') },
  { label: '9:00〜17:45・休憩45分', d: day('9:00', '17:45', '45') },
  { label: '9:00〜18:00・休憩45分', d: day('9:00', '18:00', '45') },
  { label: '9:00〜18:00・休憩60分', d: day('9:00', '18:00', '60') },
].map(({ label, d }) => ({
  label,
  work: formatHm(d.workSec),
  required: d.breakShortage ? `${d.breakShortage.requiredSec / MINUTE}分以上` : '足りている',
  short: d.breakShortage !== null,
}));

/** 基発第150号の丸めの例 */
export const ROUNDING_EXAMPLES = ['20:29', '20:30', '20:29:59'].map((t) => {
  const sec = hmToSec(t)!;
  return { before: t, after: formatHm(roundMonthlyTotal(sec)) };
});

/** 7:20 は割り切れない */
export const SEVEN_TWENTY = formatDecimalHours(hmToSec('7:20')!);
export const SEVEN_TWENTY_4 = formatDecimalHours(hmToSec('7:20')!, 4);

/** Excel の 24時間で戻る例：23:30 + 1:00 */
export const EXCEL_WRAP = {
  sum: formatHm(hmToSec('23:30')! + HOUR),
  wrapped: formatHm((hmToSec('23:30')! + HOUR) % (24 * HOUR)),
};
