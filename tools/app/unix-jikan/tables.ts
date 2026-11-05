/**
 * 本文の例の行。lib の関数を呼んで作る（本文に日時を手で書かないため。docs/features/thin-tool-content.md）
 */
import {
  UNIT_LABELS,
  Y2038_LAST_SECOND,
  convertNumber,
  formatHms,
  formatJa,
  formatYmd,
  type ConvertResult,
} from '@/lib/unix-jikan';

function describe(result: ConvertResult): string {
  switch (result.kind) {
    case 'unix':
      return formatJa(result.jst, result.showMs);
    case 'excel':
      return `${formatJa(result.wall)}（見たままの日時）`;
    case 'excel-phantom':
      return `1900年2月29日（Excel だけにある日付） ${result.time}`;
    case 'excel-time-only':
      return `時刻だけ ${result.time}`;
    default:
      return result.message;
  }
}

const INPUTS = ['1793836800', '1793836800123', '1793836800123456', '1793836800123456789', '1793836800.5', '46331', '46331.5', '60'];

export const EXAMPLES = INPUTS.map((input) => {
  const c = convertNumber(input)!;
  return { input, unit: UNIT_LABELS[c.unit], result: describe(c.result) };
});

const y2038 = convertNumber(String(Y2038_LAST_SECOND))!.result;

export const Y2038_EXAMPLE = {
  seconds: String(Y2038_LAST_SECOND),
  jst: y2038.kind === 'unix' ? `${formatYmd(y2038.jst)} ${formatHms(y2038.jst)}` : '',
};
