/**
 * 本文の早見表の行データ。額は lib/juminzei-hikazei.ts の判定から出し、本文に手で書かない
 * （docs/features/thin-tool-content.md）。
 */
import { maxIncomeFor, type JudgeInput, type Nendo } from '@/lib/juminzei-hikazei';

export interface HayamiRow {
  dependents: number;
  /** 均等割も所得割もかからない給与収入の上限（1級地） */
  salaryNone: number;
  /** 所得割がかからない給与収入の上限 */
  salaryShotokuwari: number;
  /** 65歳以上・年金だけで、均等割も所得割もかからない年金収入の上限（1級地） */
  pensionNone: number;
}

const base = (nendo: Nendo, dependents: number): JudgeInput => ({
  nendo,
  kyuchi: 1,
  salary: 0,
  pension: 0,
  over65: true,
  dependents,
  special: false,
});

export function hayamihyo(nendo: Nendo): HayamiRow[] {
  return [0, 1, 2, 3, 4].map((d) => ({
    dependents: d,
    salaryNone: maxIncomeFor(base(nendo, d), 'salary', 'kintowari') ?? 0,
    salaryShotokuwari: maxIncomeFor(base(nendo, d), 'salary', 'shotokuwari') ?? 0,
    pensionNone: maxIncomeFor(base(nendo, d), 'pension', 'kintowari') ?? 0,
  }));
}

/** 障害者・ひとり親等の給与収入の上限 */
export function specialSalaryMax(nendo: Nendo): number {
  return maxIncomeFor({ ...base(nendo, 0), special: true }, 'salary', 'kintowari') ?? 0;
}

/** 単身・給与だけで、級地ごとの「均等割も所得割もかからない」給与収入の上限 */
export function salaryMaxByKyuchi(nendo: Nendo, kyuchi: 1 | 2 | 3): number {
  return maxIncomeFor({ ...base(nendo, 0), kyuchi }, 'salary', 'kintowari') ?? 0;
}
