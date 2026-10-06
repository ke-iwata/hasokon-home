import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ANNUAL_CAP,
  LEARN_NISA_PATH,
  LIFETIME_CAP,
  MONTHLY_CAP,
  START_YM,
  clampMonthly,
  contributionSchedule,
  firstWithdrawalYear,
  formatYen,
  isScheduleError,
  lastContributionYear,
  restrictionEndDate,
  transferDate,
  type ScheduleResult,
} from '@/lib/kodomo-nisa';

/**
 * こどもNISA シミュレーター。仕様: docs/features/kodomo-nisa.md
 * 年の区切りは国税庁「令和8年度 税制改正のあらまし」（措法37の14）。
 */

function run(birth: string, monthly: number, startYm = START_YM): ScheduleResult {
  const [year, month, day] = birth.split('-').map(Number);
  const r = contributionSchedule({ birth: { year, month, day }, startYm, monthly });
  if (isScheduleError(r)) throw new Error(r);
  return r;
}

describe('制度の数字', () => {
  it('年60万円・600万円・月5万円・2027年1月開始', () => {
    expect(ANNUAL_CAP).toBe(600_000);
    expect(LIFETIME_CAP).toBe(6_000_000);
    expect(MONTHLY_CAP).toBe(50_000);
    expect(START_YM).toBe('2027-01');
  });
});

describe('contributionSchedule', () => {
  it('2027-01-01 生まれ・2027-01 開始・月5万円 → 2036-12 に600万円（120か月）', () => {
    const r = run('2027-01-01', 50_000);
    expect(r.reachedYm).toBe('2036-12');
    expect(r.months).toHaveLength(120);
    expect(r.total).toBe(6_000_000);
    expect(r.remaining).toBe(0);
    // 届いたあとは積み立てない
    expect(r.months.at(-1)!.ym).toBe('2036-12');
  });

  it('2012-04-02 生まれ（2027-01 に14歳）・月5万円 → 18歳で止まり600万円に届かない', () => {
    const r = run('2012-04-02', 50_000);
    expect(r.reachedYm).toBeNull();
    // 2030年1月1日に17歳 → 2030年12月まで。2027〜2030年の48か月
    expect(r.lastYm).toBe('2030-12');
    expect(r.months).toHaveLength(48);
    expect(r.total).toBe(2_400_000);
    expect(r.total).toBeLessThan(LIFETIME_CAP);
    expect(r.remaining).toBe(3_600_000);
  });

  it('月6万円の入力 → 5万円に丸める', () => {
    const r = run('2020-06-15', 60_000);
    expect(r.monthly).toBe(50_000);
    expect(r.capped).toBe(true);
    expect(r.years.every((y) => y.amount <= ANNUAL_CAP)).toBe(true);
  });

  it('月5万円ちょうどは丸めない（年60万円ちょうど）', () => {
    const r = run('2020-06-15', 50_000);
    expect(r.capped).toBe(false);
    expect(r.years.find((y) => y.year === 2028)!.amount).toBe(ANNUAL_CAP);
  });

  it('1年目は開始月からの月数ぶん', () => {
    const r = run('2020-06-15', 30_000, '2027-10');
    expect(r.years[0]).toEqual({ year: 2027, months: 3, amount: 90_000, cumulative: 90_000 });
    expect(r.years[1].amount).toBe(360_000);
  });

  it('最後の月は600万円までの端数だけ積み立てる', () => {
    // 月3.5万円: 171か月で598.5万円、172か月目は1.5万円
    const r = run('2027-01-01', 35_000);
    expect(r.total).toBe(6_000_000);
    expect(r.months.at(-1)!.amount).toBe(15_000);
    expect(r.months).toHaveLength(172);
  });

  it('2027年以降に生まれる子は生まれた月から', () => {
    const r = run('2028-05-20', 10_000);
    expect(r.startYm).toBe('2028-05');
  });

  it('15歳で開始 → 上限に届く前に18歳', () => {
    // 2027年1月に15歳（2011-06-10 生まれ）。2029年1月1日に17歳 → 2029年12月まで
    const r = run('2011-06-10', 50_000);
    expect(r.lastYm).toBe('2029-12');
    expect(r.total).toBe(1_800_000);
    expect(r.reachedYm).toBeNull();
  });

  it('2027年1月1日にすでに18歳以上なら使えない', () => {
    const r = contributionSchedule({ birth: { year: 2009, month: 1, day: 1 }, startYm: START_YM, monthly: 50_000 });
    expect(r).toBe('too-old');
    // 2009-01-02 生まれは2027年1月1日に17歳なので、2027年の1年だけ使える
    const ok = run('2009-01-02', 50_000);
    expect(ok.lastYm).toBe('2027-12');
    expect(ok.total).toBe(600_000);
  });

  it('積立額が0・不正なら結果を出さない', () => {
    const birth = { year: 2020, month: 1, day: 1 };
    expect(contributionSchedule({ birth, startYm: START_YM, monthly: 0 })).toBe('nothing-to-contribute');
    expect(contributionSchedule({ birth, startYm: START_YM, monthly: NaN })).toBe('nothing-to-contribute');
    expect(contributionSchedule({ birth, startYm: '2027-13', monthly: 1000 })).toBe('invalid-start');
  });
});

describe('clampMonthly', () => {
  it('上限を超えたら5万円に丸める', () => {
    expect(clampMonthly(60_000)).toEqual({ monthly: 50_000, capped: true });
    expect(clampMonthly(50_000)).toEqual({ monthly: 50_000, capped: false });
    expect(clampMonthly(12_345.6)).toEqual({ monthly: 12_345, capped: false });
    expect(clampMonthly(-1)).toEqual({ monthly: 0, capped: false });
  });
});

describe('firstWithdrawalYear（その年3月31日に12歳以上の最初の年）', () => {
  it('2012-04-02 生まれ・2027 開始 → 2027（開始年。生年月日だけなら2025）', () => {
    expect(firstWithdrawalYear({ year: 2012, month: 4, day: 2 }, 2027)).toBe(2027);
    expect(firstWithdrawalYear({ year: 2012, month: 4, day: 2 }, 0)).toBe(2025);
    expect(run('2012-04-02', 50_000).withdrawableFromStart).toBe(true);
  });

  it('3/31 生まれと 4/1 生まれで1年ずれる', () => {
    expect(firstWithdrawalYear({ year: 2015, month: 3, day: 31 }, 2027)).toBe(2027);
    expect(firstWithdrawalYear({ year: 2015, month: 4, day: 1 }, 2027)).toBe(2028);
    expect(firstWithdrawalYear({ year: 2020, month: 3, day: 31 }, 2027)).toBe(2032);
    expect(firstWithdrawalYear({ year: 2020, month: 4, day: 1 }, 2027)).toBe(2033);
  });

  it('0歳で始めた子は開始年から払い出せるわけではない', () => {
    expect(run('2027-01-01', 50_000).withdrawableFromStart).toBe(false);
    expect(run('2027-01-01', 50_000).firstWithdrawalYear).toBe(2039);
  });
});

describe('18歳の区切り', () => {
  it('積み立てられる最後の年は1月1日に17歳の年（1月1日生まれだけ1年早い）', () => {
    expect(lastContributionYear({ year: 2020, month: 1, day: 1 })).toBe(2037);
    expect(lastContributionYear({ year: 2020, month: 1, day: 2 })).toBe(2038);
    expect(lastContributionYear({ year: 2020, month: 12, day: 31 })).toBe(2038);
  });

  it('大人のNISAへ移る日は翌年の1月1日', () => {
    expect(transferDate({ year: 2020, month: 1, day: 1 })).toEqual({ year: 2038, month: 1, day: 1 });
    expect(transferDate({ year: 2020, month: 6, day: 15 })).toEqual({ year: 2039, month: 1, day: 1 });
  });

  it('払出しの制限が外れる日（3月31日に18歳の年の1月1日）', () => {
    // 1月2日〜4月1日生まれは移行の1年前に制限が外れる
    expect(restrictionEndDate({ year: 2020, month: 2, day: 1 })).toEqual({ year: 2038, month: 1, day: 1 });
    expect(transferDate({ year: 2020, month: 2, day: 1 })).toEqual({ year: 2039, month: 1, day: 1 });
    // 4月2日以降生まれは移行と同じ日
    expect(restrictionEndDate({ year: 2020, month: 4, day: 2 })).toEqual(transferDate({ year: 2020, month: 4, day: 2 }));
    // 1月1日生まれも同じ日
    expect(restrictionEndDate({ year: 2020, month: 1, day: 1 })).toEqual(transferDate({ year: 2020, month: 1, day: 1 }));
  });
});

describe('formatYen', () => {
  it('万円で区切る', () => {
    expect(formatYen(6_000_000)).toBe('600万円');
    expect(formatYen(255_000)).toBe('25万5,000円');
    expect(formatYen(5_000)).toBe('5,000円');
  });
});

// ─── ページの文面 ───

const pageSrc = readFileSync(fileURLToPath(new URL('../app/kodomo-nisa/page.tsx', import.meta.url)), 'utf8');
const calcSrc = readFileSync(fileURLToPath(new URL('../app/kodomo-nisa/Calculator.tsx', import.meta.url)), 'utf8');

/**
 * learn/tests/compliance.test.ts と同じ線を引く（仕様書「compliance の線は learn と同じに引く」）。
 * learn は別アプリで、語のリストはテストファイルの中にあり import できないので複写している。
 * **learn と揃えること**（片方だけ増やさない）。
 */
const BANNED_ASSERTIONS = [
  '必ず儲か',
  '確実に儲か',
  '絶対に儲か',
  '損はしません',
  '元本は保証',
  '元本保証です',
  '必ず値上がり',
  '確実に増えます',
  '間違いなく上がり',
];
const BANNED_TIMING = ['いま買うべき', '今が買い時', '買い時です', '売り時です', '狙い目です'];
const BANNED_PRODUCTS = [
  'eMAXIS',
  'ニッセイ',
  'たわらノーロード',
  'SBI証券',
  'SBI・',
  '楽天証券',
  '楽天・',
  'マネックス',
  'auカブコム',
  '松井証券',
  'GMOクリック',
  'ひふみ',
  'セゾン投信',
];

/** learn の proseOf() と同じ：タグを落とし、鉤括弧の中（引用）を落とす */
function proseOf(src: string): string {
  return src
    .replace(/className="[^"]*"/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/「[^」]*」/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('compliance（learn と同じ線）', () => {
  it.each([
    ['page.tsx', pageSrc],
    ['Calculator.tsx', calcSrc],
  ])('%s に断定的判断・売買時期の助言・個別商品名が無い', (_name, src) => {
    const prose = proseOf(src);
    for (const phrase of [...BANNED_ASSERTIONS, ...BANNED_TIMING, ...BANNED_PRODUCTS]) {
      expect(prose.includes(phrase), `「${phrase}」が本文にある`).toBe(false);
    }
  });

  it('利回りの入力・評価額を置かない（仕様書「やらないこと」）', () => {
    expect(calcSrc).not.toMatch(/<label[^>]*>[^<]*利回り/);
    expect(calcSrc).not.toMatch(/\b(yield|interestRate|returnRate|expectedReturn)\b/i);
    expect(calcSrc).toContain('途中で払い出さない前提の計算です');
  });

  it('大人の1,800万円の残りを断定しない（要確認3が確定するまで）', () => {
    expect(pageSrc).toContain('政省令');
    expect(calcSrc).not.toContain('1,800万');
  });
});

describe('学ぶへのリンク', () => {
  it('NISA の章が learn に実在する', () => {
    expect(LEARN_NISA_PATH).toBe('/learn/toshi/nisa/');
    const chapter = fileURLToPath(new URL('../../learn/app/toshi/nisa/page.tsx', import.meta.url));
    expect(existsSync(chapter)).toBe(true);
  });
});
