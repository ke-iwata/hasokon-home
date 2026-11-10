import { quickTableRow, type QuickRow } from '@/lib/bmi';

/**
 * 本文の早見表（身長 150〜185cm、5cm 刻み）。lib の関数を呼んで作る
 * （本文に体重を手で書かないため。docs/features/thin-tool-content.md）。
 * 「身長 160cm の標準体重」のような検索の受け皿。
 */
export const QUICK_HEIGHTS = [150, 155, 160, 165, 170, 175, 180, 185] as const;

export const QUICK_TABLE: QuickRow[] = QUICK_HEIGHTS.map((h) => quickTableRow(h));
