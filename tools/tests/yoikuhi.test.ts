import { describe, expect, it } from 'vitest';
import {
  BASIC_INCOME_RATES,
  CHILD_AGE_LABELS,
  INCOME_KIND_LABELS,
  INCOME_LIMIT,
  LAW_EFFECTIVE_DATE,
  LIEN_CAP_PER_CHILD,
  LIVING_COST_INDEX,
  MAX_CHILDREN,
  OBLIGEE_TABLE_AXIS_LIMIT,
  STATUTORY_SUPPORT_END_AGE,
  STATUTORY_SUPPORT_PER_CHILD,
  basicIncome,
  basicIncomeRate,
  calcYoikuhi,
  isStatutorySupportEligible,
  lienCap,
  statutorySupport,
  tableRangeFor,
  type ChildAgeBand,
  type IncomeKind,
  type YoikuhiAmount,
} from '@/lib/yoikuhi';

/**
 * 養育費 計算ツールのテスト。
 *
 * 仕様: docs/features/yoikuhi-keisan.md
 *
 * 一次情報は2つある。
 *
 * 1. 裁判所「平成30年度司法研究（養育費，婚姻費用の算定に関する実証的研究）」
 *    （令和元年12月23日公表）の標準算定方式と算定表（表1〜表9）
 *    https://www.courts.go.jp/toukei_siryou/siryo/H30shihou_houkoku/index.html
 * 2. 法務省民事局「養育費に関する法務省令の概要」（令和7年12月・令和7年法務省令第56号）
 *    と、パンフレット「父母の離婚後の子の養育に関するルールが改正されました」
 *    （2026年1月改訂）
 *
 * このツールは算定表の値を持たず**方式を実装している**ので、表とずれていないことを
 * 機械で確かめる必要がある。下の「算定表との突合」は、実際の算定表PDFの升目を
 * 読んで書き起こした期待値。ここが落ちたら方式の実装か基礎収入割合が壊れている。
 */

/** 算定表の升目と突き合わせるための短縮形 */
function rangeLabel(
  obligorIncome: number,
  obligeeIncome: number,
  children: ChildAgeBand[],
  kinds: { obligor?: IncomeKind; obligee?: IncomeKind } = {}
): string {
  const r = calcYoikuhi({
    obligorIncome,
    obligorKind: kinds.obligor ?? 'salary',
    obligeeIncome,
    obligeeKind: kinds.obligee ?? 'salary',
    children,
  });
  if (r.outOfRange) throw new Error(`算定表の範囲外になった: ${r.reasons.join(',')}`);
  return r.range.label;
}

/** 計算できた前提で結果を取り出す（範囲外なら投げる） */
function amount(input: Parameters<typeof calcYoikuhi>[0]): YoikuhiAmount {
  const r = calcYoikuhi(input);
  if (r.outOfRange) throw new Error(`算定表の範囲外になった: ${r.reasons.join(',')}`);
  return r;
}

const MAN = 10_000;

describe('制度データ（一次資料と一致すること）', () => {
  it('法定養育費は子1人あたり月額2万円（令和7年法務省令第56号）', () => {
    // 「月額２万円に子の数を乗じて得た額」
    expect(STATUTORY_SUPPORT_PER_CHILD).toBe(20_000);
    expect(statutorySupport(1)).toBe(20_000);
    expect(statutorySupport(2)).toBe(40_000);
    expect(statutorySupport(3)).toBe(60_000);
  });

  it('先取特権が付与される額は子1人あたり月額8万円まで（令和7年法務省令第56号）', () => {
    // 「月額８万円に子の数を乗じて得た額」
    expect(LIEN_CAP_PER_CHILD).toBe(80_000);
    expect(lienCap(1)).toBe(80_000);
    expect(lienCap(2)).toBe(160_000);
    expect(lienCap(3)).toBe(240_000);
  });

  it('先取特権の上限は法定養育費より高い（別の制度であることの確認）', () => {
    // 「法定養育費の2万円までしか差し押さえられない」という誤解を避けるための番人。
    // 法定養育費＝取決めなしのときに請求できる額、先取特権＝差押えができる額の上限
    expect(LIEN_CAP_PER_CHILD).toBeGreaterThan(STATUTORY_SUPPORT_PER_CHILD);
  });

  it('改正民法の施行日は2026年4月1日（令和6年法律第33号）', () => {
    expect(LAW_EFFECTIVE_DATE).toBe('2026-04-01');
  });

  it('法定養育費は子が18歳に達した日までで終わる', () => {
    expect(STATUTORY_SUPPORT_END_AGE).toBe(18);
  });

  it('生活費指数は 親100・0〜14歳62・15歳以上85（標準算定方式）', () => {
    expect(LIVING_COST_INDEX.parent).toBe(100);
    expect(LIVING_COST_INDEX['0-14']).toBe(62);
    expect(LIVING_COST_INDEX['15+']).toBe(85);
  });

  it('基礎収入割合は給与54%〜38%・自営61%〜48%の範囲に収まる', () => {
    const salary = BASIC_INCOME_RATES.salary;
    expect(salary[0].rate).toBe(0.54);
    expect(salary[salary.length - 1].rate).toBe(0.38);

    const business = BASIC_INCOME_RATES.business;
    expect(business[0].rate).toBe(0.61);
    expect(business[business.length - 1].rate).toBe(0.48);
  });

  it('基礎収入割合の表は収入が上がるほど割合が下がる（単調に減る）', () => {
    for (const kind of ['salary', 'business'] as IncomeKind[]) {
      const rows = BASIC_INCOME_RATES[kind];
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].upTo, `${kind}: 収入の区分が昇順でない`).toBeGreaterThan(rows[i - 1].upTo);
        expect(rows[i].rate, `${kind}: 割合が下がっていない`).toBeLessThan(rows[i - 1].rate);
      }
    }
  });

  it('算定表の上限は給与2,000万円・自営1,567万円（基礎収入割合の表の最終行と一致）', () => {
    expect(INCOME_LIMIT.salary).toBe(20_000_000);
    expect(INCOME_LIMIT.business).toBe(15_670_000);
    expect(BASIC_INCOME_RATES.salary.at(-1)!.upTo).toBe(INCOME_LIMIT.salary);
    expect(BASIC_INCOME_RATES.business.at(-1)!.upTo).toBe(INCOME_LIMIT.business);
  });

  it('算定表の横軸（権利者）の上限は給与1,000万円・自営763万円', () => {
    expect(OBLIGEE_TABLE_AXIS_LIMIT.salary).toBe(10_000_000);
    expect(OBLIGEE_TABLE_AXIS_LIMIT.business).toBe(7_630_000);
  });

  it('算定表があるのは子3人まで（表1〜表9）', () => {
    expect(MAX_CHILDREN).toBe(3);
  });

  it('表示名がそろっている', () => {
    expect(INCOME_KIND_LABELS).toEqual({ salary: '給与', business: '自営' });
    expect(CHILD_AGE_LABELS).toEqual({ '0-14': '0〜14歳', '15+': '15歳以上' });
  });
});

describe('基礎収入割合の境界値', () => {
  it('給与所得者：区分の上限ちょうどはその区分の割合を使う', () => {
    expect(basicIncomeRate(750_000, 'salary')).toBe(0.54);
    expect(basicIncomeRate(1_000_000, 'salary')).toBe(0.5);
    expect(basicIncomeRate(5_250_000, 'salary')).toBe(0.42);
    expect(basicIncomeRate(20_000_000, 'salary')).toBe(0.38);
  });

  it('給与所得者：上限を1円でも超えると次の区分に移る', () => {
    expect(basicIncomeRate(750_001, 'salary')).toBe(0.5);
    expect(basicIncomeRate(1_000_001, 'salary')).toBe(0.46);
    expect(basicIncomeRate(5_250_001, 'salary')).toBe(0.41);
  });

  it('自営業者：区分の上限ちょうどと1円超え', () => {
    expect(basicIncomeRate(660_000, 'business')).toBe(0.61);
    expect(basicIncomeRate(660_001, 'business')).toBe(0.6);
    expect(basicIncomeRate(15_670_000, 'business')).toBe(0.48);
  });

  it('収入0でも表の先頭の割合を返す（0円 × 割合 ＝ 0円）', () => {
    expect(basicIncomeRate(0, 'salary')).toBe(0.54);
    expect(basicIncome(0, 'salary')).toBe(0);
  });

  it('基礎収入は 総収入 × 割合', () => {
    // 給与500万円は「〜525万円 42%」の区分
    expect(basicIncome(5_000_000, 'salary')).toBe(2_100_000);
    // 自営373万円は「〜392万円 56%」の区分
    expect(basicIncome(3_730_000, 'business')).toBeCloseTo(2_088_800, 0);
  });

  it('負の収入・数値でない値は0として扱う', () => {
    expect(basicIncome(-1_000_000, 'salary')).toBe(0);
    expect(basicIncome(Number.NaN, 'salary')).toBe(0);
  });
});

describe('算定表と同じレンジへの丸め', () => {
  it('2万円未満は1万円幅（裁判所の説明書のとおり）', () => {
    expect(tableRangeFor(0).label).toBe('0〜1万円');
    expect(tableRangeFor(9_999).label).toBe('0〜1万円');
    expect(tableRangeFor(10_000).label).toBe('1〜2万円');
    expect(tableRangeFor(19_999).label).toBe('1〜2万円');
  });

  it('2万円以上は2万円幅', () => {
    expect(tableRangeFor(20_000).label).toBe('2〜4万円');
    expect(tableRangeFor(39_999).label).toBe('2〜4万円');
    expect(tableRangeFor(40_000).label).toBe('4〜6万円');
    expect(tableRangeFor(59_999).label).toBe('4〜6万円');
    expect(tableRangeFor(60_000).label).toBe('6〜8万円');
    expect(tableRangeFor(123_456).label).toBe('12〜14万円');
  });

  it('レンジの上下限も返す', () => {
    expect(tableRangeFor(54_100)).toEqual({ fromYen: 40_000, toYen: 60_000, label: '4〜6万円' });
    expect(tableRangeFor(8_600)).toEqual({ fromYen: 0, toYen: 10_000, label: '0〜1万円' });
  });
});

/**
 * 算定表（表1〜表3）の升目との突合。
 *
 * 期待値は算定表PDFの該当セルを読み取ったもの。縦軸＝義務者、横軸＝権利者で、
 * どちらも給与所得者の年収（万円）。方式の実装が表とずれたらここが落ちる。
 */
describe('算定表との突合：表1（子1人・0〜14歳）', () => {
  const child: ChildAgeBand[] = ['0-14'];

  it('義務者500万・権利者100万 → 4〜6万円（仕様書の代表ケース）', () => {
    expect(rangeLabel(500 * MAN, 100 * MAN, child)).toBe('4〜6万円');
  });

  it('義務者400万・権利者0 → 4〜6万円', () => {
    expect(rangeLabel(400 * MAN, 0, child)).toBe('4〜6万円');
  });

  it('義務者300万・権利者0 → 4〜6万円', () => {
    expect(rangeLabel(300 * MAN, 0, child)).toBe('4〜6万円');
  });

  it('義務者300万・権利者100万 → 2〜4万円（権利者に収入があると1段下がる）', () => {
    expect(rangeLabel(300 * MAN, 100 * MAN, child)).toBe('2〜4万円');
  });

  it('義務者200万・権利者0 → 2〜4万円', () => {
    expect(rangeLabel(200 * MAN, 0, child)).toBe('2〜4万円');
  });

  it('義務者100万・権利者0 → 1〜2万円', () => {
    expect(rangeLabel(100 * MAN, 0, child)).toBe('1〜2万円');
  });

  it('義務者50万・権利者0 → 0〜1万円', () => {
    expect(rangeLabel(50 * MAN, 0, child)).toBe('0〜1万円');
  });

  it('義務者が自営373万・権利者0 → 6〜8万円（自営の軸でも表と合う）', () => {
    expect(rangeLabel(373 * MAN, 0, child, { obligor: 'business' })).toBe('6〜8万円');
  });
});

describe('算定表との突合：表2（子1人・15歳以上）', () => {
  const child: ChildAgeBand[] = ['15+'];

  it('義務者500万・権利者100万 → 6〜8万円（同じ年収でも表1より1段上がる）', () => {
    expect(rangeLabel(500 * MAN, 100 * MAN, child)).toBe('6〜8万円');
  });

  it('義務者400万・権利者0 → 6〜8万円', () => {
    expect(rangeLabel(400 * MAN, 0, child)).toBe('6〜8万円');
  });

  it('義務者300万・権利者0 → 4〜6万円', () => {
    expect(rangeLabel(300 * MAN, 0, child)).toBe('4〜6万円');
  });

  it('義務者200万・権利者0 → 2〜4万円', () => {
    expect(rangeLabel(200 * MAN, 0, child)).toBe('2〜4万円');
  });
});

describe('算定表との突合：表3（子2人・いずれも0〜14歳）', () => {
  const children: ChildAgeBand[] = ['0-14', '0-14'];

  it('義務者500万・権利者100万 → 6〜8万円', () => {
    expect(rangeLabel(500 * MAN, 100 * MAN, children)).toBe('6〜8万円');
  });

  it('義務者400万・権利者0 → 6〜8万円', () => {
    expect(rangeLabel(400 * MAN, 0, children)).toBe('6〜8万円');
  });

  it('義務者300万・権利者0 → 4〜6万円', () => {
    expect(rangeLabel(300 * MAN, 0, children)).toBe('4〜6万円');
  });

  it('義務者200万・権利者0 → 2〜4万円', () => {
    expect(rangeLabel(200 * MAN, 0, children)).toBe('2〜4万円');
  });
});

describe('標準算定方式の計算過程', () => {
  it('公表されている計算例と1円まで一致する（義務者600万・権利者300万・子2人）', () => {
    // 子は0〜14歳と15歳以上が1人ずつ。指数合計は 62+85＝147
    //   義務者の基礎収入 600万 × 41% ＝ 246万
    //   権利者の基礎収入 300万 × 42% ＝ 126万
    //   子の生活費 246万 × 147/(100+147) ＝ 1,464,048.58円
    //   養育費 1,464,048.58 × 246万/(246万+126万) ＝ 968,161.16円/年
    //   月額 968,161.16 ÷ 12 ＝ 80,680.1円 → 80,680円
    const r = amount({
      obligorIncome: 600 * MAN,
      obligorKind: 'salary',
      obligeeIncome: 300 * MAN,
      obligeeKind: 'salary',
      children: ['0-14', '15+'],
    });

    expect(r.obligorBasicIncome).toBe(2_460_000);
    expect(r.obligeeBasicIncome).toBe(1_260_000);
    expect(r.childIndexSum).toBe(147);
    expect(r.childrenLivingCost).toBeCloseTo(1_464_048.58, 1);
    expect(r.annual).toBeCloseTo(968_161.16, 1);
    expect(r.monthly).toBe(80_680);
    expect(r.range.label).toBe('8〜10万円');
  });

  it('権利者の収入が0なら、子の生活費がそのまま養育費になる', () => {
    const r = amount({
      obligorIncome: 400 * MAN,
      obligorKind: 'salary',
      obligeeIncome: 0,
      obligeeKind: 'salary',
      children: ['0-14'],
    });
    expect(r.annual).toBeCloseTo(r.childrenLivingCost, 6);
  });

  it('双方とも収入0なら養育費は0円（按分できず、負担能力も無い）', () => {
    const r = amount({
      obligorIncome: 0,
      obligorKind: 'salary',
      obligeeIncome: 0,
      obligeeKind: 'salary',
      children: ['0-14'],
    });
    expect(r.monthly).toBe(0);
    expect(r.range.label).toBe('0〜1万円');
  });

  it('子の人数と年齢に応じて指数合計が積み上がる', () => {
    const one = amount({
      obligorIncome: 500 * MAN,
      obligorKind: 'salary',
      obligeeIncome: 0,
      obligeeKind: 'salary',
      children: ['0-14'],
    });
    const three = amount({
      obligorIncome: 500 * MAN,
      obligorKind: 'salary',
      obligeeIncome: 0,
      obligeeKind: 'salary',
      children: ['0-14', '0-14', '15+'],
    });
    expect(one.childIndexSum).toBe(62);
    expect(three.childIndexSum).toBe(62 + 62 + 85);
    expect(three.monthly).toBeGreaterThan(one.monthly);
  });

  it('子の並び順は結果に影響しない', () => {
    const base = {
      obligorIncome: 500 * MAN,
      obligorKind: 'salary' as const,
      obligeeIncome: 100 * MAN,
      obligeeKind: 'salary' as const,
    };
    const a = amount({ ...base, children: ['0-14', '15+'] });
    const b = amount({ ...base, children: ['15+', '0-14'] });
    expect(a.monthly).toBe(b.monthly);
  });

  it('義務者の年収が上がるほど養育費は増える', () => {
    const monthly = [300, 400, 500, 600, 700].map(
      (man) =>
        amount({
          obligorIncome: man * MAN,
          obligorKind: 'salary',
          obligeeIncome: 100 * MAN,
          obligeeKind: 'salary',
          children: ['0-14'],
        }).monthly
    );
    for (let i = 1; i < monthly.length; i++) {
      expect(monthly[i]).toBeGreaterThan(monthly[i - 1]);
    }
  });

  it('権利者の年収が上がるほど養育費は減る', () => {
    const monthly = [0, 100, 200, 300, 400].map(
      (man) =>
        amount({
          obligorIncome: 600 * MAN,
          obligorKind: 'salary',
          obligeeIncome: man * MAN,
          obligeeKind: 'salary',
          children: ['0-14'],
        }).monthly
    );
    for (let i = 1; i < monthly.length; i++) {
      expect(monthly[i]).toBeLessThan(monthly[i - 1]);
    }
  });

  it('15歳以上の子のほうが同じ年収でも養育費が高い（生活費指数62→85）', () => {
    const base = {
      obligorIncome: 500 * MAN,
      obligorKind: 'salary' as const,
      obligeeIncome: 100 * MAN,
      obligeeKind: 'salary' as const,
    };
    expect(amount({ ...base, children: ['15+'] }).monthly).toBeGreaterThan(
      amount({ ...base, children: ['0-14'] }).monthly
    );
  });
});

describe('法定養育費と先取特権（結果に添える額）', () => {
  it('子の数に応じて 2万円／8万円 を掛けた額が結果に入る', () => {
    const r = amount({
      obligorIncome: 500 * MAN,
      obligorKind: 'salary',
      obligeeIncome: 100 * MAN,
      obligeeKind: 'salary',
      children: ['0-14', '15+'],
    });
    expect(r.childCount).toBe(2);
    expect(r.statutoryMonthly).toBe(40_000);
    expect(r.lienCapMonthly).toBe(160_000);
  });

  it('法定養育費は算定表の目安と連動しない（収入が変わっても2万円×人数のまま）', () => {
    const low = amount({
      obligorIncome: 200 * MAN,
      obligorKind: 'salary',
      obligeeIncome: 0,
      obligeeKind: 'salary',
      children: ['0-14'],
    });
    const high = amount({
      obligorIncome: 1500 * MAN,
      obligorKind: 'salary',
      obligeeIncome: 0,
      obligeeKind: 'salary',
      children: ['0-14'],
    });
    expect(low.statutoryMonthly).toBe(20_000);
    expect(high.statutoryMonthly).toBe(20_000);
    expect(high.monthly).toBeGreaterThan(low.monthly);
  });

  it('人数が0や負でも法定養育費は0円（マイナスを返さない）', () => {
    expect(statutorySupport(0)).toBe(0);
    expect(statutorySupport(-2)).toBe(0);
    expect(lienCap(0)).toBe(0);
    expect(lienCap(-1)).toBe(0);
  });
});

describe('法定養育費の遡及適用（施行日前の離婚は対象外）', () => {
  it('施行日（2026年4月1日）以降に成立した離婚は対象', () => {
    expect(isStatutorySupportEligible('2026-04-01')).toBe(true);
    expect(isStatutorySupportEligible('2026-04-02')).toBe(true);
    expect(isStatutorySupportEligible('2027-01-01')).toBe(true);
  });

  it('施行日前（2026年3月31日まで）に成立した離婚は対象外', () => {
    // 法務省パンフレット Q5「改正法施行前に離婚しましたが、暫定的な養育費は発生しますか」
    // → A5「発生しません。この規定は、改正法施行後に離婚したケースのみに適用されます。」
    expect(isStatutorySupportEligible('2026-03-31')).toBe(false);
    expect(isStatutorySupportEligible('2025-12-31')).toBe(false);
    expect(isStatutorySupportEligible('2020-01-01')).toBe(false);
  });
});

describe('算定表の範囲外', () => {
  const base = {
    obligorKind: 'salary' as const,
    obligeeKind: 'salary' as const,
    children: ['0-14'] as ChildAgeBand[],
  };

  it('義務者の給与年収が2,000万円を超えると計算しない', () => {
    const r = calcYoikuhi({ ...base, obligorIncome: 2000 * MAN + 1, obligeeIncome: 0 });
    expect(r.outOfRange).toBe(true);
    if (r.outOfRange) expect(r.reasons).toContain('obligor-income');
  });

  it('2,000万円ちょうどは範囲内', () => {
    const r = calcYoikuhi({ ...base, obligorIncome: 2000 * MAN, obligeeIncome: 0 });
    expect(r.outOfRange).toBe(false);
  });

  it('自営の年収は1,567万円が上限', () => {
    const within = calcYoikuhi({
      ...base,
      obligorKind: 'business',
      obligorIncome: 1567 * MAN,
      obligeeIncome: 0,
    });
    expect(within.outOfRange).toBe(false);

    const over = calcYoikuhi({
      ...base,
      obligorKind: 'business',
      obligorIncome: 1567 * MAN + 1,
      obligeeIncome: 0,
    });
    expect(over.outOfRange).toBe(true);
  });

  it('権利者の年収が上限を超えても計算しない', () => {
    const r = calcYoikuhi({ ...base, obligorIncome: 500 * MAN, obligeeIncome: 2001 * MAN });
    expect(r.outOfRange).toBe(true);
    if (r.outOfRange) expect(r.reasons).toContain('obligee-income');
  });

  it('子が0人・4人以上は計算しない（算定表は表1〜表9で子3人まで）', () => {
    const none = calcYoikuhi({ ...base, children: [], obligorIncome: 500 * MAN, obligeeIncome: 0 });
    expect(none.outOfRange).toBe(true);
    if (none.outOfRange) expect(none.reasons).toContain('children-count');

    const four = calcYoikuhi({
      ...base,
      children: ['0-14', '0-14', '0-14', '15+'],
      obligorIncome: 500 * MAN,
      obligeeIncome: 0,
    });
    expect(four.outOfRange).toBe(true);
    if (four.outOfRange) expect(four.reasons).toContain('children-count');
  });

  it('子3人は範囲内', () => {
    const r = calcYoikuhi({
      ...base,
      children: ['0-14', '0-14', '15+'],
      obligorIncome: 500 * MAN,
      obligeeIncome: 0,
    });
    expect(r.outOfRange).toBe(false);
  });

  it('範囲外の理由は重なったぶんだけ返る', () => {
    const r = calcYoikuhi({
      ...base,
      children: [],
      obligorIncome: 3000 * MAN,
      obligeeIncome: 3000 * MAN,
    });
    expect(r.outOfRange).toBe(true);
    if (r.outOfRange) {
      expect(r.reasons).toEqual(['obligor-income', 'obligee-income', 'children-count']);
    }
  });

  it('負の年収は0円として扱い、範囲外にはしない', () => {
    const r = amount({ ...base, obligorIncome: -100, obligeeIncome: -100 });
    expect(r.monthly).toBe(0);
  });
});

describe('権利者の年収が算定表の横軸を超えた場合', () => {
  it('給与1,000万円までは印刷された算定表と突き合わせられる', () => {
    const r = amount({
      obligorIncome: 1500 * MAN,
      obligorKind: 'salary',
      obligeeIncome: 1000 * MAN,
      obligeeKind: 'salary',
      children: ['0-14'],
    });
    expect(r.beyondObligeeAxis).toBe(false);
  });

  it('横軸を超えても計算は続けるが、印を立てる', () => {
    const r = amount({
      obligorIncome: 1500 * MAN,
      obligorKind: 'salary',
      obligeeIncome: 1200 * MAN,
      obligeeKind: 'salary',
      children: ['0-14'],
    });
    expect(r.beyondObligeeAxis).toBe(true);
    expect(r.monthly).toBeGreaterThan(0);
  });

  it('自営の横軸の上限は763万円', () => {
    const within = amount({
      obligorIncome: 1000 * MAN,
      obligorKind: 'salary',
      obligeeIncome: 763 * MAN,
      obligeeKind: 'business',
      children: ['0-14'],
    });
    expect(within.beyondObligeeAxis).toBe(false);

    const beyond = amount({
      obligorIncome: 1000 * MAN,
      obligorKind: 'salary',
      obligeeIncome: 764 * MAN,
      obligeeKind: 'business',
      children: ['0-14'],
    });
    expect(beyond.beyondObligeeAxis).toBe(true);
  });
});
