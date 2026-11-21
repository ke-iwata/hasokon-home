/**
 * 式を作る（逆向き）とよく使う式（仕様: docs/features/cron-shiki-checker.md の「出力」6）
 *
 * 作るのは crontab・GitHub Actions・Kubernetes で共通の 5 フィールドの式。
 */
import { describe } from './describe';
import { parseFields, splitFields } from './parse';

export type BuildKind = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'interval';

export interface BuildInput {
  kind: BuildKind;
  hour: number;
  minute: number;
  /** weekly：0=日曜〜6=土曜 */
  weekday?: number;
  /** monthly：1〜31 */
  day?: number;
  /** interval：◯分ごと（1〜59。60 の約数でないと毎時0分に間隔が詰まる） */
  every?: number;
}

const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.trunc(Number.isFinite(v) ? v : min)));

export function buildCron(input: BuildInput): string {
  const h = clampInt(input.hour, 0, 23);
  const m = clampInt(input.minute, 0, 59);
  switch (input.kind) {
    case 'daily':
      return `${m} ${h} * * *`;
    case 'weekdays':
      return `${m} ${h} * * 1-5`;
    case 'weekly':
      return `${m} ${h} * * ${clampInt(input.weekday ?? 1, 0, 6)}`;
    case 'monthly':
      return `${m} ${h} ${clampInt(input.day ?? 1, 1, 31)} * *`;
    case 'interval': {
      const every = clampInt(input.every ?? 5, 1, 59);
      return every === 1 ? '* * * * *' : `*/${every} * * * *`;
    }
  }
}

/** よく使う 10 パターン（本文とボタン） */
export const COMMON_EXPRESSIONS: readonly string[] = [
  '*/5 * * * *',
  '0 * * * *',
  '0 9 * * *',
  '30 9 * * 1-5',
  '0 9-18 * * 1-5',
  '0 */6 * * *',
  '0 0 * * 0',
  '0 18 * * 5',
  '0 9 1 * *',
  '0 3 1 1 *',
];

export interface CommonRow {
  expression: string;
  description: string;
}

/** 本文の表。読み下しは lib で作る（手で書いた説明が式とずれないように） */
export function commonRows(): CommonRow[] {
  return COMMON_EXPRESSIONS.map((expression) => {
    const r = parseFields(splitFields(expression), 'cron5');
    if (!r.ok) throw new Error(`よく使う式が読めない: ${expression}`);
    return { expression, description: describe(r.spec) };
  });
}
