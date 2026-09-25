/**
 * 割り勘ページの「幹事の扱い」「丸め単位」の例の行データ。
 *
 * 仕様: docs/features/thin-tool-content.md
 *
 * 本文に例の金額を手で書くと、丸めの向きを直したときに説明だけが合わなくなる。
 * 表に出す額は必ず lib/warikan.ts の calcWarikan() から描画する。
 * 一致は tests/warikan.test.ts が見張る
 *
 * 2つの表は「同じ会計を条件だけ変えて見せる」ものなので、
 * 合計・人数は EXAMPLE で共通にしている（比べられるようにするため）。
 */

import { calcWarikan, ROUND_UNITS, type KanjiMode } from '@/lib/warikan';

/** 2つの表で共通に使う会計の例 */
export const EXAMPLE = {
  /** 合計金額（円）。人数で割り切れない額をあえて選んでいる */
  total: 32_300,
  /** 人数（幹事を含む） */
  people: 7,
  /** 幹事の扱いの比較で固定する丸め単位（円） */
  modeTableUnit: 100,
  /** 丸め単位の比較で固定する幹事の扱い */
  unitTableMode: 'kanji-more' as KanjiMode,
} as const;

/** 幹事の扱いと、Calculator の選択肢に出している呼び名 */
export const MODE_LABELS: { mode: KanjiMode; label: string; how: string }[] = [
  { mode: 'kanji-more', label: '幹事が端数を負担', how: '参加者は切り捨て' },
  { mode: 'kanji-less', label: '幹事が端数を得', how: '参加者は切り上げ' },
  { mode: 'equal', label: '均等（1円単位）', how: '余りだけ幹事が負担' },
];

/** 丸め単位の候補。計算機の選択肢と同じものを lib から引く（二重に持たない） */
export const UNITS = ROUND_UNITS;

export interface ExampleRow {
  /** 参加者（幹事以外）1人の支払額（円） */
  perPerson: number;
  /** 幹事の支払額（円）。マイナスは集めすぎ（お釣り） */
  kanji: number;
  /** 検算: perPerson × (人数−1) + kanji。常に total と一致する */
  collected: number;
}

export interface ModeRow extends ExampleRow {
  mode: KanjiMode;
  label: string;
  how: string;
}

/** 表1: 幹事の扱い3通り（丸め単位は固定） */
export const MODE_ROWS: ModeRow[] = MODE_LABELS.map(({ mode, label, how }) => ({
  mode,
  label,
  how,
  ...calcWarikan({
    total: EXAMPLE.total,
    people: EXAMPLE.people,
    roundUnit: EXAMPLE.modeTableUnit,
    mode,
  }),
}));

export interface UnitRow extends ExampleRow {
  unit: number;
  /** 参加者1人と幹事の差額（円） */
  gap: number;
}

/**
 * 「お釣りが出る」例。
 *
 * 幹事が端数を得るモードでは、参加者×(人数−1) が会計を超えると幹事の支払いが
 * マイナス（＝受け取り）になる。人数が少なく丸め単位が大きいときに起きるので、
 * 上の EXAMPLE（7人）では再現しない。条件を変えた例を別に持つ。
 */
export const CHANGE_EXAMPLE = {
  total: 3_900,
  people: 3,
  roundUnit: 1_000,
  mode: 'kanji-less' as KanjiMode,
} as const;

/** CHANGE_EXAMPLE の計算結果。kanji がマイナスなら集めすぎ（お釣り） */
export const CHANGE_ROW = calcWarikan(CHANGE_EXAMPLE);

/**
 * 人数だけを変えた場合の比較。
 *
 * 幹事の上乗せは「切り捨てた端数 ×（人数−1）」なので人数に比例せず飛ぶ。
 * その説明に使う3点で、表にはせず本文の中で並べる（表を増やさないため）。
 */
export const PEOPLE_SHIFT = [EXAMPLE.people - 1, EXAMPLE.people, EXAMPLE.people + 1].map(
  (people) => {
    const r = calcWarikan({
      total: EXAMPLE.total,
      people,
      roundUnit: EXAMPLE.modeTableUnit,
      mode: EXAMPLE.unitTableMode,
    });
    return { people, ...r, gap: r.kanji - r.perPerson };
  },
);

/** 表2: 丸め単位ごとの違い（幹事の扱いは固定） */
export const UNIT_ROWS: UnitRow[] = UNITS.map((unit) => {
  const r = calcWarikan({
    total: EXAMPLE.total,
    people: EXAMPLE.people,
    roundUnit: unit,
    mode: EXAMPLE.unitTableMode,
  });
  return { unit, ...r, gap: r.kanji - r.perPerson };
});
