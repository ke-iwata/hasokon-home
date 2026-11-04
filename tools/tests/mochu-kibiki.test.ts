import { describe, expect, it } from 'vitest';
import {
  dashidoki,
  dashidokiFaqAnswer,
  dashidokiText,
  hoyoDates,
  KIBIKI_TABLE,
  kanchuPeriod,
  kibiki,
  kinship,
  mochuNewYear,
  mochuScope,
  pageDescription,
  pageTitle,
  RELATIONS,
  relationById,
  RISSHUN,
  SELF_PRIMARY_COUNT,
  todayInTokyo,
  weekendBefore,
  type Dashidoki,
  type RelationId,
} from '@/lib/mochu-kibiki';
import { NENGA_2027, NENGA_SCHEDULES } from '@/lib/yubin-ryokin';

const rel = (id: RelationId) => relationById(id);
const noCond = { seikei: false, daishu: false, start: '2026-11-02', ofuku: 0 };

describe('親等と関係（民法725・726条）', () => {
  it.each<[RelationId, number, 'blood' | 'affinity']>([
    ['fubo', 1, 'blood'],
    ['sofubo', 2, 'blood'],
    ['kyodai', 2, 'blood'],
    ['ojioba', 3, 'blood'],
    ['oimei', 3, 'blood'],
    ['itoko', 4, 'blood'],
    ['sosofubo', 3, 'blood'],
    ['gi-fubo', 1, 'affinity'],
    ['gi-kyodai', 2, 'affinity'],
    ['gi-ojioba', 3, 'affinity'],
  ])('%s は %i 親等の %s', (id, degree, kind) => {
    const k = kinship(rel(id));
    expect(k.degree).toBe(degree);
    expect(k.kind).toBe(kind);
    expect(k.isRelative).toBe(true);
  });

  it('いとこは「四親等の血族（傍系）」', () => {
    expect(kinship(rel('itoko')).label).toBe('四親等の血族（傍系）');
  });

  it('配偶者の父母は一親等の姻族で、民法上の親族', () => {
    const k = kinship(rel('gi-fubo'));
    expect(k.label).toBe('一親等の姻族（直系）');
    expect(k.isRelative).toBe(true);
  });

  it('配偶者のいとこは姻族の4親等で、民法上の親族ではない', () => {
    const k = kinship(rel('gi-itoko'));
    expect(k).toMatchObject({ kind: 'affinity', degree: 4, isRelative: false });
  });

  it('配偶者は親等なしで親族', () => {
    expect(kinship(rel('haigusha'))).toMatchObject({ kind: 'spouse', degree: null, isRelative: true });
  });

  it('自分側の血族の配偶者（子の配偶者・継父母）は姻族', () => {
    expect(kinship(rel('ko-haigusha'))).toMatchObject({ kind: 'affinity', degree: 1 });
    expect(kinship(rel('fubo-haigusha'))).toMatchObject({ kind: 'affinity', degree: 1, line: 'direct' });
    expect(kinship(rel('ojioba-haigusha'))).toMatchObject({ kind: 'affinity', degree: 3, isRelative: true });
  });
});

describe('続柄の一覧', () => {
  it('自分側15・配偶者側7の計22項目で、id が重複しない', () => {
    expect(RELATIONS).toHaveLength(22);
    expect(RELATIONS.filter((r) => r.side === 'self')).toHaveLength(15);
    expect(RELATIONS.filter((r) => r.side === 'spouse')).toHaveLength(7);
    expect(new Set(RELATIONS.map((r) => r.id)).size).toBe(22);
  });

  it('全項目に親等・血族／姻族・喪中の目安が定義されている', () => {
    for (const r of RELATIONS) {
      const k = kinship(r);
      expect(['spouse', 'blood', 'affinity'], r.id).toContain(k.kind);
      if (k.kind !== 'spouse') expect(k.degree, r.id).toBeGreaterThan(0);
      expect(k.label, r.id).toMatch(/親等/);
      expect(['usual', 'optional'], r.id).toContain(mochuScope(r));
    }
  });

  it('自分側の最初の8個はよく選ばれる順（配偶者・父母・祖父母…いとこ）', () => {
    const self = RELATIONS.filter((r) => r.side === 'self').slice(0, SELF_PRIMARY_COUNT).map((r) => r.id);
    expect(self).toEqual(['haigusha', 'fubo', 'sofubo', 'kyodai', 'ko', 'mago', 'ojioba', 'itoko']);
  });
});

describe('喪中はがきの範囲（目安）', () => {
  it('二親等以内と配偶者は usual、三親等以上は optional', () => {
    expect(mochuScope(rel('haigusha'))).toBe('usual');
    expect(mochuScope(rel('fubo'))).toBe('usual');
    expect(mochuScope(rel('sofubo'))).toBe('usual');
    expect(mochuScope(rel('mago'))).toBe('usual');
    expect(mochuScope(rel('gi-fubo'))).toBe('usual');
    expect(mochuScope(rel('gi-kyodai'))).toBe('usual');
    expect(mochuScope(rel('ojioba'))).toBe('optional');
    expect(mochuScope(rel('itoko'))).toBe('optional');
    expect(mochuScope(rel('gi-itoko'))).toBe('optional');
  });
});

describe('忌引き（人事院規則15-14 別表第二）', () => {
  it('別表第二は12行（改正に気づくため）', () => {
    expect(KIBIKI_TABLE).toHaveLength(12);
  });

  it.each<[RelationId, number]>([
    ['haigusha', 7],
    ['fubo', 7],
    ['ko', 5],
    ['sofubo', 3],
    ['mago', 1],
    ['kyodai', 3],
    ['ojioba', 1],
    ['gi-fubo', 3],
    ['ko-haigusha', 1],
    ['gi-sofubo', 1],
    ['gi-kyodai', 1],
    ['ojioba-haigusha', 1],
  ])('%s は %i 日', (id, days) => {
    expect(kibiki(rel(id), noCond)!.baseDays).toBe(days);
  });

  it('全12行がどれかの続柄から引かれている', () => {
    const used = new Set(RELATIONS.map((r) => r.kibiki).filter(Boolean));
    for (const row of KIBIKI_TABLE) expect(used.has(row.id), row.id).toBe(true);
  });

  it.each<[RelationId, 'daishu' | 'seikei', number]>([
    ['sofubo', 'daishu', 7],
    ['ojioba', 'daishu', 7],
    ['gi-fubo', 'seikei', 7],
    ['ko-haigusha', 'seikei', 5],
    ['gi-sofubo', 'seikei', 3],
    ['gi-kyodai', 'seikei', 3],
  ])('%s は %s の場合 %i 日', (id, cond, days) => {
    const r = kibiki(rel(id), { ...noCond, [cond]: true })!;
    expect(r.baseDays).toBe(days);
    expect(r.extraApplied).toBe(true);
  });

  it('条件が違えば増えない（祖父母に生計同一をつけても3日）', () => {
    expect(kibiki(rel('sofubo'), { ...noCond, seikei: true })!.baseDays).toBe(3);
    expect(kibiki(rel('ojioba-haigusha'), { ...noCond, seikei: true, daishu: true })!.baseDays).toBe(1);
  });

  it('継父母・配偶者の子・兄弟姉妹の配偶者は、配偶者側と同じ行を引く', () => {
    expect(kibiki(rel('fubo-haigusha'), noCond)!.row.id).toBe('fubo-haigusha');
    expect(kibiki(rel('gi-ko'), noCond)!.row.id).toBe('ko-haigusha');
    expect(kibiki(rel('kyodai-haigusha'), noCond)!.row.id).toBe('kyodai-haigusha');
  });

  it('父母・1日目 2026-11-02（月）→ 終わり 2026-11-08（日）。往復2日で 11-10', () => {
    expect(kibiki(rel('fubo'), noCond)!.end).toBe('2026-11-08');
    const r = kibiki(rel('fubo'), { ...noCond, ofuku: 2 })!;
    expect(r.totalDays).toBe(9);
    expect(r.end).toBe('2026-11-10');
  });

  it('孫は1日なので1日目がそのまま終わりの日', () => {
    expect(kibiki(rel('mago'), noCond)!.end).toBe('2026-11-02');
  });

  it('往復は 0〜7 に丸める', () => {
    expect(kibiki(rel('fubo'), { ...noCond, ofuku: 20 })!.ofuku).toBe(7);
    expect(kibiki(rel('fubo'), { ...noCond, ofuku: -3 })!.ofuku).toBe(0);
  });

  it('別表第二に無い続柄（いとこ・甥姪・曾祖父母・配偶者のおじおば）は null', () => {
    for (const id of ['itoko', 'oimei', 'sosofubo', 'himago', 'gi-ojioba', 'gi-oimei', 'gi-itoko'] as RelationId[]) {
      expect(kibiki(rel(id), noCond), id).toBeNull();
    }
  });
});

describe('喪中の正月', () => {
  it('命日より後に最初に来る1月1日の年', () => {
    expect(mochuNewYear('2026-12-31')).toBe(2027);
    expect(mochuNewYear('2027-01-01')).toBe(2028);
    expect(mochuNewYear('2026-10-27')).toBe(2027);
  });
});

describe('出しどき', () => {
  const d = (meinichi: string, today: string, m: 7 | 15 = 7): Dashidoki => dashidoki(meinichi, today, m);

  it('命日 2026-10-27・今日 2026-11-20 → #5（12月上旬までに）', () => {
    const r = d('2026-10-27', '2026-11-20');
    expect(r.kind).toBe('before-accept');
    if (r.kind !== 'before-accept') return;
    expect(r.deadline).toBe('2026-12-19');
    expect(r.daysLeft).toBe(29);
    expect(r.decemberNote).toBe(false);
    const t = dashidokiText(r);
    expect(t.head).toBe('12月19日までに届くように（あと29日）');
    expect(t.body).toMatch(/理想は12月上旬まで/);
    expect(t.body).toMatch(/12月20日（日）から/);
    expect(t.note).toBeNull();
  });

  it('2026-12-19 → #5 今日まで', () => {
    const r = d('2026-10-27', '2026-12-19');
    expect(r.kind).toBe('before-accept');
    expect(dashidokiText(r).head).toMatch(/今日まで/);
  });

  it('2026-12-20 → #6（受付開始）', () => {
    const r = d('2026-10-27', '2026-12-20');
    expect(r.kind).toBe('accepting');
    expect(dashidokiText(r).body).toMatch(/寒中見舞い（1月8日〜2月3日）/);
  });

  it('2027-01-05 → #3、2027-02-03 → #3、2027-02-04 → #2', () => {
    expect(d('2026-10-27', '2027-01-05').kind).toBe('new-year');
    expect(d('2026-10-27', '2027-02-03').kind).toBe('new-year');
    const passed = d('2026-10-27', '2027-02-04');
    expect(passed).toEqual({ kind: 'passed', year: 2027 });
    expect(dashidokiText(passed).head).toBe('喪中の正月（2027年）は過ぎています');
  });

  it('寒中見舞い：松の内 1/7 → 01-08〜02-03、1/15 → 01-16〜02-03', () => {
    expect(kanchuPeriod(2027, 7)).toEqual({ from: '2027-01-08', to: '2027-02-03' });
    expect(kanchuPeriod(2027, 15)).toEqual({ from: '2027-01-16', to: '2027-02-03' });
    const r = d('2026-10-27', '2027-01-10', 15);
    expect(r.kind === 'new-year' && r.kanchu.from).toBe('2027-01-16');
  });

  it('年賀の定数がある年には立春の日も入っている（NENGA_SCHEDULES に足したら RISSHUN にも足す）', () => {
    for (const s of NENGA_SCHEDULES) expect(RISSHUN[s.year], String(s.year)).toMatch(/^\d{4}-02-0[345]$/);
  });

  it('立春が未収録の年は終わりの日を出さない', () => {
    const k = kanchuPeriod(2028, 7);
    expect(k.to).toBeNull();
  });

  it('命日 2025-11-10・今日 2026-10-27 → #2（2027年用の日付を出さない）', () => {
    const r = d('2025-11-10', '2026-10-27');
    expect(r).toEqual({ kind: 'passed', year: 2026 });
    expect(JSON.stringify(dashidokiText(r))).not.toMatch(/12月20日|12月19日/);
  });

  it('命日 2027-02-01・今日 2027-02-10 → #4「2028年用の日程は未確認」（日付を推測しない）', () => {
    // NENGA_SCHEDULES に 2028 を足したら、この期待値を before-accept に直す
    expect(NENGA_SCHEDULES.some((s) => s.year === 2028)).toBe(false);
    const r = d('2027-02-01', '2027-02-10');
    expect(r.kind).toBe('unknown');
    const t = dashidokiText(r);
    expect(t.head).toBe('2028年用の日程は未確認です');
    expect(t.body).not.toMatch(/\d+月\d+日/);
  });

  it('命日が12月：命日 2026-12-05・今日 2026-12-06 → #5（あと13日）＋寒中見舞いの添え書き', () => {
    const r = d('2026-12-05', '2026-12-06');
    expect(r.kind).toBe('before-accept');
    if (r.kind !== 'before-accept') return;
    expect(r.daysLeft).toBe(13);
    expect(r.decemberNote).toBe(true);
    expect(dashidokiText(r).note).toMatch(/寒中見舞い/);
    expect(d('2026-12-05', '2026-12-21').kind).toBe('accepting');
  });

  it('命日 2026-12-31 は 2027 年が喪中の正月、2027-01-01 は 2028 年', () => {
    expect(d('2026-12-31', '2026-12-31').year).toBe(2027);
    expect(d('2027-01-01', '2027-01-02').year).toBe(2028);
  });

  it('今日は Asia/Tokyo で取る：2026-12-19T15:30Z は 12-20 で #6', () => {
    const today = todayInTokyo(new Date('2026-12-19T15:30:00Z'));
    expect(today).toBe('2026-12-20');
    expect(d('2026-10-27', today).kind).toBe('accepting');
  });
});

describe('法要の日付', () => {
  const find = (list: ReturnType<typeof hoyoDates>, name: string) => list.find((h) => h.name === name)!;

  it('命日 2026-10-27 → 初七日 11-02・四十九日 12-14・百か日 2027-02-03・一周忌 2027-10-27・三回忌 2028-10-27', () => {
    const h = hoyoDates('2026-10-27');
    expect(find(h, '初七日').date).toBe('2026-11-02');
    expect(find(h, '四十九日').date).toBe('2026-12-14');
    expect(find(h, '百か日').date).toBe('2027-02-03');
    expect(find(h, '一周忌').date).toBe('2027-10-27');
    expect(find(h, '三回忌').date).toBe('2028-10-27');
    expect(find(h, '七回忌').date).toBe('2032-10-27');
    expect(find(h, '三十三回忌').date).toBe('2058-10-27');
  });

  it('前日から数える設定で四十九日 12-13（年忌は変わらない）', () => {
    const h = hoyoDates('2026-10-27', 'zenjitsu');
    expect(find(h, '四十九日').date).toBe('2026-12-13');
    expect(find(h, '一周忌').date).toBe('2027-10-27');
  });

  it('命日 2028-02-29 の一周忌は 2029-02-28（注記つき）、四回目の閏年の年忌はそのまま', () => {
    const h = hoyoDates('2028-02-29');
    expect(find(h, '一周忌')).toMatchObject({ date: '2029-02-28', leapAdjusted: true });
    expect(find(h, '十三回忌').date).toBe('2040-02-29');
    expect(find(h, '十三回忌').leapAdjusted).toBeUndefined();
  });

  it('直前の土日：2026-12-14（月）→ 12-12（土）・12-13（日）', () => {
    expect(weekendBefore('2026-12-14')).toEqual(['2026-12-12', '2026-12-13']);
    expect(find(hoyoDates('2026-10-27'), '四十九日').weekend).toEqual(['2026-12-12', '2026-12-13']);
  });

  it('当日が土日なら当日だけ：前日から数える設定の 12-13（日）→ 12-13', () => {
    expect(find(hoyoDates('2026-10-27', 'zenjitsu'), '四十九日').weekend).toEqual(['2026-12-13']);
    expect(weekendBefore('2026-12-12')).toEqual(['2026-12-12']);
  });

  it('金曜は前の週の土日', () => {
    expect(weekendBefore('2026-12-18')).toEqual(['2026-12-12', '2026-12-13']);
  });
});

describe('ページの文面', () => {
  it('期間内：title・description・FAQ に 2027年用の受付開始が入る', () => {
    expect(pageTitle('2026-11-04')).toBe('喪中はがきの範囲・忌引き日数・四十九日 早見｜2027年用は年賀状の受付が12月20日から');
    expect(pageDescription('2026-11-04')).toBe(
      '亡くなった方の続柄と命日から、何親等か・喪中はがきを出す範囲・出す時期（2027年用の年賀状の受付は12月20日から）・寒中見舞いの期間・忌引きの日数（国家公務員の基準）・四十九日や一周忌の日付を一度に表示。登録不要・無料。',
    );
    expect(dashidokiFaqAnswer('2026-11-04')).toMatch(/12月19日/);
  });

  it('期間外（販売終了の翌日）：日付の無い全文', () => {
    const after = '2027-01-16';
    expect(after > NENGA_2027.saleTo).toBe(true);
    expect(pageTitle(after)).toBe('喪中はがきの範囲・忌引き日数・四十九日 早見｜何親等か・法要の日付も');
    expect(pageDescription(after)).toBe(
      '亡くなった方の続柄と命日から、何親等か・喪中はがきを出す範囲と時期・寒中見舞いの期間・忌引きの日数（国家公務員の基準）・四十九日や一周忌の日付を一度に表示。登録不要・無料。',
    );
    const faq = dashidokiFaqAnswer(after);
    expect(faq).toMatch(/例年12月中旬/);
    expect(faq).not.toMatch(/2027年用|12月20日|12月19日/);
  });
});
