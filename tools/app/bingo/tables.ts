import { bingoTable, TABLE_TRIALS, type SimulationRow } from '@/lib/bingo';

/**
 * 本文の「何個目でビンゴが出る？」の表。lib のシミュレーションを固定の種で回して作る
 * （本文に数字を手で書かないため。docs/features/thin-tool-content.md）。
 * 仕様書の数字（2026-11-09 の 4,000 回）と食い違ったら、こちらを正とする。
 */
export const BINGO_TABLE: SimulationRow[] = bingoTable();

export { TABLE_TRIALS };

export function rowFor(cards: number): SimulationRow {
  const row = BINGO_TABLE.find((r) => r.cards === cards);
  if (!row) throw new Error(`目安の表に ${cards} 枚の行がありません`);
  return row;
}
