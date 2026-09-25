import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHANGE_EXAMPLE,
  CHANGE_ROW,
  EXAMPLE,
  MODE_ROWS,
  PEOPLE_SHIFT,
  UNITS,
  UNIT_ROWS,
} from '@/app/warikan/tables';
import { calcWarikan, ROUND_UNITS, type WarikanInput } from '@/lib/warikan';

const base: WarikanInput = {
  total: 25000,
  people: 5,
  roundUnit: 100,
  mode: 'kanji-less',
};

describe('calcWarikan（基本ケース）', () => {
  it('25000円・5人・100円丸め切り上げ → 全員5000円ぴったり', () => {
    const r = calcWarikan(base);
    expect(r.perPerson).toBe(5000);
    expect(r.kanji).toBe(5000);
    expect(r.collected).toBe(25000);
  });

  it('23456円・5人・100円切り上げ → 参加者4700円×4 + 幹事4656円', () => {
    const r = calcWarikan({ ...base, total: 23456 });
    expect(r.perPerson).toBe(4700);
    expect(r.kanji).toBe(4656);
    expect(r.collected).toBe(23456);
  });

  it('23456円・5人・100円切り捨て（幹事が端数を負担）→ 参加者4600円×4 + 幹事5056円', () => {
    const r = calcWarikan({ ...base, total: 23456, mode: 'kanji-more' });
    expect(r.perPerson).toBe(4600);
    expect(r.kanji).toBe(5056);
    expect(r.collected).toBe(23456);
  });

  it('均等モード: 23456円・5人 → 参加者4691円×4 + 幹事4692円', () => {
    const r = calcWarikan({ ...base, total: 23456, mode: 'equal' });
    expect(r.perPerson).toBe(4691);
    expect(r.kanji).toBe(4692);
    expect(r.collected).toBe(23456);
  });

  it('切り上げで集めすぎた場合、幹事はマイナス（お釣り）になる', () => {
    // 100円・3人・500円切り上げ → 参加者500円×2 = 1000円で 900円のお釣り
    const r = calcWarikan({ total: 100, people: 3, roundUnit: 500, mode: 'kanji-less' });
    expect(r.perPerson).toBe(500);
    expect(r.kanji).toBe(-900);
    expect(r.collected).toBe(100);
  });
});

describe('calcWarikan（検算: 集金合計は常に合計と一致）', () => {
  const totals = [0, 1, 100, 999, 12345, 23456, 25000, 100001];
  const peoples = [1, 2, 3, 5, 7, 12];
  const units = [1, 10, 100, 500, 1000];
  const modes: WarikanInput['mode'][] = ['kanji-more', 'kanji-less', 'equal'];

  it('全組み合わせで perPerson×(人数−1) + kanji === total', () => {
    for (const total of totals) {
      for (const people of peoples) {
        for (const roundUnit of units) {
          for (const mode of modes) {
            const r = calcWarikan({ total, people, roundUnit, mode });
            expect(r.collected).toBe(total);
            expect(r.perPerson * (people - 1) + r.kanji).toBe(total);
          }
        }
      }
    }
  });
});

describe('calcWarikan（エッジケース）', () => {
  it('1人の場合は幹事が全額', () => {
    const r = calcWarikan({ ...base, people: 1 });
    expect(r.kanji).toBe(25000);
    expect(r.collected).toBe(25000);
  });

  it('割り切れる場合はどのモードでも全員同額', () => {
    for (const mode of ['kanji-more', 'kanji-less', 'equal'] as const) {
      const r = calcWarikan({ total: 30000, people: 6, roundUnit: 100, mode });
      expect(r.perPerson).toBe(5000);
      expect(r.kanji).toBe(5000);
    }
  });

  it('0円の場合は全員0円', () => {
    const r = calcWarikan({ ...base, total: 0 });
    expect(r.perPerson).toBe(0);
    expect(r.kanji).toBe(0);
    expect(r.collected).toBe(0);
  });

  it('不正入力は補正される（負の合計→0、人数0→1、丸め単位0→1）', () => {
    expect(calcWarikan({ total: -100, people: 5, roundUnit: 100, mode: 'equal' }).collected).toBe(0);
    expect(calcWarikan({ total: 1000, people: 0, roundUnit: 100, mode: 'equal' }).kanji).toBe(1000);
    const r = calcWarikan({ total: 1000, people: 3, roundUnit: 0, mode: 'kanji-less' });
    expect(r.perPerson).toBe(334);
    expect(r.collected).toBe(1000);
  });
});

/**
 * 「幹事の扱いは3通り」「丸め単位の選び方」
 * （docs/features/thin-tool-content.md）のテスト。
 *
 * 本文の例の額を手で書くと、丸めの向きを直したときに説明だけが合わなくなる。
 * 表の額が calcWarikan() の結果と一致することと、検算の式が成り立つことを見る。
 */
describe('本文の例（幹事の扱い・丸め単位）', () => {
  it('例の会計は人数で割り切れない（丸めが起きる額を選んでいる）', () => {
    expect(EXAMPLE.total % EXAMPLE.people).not.toBe(0);
  });

  it('幹事の扱いの表は3モードを calcWarikan() の結果どおりに並べる', () => {
    expect(MODE_ROWS.map((r) => r.mode)).toEqual(['kanji-more', 'kanji-less', 'equal']);
    for (const row of MODE_ROWS) {
      const expected = calcWarikan({
        total: EXAMPLE.total,
        people: EXAMPLE.people,
        roundUnit: EXAMPLE.modeTableUnit,
        mode: row.mode,
      });
      expect(row.perPerson).toBe(expected.perPerson);
      expect(row.kanji).toBe(expected.kanji);
    }
  });

  it('どのモードでも「参加者×(人数−1) + 幹事 = 合計」が成り立つ', () => {
    for (const row of MODE_ROWS) {
      expect(row.perPerson * (EXAMPLE.people - 1) + row.kanji).toBe(EXAMPLE.total);
      expect(row.collected).toBe(EXAMPLE.total);
    }
  });

  it('幹事が端数を負担 → 得 の順で幹事の支払いが減る（本文の主張どおり）', () => {
    const more = MODE_ROWS.find((r) => r.mode === 'kanji-more')!;
    const less = MODE_ROWS.find((r) => r.mode === 'kanji-less')!;
    expect(more.kanji).toBeGreaterThan(less.kanji);
    expect(more.perPerson).toBeLessThan(less.perPerson);
  });

  it('丸め単位の表は Calculator と同じ5種で、額は calcWarikan() と一致する', () => {
    expect([...UNITS]).toEqual([1, 10, 100, 500, 1000]);
    // 本文の表も計算機も lib の ROUND_UNITS を見ている（同じ並びを二重に持たない）
    expect(UNITS).toBe(ROUND_UNITS);
    expect(UNIT_ROWS.map((r) => r.unit)).toEqual([...UNITS]);
    for (const row of UNIT_ROWS) {
      const expected = calcWarikan({
        total: EXAMPLE.total,
        people: EXAMPLE.people,
        roundUnit: row.unit,
        mode: EXAMPLE.unitTableMode,
      });
      expect(row.perPerson).toBe(expected.perPerson);
      expect(row.kanji).toBe(expected.kanji);
      expect(row.gap).toBe(expected.kanji - expected.perPerson);
      expect(row.collected).toBe(EXAMPLE.total);
    }
  });

  it('差額は「切り捨てた分 × 人数」で、上限は「丸め単位 × 人数」（本文の主張どおり）', () => {
    for (const row of [...UNIT_ROWS, ...PEOPLE_SHIFT]) {
      const people = 'people' in row ? row.people : EXAMPLE.people;
      const unit = 'unit' in row ? row.unit : EXAMPLE.modeTableUnit;
      // 差額 = 合計 − 参加者1人 × 人数（＝1人あたりの切り捨て額の人数分）
      expect(row.gap).toBe(EXAMPLE.total - row.perPerson * people);
      expect(row.gap).toBeLessThan(unit * people);
      expect(row.gap).toBeGreaterThanOrEqual(0);
    }
  });

  it('単位を大きくすると参加者の額は下がり、差額は広がる（本文の主張どおり）', () => {
    for (let i = 1; i < UNIT_ROWS.length; i += 1) {
      expect(UNIT_ROWS[i].perPerson).toBeLessThanOrEqual(UNIT_ROWS[i - 1].perPerson);
      expect(UNIT_ROWS[i].gap).toBeGreaterThanOrEqual(UNIT_ROWS[i - 1].gap);
    }
  });

  it('お釣りの例は本当に幹事がマイナス（受け取り側）になる', () => {
    const expected = calcWarikan(CHANGE_EXAMPLE);
    expect(CHANGE_ROW.perPerson).toBe(expected.perPerson);
    expect(CHANGE_ROW.kanji).toBe(expected.kanji);
    expect(CHANGE_ROW.kanji).toBeLessThan(0);
    expect(CHANGE_ROW.perPerson * (CHANGE_EXAMPLE.people - 1)).toBeGreaterThan(
      CHANGE_EXAMPLE.total,
    );
  });

  it('人数を変えた例は同じ会計・同じ条件で人数だけが違う', () => {
    expect(PEOPLE_SHIFT.map((r) => r.people)).toEqual([
      EXAMPLE.people - 1,
      EXAMPLE.people,
      EXAMPLE.people + 1,
    ]);
    for (const row of PEOPLE_SHIFT) {
      const expected = calcWarikan({
        total: EXAMPLE.total,
        people: row.people,
        roundUnit: EXAMPLE.modeTableUnit,
        mode: EXAMPLE.unitTableMode,
      });
      expect(row.perPerson).toBe(expected.perPerson);
      expect(row.kanji).toBe(expected.kanji);
      expect(row.gap).toBe(expected.kanji - expected.perPerson);
    }
    // 人数が増えれば参加者1人の額は下がる
    expect(PEOPLE_SHIFT[0].perPerson).toBeGreaterThan(PEOPLE_SHIFT[1].perPerson);
    expect(PEOPLE_SHIFT[1].perPerson).toBeGreaterThan(PEOPLE_SHIFT[2].perPerson);
  });

  it('page.tsx は例の額を手で書いていない', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../app/warikan/page.tsx', import.meta.url)),
      'utf8',
    );
    expect(source).toContain("from './tables'");
    expect(source).toContain('MODE_ROWS.map(');
    expect(source).toContain('UNIT_ROWS.map(');
    for (const n of [
      ...MODE_ROWS.flatMap((r) => [r.perPerson, r.kanji]),
      ...UNIT_ROWS.flatMap((r) => [r.perPerson, r.kanji]),
      ...PEOPLE_SHIFT.flatMap((r) => [r.perPerson, r.kanji]),
      CHANGE_ROW.perPerson,
    ]) {
      const formatted = Math.abs(n).toLocaleString('ja-JP');
      if (formatted.includes(',')) expect(source).not.toContain(formatted);
    }
  });
});

describe('丸め単位の情報源（運営者依頼: lib/warikan.ts の ROUND_UNITS に集約）', () => {
  it('Calculator.tsx は自前の単位リストを持たず ROUND_UNITS を使う', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../app/warikan/Calculator.tsx', import.meta.url)),
      'utf8',
    );
    // 片方だけに単位を足すと、表にある単位が計算機で選べない（逆も同じ）
    expect(src, 'Calculator.tsx が自前の単位リストを持っている').not.toMatch(
      /const\s+UNITS\s*=\s*\[/,
    );
    expect(src).toContain('ROUND_UNITS');
  });

  it('本文にサービス名を書かない（仕様の「やらないこと」）', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../app/warikan/page.tsx', import.meta.url)),
      'utf8',
    );
    for (const name of ['PayPay', 'LINE Pay', '楽天ペイ', 'd払い']) {
      expect(src, `page.tsx に個別のサービス名「${name}」がある`).not.toContain(name);
    }
  });
});
