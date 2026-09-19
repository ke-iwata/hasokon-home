import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONSUMPTION_TAX_RATE,
  COPAY_OPTIONS,
  DATA_CHECKED_AT,
  ENFORCEMENT_FROM,
  EXCLUSIONS,
  INSURED_RATIO,
  LOOKUP_TABLE,
  SOURCES,
  SPECIAL_CHARGE_RATIO,
  TRANSITION_UNTIL,
  UNCONFIRMED,
  calculate,
  effectiveBurdenRate,
  exclusionById,
  exemptMessage,
  exemptReasons,
  isOnOrAfterEnforcement,
  isWithinTransition,
  pointsToYen,
  yenToPoints,
  type ExclusionId,
} from '@/lib/otc-ruijiyaku';
import {
  ITEMS,
  ITEMS_ARE_PARTIAL,
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABEL,
  ITEM_COUNT,
  TOTAL_INGREDIENTS,
  TOTAL_PRODUCTS,
  TRANSITION_CATEGORIES,
  isTransitionCategory,
  itemGroups,
  searchItems,
} from '@/lib/otc-ruijiyaku-items';

/**
 * OTC類似薬「特別の料金」計算機のテスト。
 *
 * 仕様: docs/features/otc-ruijiyaku-tokubetsu-futan.md
 *
 * 見張っているのは4つ。
 *
 * 1. **計算式**（薬剤料の1/4を全額＋残り3/4に窓口負担割合）。仕様書の例と実質負担率を固定する
 * 2. **「かかるか」の判定が金額より強いこと**。除外・経過措置・施行前は1円も増えない
 * 3. **経過措置が埋もれないこと**。もっとも検索される湿布・保湿剤で「＋175円」を出さない
 * 4. **文言**。「保険適用外」「全額自費」と書かない（ネット上の誤りを増やす側に回らないため）
 */

const AFTER = '2027-03-15';

/** 除外・経過措置に当たらない、施行後の基本形 */
function basic(points: number, copayPercent: 30 | 20 | 10 = 30) {
  return calculate({ points, copayPercent, prescribedOn: AFTER })!;
}

describe('制度の数値', () => {
  it('特別の料金は薬剤料の4分の1で、残りの4分の3に保険給付が残る', () => {
    expect(SPECIAL_CHARGE_RATIO).toBe(0.25);
    expect(INSURED_RATIO).toBe(0.75);
    expect(SPECIAL_CHARGE_RATIO + INSURED_RATIO).toBe(1);
  });

  it('実施は2027年3月、経過措置は令和10年度末（2029年3月31日）まで', () => {
    expect(ENFORCEMENT_FROM.startsWith('2027-03')).toBe(true);
    expect(TRANSITION_UNTIL).toBe('2029-03-31');
  });

  it('告示待ちの3点に印が付いている（文章に埋め込まず1か所で持つ）', () => {
    expect(UNCONFIRMED.enforcementDay).toBe(true);
    expect(UNCONFIRMED.consumptionTax).toBe(true);
    expect(UNCONFIRMED.rounding).toBe(true);
  });

  it('出典は厚生労働省のものだけで、確認日が入っている', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(4);
    for (const source of SOURCES) {
      expect(source.url.startsWith('https://www.mhlw.go.jp/')).toBe(true);
      expect(source.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(DATA_CHECKED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('実質の負担率', () => {
  it('3割は47.5%、2割は40%、1割は32.5%（仕様書の表）', () => {
    expect(effectiveBurdenRate(30)).toBeCloseTo(0.475, 10);
    expect(effectiveBurdenRate(20)).toBeCloseTo(0.4, 10);
    expect(effectiveBurdenRate(10)).toBeCloseTo(0.325, 10);
  });

  it('どの割合でも従来より重くなる（軽くなる割合は存在しない）', () => {
    for (const option of COPAY_OPTIONS) {
      expect(effectiveBurdenRate(option.value)).toBeGreaterThan(option.value / 100);
    }
  });
});

describe('点数と円の変換', () => {
  it('1点は10円', () => {
    expect(pointsToYen(1)).toBe(10);
    expect(pointsToYen(100)).toBe(1000);
  });

  it('円で入れたら10円未満を切り捨てて点数に直す', () => {
    expect(yenToPoints(1000)).toBe(100);
    expect(yenToPoints(1009)).toBe(100);
    expect(yenToPoints(9)).toBe(0);
  });

  it('負の数・数でないものは null', () => {
    expect(yenToPoints(-1)).toBeNull();
    expect(yenToPoints(Number.NaN)).toBeNull();
  });

  it('点数の小数は切り捨てる（点数は整数）', () => {
    expect(basic(100.9).points).toBe(100);
  });
});

describe('calculate（仕様書の例）', () => {
  it('薬剤料100点・3割は 300円 → 475円（＋175円）', () => {
    const r = basic(100);
    expect(r.drugCost).toBe(1000);
    expect(r.charged).toBe(true);
    expect(r.before).toBe(300);
    expect(r.specialCharge).toBe(250);
    expect(r.insuredCopay).toBe(225);
    expect(r.after).toBe(475);
    expect(r.increase).toBe(175);
  });

  it('消費税は本体と分けて持ち、合計（after）には含めない', () => {
    const r = basic(100);
    expect(r.consumptionTax).toBe(25);
    expect(r.afterWithTax).toBe(500);
    expect(r.increaseWithTax).toBe(200);
    expect(CONSUMPTION_TAX_RATE).toBe(0.1);
  });

  it('2割・1割も実質負担率どおりになる', () => {
    const two = basic(100, 20);
    expect(two.before).toBe(200);
    expect(two.after).toBe(400);
    const one = basic(100, 10);
    expect(one.before).toBe(100);
    expect(one.after).toBe(325);
  });

  it('薬剤料0点なら増えない', () => {
    const r = basic(0);
    expect(r.after).toBe(0);
    expect(r.increase).toBe(0);
  });

  it('負の点数・数でないものは null', () => {
    expect(calculate({ points: -1, copayPercent: 30, prescribedOn: AFTER })).toBeNull();
    expect(calculate({ points: Number.NaN, copayPercent: 30, prescribedOn: AFTER })).toBeNull();
  });

  it('円未満の端数は切り捨てる（薬剤料は10円単位なので2.5円が出る）', () => {
    // 25点＝250円。特別の料金 62.5円 → 62円、保険分 187.5×0.3＝56.25円 → 56円
    const r = basic(25);
    expect(r.specialCharge).toBe(62);
    expect(r.insuredCopay).toBe(56);
    expect(r.after).toBe(118);
  });

  it('年間の負担増は回数を掛けた額。回数が無ければ null', () => {
    const r = calculate({ points: 100, copayPercent: 30, prescribedOn: AFTER, timesPerYear: 12 })!;
    expect(r.yearlyIncrease).toBe(175 * 12);
    expect(r.yearlyIncreaseWithTax).toBe(200 * 12);
    expect(basic(100).yearlyIncrease).toBeNull();
  });
});

describe('かかるかどうかの判定', () => {
  it('施行日より前の処方にはかからない', () => {
    expect(isOnOrAfterEnforcement('2027-02-28')).toBe(false);
    expect(isOnOrAfterEnforcement(ENFORCEMENT_FROM)).toBe(true);
    const r = calculate({ points: 100, copayPercent: 30, prescribedOn: '2027-02-28' })!;
    expect(r.charged).toBe(false);
    expect(r.reasons[0]).toBe('before-enforcement');
    expect(r.after).toBe(r.before);
    expect(r.increase).toBe(0);
  });

  it('除外の類型に当たるとかからない（5類型すべて）', () => {
    for (const def of EXCLUSIONS) {
      const r = calculate({
        points: 100,
        copayPercent: 30,
        exclusions: [def.id],
        prescribedOn: AFTER,
      })!;
      expect(r.charged).toBe(false);
      expect(r.reasons).toContain(def.id);
      expect(r.increase).toBe(0);
      expect(r.specialCharge).toBe(0);
      expect(r.consumptionTax).toBe(0);
      expect(r.after).toBe(300);
    }
  });

  it('「低所得者」はチェックの項目に無い（中間とりまとめに独立の類型が無いため）', () => {
    expect(EXCLUSIONS.map((e) => e.id)).toEqual([
      'child',
      'kouhi',
      'admission',
      'procedure',
      'long-term',
    ]);
    for (const def of EXCLUSIONS) {
      expect(def.label).not.toMatch(/低所得/);
    }
  });

  it('除外は EXCLUSIONS の並び順で返す（チェックした順に左右されない）', () => {
    const r = calculate({
      points: 100,
      copayPercent: 30,
      exclusions: ['long-term', 'child'] as ExclusionId[],
      prescribedOn: AFTER,
    })!;
    expect(r.reasons).toEqual(['child', 'long-term']);
  });

  it('当てはまる理由をすべて返し、先頭が主たる理由（施行前 → 経過措置 → 除外）', () => {
    expect(
      exemptReasons({ transitionItem: true, exclusions: ['child'], prescribedOn: '2027-02-01' }),
    ).toEqual(['before-enforcement', 'transition', 'child']);
  });

  it('理由ごとに「かかりません」の文が出る', () => {
    expect(exemptMessage('before-enforcement')).toContain('2027年3月');
    expect(exemptMessage('transition')).toContain('2029年3月末');
    for (const def of EXCLUSIONS) {
      expect(exemptMessage(def.id)).toBe(def.reason);
    }
  });

  it('exclusionById は未知のIDに undefined を返す', () => {
    expect(exclusionById('child')?.id).toBe('child');
    expect(exclusionById('lowincome' as ExclusionId)).toBeUndefined();
  });
});

/**
 * **このツールでいちばん壊れてはいけないところ。**
 * もっとも検索される湿布・保湿剤で「＋175円」と出すと、
 * ネット上の誤りを当サイトが増やす側に回る。
 */
describe('経過措置（湿布・皮膚保湿剤）', () => {
  it('2029年3月末までは1円も増えない', () => {
    const r = calculate({
      points: 100,
      copayPercent: 30,
      transitionItem: true,
      prescribedOn: AFTER,
    })!;
    expect(r.charged).toBe(false);
    expect(r.reasons[0]).toBe('transition');
    expect(r.increase).toBe(0);
    expect(r.after).toBe(300);
  });

  it('経過措置の最終日はまだ対象外、その翌日から対象になる', () => {
    expect(isWithinTransition('2029-03-31')).toBe(true);
    expect(isWithinTransition('2029-04-01')).toBe(false);
    const last = calculate({
      points: 100,
      copayPercent: 30,
      transitionItem: true,
      prescribedOn: '2029-03-31',
    })!;
    expect(last.charged).toBe(false);
    const next = calculate({
      points: 100,
      copayPercent: 30,
      transitionItem: true,
      prescribedOn: '2029-04-01',
    })!;
    expect(next.charged).toBe(true);
    expect(next.increase).toBe(175);
  });

  it('経過措置より施行前のほうが先に立つ（2027年3月より前は制度自体が無い）', () => {
    const r = calculate({
      points: 100,
      copayPercent: 30,
      transitionItem: true,
      prescribedOn: '2026-12-01',
    })!;
    expect(r.reasons[0]).toBe('before-enforcement');
  });
});

describe('早見表（金額）', () => {
  it('全行・全割合で after が before より大きい', () => {
    expect(LOOKUP_TABLE.length).toBeGreaterThan(3);
    for (const row of LOOKUP_TABLE) {
      expect(row.drugCost).toBe(row.points * 10);
      expect(row.cells).toHaveLength(COPAY_OPTIONS.length);
      for (const cell of row.cells) {
        expect(cell.after).toBeGreaterThan(cell.before);
        expect(cell.increase).toBe(cell.after - cell.before);
      }
    }
  });

  it('100点・3割の行は本文の例と一致する', () => {
    const row = LOOKUP_TABLE.find((r) => r.points === 100)!;
    const cell = row.cells.find((c) => c.copayPercent === 30)!;
    expect([cell.before, cell.after, cell.increase]).toEqual([300, 475, 175]);
  });
});

describe('対象成分のデータ', () => {
  it('件数を77と偽らない（載せているのは一部）', () => {
    expect(TOTAL_INGREDIENTS).toBe(77);
    expect(TOTAL_PRODUCTS).toBe(1042);
    expect(ITEM_COUNT).toBe(ITEMS.length);
    // 全件を載せられていないあいだは、必ずフラグが立っていること
    expect(ITEMS_ARE_PARTIAL).toBe(ITEM_COUNT < TOTAL_INGREDIENTS);
  });

  it('idが重複しない', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });

  it('すべての成分にまとまり・言い換えがある', () => {
    for (const item of ITEMS) {
      expect(ITEM_CATEGORIES).toContain(item.category);
      expect(ITEM_CATEGORY_LABEL[item.category]).toBeTruthy();
      expect(item.keywords.length).toBeGreaterThan(0);
    }
  });

  it('成分名だけを持ち、商品名（先発品名）を載せない', () => {
    // 品目単位の一覧は薬価改定で動くので持たない、という仕様書の約束
    for (const item of ITEMS) {
      expect(item.name).not.toMatch(/錠|カプセル|mg|ｍｇ/);
    }
  });

  it('経過措置のフラグが TRANSITION_CATEGORIES と食い違わない', () => {
    for (const item of ITEMS) {
      expect(item.transition).toBe(isTransitionCategory(item.category));
    }
    expect(TRANSITION_CATEGORIES).toEqual(['shippu', 'hoshitsu']);
  });

  it('湿布と保湿剤は必ず経過措置に当たる', () => {
    const shippu = ITEMS.filter((i) => i.category === 'shippu');
    const hoshitsu = ITEMS.filter((i) => i.category === 'hoshitsu');
    expect(shippu.length).toBeGreaterThan(0);
    expect(hoshitsu.length).toBeGreaterThan(0);
    for (const item of [...shippu, ...hoshitsu]) {
      expect(item.transition).toBe(true);
    }
  });

  it('検索は成分名でも言い換えでも引ける', () => {
    expect(searchItems('ロキソプロフェン').map((i) => i.id)).toContain('loxoprofen');
    expect(searchItems('湿布').every((i) => i.transition)).toBe(true);
    expect(searchItems('花粉症').length).toBeGreaterThan(0);
    expect(searchItems('').length).toBe(ITEMS.length);
    expect(searchItems('  ')).toHaveLength(ITEMS.length);
    expect(searchItems('存在しない成分')).toHaveLength(0);
  });

  it('itemGroups は画面の並び順で、空のまとまりを返さない', () => {
    const groups = itemGroups();
    const order = groups.map((g) => g.category);
    expect(order).toEqual(ITEM_CATEGORIES.filter((c) => order.includes(c)));
    // 検索の集まる経過措置の2つが先頭に来る
    expect(order.slice(0, 2)).toEqual(['shippu', 'hoshitsu']);
    for (const group of groups) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});

/**
 * **文言の検査。**
 * 「保険適用外」「全額自費」は誤り（薬剤料の3/4には保険給付が残る）。
 * ネット上の解説にはこの誤りが多く、当サイトが同じことを書かないよう機械で見張る。
 */
describe('書き方の約束', () => {
  const files = ['../app/otc-ruijiyaku/page.tsx', '../app/otc-ruijiyaku/Calculator.tsx'].map(
    (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'),
  );

  it('「保険適用外」「保険が効かなくなる」「全額自費」と断定して書かない', () => {
    // 「〜わけではありません」と否定する形で出てくるのは正しい書き方なので、
    // 否定を伴わない断定だけを落とす
    for (const text of files) {
      for (const phrase of ['保険適用外', '保険が効かなくなる', '全額自費', '保険外し']) {
        for (const line of text.split('\n')) {
          if (!line.includes(phrase)) continue;
          expect(
            /ではありません|わけでは|ありません|書かない|取り違え/.test(line) ||
              text.includes(`${phrase}」「`),
            `「${phrase}」を断定して書いている: ${line.trim()}`,
          ).toBe(true);
        }
      }
    }
  });

  it('「市販薬に切り替えるべき」という勧め方をしない', () => {
    for (const text of files) {
      expect(text).not.toMatch(/切り替えたほうがお得|切り替えるべきです/);
    }
  });

  it('ページが robotsFor を通している（公開前は noindex）', () => {
    expect(files[0]).toContain("robotsFor('otc-ruijiyaku')");
  });
});
