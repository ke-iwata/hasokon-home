import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  bannerText,
  categoryReason,
  cheaperAlternatives,
  classify,
  compareStamps,
  computeFee,
  CURRENT_STAMPS,
  daysBetween,
  fewestStamps,
  formatMonthDay,
  HOLDING_STAMPS,
  ippanKakitomeFee,
  isHagakiSize,
  letterPackThreshold,
  missingNengaSchedule,
  NENGA_2027,
  NENGA_SCHEDULES,
  nengaBanner,
  nengaFaqAnswer,
  NO_OPTIONS,
  optionLines,
  pageDescription,
  pageTitle,
  parseDecimal,
  RATE_TABLES,
  rateTableAt,
  todayInTokyo,
  upcomingNotice,
  type Input,
  type Options,
  type RateTable,
  type Size,
} from '@/lib/yubin-ryokin';
import { metadata } from '@/app/yubin-ryokin/page';
import { tools } from '@/lib/registry';

const T = RATE_TABLES[0];
const ASOF = '2026-11-02';

function env(length: number, width: number, thickness: number, weight: number, options: Options = NO_OPTIONS): Input {
  return { kind: 'envelope', size: { length, width, thickness, weight }, options };
}

function feeOf(input: Input, asOf = ASOF) {
  const r = computeFee(input, asOf);
  if (!r.ok) throw new Error(`料金が出ない: ${JSON.stringify(r)}`);
  return r;
}

describe('入力の読み取り', () => {
  it('全角数字・全角小数点を半角に直す', () => {
    expect(parseDecimal('２３．５')).toBe(23.5);
    expect(parseDecimal('1,000')).toBe(1000);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1.2.3')).toBeNull();
  });
});

describe('区分の境目', () => {
  it('23.5×12×1cm・50g → 定形 110円', () => {
    const r = feeOf(env(23.5, 12, 1, 50));
    expect(r.category).toBe('teikei');
    expect(r.total).toBe(110);
  });

  it('14×9cm → 定形 110円', () => {
    expect(feeOf(env(14, 9, 0.5, 20)).total).toBe(110);
  });

  it('厚さ 1.1cm → 規格内 140円', () => {
    const r = feeOf(env(23.5, 12, 1.1, 50));
    expect(r.category).toBe('kikakunai');
    expect(r.total).toBe(140);
  });

  it('13.9×9cm・14×8.9cm → 送れない（最小の大きさに足りない）', () => {
    expect(classify({ length: 13.9, width: 9, thickness: 0.5, weight: 10 })).toEqual({ kind: 'too-small', missing: ['length'] });
    expect(classify({ length: 14, width: 8.9, thickness: 0.5, weight: 10 })).toEqual({ kind: 'too-small', missing: ['width'] });
    const r = computeFee(env(13.9, 9, 0.5, 10), ASOF);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'too-small') {
      expect(r.message).toBe('長さが14cmに足りないので、郵便では送れません（最小は14×9cm）');
      expect(r.notes.join('')).toContain('6cm×12cm以上');
      expect(r.notes.join('')).toContain('直径3cm・長さ14cm以上');
    } else {
      throw new Error('too-small のはず');
    }
  });

  it('9×14cm（入れ替え）→ 定形', () => {
    expect(classify({ length: 9, width: 14, thickness: 0.5, weight: 10 }).kind).toBe('teikei');
  });

  it('34×25×3cm・1,000g → 規格内 750円、1,001g → 規格外 1,350円', () => {
    expect(feeOf(env(34, 25, 3, 1000))).toMatchObject({ category: 'kikakunai', total: 750 });
    expect(feeOf(env(34, 25, 3, 1001))).toMatchObject({ category: 'kikakugai', total: 1350 });
  });

  it('60×20×10cm（合計 90）→ 規格外、60×20×11cm → 送れない', () => {
    expect(classify({ length: 60, width: 20, thickness: 10, weight: 500 }).kind).toBe('kikakugai');
    expect(classify({ length: 60, width: 20, thickness: 11, weight: 500 })).toEqual({ kind: 'too-large', over: ['sum'] });
    const r = computeFee(env(60, 20, 11, 500), ASOF);
    expect(r.ok === false && r.reason).toBe('too-large');
  });

  it('4kg を超えると送れない', () => {
    expect(classify({ length: 30, width: 20, thickness: 5, weight: 4000.1 })).toEqual({ kind: 'too-large', over: ['weight'] });
  });

  it('長さと幅を入れ替えても同じ区分・同じ料金', () => {
    const sizes: [number, number, number, number][] = [
      [23.5, 12, 1, 50],
      [33.2, 24, 2, 300],
      [40, 30, 5, 800],
      [16.2, 11.4, 0.3, 10],
    ];
    for (const [a, b, t, w] of sizes) {
      expect(computeFee(env(a, b, t, w), ASOF)).toEqual(computeFee(env(b, a, t, w), ASOF));
    }
  });
});

describe('重さの段', () => {
  it('50g ちょうどは下の段、50.1g は上の段', () => {
    expect(feeOf(env(33.2, 24, 2, 50)).total).toBe(140);
    expect(feeOf(env(33.2, 24, 2, 50.1)).total).toBe(180);
    expect(feeOf(env(23.5, 12, 1, 50.1)).category).toBe('kikakunai');
  });

  it('規格内の全段が表どおり', () => {
    const cases: [number, number][] = [
      [50, 140],
      [100, 180],
      [150, 270],
      [250, 320],
      [500, 510],
      [1000, 750],
    ];
    for (const [w, fee] of cases) {
      expect(feeOf(env(33.2, 24, 2, w)).total, `${w}g`).toBe(fee);
      expect(feeOf(env(33.2, 24, 2, w + 0.1)).total, `${w + 0.1}g`).not.toBe(fee);
    }
  });

  it('規格外の全段が表どおり', () => {
    const cases: [number, number][] = [
      [50, 260],
      [100, 290],
      [150, 390],
      [250, 450],
      [500, 660],
      [1000, 920],
      [2000, 1350],
      [4000, 1750],
    ];
    for (const [w, fee] of cases) {
      expect(feeOf(env(40, 30, 5, w)).total, `${w}g`).toBe(fee);
    }
    expect(feeOf(env(40, 30, 5, 50.1)).total).toBe(290);
  });

  it('見出しの区分', () => {
    expect(feeOf(env(33.2, 24, 2, 80)).label).toBe('定形外（規格内）・100gまで');
    expect(feeOf(env(40, 30, 5, 1500)).label).toBe('定形外（規格外）・2kgまで');
  });
});

describe('区分の理由', () => {
  it('外れている条件が 1 つ → 「あと◯」つき', () => {
    expect(categoryReason({ length: 23.5, width: 12, thickness: 1.2, weight: 30 }, 'kikakunai', T)).toBe(
      '厚さが1cmを超えるので定形ではありません（あと2mm薄ければ110円）',
    );
    expect(categoryReason({ length: 23.5, width: 12, thickness: 1, weight: 62 }, 'kikakunai', T)).toBe(
      '重さが50gを超えるので定形ではありません（あと12g軽ければ110円）',
    );
    expect(categoryReason({ length: 25, width: 12, thickness: 1, weight: 30 }, 'kikakunai', T)).toBe(
      '長さが23.5cmを超えるので定形ではありません（あと15mm短ければ110円）',
    );
  });

  it('規格外 → 規格内に入るには（重さを直すなら 1kg の段の額）', () => {
    expect(categoryReason({ length: 34, width: 25, thickness: 3.5, weight: 300 }, 'kikakugai', T)).toBe(
      '厚さが3cmを超えるので規格内ではありません（あと5mm薄ければ510円）',
    );
    expect(categoryReason({ length: 34, width: 25, thickness: 3, weight: 1200 }, 'kikakugai', T)).toBe(
      '重さが1,000gを超えるので規格内ではありません（あと200g軽ければ750円）',
    );
  });

  it('2 つ以上 → 条件を並べた 1 行で「あと◯」なし', () => {
    const r = categoryReason({ length: 23.5, width: 12, thickness: 1.4, weight: 62 }, 'kikakunai', T);
    expect(r).toBe('厚さ（1.4cm）と重さ（62g）が定形の上限（1cm・50g）を超えているので定形ではありません');
    expect(r).not.toContain('あと');
  });

  it('3 つ以上でも 1 行のまま（長さ・幅・厚さ・重さの順）', () => {
    const r = categoryReason({ length: 33.2, width: 24, thickness: 2, weight: 300 }, 'kikakunai', T)!;
    expect(r).toBe('長さ（33.2cm）・幅（24cm）・厚さ（2cm）と重さ（300g）が定形の上限（23.5cm・12cm・1cm・50g）を超えているので定形ではありません');
    expect(r.split('\n')).toHaveLength(1);
  });

  it('定形なら理由は出さない', () => {
    expect(feeOf(env(23.5, 12, 1, 50)).reason).toBeNull();
  });
});

describe('オプション', () => {
  const opt = (o: Partial<Options>): Options => ({ ...NO_OPTIONS, ...o });

  it('速達の 250g／1kg／4kg の境目', () => {
    const fee = (w: number) => optionLines(opt({ sokutatsu: true }), w, T);
    expect(fee(250)).toEqual({ ok: true, lines: [{ label: '速達', amount: 300 }] });
    expect(fee(250.1)).toEqual({ ok: true, lines: [{ label: '速達', amount: 400 }] });
    expect(fee(1000)).toEqual({ ok: true, lines: [{ label: '速達', amount: 400 }] });
    expect(fee(1000.1)).toEqual({ ok: true, lines: [{ label: '速達', amount: 690 }] });
    expect(fee(4000)).toEqual({ ok: true, lines: [{ label: '速達', amount: 690 }] });
  });

  it('内訳：基本 180＋速達 300＝480円', () => {
    const r = feeOf(env(33.2, 24, 2, 80, opt({ sokutatsu: true })));
    expect(r.base).toBe(180);
    expect(r.options).toEqual([{ label: '速達', amount: 300 }]);
    expect(r.total).toBe(480);
  });

  it('特定記録 +210円', () => {
    expect(feeOf(env(23.5, 12, 1, 25, opt({ record: 'tokutei' }))).total).toBe(320);
  });

  it('一般書留の損害要償額：10万・10万1円（+23）・500万・500万1円（送れない）', () => {
    expect(ippanKakitomeFee(100_000, T)).toBe(480);
    expect(ippanKakitomeFee(100_001, T)).toBe(503);
    expect(ippanKakitomeFee(150_000, T)).toBe(503);
    expect(ippanKakitomeFee(150_001, T)).toBe(526);
    expect(ippanKakitomeFee(5_000_000, T)).toBe(480 + 98 * 23);
    expect(ippanKakitomeFee(5_000_001, T)).toBeNull();
    expect(ippanKakitomeFee(null, T)).toBe(480);
    const r = computeFee(env(23.5, 12, 1, 25, opt({ record: 'ippan', songai: 5_000_001 })), ASOF);
    expect(r.ok === false && r.reason).toBe('option');
  });

  it('配達証明は一般書留なしでは足せない', () => {
    expect(feeOf(env(23.5, 12, 1, 25, opt({ haitatsuShomei: true }))).total).toBe(110);
    expect(feeOf(env(23.5, 12, 1, 25, opt({ record: 'kani', haitatsuShomei: true }))).total).toBe(460);
    expect(feeOf(env(23.5, 12, 1, 25, opt({ record: 'ippan', haitatsuShomei: true }))).total).toBe(110 + 480 + 350);
  });

  it('簡易書留の損害要償額 5万円 → 簡易書留のまま、5万1円 → 料金を出さず一般書留を案内', () => {
    expect(feeOf(env(23.5, 12, 1, 25, opt({ record: 'kani', songai: 50_000 }))).total).toBe(460);
    const r = optionLines(opt({ record: 'kani', songai: 50_001 }), 25, T);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('kani-over');
      expect(r.message).toBe('簡易書留は5万円まで。5万円を超えるなら一般書留にしてください。');
    }
  });
});

describe('はがき', () => {
  const hagaki = (size: Partial<Size> = {}, kind: 'hagaki' | 'ofuku' = 'hagaki'): Input => ({
    kind,
    size: { length: 14.8, width: 10, thickness: 0, weight: 3, ...size },
    options: NO_OPTIONS,
  });

  it('通常はがき 85円・往復はがき 170円', () => {
    expect(feeOf(hagaki()).total).toBe(85);
    expect(feeOf(hagaki({}, 'ofuku')).total).toBe(170);
  });

  it('はがきの規格を外れたら封書として判定する', () => {
    expect(isHagakiSize({ length: 15.4, width: 10.7, thickness: 0, weight: 6 })).toBe(true);
    expect(isHagakiSize({ length: 15.5, width: 10.7, thickness: 0, weight: 6 })).toBe(false);
    const r = feeOf(hagaki({ weight: 7 }));
    expect(r.hagakiOutOfSpec).toBe(true);
    expect(r.category).toBe('teikei');
    expect(r.total).toBe(110);
  });
});

describe('手持ちの切手', () => {
  it('84円 1 枚で定形 110円 → 26円不足', () => {
    const r = compareStamps({ 84: 1 }, 110);
    expect(r).toMatchObject({ kind: 'short', held: 84, shortBy: 26 });
  });

  it('組み合わせの枚数が最少（今売られている額面だけで組む）', () => {
    expect(fewestStamps(26)).toEqual([[26, 1]]);
    expect(fewestStamps(25)).toEqual([
      [20, 1],
      [5, 1],
    ]);
    // 総当たりと突き合わせる（1〜600円）
    const best = new Array<number>(601).fill(Infinity);
    best[0] = 0;
    for (let a = 1; a <= 600; a++) for (const d of CURRENT_STAMPS) if (d <= a) best[a] = Math.min(best[a], best[a - d] + 1);
    for (let a = 1; a <= 600; a++) {
      const combo = fewestStamps(a)!;
      expect(combo.reduce((s, [v, n]) => s + v * n, 0), `${a}円の合計`).toBe(a);
      expect(combo.reduce((s, [, n]) => s + n, 0), `${a}円の枚数`).toBe(best[a]);
      for (const [v] of combo) expect(CURRENT_STAMPS).toContain(v);
    }
    // 旧料金の額面（84円など）は組み合わせに使わない
    expect(fewestStamps(84)!.some(([v]) => v === 84)).toBe(false);
  });

  it('貼りすぎの差額・ちょうど', () => {
    expect(compareStamps({ 84: 2 }, 110)).toEqual({ kind: 'over', held: 168, overBy: 58 });
    expect(compareStamps({ 84: 1, 26: 1 }, 110)).toEqual({ kind: 'exact', held: 110 });
    expect(compareStamps({}, 110)).toEqual({ kind: 'none' });
  });

  it('手持ちの欄は旧料金の切手（84・63・62・52・82円）と今売られている額面を並べる', () => {
    for (const v of [84, 63, 62, 52, 82]) expect(HOLDING_STAMPS).toContain(v);
    for (const v of CURRENT_STAMPS) expect(HOLDING_STAMPS).toContain(v);
    expect(new Set(HOLDING_STAMPS).size).toBe(HOLDING_STAMPS.length);
  });
});

describe('ほかの送り方（レターパック）', () => {
  it('ライトに入り、定形外の料金が 430円を超えるなら差額を出す', () => {
    const size = { length: 33.2, width: 24, thickness: 2, weight: 300 };
    expect(cheaperAlternatives(size, 510, T)).toEqual([
      { name: 'レターパックライト', price: 430, delivery: '郵便受けに配達', cheaperBy: 80 },
    ]);
  });

  it('厚さ 3cm を超えるとライトは出さず、600円を超えるならプラス', () => {
    const size = { length: 33, width: 24, thickness: 4, weight: 600 };
    expect(cheaperAlternatives(size, 920, T)).toEqual([
      { name: 'レターパックプラス', price: 600, delivery: '対面で配達', cheaperBy: 320 },
    ]);
  });

  it('A4 ファイルサイズ（34×24.8cm）に入らなければ出さない', () => {
    expect(cheaperAlternatives({ length: 35, width: 24, thickness: 2, weight: 600 }, 920, T)).toEqual([]);
    expect(cheaperAlternatives({ length: 34, width: 24.9, thickness: 2, weight: 600 }, 920, T)).toEqual([]);
  });

  it('安いときは出さない', () => {
    expect(cheaperAlternatives({ length: 33.2, width: 24, thickness: 2, weight: 200 }, 320, T)).toEqual([]);
  });

  it('レターパックのほうが安くなり始める重さを表から出す', () => {
    expect(letterPackThreshold(T.kikakunai, T.letterPackLight)).toEqual({ overWeight: 250, fee: 510 });
    expect(letterPackThreshold(T.kikakugai, T.letterPackPlus)).toEqual({ overWeight: 250, fee: 660 });
  });
});

describe('日付つきの表', () => {
  const FUTURE: RateTable = {
    ...T,
    effectiveFrom: '2027-10-01',
    teikei: 130,
    kikakunai: T.kikakunai.map((s) => ({ ...s, fee: s.fee + 20 })),
    hagaki: 100,
    sokutatsu: T.sokutatsu.map((s) => ({ ...s, fee: s.fee + 10 })),
    tokuteiKiroku: 230,
    letterPackLight: 450,
    letterPackPlus: 620,
  };
  const tables = [T, FUTURE];

  it('asOf が表の境目の前後で使う表が変わる（基本料金・加算額・レターパックが揃って切り替わる）', () => {
    expect(rateTableAt('2027-09-30', tables)).toBe(T);
    expect(rateTableAt('2027-10-01', tables)).toBe(FUTURE);
    const input = env(23.5, 12, 1, 25, { ...NO_OPTIONS, sokutatsu: true, record: 'tokutei' });
    const before = computeFee(input, '2027-09-30', tables);
    const after = computeFee(input, '2027-10-01', tables);
    expect(before.ok && before.total).toBe(110 + 300 + 210);
    expect(after.ok && after.total).toBe(130 + 310 + 230);
    expect(rateTableAt('2027-10-01', tables).letterPackLight).toBe(450);
  });

  it('未来の表があると予告の 1 行が出る（無ければ出ない）', () => {
    const input = env(23.5, 12, 1, 25);
    expect(upcomingNotice(input, '2027-09-30', tables)).toBe('2027年10月1日から130円になります');
    expect(upcomingNotice(input, '2027-10-01', tables)).toBeNull();
    expect(upcomingNotice(input, ASOF)).toBeNull();
  });

  it('表は effectiveFrom の昇順', () => {
    const froms = RATE_TABLES.map((t) => t.effectiveFrom);
    expect([...froms].sort()).toEqual(froms);
  });
});

describe('年賀状の帯（Asia/Tokyo）', () => {
  const b = (d: string) => nengaBanner(d);

  it('今日は Asia/Tokyo で取る（UTC の 15:00 は翌日）', () => {
    expect(todayInTokyo(new Date('2026-12-27T14:59:59Z'))).toBe('2026-12-27');
    expect(todayInTokyo(new Date('2026-12-27T15:00:00Z'))).toBe('2026-12-28');
  });

  it('日付の部品', () => {
    expect(formatMonthDay('2026-12-20')).toBe('12月20日（日）');
    expect(formatMonthDay('2026-12-19')).toBe('12月19日（土）');
    expect(formatMonthDay('2027-01-03')).toBe('1月3日（日）');
    expect(daysBetween('2027-01-01', '2027-01-15')).toBe(14);
    expect(addDays('2027-01-15', 1)).toBe('2027-01-16');
  });

  it('10-31 は出ない・11-01 は出る（11-01 だけ販売開始の一文が頭に付く）', () => {
    expect(b('2026-10-31')).toBeNull();
    const nov1 = b('2026-11-01')!;
    expect(nov1.stage).toBe('before-accept');
    expect(bannerText(nov1)).toBe(
      '年賀はがきの販売は11月2日（月）から。年賀状の受付は12月20日（日）から。元日に届けるには12月27日（日）までに出してください。12月19日（土）以前に出した年賀状は、ふつうの郵便として年内に届きます。',
    );
    expect(bannerText(b('2026-11-02')!)).not.toContain('販売は11月2日');
  });

  it('12-19 と 12-20 で文言が変わる', () => {
    expect(b('2026-12-19')!.stage).toBe('before-accept');
    expect(b('2026-12-19')!.countdown).toBe('受付開始まであと1日');
    expect(b('2026-12-20')!.stage).toBe('accepting');
    expect(bannerText(b('2026-12-20')!)).toBe('年賀状の受付が始まっています。元日に届けるには12月27日（日）までに出してください。');
    expect(b('2026-12-20')!.countdown).toBe('元日に届ける目安まであと7日');
  });

  it('12-27 の残りは「今日まで」、12-28〜12-31 は残り日数を出さない', () => {
    expect(b('2026-12-27')!.countdown).toBe('元日に届ける目安は今日まで');
    const d28 = b('2026-12-28')!;
    expect(d28.stage).toBe('after-new-year-by');
    expect(d28.countdown).toBeNull();
    expect(bannerText(d28)).toBe('元日に届けるための差出の目安（12月27日）は過ぎました。三が日の年賀状の配達は元日と1月3日（日）です。');
    expect(b('2026-12-31')!.countdown).toBeNull();
  });

  it('12-31 と 01-01 で文言が変わり、01-01 の残りは 01-15 まで（14日）', () => {
    expect(b('2026-12-31')!.stage).toBe('after-new-year-by');
    const jan1 = b('2027-01-01')!;
    expect(jan1.stage).toBe('new-year');
    expect(jan1.countdown).toBe('販売終了まであと14日');
    expect(bannerText(jan1)).toBe('年賀はがきの販売は1月15日（金）まで。三が日の年賀状の配達は元日と1月3日（日）です。');
    expect(bannerText(b('2027-01-04')!)).toBe('年賀はがきの販売は1月15日（金）まで。');
  });

  it('01-15 は出る（今日まで）・01-16 は出ない', () => {
    expect(b('2027-01-15')!.countdown).toBe('販売終了は今日まで');
    expect(b('2027-01-16')).toBeNull();
  });

  it('到着の約束（◯日に届きます・まだ間に合います）はどの段階でも書かない', () => {
    for (let d = '2026-11-01'; d <= '2027-01-15'; d = addDays(d, 1)) {
      const text = bannerText(b(d)!);
      expect(text, d).not.toMatch(/日に届きます|間に合います/);
    }
  });

  it('翌年用の日付が定数に無いまま 11 月を迎えたら帯を出さない', () => {
    expect(nengaBanner('2027-11-01')).toBeNull();
  });
});

describe('翌年の定数の足し忘れ', () => {
  it('判定：10-31 は見ない・11-01 から翌年の定数が要る', () => {
    expect(missingNengaSchedule('2027-10-31')).toBeNull();
    expect(missingNengaSchedule('2027-11-01')).toBe(
      '`NENGA_2028` がありません。8 月末の日本郵便の発表（2028 年用年賀はがきの発行・販売等）を見て `NENGA_2028` を `tools/lib/yubin-ryokin.ts` に足す。仕様：docs/features/yubin-ryokin-keisan.md#年賀状の帯季節の表示',
    );
    expect(missingNengaSchedule('2026-11-01')).toBeNull();
    expect(missingNengaSchedule('2026-10-31')).toBeNull();
  });

  it('今日（Asia/Tokyo）の時点で翌年用の NENGA_* が足されている', () => {
    // 日付で落ちるテスト。関係のない PR の CI まで赤くなるのを承知で入れている（仕様）
    const message = missingNengaSchedule(todayInTokyo());
    expect(message, message ?? '').toBeNull();
  });

  it('定数の日付の並びが正しい', () => {
    for (const s of NENGA_SCHEDULES) {
      expect(s.saleFrom < s.acceptFrom && s.acceptFrom < s.newYearBy && s.newYearBy < `${s.year}-01-01`).toBe(true);
      expect(s.saleTo.startsWith(`${s.year}-01-`)).toBe(true);
    }
  });
});

describe('焼き込みの文面', () => {
  it('title の額が RATE_TABLES の現行の表と一致する', () => {
    const t = rateTableAt(todayInTokyo());
    expect(String(metadata.title)).toBe(pageTitle(todayInTokyo()));
    expect(String(metadata.title)).toContain(`はがき${t.hagaki}円`);
    expect(String(metadata.title)).toContain(`定形${t.teikei}円`);
  });

  it('description はビルド日から組み立てる', () => {
    expect(metadata.description).toBe(pageDescription(todayInTokyo()));
  });

  it('期間内の description には年賀の部分が入る', () => {
    expect(pageDescription('2026-11-02')).toBe(
      '封筒の大きさと重さから定形・定形外（規格内・規格外）を判定し、郵便料金を計算。速達・書留・特定記録の加算、手持ちの84円・63円切手にあと何円足すか、レターパックのほうが安いかも表示。2027年用年賀状の受付開始（12月20日）と元日配達の期限（12月27日）つき。登録不要・無料。',
    );
  });

  it('ビルド日が saleTo の翌日なら description に年賀の部分が無い', () => {
    const after = addDays(NENGA_2027.saleTo, 1);
    expect(pageDescription(after)).toBe(
      '封筒の大きさと重さから定形・定形外（規格内・規格外）を判定し、郵便料金を計算。速達・書留・特定記録の加算、手持ちの84円・63円切手にあと何円足すか、レターパックのほうが安いかも表示。登録不要・無料。',
    );
    expect(pageDescription(NENGA_2027.saleTo)).toContain('2027年用年賀状');
  });

  it('FAQ の年賀状の答えは期間外なら日付を書かない', () => {
    expect(nengaFaqAnswer('2026-11-02')).toContain('2026年12月20日（日）から');
    expect(nengaFaqAnswer('2026-11-02')).toContain('12月27日（日）まで');
    expect(nengaFaqAnswer('2027-01-16')).toBe('毎年8月末に日本郵便が発表します。発表が出たらこのページに載せます。');
  });

  it('registry の description に年賀の日付や額を書かない（焼き込みで古くならないように）', () => {
    const d = tools.find((t) => t.slug === 'yubin-ryokin')!.description;
    expect(d).not.toMatch(/年用年賀状|12月20日|12月27日|\d+円になります/);
  });
});

describe('改正郵便法の時制（docs/features/kokai-tool-seikaku-2026-11-04.md B2）', () => {
  // 施行は 2026-12-01。静的書き出しで時制がビルド日に固定されるので、施行の前後どちらで読んでも正しい文にする
  const root = new URL('../', import.meta.url);
  const read = (file: string) => readFileSync(new URL(file, root), 'utf8');

  it('page.tsx に「変わりました」「認可制に変わった」が無く、「2026年12月1日施行」がある', () => {
    const page = read('app/yubin-ryokin/page.tsx');
    expect(page).not.toContain('変わりました');
    expect(page).not.toContain('認可制に変わった');
    expect(page).toContain('2026年12月1日施行');
    expect(page).toContain('施行前は省令で定めます');
  });

  it('lib のコメントも施行日を明記した書き方', () => {
    const lib = read('lib/yubin-ryokin.ts');
    expect(lib).not.toContain('認可制に変わった');
    expect(lib).toContain('2026年12月1日施行');
  });
});
