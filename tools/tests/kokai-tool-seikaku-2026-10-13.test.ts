import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calcFurusato,
  estimateSocialInsurance,
  hayamihyoInput,
  HAYAMIHYO_FAMILIES,
  salaryIncome,
} from '@/lib/furusato-nozei';
import { basicDeductionIncomeTaxR7 } from '@/lib/nenmatsu-chosei';
import { NATIONAL_AVERAGE, PREFECTURES } from '@/lib/saitei-chingin';

/**
 * 公開中ツールの正確さの修正（2026-10-13 監査）の文言 3 件。
 * 半角⇔全角の判定は tests/hankaku-zenkaku.test.ts の countChars にある。
 * 仕様: docs/features/kokai-tool-seikaku-2026-10-13.md
 */
const read = (slug: string) => readFileSync(join(__dirname, `../app/${slug}/page.tsx`), 'utf8');

/** 1,000 円未満切捨ての課税所得を「約◯万円」にする */
const man = (yen: number) => `約${Math.round(yen / 10_000)}万円`;

describe('ふるさと納税：改正の注記の課税所得（給与収入500万円・独身）', () => {
  const page = read('furusato-nozei');
  const income = 5_000_000;
  const single = HAYAMIHYO_FAMILIES.find((f) => f.id === 'single')!;

  // 令和7年分は calcFurusato の年分に無いので、lib の部品から組み立てる
  const totalIncome = salaryIncome(income);
  const r7Taxable =
    Math.floor(
      (totalIncome - estimateSocialInsurance(income) - basicDeductionIncomeTaxR7(totalIncome)) /
        1_000,
    ) * 1_000;
  const r8 = calcFurusato(hayamihyoInput(income, single), { taxYear: 2026 });

  it('lib で出し直した値が仕様の表と一致する', () => {
    expect(basicDeductionIncomeTaxR7(totalIncome)).toBe(680_000);
    expect(r7Taxable).toBe(2_144_000);
    expect(r8.incomeTax.basicDeduction).toBe(1_040_000);
    expect(r8.incomeTax.taxableIncome).toBe(1_784_000);
  });

  it('本文の「約◯万円から約◯万円」が lib の値と一致する', () => {
    expect(page).toContain(`課税所得が${man(r7Taxable)}から${man(r8.incomeTax.taxableIncome)}に下がり`);
  });

  it('基礎控除58万円で計算した「約224万円」・lib と合わない「約179万円」が残っていない', () => {
    expect(page).not.toContain('約224万円');
    expect(page).not.toContain('約179万円');
  });
});

describe('年齢計算：FAQ「満18歳になるのは何年生まれ？」', () => {
  const page = read('nenrei-keisan');
  const answer = page.match(/q: '満18歳になるのは何年生まれですか？',\s*a: `([^`]*)`/)?.[1] ?? '';

  it('FAQ の答えを取り出せる', () => {
    expect(answer).not.toBe('');
  });

  it('「誕生日がまだの人」が 18 歳に「なる」と書いていない', () => {
    expect(answer).not.toMatch(/に満18歳になるのは、誕生日を迎えた/);
    expect(answer).not.toMatch(/誕生日がまだの人が\$\{baseYear - 19\}/);
  });

  it('「いま 18 歳である」と「その年に 18 歳になる」を 2 文に分けている', () => {
    expect(answer).toContain('いま満18歳であるのは、今年の誕生日を迎えた人が${baseYear - 18}年');
    expect(answer).toContain('まだの人が${baseYear - 19}年');
    expect(answer).toContain('${baseYear}年中に満18歳になるのは${baseYear - 18}年生まれです');
  });
});

describe('最低賃金：FAQ 1 問目を答申額が出そろった書き方にする', () => {
  const page = read('saitei-chingin');
  const first = page.match(/const faq = \[\s*\{\s*q: '([^']*)',\s*a: `([^`]*)`/);
  const [q, a] = [first?.[1] ?? '', first?.[2] ?? ''];

  it('FAQ 1 問目を取り出せる', () => {
    expect(q).toBe('2026年（令和8年度）の最低賃金はいくら上がりましたか？');
  });

  it('決定前の書き方（目安どおりなら・審議会が決めます）が無い', () => {
    expect(a).not.toMatch(/目安どおりに改定されれば/);
    expect(a).not.toMatch(/審議会が決めます/);
  });

  it('答申額として書き、「決定額」とは書かない', () => {
    expect(a).toMatch(/^47都道府県の改定額（答申額）が出そろい/);
    expect(a).not.toMatch(/決定額/);
  });

  it('全国加重平均は NATIONAL_AVERAGE から出す（1,121円 → 1,177円）', () => {
    expect(a).toContain(
      '${NATIONAL_AVERAGE.current}円から${NATIONAL_AVERAGE.answered}円（+${NATIONAL_AVERAGE.answered - NATIONAL_AVERAGE.current}円）',
    );
    expect(NATIONAL_AVERAGE.answered).toBe(1177);
    expect(NATIONAL_AVERAGE.current).toBe(1121);
  });

  it('「10月1日から12月2日まで」がデータの発効日の最初と最後に一致する', () => {
    expect(a).toContain('発効日は10月1日から12月2日まで');
    const dates = PREFECTURES.map((p) => p.answered?.effectiveOn ?? p.answered?.plannedEffectiveOn)
      .filter((d): d is string => d !== undefined)
      .sort();
    expect(dates).toHaveLength(PREFECTURES.length);
    expect(dates[0]).toBe('2026-10-01');
    expect(dates.at(-1)).toBe('2026-12-02');
  });

  it('目安（A 54円・B/C 56円）は経緯として残す', () => {
    expect(a).toMatch(/Aランク54円、B・Cランク56円/);
  });
});
