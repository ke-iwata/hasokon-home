import { describe, expect, it } from 'vitest';
import {
  BASIC_FIXED,
  BASIC_PER_HEIR,
  BRACKETS,
  DISCLAIMER,
  INSURANCE_EXEMPT_PER_HEIR,
  SMALL_LAND_NOTE,
  SPOUSE_RELIEF_FLOOR,
  VERDICT_MESSAGES,
  applyFraction,
  basicDeduction,
  civilShares,
  exemptAmount,
  formatFraction,
  frac,
  hasSurcharge,
  heirCountNotes,
  legalHeirCount,
  legalHeirs,
  perHeirTax,
  taxOnShare,
  totalTax,
  yearsUntilAge,
  type Person,
  type PersonInput,
  type Relation,
} from '@/lib/sozokuzei-keisan';

/**
 * 相続税 計算機のテスト。
 *
 * 仕様: docs/features/sozokuzei-keisan.md（「テスト」の検算ケース。手計算をコメントに併記する）
 */

const DEATH = { year: 2026, month: 10, day: 15 };

let seq = 0;
const P = (relation: Relation, extra: Partial<Person> = {}): Person => ({ id: `p${++seq}`, relation, ...extra });

/** 法定相続分どおりに estate を分けた入力を作る */
function byLegalShare(people: Person[], estate: number, extra: Record<string, Partial<PersonInput>> = {}): PersonInput[] {
  const shares = civilShares(people);
  return people.map((person) => {
    const s = shares.get(person.id);
    return { person, acquired: s ? applyFraction(estate, s) : 0, ...extra[person.id] };
  });
}

describe('制度データ（No.4152・No.4155）', () => {
  it('基礎控除は 3,000 万円 ＋ 600 万円 × 法定相続人の数', () => {
    expect(BASIC_FIXED).toBe(30_000_000);
    expect(BASIC_PER_HEIR).toBe(6_000_000);
    expect(basicDeduction(3)).toBe(48_000_000);
  });

  it('速算表は 8 段・最高 55%', () => {
    expect(BRACKETS).toHaveLength(8);
    expect(BRACKETS.at(-1)).toEqual({ upTo: Infinity, rate: 0.55, deduction: 72_000_000 });
  });

  it('速算表の境界（1,000 万円ちょうど・6 億円ちょうど）', () => {
    expect(taxOnShare(10_000_000)).toBe(1_000_000); // 10%
    expect(taxOnShare(10_001_000)).toBe(1_000_150); // 15% − 50 万
    expect(taxOnShare(600_000_000)).toBe(258_000_000); // 50% − 4,200 万
    expect(taxOnShare(600_001_000)).toBe(258_000_550); // 55% − 7,200 万
    expect(taxOnShare(0)).toBe(0);
  });
});

describe('検算 1：遺産 1 億円・配偶者＋子 2 人・法定相続分どおり', () => {
  const spouse = P('spouse');
  const c1 = P('child');
  const c2 = P('child');
  const people = [spouse, c1, c2];
  const r = perHeirTax({ people, inputs: byLegalShare(people, 100_000_000), inheritanceDate: DEATH })!;

  it('基礎控除 4,800 万円・課税遺産総額 5,200 万円・総額 630 万円', () => {
    expect(r.basic).toBe(48_000_000);
    expect(r.total.taxableEstate).toBe(52_000_000);
    // 配偶者 2,600 万 × 15% − 50 万 ＝ 340 万、子 1,300 万 × 15% − 50 万 ＝ 145 万 × 2
    expect(r.total.rows.map((x) => x.tax)).toEqual([3_400_000, 1_450_000, 1_450_000]);
    expect(r.total.total).toBe(6_300_000);
  });

  it('配偶者は軽減で 0 円、子は各 1,575,000 円', () => {
    const [s, a, b] = r.acquirers;
    expect(s.allocated).toBe(3_150_000);
    expect(s.spouseRelief).toBe(3_150_000);
    expect(s.payable).toBe(0);
    expect(a.payable).toBe(1_575_000);
    expect(b.payable).toBe(1_575_000);
    expect(r.verdict).toBe('tax');
  });
});

describe('検算 2：遺産 4,800 万円・配偶者＋子 2 人', () => {
  it('基礎控除ちょうど → かからない（小規模宅地等の注記の文言も確かめる）', () => {
    const people = [P('spouse'), P('child'), P('child')];
    const r = perHeirTax({ people, inputs: byLegalShare(people, 48_000_000), inheritanceDate: DEATH })!;
    expect(r.taxableTotal).toBe(48_000_000);
    expect(r.verdict).toBe('below-basic');
    expect(r.payableTotal).toBe(0);
    expect(VERDICT_MESSAGES['below-basic']).toBe('相続税はかかりません。');
    expect(SMALL_LAND_NOTE).toContain('小規模宅地等の特例');
    expect(SMALL_LAND_NOTE).toContain('申告が必要');
  });

  it('1,000 円でも超えれば「かかる」側（千円未満は切り捨ててから比べる）', () => {
    const people = [P('spouse'), P('child'), P('child')];
    const below = perHeirTax({ people, inputs: byLegalShare(people, 48_000_999), inheritanceDate: DEATH })!;
    expect(below.verdict).toBe('below-basic');
  });
});

describe('検算 3：実子 1 人＋養子 3 人', () => {
  it('法定相続人は 2 人（養子は 1 人まで）・基礎控除 4,200 万円', () => {
    const people = [P('child'), P('adopted'), P('adopted'), P('adopted')];
    const h = legalHeirs(people);
    expect(h.count).toBe(2);
    expect(basicDeduction(h.count)).toBe(42_000_000);
    // 総額は数えた 2 人で民法 900 条を当てる（相続税法 16 条）
    expect(h.shares.map(formatFraction)).toEqual(['1/2', '1/2']);
    expect(heirCountNotes(h)).toEqual(['養子3人のうち1人を数えました（実子がいるため1人まで）']);
  });

  it('実際の分け方（民法）では養子も 1/4 ずつ', () => {
    const people = [P('child'), P('adopted'), P('adopted'), P('adopted')];
    expect([...civilShares(people).values()].map(formatFraction)).toEqual(['1/4', '1/4', '1/4', '1/4']);
  });

  it('実子がいなければ 2 人まで、養子 1 人なら 1 人', () => {
    expect(legalHeirCount([P('adopted'), P('adopted'), P('adopted')])).toBe(2);
    expect(legalHeirCount([P('adopted')])).toBe(1);
  });
});

describe('「実子として数える養子」（No.4170 の 3・相続税法 15 条 3 項）', () => {
  it('実子 0・養子 3 のうち特別養子 2 → 法定相続人 3 人。入力しなければ 2 人（基礎控除が 600 万円違う）', () => {
    const withFlag = [P('adopted-as-real'), P('adopted-as-real'), P('adopted')];
    const without = [P('adopted'), P('adopted'), P('adopted')];
    expect(legalHeirCount(withFlag)).toBe(3);
    expect(legalHeirCount(without)).toBe(2);
    expect(basicDeduction(legalHeirCount(withFlag)) - basicDeduction(legalHeirCount(without))).toBe(6_000_000);
  });

  it('代襲の孫は実子として数え、養子の上限は 1 人になる', () => {
    const h = legalHeirs([P('grandchild', { branch: 1 }), P('grandchild', { branch: 1 }), P('adopted'), P('adopted')]);
    expect(h.hasRealChild).toBe(true);
    expect(h.count).toBe(3);
  });

  it('代襲の孫は亡くなった子 1 人分を頭数で分ける', () => {
    const people = [P('spouse'), P('child'), P('grandchild', { branch: 1 }), P('grandchild', { branch: 1 })];
    expect([...civilShares(people).values()].map(formatFraction).sort()).toEqual(['1/2', '1/4', '1/8', '1/8'].sort());
  });
});

describe('検算 4：2 つの集合がずれる例（子 2 人が全員放棄し、父母が取得）', () => {
  const c1 = P('child', { renounced: true });
  const c2 = P('child', { renounced: true });
  const f = P('parent');
  const m = P('parent');
  const people = [c1, c2, f, m];
  const r = perHeirTax({ people, inputs: byLegalShare(people, 100_000_000), inheritanceDate: DEATH })!;

  it('総額は子 2 人の法定相続分で出す：法定相続人 2 人・基礎控除 4,200 万円・総額 770 万円', () => {
    expect(r.heirs.count).toBe(2);
    expect(r.basic).toBe(42_000_000);
    expect(r.total.taxableEstate).toBe(58_000_000);
    // 2,900 万円 × 15% − 50 万 ＝ 385 万円 × 2
    expect(r.total.total).toBe(7_700_000);
    expect(heirCountNotes(r.heirs)).toEqual(['放棄した2人も数えました（放棄がなかったものとして数えます）']);
  });

  it('取得するのは父母で各 385 万円。一親等の血族なので 2 割加算はかからない', () => {
    expect(r.acquirers.map((a) => a.person.id)).toEqual([f.id, m.id]);
    for (const a of r.acquirers) {
      expect(a.surcharge).toBe(0);
      expect(a.payable).toBe(3_850_000);
      // 父母は「放棄がなかったものとした相続人」ではない
      expect(a.isLegalHeir).toBe(false);
    }
  });
});

describe('検算 5：兄弟姉妹（全血 1・半血 1）のみ', () => {
  it('法定相続分 2/3・1/3、全員に 2 割加算', () => {
    const full = P('sibling');
    const half = P('half-sibling');
    const people = [full, half];
    expect([...civilShares(people).values()].map(formatFraction)).toEqual(['2/3', '1/3']);
    const r = perHeirTax({ people, inputs: byLegalShare(people, 90_000_000), inheritanceDate: DEATH })!;
    // 基礎控除 4,200 万円、課税遺産総額 4,800 万円 → 3,200 万円（20% − 200 万 ＝ 440 万）＋ 1,600 万円（15% − 50 万 ＝ 190 万）＝ 630 万円
    expect(r.total.total).toBe(6_300_000);
    const [a, b] = r.acquirers;
    // 課税価格 6,000 万円・3,000 万円 → 按分 420 万円・210 万円 → 2 割加算 84 万円・42 万円
    expect(a.allocated).toBe(4_200_000);
    expect(a.surcharge).toBe(840_000);
    expect(a.payable).toBe(5_040_000);
    expect(b.surcharge).toBe(420_000);
    expect(b.payable).toBe(2_520_000);
  });

  it('配偶者と兄弟姉妹なら 3/4・1/4', () => {
    const people = [P('spouse'), P('sibling'), P('sibling')];
    expect([...civilShares(people).values()].map(formatFraction).sort()).toEqual(['1/8', '1/8', '3/4'].sort());
  });

  it('配偶者と父母なら 2/3・1/3', () => {
    const people = [P('spouse'), P('parent'), P('parent')];
    expect(legalHeirs(people).spouseShare).toEqual(frac(2, 3));
  });
});

describe('検算 6：未成年者控除（No.4164 の例）', () => {
  it('15 歳 9 か月なら 18 歳まで 3 年 → 30 万円', () => {
    const birth = { year: 2011, month: 1, day: 15 }; // 2026-10-15 時点で 15 歳 9 か月
    expect(yearsUntilAge(birth, DEATH, 18)).toBe(3);
  });

  it('ちょうど 15 歳なら 3 年、18 歳以上は 0', () => {
    expect(yearsUntilAge({ year: 2011, month: 10, day: 15 }, DEATH, 18)).toBe(3);
    expect(yearsUntilAge({ year: 2008, month: 10, day: 15 }, DEATH, 18)).toBe(0);
  });

  it('税額から引き、引ききれない額を返す（扶養義務者への振替はしない）', () => {
    const spouse = P('spouse');
    const kid = P('child');
    const people = [spouse, kid];
    const r = perHeirTax({
      people,
      inputs: byLegalShare(people, 60_000_000, { [kid.id]: { birth: { year: 2011, month: 1, day: 15 } } }),
      inheritanceDate: DEATH,
    })!;
    // 基礎控除 4,200 万、課税遺産総額 1,800 万 → 900 万 × 10% ＝ 90 万 × 2 ＝ 180 万。子の按分 90 万 − 30 万 ＝ 60 万
    const k = r.acquirers.find((a) => a.person.id === kid.id)!;
    expect(k.allocated).toBe(900_000);
    expect(k.minorCredit).toBe(300_000);
    expect(k.payable).toBe(600_000);

    const r2 = perHeirTax({
      people,
      inputs: byLegalShare(people, 44_000_000, { [kid.id]: { birth: { year: 2026, month: 1, day: 1 } } }),
      inheritanceDate: DEATH,
    })!;
    // 課税遺産総額 200 万 → 100 万 × 10% ＝ 10 万 × 2。0 歳の子は 18 年 × 10 万 ＝ 180 万 → 10 万だけ引けて 170 万が残る
    const k2 = r2.acquirers.find((a) => a.person.id === kid.id)!;
    expect(k2.minorCredit).toBe(100_000);
    expect(k2.minorUnused).toBe(1_700_000);
    expect(k2.payable).toBe(0);
  });

  it('障害者控除は 85 歳まで・特別は 20 万円／年', () => {
    const p = P('child');
    const people = [p];
    const r = perHeirTax({
      people,
      inputs: [{ person: p, acquired: 100_000_000, birth: { year: 1976, month: 10, day: 15 }, disability: 'special' }],
      inheritanceDate: DEATH,
    })!;
    // 50 歳 → 35 年 × 20 万 ＝ 700 万。総額：6,400 万 → 30% − 700 万 ＝ 1,220 万 → 520 万
    expect(r.acquirers[0].disabledCredit).toBe(7_000_000);
    expect(r.acquirers[0].payable).toBe(5_200_000);
  });
});

describe('検算 7：配偶者が法定相続分と 1.6 億円を超えて取得し、一部課税になる例', () => {
  it('遺産 4 億円・配偶者 3 億円・子 1 億円 → 配偶者の納付 2,730 万円・子 2,730 万円', () => {
    const spouse = P('spouse');
    const kid = P('child');
    const r = perHeirTax({
      people: [spouse, kid],
      inputs: [
        { person: spouse, acquired: 300_000_000 },
        { person: kid, acquired: 100_000_000 },
      ],
      inheritanceDate: DEATH,
    })!;
    // 基礎控除 4,200 万、課税遺産総額 3 億 5,800 万 → 1 億 7,900 万 × 40% − 1,700 万 ＝ 5,460 万 × 2
    expect(r.basic).toBe(42_000_000);
    expect(r.total.total).toBe(109_200_000);
    const [s, k] = r.acquirers;
    expect(s.allocated).toBe(81_900_000);
    expect(k.allocated).toBe(27_300_000);
    // 1 億 920 万 × min(3 億, max(4 億 × 1/2, 1.6 億)) ÷ 4 億 ＝ 5,460 万
    expect(s.spouseRelief).toBe(54_600_000);
    expect(s.payable).toBe(27_300_000);
    expect(k.payable).toBe(27_300_000);
  });

  it('1.6 億円以下の取得なら配偶者は 0 円 → 全員 0 なら「申告が必要」の文面', () => {
    const spouse = P('spouse');
    const r = perHeirTax({
      people: [spouse],
      inputs: [{ person: spouse, acquired: 150_000_000 }],
      inheritanceDate: DEATH,
    })!;
    expect(SPOUSE_RELIEF_FLOOR).toBe(160_000_000);
    expect(r.total.total).toBeGreaterThan(0);
    expect(r.payableTotal).toBe(0);
    expect(r.verdict).toBe('zero-by-spouse-relief');
    expect(VERDICT_MESSAGES['zero-by-spouse-relief']).toContain('申告が必要');
  });
});

describe('死亡保険金の非課税枠（No.4114）', () => {
  it('相続人 2 人が 600 万円・400 万円を受け取り、枠 1,500 万円（相続人 3 人）なら全額非課税', () => {
    const m = exemptAmount(
      [
        { id: 'a', amount: 6_000_000, eligible: true },
        { id: 'b', amount: 4_000_000, eligible: true },
      ],
      3,
    );
    expect(m.get('a')).toBe(6_000_000);
    expect(m.get('b')).toBe(4_000_000);
  });

  it('枠を超えたら受取額で按分', () => {
    const m = exemptAmount(
      [
        { id: 'a', amount: 30_000_000, eligible: true },
        { id: 'b', amount: 10_000_000, eligible: true },
      ],
      2,
    );
    // 枠 1,000 万円 × 3/4・1/4
    expect(m.get('a')).toBe(7_500_000);
    expect(m.get('b')).toBe(2_500_000);
    expect(INSURANCE_EXEMPT_PER_HEIR).toBe(5_000_000);
  });

  it('放棄した人の受取保険金には枠が付かない（法定相続人の数には入る）', () => {
    const spouse = P('spouse');
    const kid = P('child', { renounced: true });
    const people = [spouse, kid];
    const r = perHeirTax({
      people,
      inputs: [
        { person: spouse, acquired: 80_000_000 },
        { person: kid, acquired: 0, insurance: 10_000_000 },
      ],
      inheritanceDate: DEATH,
    })!;
    expect(r.heirs.count).toBe(2);
    const k = r.acquirers.find((a) => a.person.id === kid.id)!;
    expect(k.insuranceExempt).toBe(0);
    expect(k.taxable).toBe(10_000_000);
    // 放棄しても一親等の血族なので 2 割加算はかからない
    expect(k.surcharge).toBe(0);
  });

  it('死亡退職金は保険金と別枠', () => {
    const p = P('child');
    const r = perHeirTax({
      people: [p],
      inputs: [{ person: p, acquired: 30_000_000, insurance: 5_000_000, retirement: 5_000_000 }],
      inheritanceDate: DEATH,
    })!;
    expect(r.acquirers[0].insuranceExempt).toBe(5_000_000);
    expect(r.acquirers[0].retirementExempt).toBe(5_000_000);
    expect(r.taxableTotal).toBe(30_000_000);
  });
});

describe('2 割加算（No.4157・相続税法 18 条）', () => {
  it('孫養子は代襲でない限り対象、代襲の孫・父母・養子は対象外', () => {
    expect(hasSurcharge('adopted-grandchild')).toBe(true);
    expect(hasSurcharge('sibling')).toBe(true);
    expect(hasSurcharge('half-sibling')).toBe(true);
    expect(hasSurcharge('grandchild')).toBe(false);
    expect(hasSurcharge('parent')).toBe(false);
    expect(hasSurcharge('adopted')).toBe(false);
    expect(hasSurcharge('spouse')).toBe(false);
  });
});

describe('分数の法定相続分と千円未満切捨て', () => {
  it('1/3 を小数にせず、各人ごとに千円未満を切り捨てる', () => {
    // 子 3 人・課税遺産総額 1,000 万円 → 3,333,333 円 → 3,333,000 円 × 3
    const h = legalHeirs([P('child'), P('child'), P('child')]);
    const t = totalTax(basicDeduction(3) + 10_000_000, h);
    expect(t.rows.map((r) => r.amount)).toEqual([3_333_000, 3_333_000, 3_333_000]);
    expect(t.total).toBe(333_300 * 3);
  });

  it('加算する生前贈与は課税価格に足し、その贈与税額を控除する', () => {
    const p = P('child');
    const r = perHeirTax({
      people: [p],
      inputs: [{ person: p, acquired: 60_000_000, addedGifts: 4_000_000, giftTaxPaid: 300_000 }],
      inheritanceDate: DEATH,
    })!;
    // 課税価格 6,400 万 − 基礎控除 3,600 万 ＝ 2,800 万 → 15% − 50 万 ＝ 370 万 − 30 万 ＝ 340 万
    expect(r.taxableTotal).toBe(64_000_000);
    expect(r.acquirers[0].giftCredit).toBe(300_000);
    expect(r.acquirers[0].payable).toBe(3_400_000);
  });
});

describe('相続人がいない・文言', () => {
  it('法定相続人が 0 人なら null（対象外）', () => {
    expect(perHeirTax({ people: [], inputs: [], inheritanceDate: DEATH })).toBeNull();
  });

  it('免責は省略しない', () => {
    expect(DISCLAIMER).toBe('概算です。財産の評価や特例の適用は、税理士または税務署に確認してください。');
  });
});
