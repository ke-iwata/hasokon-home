import { describe, expect, it } from 'vitest';
import {
  DATA_CHECKED_AT,
  DEDUCTION_R8,
  DEDUCTION_R9,
  FORM_PAGE,
  PRIOR_REVENUE_LIMIT,
  SOURCES,
  asksEBook,
  asksFilingR8,
  capByIncome,
  isOverPriorRevenueLimit,
  RESIDENT_EXEMPT_LIMIT,
  incomeForTaxable,
  judge,
  taxDiff,
  taxFor,
  tierR8,
  tierR9,
  type AoiroInput,
} from '@/lib/aoiro-shinkoku-kojo';

/** 事業所得・複式簿記・期限内の書面申告・前々年1,000万円以下（仕様書の「テスト」#1 の形） */
const base: AoiroInput = {
  kind: 'business',
  bookkeeping: 'double',
  cashBasis: false,
  filingR9: 'paper',
  eBook: 'none',
  priorRevenueOver: false,
  filingR8: 'paper',
};

/**
 * 仕様書の「テスト」の 11 ケース（docs/features/aoiro-shinkoku-tokubetsu-kojo-r9.md）。
 * 課税所得は令和9年分（令和9年分の控除を引いた後）の所得税の課税所得で書く。ほかの所得控除は0とし、
 * 控除前の所得 ＝ 令和9年分の課税所得 ＋ 所得税の基礎控除 ＋ 令和9年分の控除（`incomeForTaxable()`）。
 */
describe('仕様書の 11 ケース', () => {
  it('#1 事業・複式簿記・書面・前々年600万円：55万円 → 10万円、税額 +90,945円', () => {
    const r = judge({
      ...base,
      priorRevenueOver: isOverPriorRevenueLimit(6_000_000),
      incomeBeforeDeduction: incomeForTaxable(3_000_000, 100_000),
      otherDeductions: 0,
    });
    expect(r.r8).toBe(550_000);
    expect(r.r9).toBe(100_000);
    expect(r.change).toBe(-450_000);
    expect(r.reason).toBe('paper');
    expect(r.tax?.after.taxableIncome).toBe(3_000_000);
    expect(r.tax?.before.taxableIncome).toBe(2_550_000);
    expect(r.tax?.total).toBe(90_945);
  });

  it('#2 #1 を e-Tax に変えると 65万円（令和8年分の書面55万円から +10万円）、書面との差は 111,155円', () => {
    const etax = judge({ ...base, filingR9: 'etax' });
    expect(etax.r8).toBe(550_000);
    expect(etax.r9).toBe(650_000);
    expect(etax.change).toBe(100_000);

    // 「1つ上の区分に上がるには」：書面のままの #1 から e-Tax にした分
    const income = incomeForTaxable(3_000_000, 100_000);
    const r = judge({ ...base, incomeBeforeDeduction: income, otherDeductions: 0 });
    const up = r.upgrades.find((u) => u.action === 'etax');
    expect(up?.amount).toBe(650_000);
    expect(up?.gain).toBe(550_000);
    expect(up?.taxSaving).toBe(111_155);
    const d = taxDiff(income, 0, 100_000, 650_000);
    expect(d.before.taxableIncome).toBe(3_000_000);
    expect(d.after.taxableIncome).toBe(2_450_000);
  });

  it('#3 事業・複式・e-Tax・優良な電子帳簿：65万円 → 75万円、税額 −30,420円', () => {
    const r = judge({
      ...base,
      filingR9: 'etax',
      eBook: 'yuryo',
      filingR8: 'yuryo',
      incomeBeforeDeduction: incomeForTaxable(6_000_000, 750_000),
      otherDeductions: 0,
    });
    expect(r.r8).toBe(650_000);
    expect(r.r9).toBe(750_000);
    expect(r.reason).toBe('top');
    expect(r.tax?.after.taxableIncome).toBe(6_000_000);
    expect(r.tax?.before.taxableIncome).toBe(6_100_000);
    expect(r.tax?.total).toBe(-30_420);
    expect(r.upgrades).toEqual([]);
  });

  it('#4 事業・簡易簿記・書面・前々年1,200万円：10万円 → 0円、税額 +30,420円', () => {
    const r = judge({
      ...base,
      bookkeeping: 'simple',
      priorRevenueOver: isOverPriorRevenueLimit(12_000_000),
      // 控除の前後で合計所得が655万円の段（基礎控除67万円→62万円）をまたがない所得にする
      incomeBeforeDeduction: incomeForTaxable(6_380_000, 0),
      otherDeductions: 0,
    });
    expect(r.r8).toBe(100_000);
    expect(r.r9).toBe(0);
    expect(r.reason).toBe('simpleOver');
    expect(r.tax?.after.taxableIncome).toBe(6_380_000);
    expect(r.tax?.before.taxableIncome).toBe(6_280_000);
    expect(r.tax?.total).toBe(30_420);
  });

  it('#5 簡易簿記・前々年1,000万円ちょうどは「超える」に当たらず 10万円のまま', () => {
    expect(isOverPriorRevenueLimit(PRIOR_REVENUE_LIMIT)).toBe(false);
    expect(isOverPriorRevenueLimit(PRIOR_REVENUE_LIMIT + 1)).toBe(true);
    const r = judge({
      ...base,
      bookkeeping: 'simple',
      priorRevenueOver: isOverPriorRevenueLimit(10_000_000),
    });
    expect(r.r8).toBe(100_000);
    expect(r.r9).toBe(100_000);
    expect(r.reason).toBe('simple');
  });

  it('#6 不動産（業務的規模）・複式簿記・e-Tax・前々年1,200万円：10万円 → 10万円', () => {
    const r = judge({
      ...base,
      kind: 'realEstateSmall',
      filingR9: 'etax',
      priorRevenueOver: true,
      filingR8: 'etax',
    });
    expect(r.r8).toBe(100_000);
    expect(r.r9).toBe(100_000);
    expect(r.reason).toBe('realEstateSmall');
    expect(r.upgrades).toEqual([]); // 複式に移っても最大10万円
  });

  it('#7 現金主義の特例「はい」・e-Tax：10万円 → 10万円（令和8年分は聞かない）', () => {
    const input: AoiroInput = { ...base, cashBasis: true, filingR9: 'etax', filingR8: 'etax' };
    expect(asksFilingR8(input)).toBe(false);
    expect(asksEBook(input)).toBe(false);
    const r = judge(input);
    expect(r.r8).toBe(100_000);
    expect(r.r9).toBe(100_000);
    expect(r.reason).toBe('cashBasis');
  });

  it('#8 控除前の所得40万円なら、65万円ではなく所得の40万円が上限', () => {
    const r = judge({
      ...base,
      filingR9: 'etax',
      filingR8: 'etax',
      incomeBeforeDeduction: 400_000,
      otherDeductions: 0,
    });
    expect(r.r8).toBe(400_000);
    expect(r.r9).toBe(400_000);
    expect(r.cappedByIncome).toBe(true);
    expect(r.change).toBe(0);
    // 上がっても控除が増えないので「1つ上の区分」は出さない
    expect(r.upgrades).toEqual([]);
  });

  it('#9 330万円の帯の境をまたぐと、限界税率×差額（90,945円）ではなく +106,260円', () => {
    const r = judge({
      ...base,
      incomeBeforeDeduction: incomeForTaxable(3_450_000, 100_000),
      otherDeductions: 0,
    });
    expect(r.r8).toBe(550_000);
    expect(r.r9).toBe(100_000);
    expect(r.tax?.before.taxableIncome).toBe(3_000_000);
    expect(r.tax?.after.taxableIncome).toBe(3_450_000);
    expect(r.tax?.incomeTax).toBe(61_260);
    expect(r.tax?.residentTax).toBe(45_000);
    expect(r.tax?.total).toBe(106_260);
    expect(r.tax?.total).not.toBe(90_945);
  });

  it('#10 不動産（業務的規模）・簡易簿記・書面・前々年1,200万円：0円にならず 10万円', () => {
    const r = judge({ ...base, kind: 'realEstateSmall', bookkeeping: 'simple', priorRevenueOver: true });
    expect(r.r8).toBe(100_000);
    expect(r.r9).toBe(100_000);
    expect(r.reason).toBe('realEstateSmall');
  });

  it('#11 両方・事業600万円・不動産（事業的規模）1,200万円・簡易簿記：いずれかが超えるので 0円', () => {
    const r = judge({
      ...base,
      kind: 'both',
      bookkeeping: 'simple',
      priorRevenueOver: isOverPriorRevenueLimit(6_000_000) || isOverPriorRevenueLimit(12_000_000),
    });
    expect(r.r8).toBe(100_000);
    expect(r.r9).toBe(0);
    // 合計（1,800万円）で判定するのではない：事業900万円・不動産900万円なら超えない
    expect(isOverPriorRevenueLimit(9_000_000) || isOverPriorRevenueLimit(9_000_000)).toBe(false);
  });
});

describe('令和9年分の区分（租税特別措置法25条の2・令和9年1月1日施行版）', () => {
  it('4区分の額', () => {
    expect(DEDUCTION_R9).toEqual({ top: 750_000, etax: 650_000, basic: 100_000, none: 0 });
    expect(DEDUCTION_R8).toEqual({ etax: 650_000, paper: 550_000, basic: 100_000 });
  });

  it('デジタルシームレス保存でも 75万円（5項2号）', () => {
    expect(tierR9({ ...base, filingR9: 'etax', eBook: 'seamless' })).toEqual({
      amount: 750_000,
      reason: 'top',
    });
  });

  it('電子帳簿が「分からない」は 65万円で、理由を分けて返す', () => {
    expect(tierR9({ ...base, filingR9: 'etax', eBook: 'unknown' })).toEqual({
      amount: 650_000,
      reason: 'etaxUnknownEBook',
    });
  });

  it('期限後の申告（還付申告も）は複式簿記でも 10万円（7項）', () => {
    expect(tierR9({ ...base, filingR9: 'late', eBook: 'yuryo' })).toEqual({
      amount: 100_000,
      reason: 'late',
    });
  });

  it('書面申告は優良な電子帳簿を付けていても 10万円（75万円は65万円の要件が前提）', () => {
    expect(tierR9({ ...base, filingR9: 'paper', eBook: 'yuryo' }).amount).toBe(100_000);
  });

  it('複式簿記の書面・期限後は、前々年1,000万円超でも 0円ではなく 10万円（2項は「4項に規定する場合」を除く）', () => {
    expect(tierR9({ ...base, filingR9: 'paper', priorRevenueOver: true }).amount).toBe(100_000);
    expect(tierR9({ ...base, filingR9: 'late', priorRevenueOver: true }).amount).toBe(100_000);
  });

  it('現金主義の特例の人は前々年1,000万円超でも 10万円（2項から除かれる）', () => {
    expect(
      tierR9({ ...base, bookkeeping: 'simple', cashBasis: true, priorRevenueOver: true }).amount,
    ).toBe(100_000);
  });

  it('不動産（事業的規模）は事業所得と同じ扱い', () => {
    expect(tierR9({ ...base, kind: 'realEstateBusiness', filingR9: 'etax' }).amount).toBe(650_000);
    expect(
      tierR9({ ...base, kind: 'realEstateBusiness', bookkeeping: 'simple', priorRevenueOver: true })
        .amount,
    ).toBe(0);
  });
});

describe('令和8年分（改正前）', () => {
  it('複式簿記は書面55万円・e-Tax 65万円・優良な電子帳簿 65万円', () => {
    expect(tierR8({ ...base, filingR8: 'paper' })).toBe(550_000);
    expect(tierR8({ ...base, filingR8: 'etax' })).toBe(650_000);
    expect(tierR8({ ...base, filingR8: 'yuryo' })).toBe(650_000);
  });

  it('簡易簿記・現金主義・業務的規模は前々年がいくらでも 10万円（0円の区分は令和9年分から）', () => {
    expect(tierR8({ ...base, bookkeeping: 'simple', priorRevenueOver: true })).toBe(100_000);
    expect(tierR8({ ...base, cashBasis: true })).toBe(100_000);
    expect(tierR8({ ...base, kind: 'realEstateSmall', filingR8: 'etax' })).toBe(100_000);
  });
});

describe('入力の出し分け', () => {
  it('令和8年分の申告の方法は、複式簿記・現金主義でない・業務的規模でないときだけ聞く', () => {
    expect(asksFilingR8(base)).toBe(true);
    expect(asksFilingR8({ ...base, bookkeeping: 'simple' })).toBe(false);
    expect(asksFilingR8({ ...base, cashBasis: true })).toBe(false);
    expect(asksFilingR8({ ...base, kind: 'realEstateSmall' })).toBe(false);
  });

  it('電子帳簿は e-Tax・複式簿記のときだけ聞く', () => {
    expect(asksEBook({ ...base, filingR9: 'etax' })).toBe(true);
    expect(asksEBook({ ...base, filingR9: 'paper' })).toBe(false);
    expect(asksEBook({ ...base, filingR9: 'late' })).toBe(false);
    expect(asksEBook({ ...base, filingR9: 'etax', bookkeeping: 'simple' })).toBe(false);
  });
});

describe('1つ上の区分に上がるには', () => {
  it('書面申告なら e-Tax（65万円）と、優良な電子帳簿（75万円・1月1日から）の2つ', () => {
    const r = judge(base);
    expect(r.upgrades.map((u) => [u.action, u.amount, u.gain, u.needsFromJan1])).toEqual([
      ['etax', 650_000, 550_000, false],
      ['eBook', 750_000, 650_000, true],
    ]);
    expect(r.upgrades[0].taxSaving).toBeUndefined(); // 所得を入れていなければ税額は出さない
  });

  it('e-Tax の 65万円なら、優良な電子帳簿で 75万円（+10万円）', () => {
    const r = judge({ ...base, filingR9: 'etax' });
    expect(r.upgrades).toHaveLength(1);
    expect(r.upgrades[0]).toMatchObject({ action: 'eBook', amount: 750_000, gain: 100_000 });
  });

  it('簡易簿記の 0円なら、複式簿記＋e-Tax で 65万円（+65万円）', () => {
    const r = judge({ ...base, bookkeeping: 'simple', priorRevenueOver: true });
    expect(r.upgrades).toEqual([
      expect.objectContaining({ action: 'doubleEntry', amount: 650_000, gain: 650_000 }),
    ]);
  });

  it('現金主義の特例なら、特例をやめて複式簿記＋e-Tax で 65万円', () => {
    const r = judge({ ...base, cashBasis: true });
    expect(r.upgrades[0]).toMatchObject({ action: 'stopCashBasis', amount: 650_000 });
  });

  it('所得が小さいと上がる幅も所得で頭打ち', () => {
    const r = judge({ ...base, incomeBeforeDeduction: 300_000 });
    expect(r.r9).toBe(100_000);
    expect(r.upgrades[0]).toMatchObject({ action: 'etax', amount: 300_000, gain: 200_000 });
    expect(r.upgrades).toHaveLength(1); // 75万円にしても30万円のまま
  });
});

describe('控除の上限と税額', () => {
  it('所得を入れなければ区分の額、入れれば所得が上限（マイナスは0）', () => {
    expect(capByIncome(650_000, undefined)).toBe(650_000);
    expect(capByIncome(650_000, 400_000)).toBe(400_000);
    expect(capByIncome(650_000, -100_000)).toBe(0);
  });

  it('ほかの所得控除で課税所得が0円未満になっても税額はマイナスにならない', () => {
    const d = taxDiff(1_000_000, 2_000_000, 550_000, 100_000);
    expect(d.before.taxableIncome).toBe(0);
    expect(d.after.taxableIncome).toBe(0);
    expect(d.total).toBe(0);
  });

  it('給与所得などほかの所得は課税所得に足す（副業で税率の帯が上がる）', () => {
    // 給与所得500万円＋事業所得300万円・所得控除100万円（基礎控除62万円＋ほか38万円）・
    // 複式簿記の書面申告（PR #387 のレビュー）
    const r = judge({
      ...base,
      incomeBeforeDeduction: 3_000_000,
      otherIncome: 5_000_000,
      otherDeductions: 380_000,
    });
    expect(r.tax?.before.taxableIncome).toBe(6_450_000);
    expect(r.tax?.after.taxableIncome).toBe(6_900_000);
    expect(r.tax?.incomeTax).toBe(91_890);
    expect(r.tax?.residentTax).toBe(45_000);
    expect(r.tax?.total).toBe(136_890);
    // 控除の上限は事業・不動産の所得だけで見る（給与所得は上限に入らない）
    const capped = judge({
      ...base,
      filingR9: 'etax',
      incomeBeforeDeduction: 400_000,
      otherIncome: 5_000_000,
    });
    expect(capped.r9).toBe(400_000);
  });

  it('所得に0円を入れたときは「受けられない」ではなく所得の上限として扱う', () => {
    const r = judge({ ...base, filingR9: 'etax', incomeBeforeDeduction: 0 });
    expect(r.r9).toBe(0);
    expect(r.cappedByIncome).toBe(true);
  });

  it('所得を入れないときは税額を出さない', () => {
    expect(judge(base).tax).toBeUndefined();
  });
});

describe('住民税は住民税の基礎控除で計算する（docs/features/kokai-tool-seikaku-2026-10-16.md の A）', () => {
  /** 事業所得・複式簿記・書面申告、令和8年分 55万円 → 令和9年分 10万円、基礎控除を除く控除 0円 */
  const paper = (income: number) => judge({ ...base, incomeBeforeDeduction: income, otherDeductions: 0 });

  it('控除前の所得100万円：所得税は0円のまま、住民税は非課税 → 44,500円（「変わりません」にしない）', () => {
    const r = paper(1_000_000);
    expect(r.tax?.incomeTax).toBe(0);
    expect(r.tax?.before.residentExempt).toBe(true);
    expect(r.tax?.before.residentTax).toBe(0);
    expect(r.tax?.after.residentTaxable).toBe(470_000);
    expect(r.tax?.after.residentTax).toBe(44_500);
    expect(r.tax?.residentTax).toBe(44_500);
    expect(r.tax?.total).toBe(44_500);
  });

  it('控除前の所得150万円：住民税 49,500円 → 94,500円（+45,000円）、所得税 +18,378円', () => {
    const r = paper(1_500_000);
    expect(r.tax?.before.residentTax).toBe(49_500);
    expect(r.tax?.after.residentTax).toBe(94_500);
    expect(r.tax?.residentTax).toBe(45_000);
    expect(r.tax?.before.incomeTax).toBe(0);
    expect(r.tax?.incomeTax).toBe(18_378);
  });

  it('控除前の所得300万円：住民税 199,500円 → 244,500円（+45,000円）、所得税 +22,972円', () => {
    const r = paper(3_000_000);
    expect(r.tax?.before.residentTax).toBe(199_500);
    expect(r.tax?.after.residentTax).toBe(244_500);
    expect(r.tax?.residentTax).toBe(45_000);
    expect(r.tax?.incomeTax).toBe(22_972);
  });

  it('総所得金額等が所得割の非課税限度額（単身45万円）以下の側は0円、1円でも超えれば課税', () => {
    expect(RESIDENT_EXEMPT_LIMIT).toBe(450_000);
    const at = taxFor(1_000_000, 0, 550_000);
    expect(at.totalIncome).toBe(450_000);
    expect(at.residentExempt).toBe(true);
    expect(at.residentTax).toBe(0);
    const over = taxFor(1_001_000, 0, 550_000);
    expect(over.residentExempt).toBe(false);
    expect(over.residentTaxable).toBe(21_000);
    expect(over.residentTax).toBe(2_100 - 1_050); // 調整控除は課税所得の5%（5万円が上限）
  });

  it('所得税と住民税の基礎控除は控除の前後の合計所得で取り直す（489万円の段をまたぐ）', () => {
    // 令和8年分：合計所得 495万円 → 所得税の基礎控除67万円、令和9年分：540万円 → 67万円
    // 令和8年分に e-Tax 65万円なら 485万円 → 104万円
    const etax = taxFor(5_500_000, 0, 650_000);
    expect(etax.totalIncome).toBe(4_850_000);
    expect(etax.taxableIncome).toBe(4_850_000 - 1_040_000);
    expect(etax.residentTaxable).toBe(4_850_000 - 430_000);
    const paperSide = taxFor(5_500_000, 0, 550_000);
    expect(paperSide.taxableIncome).toBe(4_950_000 - 670_000);
    expect(paperSide.residentTaxable).toBe(4_950_000 - 430_000);
  });

  it('基礎控除を除く所得控除は所得税・住民税の両方から引く', () => {
    const t = taxFor(3_000_000, 500_000, 100_000);
    expect(t.taxableIncome).toBe(2_900_000 - 1_040_000 - 500_000);
    expect(t.residentTaxable).toBe(2_900_000 - 430_000 - 500_000);
  });

  it('本文の例の所得は、所得税の課税所得がちょうどその額になる', () => {
    for (const taxable of [2_600_000, 5_000_000, 6_000_000, 6_380_000]) {
      for (const deduction of [0, 100_000, 650_000, 750_000]) {
        expect(taxFor(incomeForTaxable(taxable, deduction), 0, deduction).taxableIncome).toBe(taxable);
      }
    }
  });
});

describe('出典', () => {
  it('国税庁・e-Gov の一次資料だけを出典にしている', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(4);
    for (const source of [...SOURCES, FORM_PAGE]) {
      expect(source.url).toMatch(/^https:\/\/(www\.nta\.go\.jp|laws\.e-gov\.go\.jp)\//);
      expect(source.label.length).toBeGreaterThan(5);
      expect(source.checkedAt).toBe(DATA_CHECKED_AT);
    }
  });

  it('届出書の正式名称を直書きしない（令和9年3月頃に「65万」→「75万」に変わる予定）', () => {
    expect(FORM_PAGE.label).not.toMatch(/65万|75万/);
  });
});
