/**
 * 国民年金 育児免除 計算機ページの早見表の行データ。
 *
 * 仕様: docs/features/kokunen-ikuji-menjo.md（表示 6）
 *
 * 本文に月数・額を手で書くと、MONTHLY_PREMIUM を更新したときに本文だけ古くなるので、
 * 必ず calcMenjo() から作る。一致は tests/kokunen-ikuji-menjo.test.ts が見張る。
 *
 * - 表A（EXEMPT_TABLE_AFTER）: 2026年10月〜2027年9月生まれ（仕様どおり。施行日の壁が効かない）
 * - 表B（EXEMPT_TABLE_BEFORE）: 2025年11月〜2026年9月生まれ（施行日の壁で月数が減る。
 *   「10月より前に生まれた子は？」への答えを表で見せるため）
 */

import { calcMenjo, formatMonth, parseMonth } from '@/lib/kokunen-ikuji-menjo';

export interface ExemptRow {
  /** 生まれ月 'YYYY-MM' */
  month: string;
  mother: { months: number; amount: number };
  /** 実母のうち育児免除の月数（施行日の壁のあと） */
  motherIkujiMonths: number;
  father: { months: number; amount: number };
}

function rows(from: string, to: string): ExemptRow[] {
  const out: ExemptRow[] = [];
  for (let i = parseMonth(from)!; i <= parseMonth(to)!; i++) {
    const ym = formatMonth(i);
    const [year, month] = ym.split('-').map(Number);
    const birthDate = { year, month, day: 15 };
    const mother = calcMenjo({ birthDate, role: 'mother', category: 'first' });
    const father = calcMenjo({ birthDate, role: 'father', category: 'first' });
    out.push({
      month: ym,
      mother: { months: mother.exemptMonths, amount: mother.amount },
      motherIkujiMonths: mother.ikuji?.months ?? 0,
      father: { months: father.exemptMonths, amount: father.amount },
    });
  }
  return out;
}

export const EXEMPT_TABLE_AFTER = rows('2026-10', '2027-09');
export const EXEMPT_TABLE_BEFORE = rows('2025-11', '2026-09');
