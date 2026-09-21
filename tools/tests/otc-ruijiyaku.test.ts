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
  TRANSITION_NOTE,
  TRANSITION_UNTIL,
  UNCONFIRMED,
  calculate,
  effectiveBurdenRate,
  effectiveBurdenRateWithTax,
  exclusionById,
  exemptMessage,
  exemptReasons,
  isEnforcementDayUncertain,
  isOnOrAfterEnforcement,
  isWithinTransition,
  parseAmountInput,
  pointsToYen,
  yenToPoints,
  type ExclusionId,
} from '@/lib/otc-ruijiyaku';
import {
  ITEMS,
  ITEMS_CHECKED_AT,
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABEL,
  ITEM_COUNT,
  TOTAL_INGREDIENTS,
  TOTAL_PRODUCTS,
  TRANSITION_NAMED_USES,
  isTransitionNamed,
  itemGroups,
  searchItems,
} from '@/lib/otc-ruijiyaku-items';
import { tools } from '@/lib/registry';

/**
 * OTC類似薬「特別の料金」計算機のテスト。
 *
 * 仕様: docs/features/otc-ruijiyaku-tokubetsu-futan.md
 *
 * 見張っているのは5つ。
 *
 * 1. **計算式**（薬剤料の1/4を全額＋消費税＋残り3/4に窓口負担割合）
 * 2. **消費税を合計に含めること**。原典に「かかっている」と明記がある以上、
 *    外して出すと窓口の額を実際より安く見せることになる
 * 3. **「かかるか」の判定が金額より強いこと**。除外・経過措置・施行前は1円も増えない
 * 4. **成分一覧が原典の77件と一致すること**、かつ商品名を持たないこと
 * 5. **文言**。「保険適用外」と書かない・「PDFは画像」のような事実と違う説明を残さない
 */

const AFTER = '2027-04-15';

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

  /**
   * **消費税は UNCONFIRMED に置かない。**
   * 原典（第213回 資料1・3頁）に「※選定療養に係る『特別の料金』には別途消費税が
   * かかっている。」と明記があり、「確認できていない」と書くのは事実と違う。
   */
  it('告示待ちは施行日の日・端数処理・経過措置の範囲の3点で、消費税は含まない', () => {
    expect(Object.keys(UNCONFIRMED).sort()).toEqual([
      'enforcementDay',
      'rounding',
      'transitionScope',
    ]);
    expect(UNCONFIRMED).not.toHaveProperty('consumptionTax');
  });

  it('経過措置の読みが分かれることを1か所で持っている', () => {
    expect(TRANSITION_NOTE).toMatch(/経過措置/);
    expect(TRANSITION_NOTE.length).toBeGreaterThan(40);
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
  it('消費税を除くと3割は47.5%、2割は40%、1割は32.5%', () => {
    expect(effectiveBurdenRate(30)).toBeCloseTo(0.475, 10);
    expect(effectiveBurdenRate(20)).toBeCloseTo(0.4, 10);
    expect(effectiveBurdenRate(10)).toBeCloseTo(0.325, 10);
  });

  it('消費税を含めると3割は50%、2割は42.5%、1割は35%', () => {
    expect(effectiveBurdenRateWithTax(30)).toBeCloseTo(0.5, 10);
    expect(effectiveBurdenRateWithTax(20)).toBeCloseTo(0.425, 10);
    expect(effectiveBurdenRateWithTax(10)).toBeCloseTo(0.35, 10);
  });

  it('どの割合でも従来より重くなる（軽くなる割合は存在しない）', () => {
    for (const option of COPAY_OPTIONS) {
      expect(effectiveBurdenRateWithTax(option.value)).toBeGreaterThan(option.value / 100);
    }
  });

  /**
   * 原典19頁「医療用医薬品の自己負担額のイメージ（3割負担の場合）」の
   * 去痰薬 360円→570円・抗アレルギー薬 540円→855円 は、ちょうど 1.58333 倍。
   * 厚労省の試算表が**消費税を含めない 47.5%** で作られていることの裏づけで、
   * このツールが税抜の額も併せて持つ根拠になっている。
   */
  it('原典19頁の試算表（税抜47.5%）と突き合わせられる', () => {
    expect(360 * (effectiveBurdenRate(30) / 0.3)).toBeCloseTo(570, 6);
    expect(540 * (effectiveBurdenRate(30) / 0.3)).toBeCloseTo(855, 6);
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

  /**
   * `Number('')` は `0` なので、素通りさせると入力欄が空のときに
   * 「かかります ＋0円」まで出てしまう（#240 のレビュー指摘）。
   */
  it('空欄・空白だけの入力は NaN にして、結果を出さない', () => {
    for (const text of ['', ' ', '\u3000', '  \u3000 ']) {
      expect(parseAmountInput(text), `「${text}」`).toBeNaN();
      expect(
        calculate({ points: parseAmountInput(text), copayPercent: 30, prescribedOn: AFTER }),
      ).toBeNull();
    }
  });

  it('桁区切りと全角空白は取り除いて読む', () => {
    expect(parseAmountInput('1,000')).toBe(1000);
    expect(parseAmountInput(' 100 ')).toBe(100);
    expect(parseAmountInput('あ')).toBeNaN();
  });

  it('円モードで空欄のときも結果を出さない', () => {
    expect(yenToPoints(parseAmountInput(''))).toBeNull();
  });
});

describe('calculate（仕様書の例）', () => {
  it('薬剤料100点・3割は 300円 → 500円（消費税込み・＋200円）', () => {
    const r = basic(100);
    expect(r.drugCost).toBe(1000);
    expect(r.charged).toBe(true);
    expect(r.before).toBe(300);
    expect(r.specialCharge).toBe(250);
    expect(r.consumptionTax).toBe(25);
    expect(r.insuredCopay).toBe(225);
    expect(r.afterWithTax).toBe(500);
    expect(r.increaseWithTax).toBe(200);
  });

  it('消費税を除いた額も持つ（原典の試算表と突き合わせるため）', () => {
    const r = basic(100);
    expect(r.after).toBe(475);
    expect(r.increase).toBe(175);
    expect(CONSUMPTION_TAX_RATE).toBe(0.1);
  });

  it('2割・1割も実質負担率どおりになる', () => {
    const two = basic(100, 20);
    expect(two.before).toBe(200);
    expect(two.afterWithTax).toBe(425);
    const one = basic(100, 10);
    expect(one.before).toBe(100);
    expect(one.afterWithTax).toBe(350);
  });

  it('薬剤料0点なら増えない', () => {
    const r = basic(0);
    expect(r.afterWithTax).toBe(0);
    expect(r.increaseWithTax).toBe(0);
  });

  it('負の点数・数でないものは null', () => {
    expect(calculate({ points: -1, copayPercent: 30, prescribedOn: AFTER })).toBeNull();
    expect(calculate({ points: Number.NaN, copayPercent: 30, prescribedOn: AFTER })).toBeNull();
  });

  it('円未満の端数は四捨五入する（薬剤料は10円単位なので2.5円が出る）', () => {
    // 25点＝250円。特別の料金 62.5円 → 63円、消費税 6.25円 → 6円、
    // 保険分 187.5×0.3＝56.25円 → 56円
    const r = basic(25);
    expect(r.specialCharge).toBe(63);
    expect(r.consumptionTax).toBe(6);
    expect(r.insuredCopay).toBe(56);
    expect(r.afterWithTax).toBe(125);
  });

  it('年間の負担増は回数を掛けた額。回数が無ければ null', () => {
    const r = calculate({ points: 100, copayPercent: 30, prescribedOn: AFTER, timesPerYear: 12 })!;
    expect(r.yearlyIncreaseWithTax).toBe(200 * 12);
    expect(r.yearlyIncrease).toBe(175 * 12);
    expect(basic(100).yearlyIncreaseWithTax).toBeNull();
  });
});

describe('かかるかどうかの判定', () => {
  it('施行日より前の処方にはかからない', () => {
    expect(isOnOrAfterEnforcement('2027-02-28')).toBe(false);
    expect(isOnOrAfterEnforcement(ENFORCEMENT_FROM)).toBe(true);
    const r = calculate({ points: 100, copayPercent: 30, prescribedOn: '2027-02-28' })!;
    expect(r.charged).toBe(false);
    expect(r.reasons[0]).toBe('before-enforcement');
    expect(r.afterWithTax).toBe(r.before);
    expect(r.increaseWithTax).toBe(0);
  });

  /**
   * **施行日の「日」は決まっていない。**
   * 2027年3月中の日付では、告示しだいで答えが変わるので断定しない。
   */
  it('2027年3月中の日付は「断定できない」の印が立つ', () => {
    expect(isEnforcementDayUncertain('2027-03-01')).toBe(true);
    expect(isEnforcementDayUncertain('2027-03-31')).toBe(true);
    expect(isEnforcementDayUncertain('2027-02-28')).toBe(false);
    expect(isEnforcementDayUncertain('2027-04-01')).toBe(false);
    expect(basic(100).enforcementDayUncertain).toBe(false);
    const march = calculate({ points: 100, copayPercent: 30, prescribedOn: '2027-03-15' })!;
    expect(march.charged).toBe(true);
    expect(march.enforcementDayUncertain).toBe(true);
  });

  it('かからないと分かっている日には、断定できないの印を立てない', () => {
    const before = calculate({ points: 100, copayPercent: 30, prescribedOn: '2027-02-01' })!;
    expect(before.enforcementDayUncertain).toBe(false);
  });

  it('除外の類型に当たるとかからない（全類型）', () => {
    for (const def of EXCLUSIONS) {
      const r = calculate({
        points: 100,
        copayPercent: 30,
        exclusions: [def.id],
        prescribedOn: AFTER,
      })!;
      expect(r.charged).toBe(false);
      expect(r.reasons).toContain(def.id);
      expect(r.increaseWithTax).toBe(0);
      expect(r.specialCharge).toBe(0);
      expect(r.consumptionTax).toBe(0);
      expect(r.afterWithTax).toBe(300);
    }
  });

  /**
   * 当初は5類型しか持っておらず、原典にある
   * 生活保護受給者・妊婦等・効能効果の違い・がん／難病の切り分けが抜けていた。
   */
  it('原典の類型をすべて持っている（生活保護・妊婦・効能効果を落とさない）', () => {
    expect(EXCLUSIONS.map((e) => e.id)).toEqual([
      'kounou',
      'child',
      'cancer',
      'nanbyo',
      'kouhi',
      'seikatsuhogo',
      'admission',
      'procedure',
      'long-term',
      'pregnancy',
    ]);
  });

  it('「低所得者」は生活保護受給者として持ち、範囲が広がりうることを書いている', () => {
    const def = exclusionById('seikatsuhogo')!;
    expect(def.label).toMatch(/生活保護/);
    expect(def.note).toMatch(/広がる可能性/);
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
 * もっとも検索される湿布・保湿剤で金額を出すと、
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
    expect(r.increaseWithTax).toBe(0);
    expect(r.afterWithTax).toBe(300);
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
    expect(next.increaseWithTax).toBe(200);
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
        expect(cell.afterWithTax).toBeGreaterThan(cell.before);
        expect(cell.increaseWithTax).toBe(cell.afterWithTax - cell.before);
      }
    }
  });

  it('100点・3割の行は本文の例と一致する（消費税込み）', () => {
    const row = LOOKUP_TABLE.find((r) => r.points === 100)!;
    const cell = row.cells.find((c) => c.copayPercent === 30)!;
    expect([cell.before, cell.afterWithTax, cell.increaseWithTax]).toEqual([300, 500, 200]);
  });
});

describe('対象成分のデータ', () => {
  /**
   * 当初は「厚労省のPDFが画像で成分名を取り出せない」として13成分しか
   * 載せていなかったが、PDFにはテキスト層があり全件を写せた。
   */
  it('原典の77成分すべてが入っている', () => {
    expect(TOTAL_INGREDIENTS).toBe(77);
    expect(TOTAL_PRODUCTS).toBe(1042);
    expect(ITEM_COUNT).toBe(TOTAL_INGREDIENTS);
    expect(ITEMS_CHECKED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('No が1〜77の通し番号になっている（写し漏れ・重複を落とす）', () => {
    expect(ITEMS.map((i) => i.no)).toEqual(
      Array.from({ length: TOTAL_INGREDIENTS }, (_, i) => i + 1),
    );
  });

  it('原典の表のとおりの成分名が入っている（抜き取りで突き合わせ）', () => {
    const byNo = new Map(ITEMS.map((i) => [i.no, i]));
    expect(byNo.get(1)!.name).toBe('アシクロビル');
    expect(byNo.get(7)!).toMatchObject({ name: 'イトプリド塩酸塩', use: '胃薬' });
    expect(byNo.get(30)!).toMatchObject({ name: '酸化マグネシウム', use: '制酸・緩下剤' });
    expect(byNo.get(62)!).toMatchObject({ name: 'ヘパリン類似物質', use: '血行促進・皮膚保湿剤' });
    expect(byNo.get(75)!).toMatchObject({ name: 'ラメルテオン', use: '睡眠導入剤' });
    expect(byNo.get(76)!.name).toBe('ロキソプロフェンナトリウム水和物');
    expect(byNo.get(77)!).toMatchObject({ name: 'ロラタジン', use: '抗アレルギー薬' });
  });

  it('すべての成分に用途・まとまり・言い換えがある', () => {
    for (const item of ITEMS) {
      expect(item.use).not.toBe('');
      expect(ITEM_CATEGORIES).toContain(item.category);
      expect(ITEM_CATEGORY_LABEL[item.category]).toBeTruthy();
      expect(item.keywords.length).toBeGreaterThan(0);
    }
  });

  /**
   * ファイル冒頭が「品目名（商品名）は載せない」と宣言している。
   * `name` だけでなく `keywords` も見ないと、画面に出ないところで宣言が形骸化する。
   */
  it('成分名にも検索語にも商品名（先発品名）を入れない', () => {
    const brands = ['ロキソニン', 'マグミット', 'ムコダイン', 'ヒルドイド', 'ボルタレン', 'アレグラ'];
    for (const item of ITEMS) {
      for (const text of [item.name, ...item.keywords]) {
        for (const brand of brands) {
          expect(text, `${item.name} に商品名「${brand}」が入っている`).not.toContain(brand);
        }
      }
      expect(item.name).not.toMatch(/錠|カプセル|mg|ｍｇ/);
    }
  });

  /**
   * 経過措置は薬効分類で書かれていて、成分一覧の「用途」の列とは粒度が違う。
   * **推測で広げない**ことを固定する（原典の語と一致するものだけ）。
   */
  it('経過措置の印は、原典の薬効分類と文字列が一致するものだけに付く', () => {
    expect(TRANSITION_NAMED_USES).toEqual(['鎮痛消炎剤', '皮膚保護剤', '血行促進・皮膚保湿剤']);
    for (const item of ITEMS) {
      expect(isTransitionNamed(item)).toBe(TRANSITION_NAMED_USES.includes(item.use));
    }
    const named = ITEMS.filter(isTransitionNamed);
    expect(named.map((i) => i.no)).toEqual([10, 18, 27, 28, 29, 62]);
  });

  it('内服と外用の両方がある成分には経過措置の印を付けない（用途から判別できないため）', () => {
    for (const no of [8, 33, 53, 76]) {
      expect(isTransitionNamed(ITEMS.find((i) => i.no === no)!)).toBe(false);
    }
  });

  it('検索は成分名でも用途でも言い換えでも引ける', () => {
    expect(searchItems('ロキソプロフェン').map((i) => i.no)).toContain(76);
    expect(searchItems('抗真菌薬').length).toBeGreaterThan(3);
    expect(searchItems('花粉症').length).toBeGreaterThan(0);
    expect(searchItems('水虫').length).toBeGreaterThan(0);
    expect(searchItems('').length).toBe(ITEMS.length);
    expect(searchItems('  ')).toHaveLength(ITEMS.length);
    expect(searchItems('存在しない成分')).toHaveLength(0);
  });

  it('itemGroups は画面の並び順で、空のまとまりを返さない', () => {
    const groups = itemGroups();
    const order = groups.map((g) => g.category);
    expect(order).toEqual(ITEM_CATEGORIES.filter((c) => order.includes(c)));
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(ITEM_COUNT);
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
  const paths = ['../app/otc-ruijiyaku/page.tsx', '../app/otc-ruijiyaku/Calculator.tsx'];
  const files = paths.map((rel) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'),
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

  /**
   * 「消費税は告示で確認できていない」「PDFは画像」は、どちらも原典を読めば
   * 事実と違う。いったん書いた誤りが残らないよう固定しておく。
   */
  it('原典に答えのあることを「確認できていない」と書かない', () => {
    for (const text of files) {
      expect(text).not.toMatch(/消費税[^。]{0,40}確認できていない/);
      expect(text).not.toMatch(/PDF[^。]{0,30}画像/);
      expect(text).not.toMatch(/低所得者[^。]{0,30}独立して出てきません/);
    }
  });

  it('入力の読み取りを lib に置いている（空欄の素通りを防ぐ）', () => {
    expect(files[1]).toContain('parseAmountInput');
    expect(files[1]).not.toMatch(/Number\(\s*points\./);
  });

  it('消費税を含んだ額を窓口の額として出している', () => {
    expect(files[1]).toContain('result.afterWithTax');
    expect(files[1]).toContain('result.increaseWithTax');
  });

  /**
   * `useState(() => new Date())` の初期化関数はハイドレーション時にも走るので、
   * 静的書き出しではデプロイ日と閲覧日がずれた瞬間に React のエラーになる。
   * ビルド日を props で受ける作法に揃っていることを見張る。
   */
  it('日付の既定値をクライアントの new Date() から作らない', () => {
    expect(files[1]).toContain('buildDate');
    expect(files[1]).not.toMatch(/useState\(\(\)\s*=>\s*toIsoDate\(new Date\(\)\)\)/);
    expect(files[0]).toContain('buildDate={buildDate}');
  });

  it('ページが robotsFor を通している（公開前は noindex）', () => {
    expect(files[0]).toContain("robotsFor('otc-ruijiyaku')");
  });
});

/**
 * 公開したあとに「一部しか載っていない一覧」が出ないようにする歯止め。
 * いまは全77件が入っているので素通りするが、将来誰かが `ITEMS` を削っても
 * `public` のままにはできない。
 */
describe('公開の歯止め', () => {
  it('成分一覧が原典の件数に満たないまま public にできない', () => {
    const entry = tools.find((t) => t.slug === 'otc-ruijiyaku')!;
    if (entry.stage === 'public') {
      expect(ITEM_COUNT).toBe(TOTAL_INGREDIENTS);
    }
    expect(['wip', 'preview', 'public']).toContain(entry.stage);
  });
});
