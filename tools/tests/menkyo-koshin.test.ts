import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatDate, parseDate, type DateParts } from '@/lib/date-parts';
import { tools } from '@/lib/registry';
import {
  OFFICIAL_NOTICE,
  calcMenkyo,
  estimatedExpiry,
  extensionReason,
  isRegularExpiry,
  lapseDeadline,
  lapseStatus,
  licenseBirthday,
  nextExpiry,
  nextExtendedDay,
  parseCardDate,
  renewalStatus,
  renewalWindow,
  seniorWindow,
  validateInput,
  upcomingExpiry,
  windowHeading,
} from '@/lib/menkyo-koshin';

/**
 * 運転免許の更新期間 計算機のテスト。
 *
 * 仕様: docs/features/menkyo-koshin-kikan.md「確かめること」
 * 期待値は道路交通法の条文（第95条の6・第97条の2・第101条・第101条の4）・施行令第33条の8と
 * 都道府県警察の案内から手で出したもの。
 */

const d = (ymd: string): DateParts => parseDate(ymd) as DateParts;
const f = formatDate;

describe('renewalWindow（仕様書「確かめること」の5ケース）', () => {
  const cases: Array<[string, string, string, string, string, string]> = [
    ['1980-09-27', '2026-10-27', '2026-08-27', '2026-10-27', '', '警察の例（9/27 生まれ→8/27〜10/27）'],
    ['1975-11-29', '2026-12-29', '2026-10-29', '2027-01-04', '年末年始', '12/29〜1/3 は 1/4 まで'],
    ['1990-01-01', '2026-02-01', '2025-12-01', '2026-02-02', '日曜', '日曜の延長'],
    ['1984-02-29', '2026-03-28', '2026-01-28', '2026-03-30', '土曜', '2/29 生まれは平年 2/28＋土日の連続'],
    ['1956-04-05', '2026-05-05', '2026-03-05', '2026-05-07', 'こどもの日', '5/5 祝・5/6 振替休日の連続'],
  ];
  for (const [birth, expiry, start, end, firstReason, note] of cases) {
    it(`${birth} / 券面 ${expiry} → ${start}〜${end}（${note}）`, () => {
      const w = renewalWindow(d(birth), d(expiry));
      expect(f(w.start)).toBe(start);
      expect(f(w.expiry)).toBe(expiry);
      expect(f(w.legalEnd)).toBe(end);
      expect(w.extended).toBe(end !== expiry);
      if (firstReason) expect(w.extendedReasons[0]).toBe(firstReason);
      else expect(w.extendedReasons).toEqual([]);
      expect(w.holidayTableOutOfRange).toBe(false);
    });
  }

  it('年末年始は 12/29〜1/3 をすべて飛ばす（6日連続）', () => {
    const w = renewalWindow(d('1975-11-29'), d('2026-12-29'));
    expect(w.extendedReasons).toEqual(Array(6).fill('年末年始'));
  });

  it('土曜→日曜→振替休日のような連続も最後まで繰り下がる', () => {
    const w = renewalWindow(d('1984-02-29'), d('2026-03-28'));
    expect(w.extendedReasons).toEqual(['土曜', '日曜']);
    const gw = renewalWindow(d('1956-04-05'), d('2026-05-05'));
    expect(gw.extendedReasons).toEqual(['こどもの日', '振替休日']);
  });

  it('2/29 生まれはうるう年なら 2/29 が誕生日（1か月前は 1/29）', () => {
    const w = renewalWindow(d('1984-02-29'), d('2028-03-29'));
    expect(f(w.birthday)).toBe('2028-02-29');
    expect(f(w.start)).toBe('2028-01-29');
  });

  it('月末生まれの1か月前は、応当日が無ければその月の末日（3/31 生まれ → 2/28）', () => {
    const w = renewalWindow(d('1980-03-31'), d('2027-04-30'));
    expect(f(w.start)).toBe('2027-02-28');
  });
});

describe('nextExtendedDay（施行令第33条の8）', () => {
  it('平日はそのまま', () => {
    const r = nextExtendedDay(d('2026-10-27'));
    expect(f(r.date)).toBe('2026-10-27');
    expect(r.skipped).toEqual([]);
  });

  it('祝日表の範囲外（2028年以降）は土日・年末年始だけで判定し、holidayTableOutOfRange を立てる', () => {
    // 2028-12-30 は土曜。12/30〜1/3 を飛ばして 2029-01-04（木）
    const r = nextExtendedDay(d('2028-12-30'));
    expect(f(r.date)).toBe('2029-01-04');
    expect(r.holidayTableOutOfRange).toBe(true);
  });

  it('範囲外の平日でも holidayTableOutOfRange は立つ（祝日かどうか確かめられない）', () => {
    expect(nextExtendedDay(d('2028-05-10')).holidayTableOutOfRange).toBe(true);
    expect(nextExtendedDay(d('2027-05-10')).holidayTableOutOfRange).toBe(false);
  });

  it('extensionReason：年末年始を祝日より先に見る（1/1 は元日でも「年末年始」）', () => {
    expect(extensionReason(d('2027-01-01'))).toBe('年末年始');
    expect(extensionReason(d('2026-12-28'))).toBe(null); // 月曜
    expect(extensionReason(d('2026-11-03'))).toBe('文化の日');
  });
});

describe('seniorWindow（第101条の4。更新期間が満了する日の年齢で見る）', () => {
  it('満了日に70歳ちょうどなら高齢者講習が要る', () => {
    const s = seniorWindow(d('1957-04-12'), d('2027-04-12'));
    expect(s.ageAtEnd).toBe(70);
    expect(s.lecture).toBe(true);
    expect(s.cognitive).toBe(false);
  });

  it('満了日に69歳364日なら要らない', () => {
    const s = seniorWindow(d('1957-04-13'), d('2027-04-12'));
    expect(s.ageAtEnd).toBe(69);
    expect(s.lecture).toBe(false);
  });

  it('満了日に75歳ちょうどなら認知機能検査も要る', () => {
    const s = seniorWindow(d('1952-04-12'), d('2027-04-12'));
    expect(s.ageAtEnd).toBe(75);
    expect(s.lecture).toBe(true);
    expect(s.cognitive).toBe(true);
  });

  it('受けられる期間は延長後の末日の6か月前の翌日〜末日', () => {
    const s = seniorWindow(d('1957-03-10'), d('2027-04-12'));
    expect(f(s.from)).toBe('2026-10-13');
    expect(f(s.to)).toBe('2027-04-12');
  });

  it('70歳の誕生日が更新期間に入る人：満了日は70歳で講習は要る', () => {
    const r = calcMenkyo({
      birth: '1957-03-10',
      expiry: '2027-04-10',
      term: 'five',
    })!;
    expect(f(r.window.legalEnd)).toBe('2027-04-12');
    expect(r.senior.ageAtEnd).toBe(70);
    expect(r.senior.lecture).toBe(true);
  });
});

describe('nextExpiry（第95条の6の表。生年月日と更新日から出す）', () => {
  // 仕様書「年齢の数え方」の具体例 3 行。更新日の年齢を直接渡さない
  const rows: Array<[string, string, number, number]> = [
    ['1957-03-10', '2032-04-10', 69, 5],
    ['1956-03-10', '2031-04-10', 70, 4],
    ['1955-03-10', '2030-04-10', 71, 3],
  ];
  for (const [birth, next, age, n] of rows) {
    it(`${birth} 生まれ・券面 2027-04-10 → ${next}（更新日等の年齢 ${age}歳・${n}回目）`, () => {
      const r = nextExpiry(d(birth), d('2027-04-10'), d('2027-03-01'), 'five');
      expect(f(r.date)).toBe(next);
      expect(r.ageAtRenewal).toBe(age);
      expect(r.birthdays).toBe(n);
      expect(r.early).toBe(false);
    });
  }

  it('更新日が誕生日の前・当日・後で、次の有効期限は同じ（備考二・三）', () => {
    const birth = d('1957-03-10');
    const expiry = d('2027-04-10');
    const results = ['2027-02-10', '2027-03-09', '2027-03-10', '2027-03-20', '2027-04-10'].map((r) =>
      f(nextExpiry(birth, expiry, d(r), 'five').date)
    );
    expect(new Set(results)).toEqual(new Set(['2032-04-10']));
  });

  it('70歳の誕生日の後に更新しても、更新日等は69歳として数える（備考三）', () => {
    const r = nextExpiry(d('1957-03-10'), d('2027-04-10'), d('2027-03-20'), 'five');
    expect(r.ageAtRenewal).toBe(69);
    expect(r.birthdays).toBe(5);
  });

  it('ブルー3年・グリーン（違反運転者等・初回更新）は年齢にかかわらず3回目', () => {
    const r = nextExpiry(d('1980-09-27'), d('2026-10-27'), d('2026-09-01'), 'three');
    expect(f(r.date)).toBe('2029-10-27');
    expect(r.birthdays).toBe(3);
  });

  it('次の有効期限が祝日表の外でも延長を判定せず、券面の日付のまま返す', () => {
    // 2031-11-29 + 1か月 = 2031-12-29（月）。年末年始でも延ばさない
    const r = nextExpiry(d('1975-11-29'), d('2026-12-29'), d('2026-11-01'), 'five');
    expect(f(r.date)).toBe('2031-12-29');
  });

  it('2/29 生まれは平年の誕生日を 2/28 とみなして1か月後', () => {
    const r = nextExpiry(d('1984-02-29'), d('2026-03-28'), d('2026-02-01'), 'five');
    expect(f(r.date)).toBe('2031-03-28');
    const leap = nextExpiry(d('1984-02-29'), d('2026-03-28'), d('2026-02-01'), 'three');
    expect(f(leap.date)).toBe('2029-03-28');
  });

  it('更新期間より前の更新（特例更新）は更新した日から数えるので短くなる', () => {
    const r = nextExpiry(d('1980-09-27'), d('2026-10-27'), d('2026-06-01'), 'five');
    expect(r.early).toBe(true);
    expect(f(r.date)).toBe('2030-10-27');
  });
});

describe('lapseDeadline（第97条の2第1項第3号）', () => {
  it('失効した日（延長後の末日の翌日）から6か月を経過しない日まで', () => {
    const l = lapseDeadline(d('2026-10-27'));
    expect(f(l.lapsedOn)).toBe('2026-10-28');
    expect(f(l.deadline)).toBe('2027-04-27');
  });

  it('年末年始で延びた人は 1/5 に失効', () => {
    const l = lapseDeadline(d('2027-01-04'));
    expect(f(l.lapsedOn)).toBe('2027-01-05');
    expect(f(l.deadline)).toBe('2027-07-04');
  });

  it('6か月後に応当日が無いときはその月の末日（8/31 失効 → 2/28）', () => {
    const l = lapseDeadline(d('2026-08-30'));
    expect(f(l.lapsedOn)).toBe('2026-08-31');
    expect(f(l.deadline)).toBe('2027-02-28');
  });
});

describe('lapseStatus（失効後の期限を過ぎたら文言を分ける。#503 レビュー必須2）', () => {
  // 2026-10-27 が末日 → 2026-10-28 失効・6か月は 2027-04-27 まで・3年は 2029-10-27 まで
  const l = lapseDeadline(d('2026-10-27'));
  it('3年の上限（失効した日から起算して3年を経過しない日）', () => {
    expect(f(l.unavoidableDeadline)).toBe('2029-10-27');
  });
  it('6か月の期限の当日までは within6m、翌日から within3y', () => {
    expect(lapseStatus(l, d('2026-10-28'))).toBe('within6m');
    expect(lapseStatus(l, d('2027-04-27'))).toBe('within6m');
    expect(lapseStatus(l, d('2027-04-28'))).toBe('within3y');
  });
  it('3年の上限の当日までは within3y、翌日から over3y', () => {
    expect(lapseStatus(l, d('2029-10-27'))).toBe('within3y');
    expect(lapseStatus(l, d('2029-10-28'))).toBe('over3y');
  });
  it('レビューの例（1980-01-10・期限 2020-02-10）は 2026-11-14 には over3y', () => {
    const r = calcMenkyo({
      birth: '1980-01-10',
      expiry: '2020-02-10',
      term: 'five',
    })!;
    expect(lapseStatus(r.lapse, d('2026-11-14'))).toBe('over3y');
  });
});

describe('upcomingExpiry（開いた瞬間の例が失効にならない。#503 レビュー必須1）', () => {
  const birth = d('1980-09-27');
  it('今日以降で最初の誕生日の1か月後', () => {
    expect(f(upcomingExpiry(birth, d('2026-11-14')))).toBe('2027-10-27');
    expect(f(upcomingExpiry(birth, d('2026-10-27')))).toBe('2026-10-27');
    expect(f(upcomingExpiry(birth, d('2026-01-05')))).toBe('2026-10-27');
  });
  it('どの日に開いても、既定の例は「期限を過ぎています」にならない', () => {
    for (
      let day = d('2026-01-01');
      day.year < 2031;
      day = {
        ...day,
        month: day.month === 12 ? 1 : day.month + 1,
        year: day.month === 12 ? day.year + 1 : day.year,
      }
    ) {
      const r = calcMenkyo({
        birth: '1980-09-27',
        expiry: f(upcomingExpiry(birth, day)),
        term: 'five',
      })!;
      expect(renewalStatus(r.window, day).kind).not.toBe('expired');
    }
  });
  it('画面は固定の既定値を upcomingExpiry で置き換えている', () => {
    const src = readFileSync(fileURLToPath(new URL('../app/menkyo-koshin/Calculator.tsx', import.meta.url)), 'utf8');
    expect(src).toContain('upcomingExpiry(');
    expect(src).toContain('lapseStatus(');
  });
});

describe('renewalStatus（今日から見た状態）', () => {
  const w = renewalWindow(d('1980-09-27'), d('2026-10-27'));
  it('更新期間の前・中・後', () => {
    expect(renewalStatus(w, d('2026-08-20'))).toEqual({
      kind: 'before',
      daysUntilStart: 7,
    });
    expect(renewalStatus(w, d('2026-08-27'))).toEqual({
      kind: 'during',
      daysLeft: 61,
    });
    expect(renewalStatus(w, d('2026-10-27'))).toEqual({
      kind: 'during',
      daysLeft: 0,
    });
    expect(renewalStatus(w, d('2026-10-28'))).toEqual({
      kind: 'expired',
      daysSinceLapse: 1,
    });
  });

  it('延長された日までは更新期間中', () => {
    const ny = renewalWindow(d('1975-11-29'), d('2026-12-29'));
    expect(renewalStatus(ny, d('2027-01-04')).kind).toBe('during');
    expect(renewalStatus(ny, d('2027-01-05')).kind).toBe('expired');
  });
});

describe('入力', () => {
  it('和暦（令和8年12月29日）は西暦と同じ結果になる', () => {
    const wa = parseCardDate('令和8年12月29日');
    expect(wa && f(wa)).toBe('2026-12-29');
    const a = calcMenkyo({
      birth: '1975-11-29',
      expiry: f(wa!),
      term: 'five',
    })!;
    const b = calcMenkyo({
      birth: '1975-11-29',
      expiry: '2026-12-29',
      term: 'five',
    })!;
    expect(a).toEqual(b);
  });

  it('いろいろな書き方を読む', () => {
    for (const s of ['R8.12.29', '令和８年１２月２９日まで', '2026/12/29', '2026年12月29日', '2026-12-29']) {
      expect(f(parseCardDate(s)!)).toBe('2026-12-29');
    }
    expect(f(parseCardDate('令和元年5月1日')!)).toBe('2019-05-01');
    expect(f(parseCardDate('H31.4.30')!)).toBe('2019-04-30');
  });

  it('読めない・存在しない日付は null', () => {
    expect(parseCardDate('')).toBe(null);
    expect(parseCardDate('令和8年2月30日')).toBe(null);
    expect(parseCardDate('明日')).toBe(null);
  });

  it('代替入力（更新の年だけ）は誕生日の1か月後を有効期限とみなし、見出しに「推定」', () => {
    expect(f(estimatedExpiry(d('1980-09-27'), 2026))).toBe('2026-10-27');
    expect(f(estimatedExpiry(d('1984-02-29'), 2026))).toBe('2026-03-28');
    const r = calcMenkyo({
      birth: '1980-09-27',
      renewalYear: 2026,
      term: 'five',
    })!;
    expect(r.estimated).toBe(true);
    expect(f(r.window.expiry)).toBe('2026-10-27');
    expect(windowHeading(r.estimated)).toContain('推定');
    expect(windowHeading(false)).not.toContain('推定');
  });

  it('券面の日付が誕生日の1か月後でなければ irregularExpiry（計算は券面を正として続ける）', () => {
    expect(isRegularExpiry(d('1980-09-27'), d('2026-10-27'))).toBe(true);
    expect(isRegularExpiry(d('1984-02-29'), d('2026-03-28'))).toBe(true);
    const r = calcMenkyo({
      birth: '1980-09-27',
      expiry: '2026-10-28',
      term: 'five',
    })!;
    expect(r.irregularExpiry).toBe(true);
    expect(f(r.window.legalEnd)).toBe('2026-10-28');
  });

  it('validateInput', () => {
    expect(validateInput(d('2030-01-01'), d('2031-01-01'), d('2026-11-14'))).toBe('birth-future');
    expect(validateInput(d('1980-09-27'), d('1979-10-27'), d('2026-11-14'))).toBe('expiry-before-birth');
    expect(validateInput(d('2015-09-27'), d('2026-10-27'), d('2026-11-14'))).toBe('expiry-too-early');
    expect(validateInput(d('1980-09-27'), d('2026-10-27'), d('2026-11-14'))).toBe(null);
  });

  it('licenseBirthday：2/29 生まれは平年 2/28（ageAt の 3/1 とは違う）', () => {
    expect(f(licenseBirthday(d('1984-02-29'), 2027))).toBe('2027-02-28');
    expect(f(licenseBirthday(d('1984-02-29'), 2028))).toBe('2028-02-29');
  });
});

describe('画面の約束', () => {
  const calcSrc = readFileSync(fileURLToPath(new URL('../app/menkyo-koshin/Calculator.tsx', import.meta.url)), 'utf8');

  it('結果の下に「正式な期限は券面と更新連絡書で」の1行を出す', () => {
    expect(OFFICIAL_NOTICE).toContain('券面');
    expect(OFFICIAL_NOTICE).toContain('更新連絡書');
    expect(calcSrc).toContain('{OFFICIAL_NOTICE}');
  });

  it('見出しは windowHeading() を通す（代替入力で「推定」が出る）', () => {
    expect(calcSrc).toMatch(/windowHeading\(ok\.estimated\)/);
  });

  it('計算と70歳以上の欄が出たことを分けて tool_use を送る', () => {
    expect(calcSrc).toContain("trackToolUse('menkyo-koshin', 'calc')");
    expect(calcSrc).not.toContain("onBlur={() => trackToolUse('menkyo-koshin', 'calc')}");
    expect(calcSrc).toContain("trackToolUse('menkyo-koshin', 'senior-shown')");
  });

  it('registry は wip・生活・健康で入っている（public にするPRでカードと絵を足す）', () => {
    const t = tools.find((x) => x.slug === 'menkyo-koshin');
    expect(t?.category).toBe('生活・健康');
    expect(t?.stage).toBe('wip');
  });
});
