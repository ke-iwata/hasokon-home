import { describe, expect, it } from 'vitest';
import {
  type JudgeInput,
  KYUCHI_RATE,
  NENDO_RULES,
  isMinor,
  isOver65,
  judge,
  judgeAllKyuchi,
  judgeHousehold,
  kyuyoShotoku,
  limits,
  minorBornOnOrAfter,
  nenkinKojo,
  nenkinShotoku,
  over65BornOnOrBefore,
  shotokuChoseiKojo,
} from '@/lib/juminzei-hikazei';
import { salaryIncome } from '@/lib/furusato-nozei';
import { WALL_DEFS } from '@/lib/nenshu-kabe';

/**
 * 仕様: docs/features/juminzei-hikazei-hantei.md の「テスト」。
 * 境目の数字は大阪市「市民税・府民税・森林環境税が課税されない方」の目安表（令和8年度）と、
 * 地方税法 295条・附則3条の3・施行令47条の3・施行規則9条の21（e-Gov で確認）の式から出したもの。
 */

const base: JudgeInput = {
  nendo: 'R9',
  kyuchi: 1,
  salary: 0,
  pension: 0,
  over65: false,
  dependents: 0,
  special: false,
};
const j = (over: Partial<JudgeInput>) => judge({ ...base, ...over });

describe('給与所得（別表第五の端数つき）', () => {
  it('令和9年度は最低保障74万円・令和8年度は65万円', () => {
    expect(kyuyoShotoku(1_190_000, 'R9')).toBe(450_000);
    expect(kyuyoShotoku(1_100_000, 'R8')).toBe(450_000);
    expect(kyuyoShotoku(700_000, 'R9')).toBe(0);
  });

  it('最低保障を超える帯は収入を4,000円単位に切り捨てて式に当てる', () => {
    // 220万〜220万3,999円は同じ給与所得（2,200,000 − (660,000 + 80,000)）
    expect(kyuyoShotoku(2_200_000, 'R9')).toBe(1_460_000);
    expect(kyuyoShotoku(2_203_999, 'R9')).toBe(1_460_000);
    expect(kyuyoShotoku(2_204_000, 'R9')).toBe(1_462_800);
  });

  it('4,000円の倍数では lib/furusato-nozei.ts の令和8年分の給与所得と一致する（同じ表を二重に持たない）', () => {
    for (const income of [500_000, 1_000_000, 2_400_000, 3_000_000, 5_000_000, 7_000_000]) {
      expect(kyuyoShotoku(income, 'R9')).toBe(salaryIncome(income));
    }
  });
});

describe('公的年金等の雑所得・所得金額調整控除', () => {
  it('65歳以上は最低110万円・65歳未満は最低60万円', () => {
    expect(nenkinKojo(1_550_000, true)).toBe(1_100_000);
    expect(nenkinShotoku(1_550_000, true)).toBe(450_000);
    expect(nenkinShotoku(1_550_000, false)).toBe(1_550_000 - (1_550_000 * 0.25 + 275_000));
    expect(nenkinShotoku(500_000, false)).toBe(0);
  });

  it('給与と年金の両方があれば最大10万円を給与所得から引く', () => {
    expect(shotokuChoseiKojo(260_000, 400_000)).toBe(100_000);
    expect(shotokuChoseiKojo(50_000, 400_000)).toBe(50_000);
    expect(shotokuChoseiKojo(260_000, 0)).toBe(0);
    const r = j({ salary: 1_000_000, pension: 1_500_000, over65: true });
    expect(r.choseiKojo).toBe(100_000);
    expect(r.totalIncome).toBe(260_000 - 100_000 + 400_000);
  });
});

describe('非課税限度額', () => {
  it('1級地：扶養なし45万円・扶養1人は均等割101万円／所得割112万円', () => {
    expect(limits({ dependents: 0, kyuchi: 1 })).toEqual({ kintowari: 450_000, shotokuwari: 450_000 });
    expect(limits({ dependents: 1, kyuchi: 1 })).toEqual({
      kintowari: 1_010_000,
      shotokuwari: 1_120_000,
    });
  });

  it('級地の率は施行規則9条の21（1.0・0.9・0.8）。所得割の限度額は級地によらない', () => {
    expect(KYUCHI_RATE).toEqual({ 1: 1.0, 2: 0.9, 3: 0.8 });
    expect(limits({ dependents: 0, kyuchi: 2 }).kintowari).toBe(415_000);
    expect(limits({ dependents: 0, kyuchi: 3 }).kintowari).toBe(380_000);
    expect(limits({ dependents: 1, kyuchi: 2 }).kintowari).toBe(315_000 * 2 + 189_000 + 100_000);
    expect(limits({ dependents: 1, kyuchi: 3 }).kintowari).toBe(280_000 * 2 + 168_000 + 100_000);
    for (const kyuchi of [1, 2, 3] as const) {
      expect(limits({ dependents: 2, kyuchi }).shotokuwari).toBe(350_000 * 3 + 420_000);
    }
  });
});

describe('仕様書「テスト」の6ケース', () => {
  it('単身・給与：令和9年度は119万円まで非課税、119万1円で課税（令和8年度は110万円）', () => {
    expect(j({ salary: 1_190_000 }).status).toBe('none');
    expect(j({ salary: 1_190_001 }).status).toBe('taxed');
    expect(j({ salary: 1_190_001 }).shotokuwariFree).toBe(false);
    expect(j({ nendo: 'R8', salary: 1_100_000 }).status).toBe('none');
    expect(j({ nendo: 'R8', salary: 1_100_001 }).status).toBe('taxed');
  });

  it('扶養1人（1級地）：令和8年度は大阪市の目安表どおり均等割166万円・所得割177万円', () => {
    const r8 = { nendo: 'R8' as const, dependents: 1 };
    expect(j({ ...r8, salary: 1_660_000 }).status).toBe('none');
    expect(j({ ...r8, salary: 1_660_001 }).status).toBe('kintowari');
    expect(j({ ...r8, salary: 1_770_000 }).status).toBe('kintowari');
    expect(j({ ...r8, salary: 1_770_001 }).status).toBe('taxed');
    // 令和9年度は計算で出す（最低保障が9万円上がるぶん境目も9万円上がる）
    expect(j({ dependents: 1 }).maxSalaryNone).toBe(1_750_000);
    expect(j({ dependents: 1 }).maxSalaryShotokuwari).toBe(1_860_000);
  });

  it('扶養2人（1級地・令和8年度）：205万9,999円まで非課税（4,000円の切り捨てで出る数字）', () => {
    expect(j({ nendo: 'R8', dependents: 2, salary: 2_059_999 }).status).toBe('none');
    expect(j({ nendo: 'R8', dependents: 2, salary: 2_060_000 }).status).toBe('kintowari');
    expect(j({ nendo: 'R8', dependents: 2 }).maxSalaryNone).toBe(2_059_999);
  });

  it('65歳以上・年金だけ：155万円まで非課税、155万1円で課税', () => {
    expect(j({ pension: 1_550_000, over65: true }).status).toBe('none');
    expect(j({ pension: 1_550_001, over65: true }).status).toBe('taxed');
    // 65歳未満なら同じ年金額でも課税
    expect(j({ pension: 1_550_000, over65: false }).status).toBe('taxed');
  });

  it('ひとり親等：令和8年度は204万3,999円まで非課税（大阪市）、令和9年度は209万円', () => {
    expect(j({ nendo: 'R8', special: true, salary: 2_043_999 }).status).toBe('none');
    expect(j({ nendo: 'R8', special: true, salary: 2_043_999 }).bySpecial).toBe(true);
    expect(j({ nendo: 'R8', special: true, salary: 2_044_000 }).status).toBe('taxed');
    expect(j({ special: true }).maxSalaryNone).toBe(2_090_000);
    expect(j({ special: true, salary: 2_090_001 }).status).toBe('taxed');
  });

  it('3級地・扶養なし：均等割の限度額は38万円で、1級地との差が出る', () => {
    const r = j({ kyuchi: 3, salary: 1_150_000 });
    expect(r.limitKintowari).toBe(380_000);
    expect(r.status).toBe('kintowari');
    expect(j({ kyuchi: 1, salary: 1_150_000 }).status).toBe('none');
    expect(j({ kyuchi: 3 }).maxSalaryNone).toBe(1_120_000);
    // 2級地は41万5,000円なので、給与115万円（合計所得41万円）はまだ非課税
    const all = judgeAllKyuchi({ ...base, salary: 1_150_000 });
    expect([all[1].status, all[2].status, all[3].status]).toEqual(['none', 'none', 'kintowari']);
  });
});

describe('入力の取り違えが効く例', () => {
  it('16歳未満の子を数えないと（0人）、境目が35万円以上ずれる', () => {
    const zero = j({ dependents: 0 }).maxSalaryNone as number;
    const one = j({ dependents: 1 }).maxSalaryNone as number;
    expect(one - zero).toBeGreaterThanOrEqual(350_000);
  });

  it('所得控除は判定に効かない：入力に無く、合計所得金額だけで決まる', () => {
    const r = j({ salary: 1_500_000 });
    expect(r.totalIncome).toBe(760_000);
    expect(r.status).toBe('taxed');
  });

  it('「所得税はかからないのに住民税はかかる帯」を判定できる', () => {
    const r = j({ salary: 1_500_000 });
    expect(r.basicDeductionIncomeTax).toBe(1_040_000);
    expect(r.incomeTaxFreeByBasic).toBe(true);
    expect(r.status).toBe('taxed');
  });
});

describe('あと何円まで非課税か', () => {
  it('限度額 − 合計所得 を給与収入に戻した額', () => {
    const r = j({ salary: 1_000_000 });
    expect(r.maxSalaryNone).toBe(1_190_000);
    expect(r.headroomSalary).toBe(190_000);
    expect(j({ salary: 1_300_000 }).headroomSalary).toBeNull();
  });

  it('年金がある人は、年金を固定したまま給与をいくらまで足せるか', () => {
    // 65歳以上・年金140万円 → 雑所得30万円。給与を足すと所得金額調整控除も効く
    const r = j({ pension: 1_400_000, over65: true });
    const max = r.maxSalaryNone as number;
    expect(j({ pension: 1_400_000, over65: true, salary: max }).status).toBe('none');
    expect(j({ pension: 1_400_000, over65: true, salary: max + 1 }).status).not.toBe('none');
  });
});

describe('世帯の判定', () => {
  it('全員が非課税なら非課税世帯。1人でも課税なら誰かを返す', () => {
    const h = judgeHousehold(
      [
        { salary: 1_000_000, pension: 0, over65: false, dependents: 0, special: false },
        { salary: 1_300_000, pension: 0, over65: false, dependents: 0, special: false },
      ],
      { nendo: 'R9', kyuchi: 1 },
    );
    expect(h.hikazeiSetai).toBe(false);
    expect(h.taxedIndexes).toEqual([1]);
  });

  it('親（65歳以上・年金150万円）＋子（給与170万円・親を扶養）：子の扶養人数で結論が変わる', () => {
    const parent = { salary: 0, pension: 1_500_000, over65: true, dependents: 0, special: false };
    const child = { salary: 1_700_000, pension: 0, over65: false, special: false };
    const withDep = judgeHousehold([parent, { ...child, dependents: 1 }], { nendo: 'R9', kyuchi: 1 });
    const noDep = judgeHousehold([parent, { ...child, dependents: 0 }], { nendo: 'R9', kyuchi: 1 });
    expect(withDep.hikazeiSetai).toBe(true);
    expect(noDep.hikazeiSetai).toBe(false);
    expect(noDep.taxedIndexes).toEqual([1]);
  });

  it('所得割だけかからない人（均等割はかかる）がいれば非課税世帯ではない', () => {
    const h = judgeHousehold(
      [{ salary: 1_700_000, pension: 0, over65: false, dependents: 1, special: false }],
      { nendo: 'R9', kyuchi: 3 },
    );
    expect(h.members[0].status).toBe('kintowari');
    expect(h.hikazeiSetai).toBe(false);
  });
});

describe('年齢の基準日', () => {
  it('65歳：令和9年度は1962-01-01生まれまで65歳以上、1962-01-02生まれは65歳未満', () => {
    expect(isOver65({ year: 1962, month: 1, day: 1 }, 'R9')).toBe(true);
    expect(isOver65({ year: 1962, month: 1, day: 2 }, 'R9')).toBe(false);
    expect(over65BornOnOrBefore('R9')).toEqual({ year: 1962, month: 1, day: 1 });
    expect(over65BornOnOrBefore('R8')).toEqual({ year: 1961, month: 1, day: 1 });
  });

  it('未成年：令和9年度は2027-01-01時点で18歳未満＝2009-01-03以降の生まれ', () => {
    // 2009-01-02生まれは 2027-01-01 の終了時に18歳になるので、賦課期日の現況では18歳
    expect(isMinor({ year: 2009, month: 1, day: 2 }, 'R9')).toBe(false);
    expect(isMinor({ year: 2009, month: 1, day: 3 }, 'R9')).toBe(true);
    expect(minorBornOnOrAfter('R9')).toEqual({ year: 2009, month: 1, day: 3 });
    expect(isMinor(minorBornOnOrAfter('R8'), 'R8')).toBe(true);
  });
});

describe('年度の定数', () => {
  it('令和9年度は2026年の収入・令和8年度は2025年の収入', () => {
    expect(NENDO_RULES.R9.incomeYear).toBe(2026);
    expect(NENDO_RULES.R8.incomeYear).toBe(2025);
  });

  it('入力の異常値（負数・NaN・上限超え）で落ちない', () => {
    expect(j({ salary: -1 }).status).toBe('none');
    expect(j({ salary: Number.NaN }).status).toBe('none');
    expect(j({ salary: 1e12 }).status).toBe('taxed');
    expect(j({ dependents: 99 }).limitKintowari).toBe(limits({ dependents: 6, kyuchi: 1 }).kintowari);
  });
});

describe('lib/nenshu-kabe.ts の「119万円の壁」と食い違わない', () => {
  it('単身・給与だけの令和9年度の境目が WALL_DEFS の119万円と一致する', () => {
    const wall = WALL_DEFS.find((w) => w.label === '119万円の壁');
    expect(wall).toBeDefined();
    expect(j({}).maxSalaryNone).toBe(wall?.amount);
  });
});

describe('扶養親族の所得要件', () => {
  it('給与だけの年収の目安は、所得要件 ＋ 給与所得控除の最低保障と一致する', () => {
    for (const n of ['R8', 'R9'] as const) {
      const rule = NENDO_RULES[n];
      expect(rule.dependentSalaryMax).toBe(rule.dependentIncomeMax + rule.salaryMin);
      expect(kyuyoShotoku(rule.dependentSalaryMax, n)).toBe(rule.dependentIncomeMax);
    }
  });
});
