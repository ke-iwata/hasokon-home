import { describe, expect, it } from 'vitest';
import {
  CATEGORY_ORDER,
  DEFAULT_DAYS,
  MAX_DAYS,
  MAX_PEOPLE_PER_TYPE,
  MAX_PETS_PER_TYPE,
  RICE_GRAMS_PER_MEAL,
  STOCK_DAYS_OPTIONS,
  STOCK_ITEMS,
  calcBosaiBichiku,
  groupByCategory,
  type StockLine,
} from '@/lib/bosai-bichiku';

/**
 * 防災備蓄 計算ロジックのテスト（docs/features/bosai-bichiku-keisan.md）。
 *
 * 見張っているのは3つ。
 *
 * 1. **一次資料の数値をそのまま再現できること**。カセットボンベ「1人1週間約6本」
 *    （農水省）と簡易トイレ「3人7日で105回分」（東京備蓄ナビ）は、係数を触ると
 *    静かにずれる。資料の数字をそのまま突き合わせる形で固定する
 * 2. **区分ごとの数え分け**。乳幼児は主食を食べずミルクとおむつが要る、
 *    高齢者の常備薬は日数に比例しない、といった数え方の違い
 * 3. **異常値で壊れないこと**。負・小数・NaN・桁の打ち間違い
 */

/** 品目IDから必要量を引く。無ければ0（＝その世帯には不要という意味） */
function amount(lines: StockLine[], id: string): number {
  return lines.find((l) => l.id === id)?.quantity ?? 0;
}

describe('一次資料の数値の再現', () => {
  it('カセットボンベは1人1週間で約6本（農水省ガイド(7)）', () => {
    const { lines } = calcBosaiBichiku({ adults: 1, days: 7 });
    expect(amount(lines, 'gas-cartridge')).toBe(6);
  });

  it('カセットボンベは大人2人1週間で12本（1人分の倍）', () => {
    const { lines } = calcBosaiBichiku({ adults: 2, days: 7 });
    expect(amount(lines, 'gas-cartridge')).toBe(12);
  });

  it('簡易トイレは3人1週間で105回分（東京備蓄ナビの提示例）', () => {
    const { lines } = calcBosaiBichiku({ adults: 3, days: 7 });
    expect(amount(lines, 'toilet')).toBe(105);
  });

  it('飲料水は1人1日3L（農水省 aff「飲料1L＋調理を含めて3L程度」）', () => {
    const { lines } = calcBosaiBichiku({ adults: 1, days: 1 });
    expect(amount(lines, 'water')).toBe(3);
  });

  it('主食は1人1日3食', () => {
    const { lines } = calcBosaiBichiku({ adults: 1, days: 1 });
    expect(amount(lines, 'staple')).toBe(3);
  });

  it('備蓄日数の選択肢は3日と7日（最低3日分～1週間分）', () => {
    expect([...STOCK_DAYS_OPTIONS]).toEqual([3, 7]);
    expect(STOCK_DAYS_OPTIONS).toContain(DEFAULT_DAYS);
  });
});

describe('大人2人・3日分', () => {
  const result = calcBosaiBichiku({ adults: 2, days: 3 });

  it('水・主食・主菜・トイレが人数×日数で出る', () => {
    expect(amount(result.lines, 'water')).toBe(18); // 3L × 2人 × 3日
    expect(amount(result.lines, 'staple')).toBe(18); // 3食 × 2人 × 3日
    expect(amount(result.lines, 'main-dish')).toBe(12); // 2食 × 2人 × 3日
    expect(amount(result.lines, 'toilet')).toBe(30); // 5回 × 2人 × 3日
  });

  it('カセットボンベは切り上げる（6/7本×2人×3日＝5.14→6本）', () => {
    expect(amount(result.lines, 'gas-cartridge')).toBe(6);
  });

  it('カセットコンロは世帯に1台（人数にも日数にも比例しない）', () => {
    expect(amount(result.lines, 'gas-stove')).toBe(1);
    expect(amount(calcBosaiBichiku({ adults: 5, days: 7 }).lines, 'gas-stove')).toBe(1);
  });

  it('乳幼児・高齢者・ペットの品目は出さない', () => {
    for (const id of ['baby-milk', 'baby-diaper', 'medicine', 'pet-food', 'pet-water']) {
      expect(result.lines.find((l) => l.id === id), `${id} が出ている`).toBeUndefined();
    }
  });

  it('水の買い方（2Lボトルの本数と6本入りの箱数）が出る', () => {
    expect(result.water).toEqual({ liters: 18, bottles: 9, cases: 2 });
  });

  it('主食を米だけで用意した場合の重さが出る（1食75g）', () => {
    // 18食 × 75g = 1,350g → 0.1kg 単位に切り上げて 1.4kg
    expect(result.riceKg).toBe(1.4);
    expect(RICE_GRAMS_PER_MEAL).toBe(75);
  });
});

describe('乳幼児', () => {
  const result = calcBosaiBichiku({ infants: 1, days: 3 });

  it('主食と主菜は数えない（ミルクと離乳食に置き換わるため）', () => {
    expect(amount(result.lines, 'staple')).toBe(0);
    expect(amount(result.lines, 'main-dish')).toBe(0);
  });

  it('ミルクとおむつが日数ぶん出る', () => {
    expect(amount(result.lines, 'baby-milk')).toBe(15); // 5本 × 3日
    expect(amount(result.lines, 'baby-diaper')).toBe(30); // 10枚 × 3日
  });

  it('簡易トイレは数えない（おむつを使うため）', () => {
    expect(amount(result.lines, 'toilet')).toBe(0);
  });

  it('水は大人より少ない量で数える', () => {
    expect(amount(result.lines, 'water')).toBe(4.5); // 1.5L × 3日
  });

  it('調乳に湯が要るのでカセットボンベは数える', () => {
    expect(amount(result.lines, 'gas-cartridge')).toBe(3); // 6/7 × 3日 = 2.57 → 3
  });
});

describe('子ども（自分で食事をとる年齢）', () => {
  const result = calcBosaiBichiku({ children: 1, days: 7 });

  it('主食・主菜・トイレは大人と同じ数え方', () => {
    expect(amount(result.lines, 'staple')).toBe(21);
    expect(amount(result.lines, 'main-dish')).toBe(14);
    expect(amount(result.lines, 'toilet')).toBe(35);
  });

  it('水だけ体格に応じて少なくする', () => {
    expect(amount(result.lines, 'water')).toBe(14); // 2L × 7日
  });

  it('ミルク・おむつは出さない（乳幼児と混ぜない）', () => {
    expect(amount(result.lines, 'baby-milk')).toBe(0);
    expect(amount(result.lines, 'baby-diaper')).toBe(0);
  });
});

describe('高齢者', () => {
  it('水・主食・トイレは大人と同じ', () => {
    const senior = calcBosaiBichiku({ seniors: 2, days: 7 });
    const adult = calcBosaiBichiku({ adults: 2, days: 7 });
    for (const id of ['water', 'staple', 'main-dish', 'toilet', 'gas-cartridge']) {
      expect(amount(senior.lines, id), id).toBe(amount(adult.lines, id));
    }
  });

  it('常備薬は人数ぶんだけで、日数に比例しない', () => {
    expect(amount(calcBosaiBichiku({ seniors: 2, days: 3 }).lines, 'medicine')).toBe(2);
    expect(amount(calcBosaiBichiku({ seniors: 2, days: 7 }).lines, 'medicine')).toBe(2);
    expect(amount(calcBosaiBichiku({ seniors: 2, days: 30 }).lines, 'medicine')).toBe(2);
  });

  it('高齢者がいなければ常備薬の行は出さない', () => {
    expect(amount(calcBosaiBichiku({ adults: 2, days: 3 }).lines, 'medicine')).toBe(0);
  });
});

describe('ペット', () => {
  it('犬と猫で1日量が違う', () => {
    const dog = calcBosaiBichiku({ adults: 1, dogs: 1, days: 3 });
    const cat = calcBosaiBichiku({ adults: 1, cats: 1, days: 3 });
    expect(amount(dog.lines, 'pet-food')).toBe(450); // 150g × 3日
    expect(amount(cat.lines, 'pet-food')).toBe(180); // 60g × 3日
    expect(amount(dog.lines, 'pet-water')).toBe(1.5);
    expect(amount(cat.lines, 'pet-water')).toBe(0.6);
  });

  it('複数匹ぶんを合算する', () => {
    const { lines } = calcBosaiBichiku({ adults: 1, dogs: 2, cats: 1, days: 7 });
    expect(amount(lines, 'pet-food')).toBe(150 * 2 * 7 + 60 * 1 * 7);
  });

  it('ペット用の水は人の飲料水の集計に混ぜない', () => {
    const withPet = calcBosaiBichiku({ adults: 1, dogs: 1, days: 3 });
    const withoutPet = calcBosaiBichiku({ adults: 1, days: 3 });
    expect(withPet.water).toEqual(withoutPet.water);
    expect(amount(withPet.lines, 'water')).toBe(9);
  });

  it('ペットだけの入力でもフードと水は出るが、世帯の備品は出さない', () => {
    const { lines, totalPeople } = calcBosaiBichiku({ cats: 1, days: 3 });
    expect(totalPeople).toBe(0);
    expect(amount(lines, 'pet-food')).toBe(180);
    // 人がいない世帯に「カセットコンロ1台」と出すと入力前の初期表示が意味不明になる
    expect(amount(lines, 'gas-stove')).toBe(0);
  });
});

describe('入力の丸めと歯止め', () => {
  it('人数が0なら品目を1つも出さない', () => {
    expect(calcBosaiBichiku({}).lines).toEqual([]);
    expect(calcBosaiBichiku({ adults: 0, days: 7 }).lines).toEqual([]);
  });

  it('負の人数・NaN は0として扱う', () => {
    expect(calcBosaiBichiku({ adults: -3, days: 3 }).people.adult).toBe(0);
    expect(calcBosaiBichiku({ adults: Number.NaN, days: 3 }).people.adult).toBe(0);
    expect(calcBosaiBichiku({ adults: Number.POSITIVE_INFINITY, days: 3 }).people.adult).toBe(0);
  });

  it('小数の人数は切り捨てる（1.9人は1人）', () => {
    expect(calcBosaiBichiku({ adults: 1.9, days: 3 }).people.adult).toBe(1);
  });

  it('人数・ペット・日数は上限で頭打ちにする（桁の打ち間違い対策）', () => {
    const { people, pets, days } = calcBosaiBichiku({
      adults: 9999,
      dogs: 9999,
      days: 9999,
    });
    expect(people.adult).toBe(MAX_PEOPLE_PER_TYPE);
    expect(pets.dog).toBe(MAX_PETS_PER_TYPE);
    expect(days).toBe(MAX_DAYS);
  });

  it('日数を省く・0・不正のときは既定の3日で計算する', () => {
    expect(calcBosaiBichiku({ adults: 1 }).days).toBe(DEFAULT_DAYS);
    expect(calcBosaiBichiku({ adults: 1, days: 0 }).days).toBe(DEFAULT_DAYS);
    expect(calcBosaiBichiku({ adults: 1, days: Number.NaN }).days).toBe(DEFAULT_DAYS);
    expect(calcBosaiBichiku({ adults: 1, days: -5 }).days).toBe(DEFAULT_DAYS);
  });

  it('人数の合計を返す（ペットは含めない）', () => {
    const { totalPeople } = calcBosaiBichiku({
      adults: 2,
      seniors: 1,
      children: 1,
      infants: 1,
      dogs: 3,
    });
    expect(totalPeople).toBe(5);
  });

  it('必要量は必ず切り上げる（足りないより余るほうを選ぶ）', () => {
    // 6/7本 × 1人 × 3日 = 2.57 → 3本
    expect(amount(calcBosaiBichiku({ adults: 1, days: 3 }).lines, 'gas-cartridge')).toBe(3);
    // 水は0.1L刻みで切り上げ（乳幼児1人1日1.5L）
    expect(amount(calcBosaiBichiku({ infants: 1, days: 1 }).lines, 'water')).toBe(1.5);
  });
});

describe('品目データ（STOCK_ITEMS）', () => {
  it('IDが重複していない', () => {
    const ids = STOCK_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('すべての品目に根拠の一文がある', () => {
    // derived（当サイトの目安）を official と同じ顔で出さないための担保。
    // 画面はこの source を必ず添えて表示する
    for (const item of STOCK_ITEMS) {
      expect(item.source.length, `${item.id} に根拠が無い`).toBeGreaterThan(0);
    }
  });

  it('分類はすべて CATEGORY_ORDER に載っている（印刷リストから漏れないこと）', () => {
    for (const item of STOCK_ITEMS) {
      expect(CATEGORY_ORDER, `${item.id} の分類が並び順に無い`).toContain(item.category);
    }
  });

  it('どの品目も人数・ペット・世帯のいずれかで数えられる', () => {
    for (const item of STOCK_ITEMS) {
      const countable =
        item.perPersonPerDay || item.perPetPerDay || item.perHousehold || item.perPersonFixed;
      expect(countable, `${item.id} は数量が決まらない`).toBeTruthy();
    }
  });
});

describe('groupByCategory', () => {
  const { lines } = calcBosaiBichiku({
    adults: 2,
    seniors: 1,
    children: 1,
    infants: 1,
    dogs: 1,
    days: 7,
  });
  const groups = groupByCategory(lines);

  it('CATEGORY_ORDER の順に並ぶ', () => {
    const order = groups.map((g) => g.category);
    expect(order).toEqual(CATEGORY_ORDER.filter((c) => order.includes(c)));
  });

  it('空の分類は落とす', () => {
    for (const g of groups) expect(g.lines.length).toBeGreaterThan(0);
  });

  it('分類に振り分けても品目が減らない', () => {
    expect(groups.flatMap((g) => g.lines)).toHaveLength(lines.length);
  });
});
