import { describe, expect, it } from 'vitest';
import {
  DATA_CHECKED_AT,
  MEYASU_BY_RANK,
  NATIONAL_AVERAGE,
  PREFECTURES,
  WEEKS_PER_YEAR,
  checkWage,
  estimateIncome,
  formatDate,
  formatYen,
  nextWallFor,
  prefectureByCode,
  prefectureByName,
  revisionOf,
  wallsFor,
  type Prefecture,
} from '@/lib/saitei-chingin';

/**
 * 最低賃金 早見表・チェッカーのテスト。
 *
 * 仕様: docs/features/saitei-chingin-checker.md
 *
 * 仕様書が挙げている「47件すべて存在する」「新額 ≧ 旧額」「ランクと引き上げ幅の整合」
 * 「発効日の形式」「全エントリに出典URLがある」を軸にしている。
 *
 * このツールで一番こわいのは**目安と答申の取り違え**なので、
 * 状態（目安 / 答申 / 発効済み）の出し分けを重点的に見張る。
 * あわせて厚労省の一次資料から読み取った金額そのものを何件か焼き込んでおく
 * （二次情報を見て書き換えられるのを防ぐため）。
 */

const ymd = /^\d{4}-\d{2}-\d{2}$/;
const byName = (name: string): Prefecture => {
  const pref = prefectureByName(name);
  if (!pref) throw new Error(`テストデータに ${name} がない`);
  return pref;
};

describe('PREFECTURES（47都道府県のデータ）', () => {
  it('47件ある', () => {
    expect(PREFECTURES).toHaveLength(47);
  });

  it('都道府県コードが1〜47で重複なく、昇順に並んでいる', () => {
    expect(PREFECTURES.map((p) => p.code)).toEqual(
      Array.from({ length: 47 }, (_, i) => i + 1),
    );
  });

  it('都道府県名が重複していない', () => {
    const names = PREFECTURES.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('全エントリに出典URLがある（仕様: 出典は必須フィールド）', () => {
    for (const p of PREFECTURES) {
      expect(p.source.url, `${p.name}: 現行額の出典URLが無い`).toMatch(/^https:\/\//);
      expect(p.source.label, `${p.name}: 現行額の出典名が空`).not.toBe('');
      expect(p.source.checkedAt, `${p.name}: 現行額の出典の確認日が不正`).toMatch(ymd);
    }
  });

  it('答申を持つエントリには答申額の出典URLもある', () => {
    for (const p of PREFECTURES) {
      if (!p.answered) continue;
      expect(p.answered.source.url, `${p.name}: 答申の出典URLが無い`).toMatch(/^https:\/\//);
      expect(p.answered.source.label, `${p.name}: 答申の出典名が空`).not.toBe('');
    }
  });

  it('答申の出典は厚労省または都道府県労働局のドメインである', () => {
    for (const p of PREFECTURES) {
      if (!p.answered) continue;
      expect(p.answered.source.url, `${p.name}: 一次情報でない出典`).toMatch(
        /^https:\/\/(jsite\.)?mhlw\.go\.jp\//,
      );
    }
  });

  it('現行額が1,000円以上の整数で、発効日が YYYY-MM-DD 形式', () => {
    for (const p of PREFECTURES) {
      expect(Number.isInteger(p.currentYen), `${p.name}: 時間額が整数でない`).toBe(true);
      // 令和7年度改定で全都道府県が1,000円を超えた
      expect(p.currentYen, `${p.name}: 時間額が低すぎる`).toBeGreaterThanOrEqual(1000);
      expect(p.currentEffectiveOn, `${p.name}: 発効日の形式`).toMatch(ymd);
    }
  });

  it('ランクの内訳が厚労省の目安（A:6・B:28・C:13）と一致する', () => {
    const count = (rank: 'A' | 'B' | 'C') => PREFECTURES.filter((p) => p.rank === rank).length;
    expect(count('A')).toBe(6);
    expect(count('B')).toBe(28);
    expect(count('C')).toBe(13);
  });

  it('Aランクは埼玉・千葉・東京・神奈川・愛知・大阪の6都府県', () => {
    expect(PREFECTURES.filter((p) => p.rank === 'A').map((p) => p.name)).toEqual([
      '埼玉',
      '千葉',
      '東京',
      '神奈川',
      '愛知',
      '大阪',
    ]);
  });

  /**
   * 厚労省「令和７年度地域別最低賃金全国一覧」の値をそのまま固定する。
   * 最高額・最低額・独自の発効日を持つ県を選んでいる。
   */
  it('一次資料の金額と発効日を固定する', () => {
    expect(byName('東京').currentYen).toBe(1226);
    expect(byName('神奈川').currentYen).toBe(1225);
    expect(byName('大阪').currentYen).toBe(1177);
    // 最低額は高知・宮崎・沖縄の1,023円
    expect(byName('高知').currentYen).toBe(1023);
    expect(byName('宮崎').currentYen).toBe(1023);
    expect(byName('沖縄').currentYen).toBe(1023);
    // 秋田だけ発効が令和8年3月31日まで遅れた
    expect(byName('秋田').currentEffectiveOn).toBe('2026-03-31');
    expect(byName('東京').currentEffectiveOn).toBe('2025-10-03');
  });

  it('答申額は現行額より高い（新額 ≧ 旧額）', () => {
    for (const p of PREFECTURES) {
      if (!p.answered) continue;
      expect(p.answered.yen, `${p.name}: 答申額が現行額を下回る`).toBeGreaterThan(p.currentYen);
    }
  });

  it('答申額はランク別の目安額以上になっている（目安を下回る答申は出ていない）', () => {
    for (const p of PREFECTURES) {
      if (!p.answered) continue;
      const raise = p.answered.yen - p.currentYen;
      expect(raise, `${p.name}: 引上げ額が目安を下回る`).toBeGreaterThanOrEqual(
        MEYASU_BY_RANK[p.rank],
      );
    }
  });

  it('答申の日付は YYYY-MM-DD 形式で、持つなら発効日は答申日より後', () => {
    for (const p of PREFECTURES) {
      const a = p.answered;
      if (!a) continue;
      if (a.answeredOn !== undefined) expect(a.answeredOn, `${p.name}`).toMatch(ymd);
      if (a.effectiveOn !== undefined) expect(a.effectiveOn, `${p.name}`).toMatch(ymd);
      if (a.answeredOn !== undefined && a.effectiveOn !== undefined) {
        expect(a.effectiveOn > a.answeredOn, `${p.name}: 発効日が答申日より前`).toBe(true);
      }
    }
  });

  it('答申済みの県の金額を一次資料どおりに固定する', () => {
    expect(byName('東京').answered?.yen).toBe(1280);
    expect(byName('神奈川').answered?.yen).toBe(1279);
    expect(byName('大阪').answered?.yen).toBe(1231);
    expect(byName('愛知').answered?.yen).toBe(1195);
  });

  it('データ最終確認日を持っている（確認済みか未確認かを区別するため）', () => {
    expect(DATA_CHECKED_AT).toMatch(ymd);
  });
});

describe('MEYASU_BY_RANK / NATIONAL_AVERAGE', () => {
  it('令和8年度の目安は A:54円・B:56円・C:56円', () => {
    expect(MEYASU_BY_RANK).toEqual({ A: 54, B: 56, C: 56 });
  });

  it('全国加重平均は 1,121円 → 目安どおりなら 1,176円（+55円）', () => {
    expect(NATIONAL_AVERAGE.current).toBe(1121);
    expect(NATIONAL_AVERAGE.meyasu).toBe(1176);
    expect(NATIONAL_AVERAGE.meyasu - NATIONAL_AVERAGE.current).toBe(55);
  });
});

describe('revisionOf', () => {
  it('答申が無い県はランク別の目安を足した「目安」として返す', () => {
    const akita = byName('秋田'); // Cランク・答申前
    const r = revisionOf(akita, new Date('2026-08-14'));
    expect(r.status).toBe('目安');
    expect(r.yen).toBe(akita.currentYen + 56);
    expect(r.raise).toBe(56);
    // 目安の出どころは厚労省の目安の答申
    expect(r.source.url).toContain('mhlw.go.jp');
    // 目安の段階では発効日も答申日も無い（推測で埋めない）
    expect(r.effectiveOn).toBeUndefined();
    expect(r.answeredOn).toBeUndefined();
  });

  it('答申済みで発効前の県は「答申」になり、答申額をそのまま返す', () => {
    const r = revisionOf(byName('東京'), new Date('2026-08-14'));
    expect(r.status).toBe('答申');
    expect(r.yen).toBe(1280);
    expect(r.raise).toBe(54);
    expect(r.answeredOn).toBe('2026-08-05');
    // 出典は労働局の発表に切り替わる
    expect(r.source.url).toContain('tokyo-roudoukyoku');
  });

  it('発効日を過ぎたら「発効済み」に変わる（運営者の手作業は要らない）', () => {
    const kanagawa = byName('神奈川'); // 効力発生予定日 2026-10-01
    expect(revisionOf(kanagawa, new Date('2026-09-30')).status).toBe('答申');
    expect(revisionOf(kanagawa, new Date('2026-10-01')).status).toBe('発効済み');
    expect(revisionOf(kanagawa, new Date('2026-12-01')).status).toBe('発効済み');
  });

  it('発効日が未公表の答申は日付が来ても「答申」のまま（決め打ちしない）', () => {
    // 大阪は答申の発表時点で効力発生日を示していない
    expect(byName('大阪').answered?.effectiveOn).toBeUndefined();
    expect(revisionOf(byName('大阪'), new Date('2026-12-01')).status).toBe('答申');
  });

  it('引上げ率を小数第1位まで出す', () => {
    // 東京: 54 / 1226 = 4.404...% → 4.4%
    expect(revisionOf(byName('東京'), new Date('2026-08-14')).raisePercent).toBe(4.4);
  });

  it('全47都道府県で改定額が現行額を上回る', () => {
    for (const p of PREFECTURES) {
      const r = revisionOf(p, new Date('2026-08-14'));
      expect(r.yen, `${p.name}`).toBeGreaterThan(p.currentYen);
      expect(r.raise, `${p.name}`).toBeGreaterThanOrEqual(MEYASU_BY_RANK[p.rank]);
    }
  });
});

describe('prefectureByCode / prefectureByName', () => {
  it('コードから引ける', () => {
    expect(prefectureByCode(13)?.name).toBe('東京');
    expect(prefectureByCode(47)?.name).toBe('沖縄');
    expect(prefectureByCode(48)).toBeUndefined();
  });

  it('「東京都」「大阪府」「北海道」のような表記でも引ける', () => {
    expect(prefectureByName('東京都')?.code).toBe(13);
    expect(prefectureByName('大阪府')?.code).toBe(27);
    expect(prefectureByName('神奈川県')?.code).toBe(14);
    // 「北海道」は末尾の「道」を落とすと引けなくなるので、そのまま一致すること
    expect(prefectureByName('北海道')?.code).toBe(1);
  });

  it('知らない名前は undefined', () => {
    expect(prefectureByName('江戸')).toBeUndefined();
  });
});

describe('checkWage', () => {
  const asOf = new Date('2026-08-14');

  it('現行の最低賃金を下回っていれば不足額を返す', () => {
    const r = checkWage(byName('東京'), 1200, asOf);
    expect(r.current.meets).toBe(false);
    expect(r.current.shortfall).toBe(26); // 1226 - 1200
    expect(r.current.surplus).toBe(0);
  });

  it('最低賃金と同額はセーフ（「以上」であればよい）', () => {
    const r = checkWage(byName('東京'), 1226, asOf);
    expect(r.current.meets).toBe(true);
    expect(r.current.shortfall).toBe(0);
    expect(r.current.surplus).toBe(0);
  });

  it('いまは足りていても改定後に下回るケースを検知する', () => {
    // 東京は 1,226円 → 答申 1,280円
    const r = checkWage(byName('東京'), 1250, asOf);
    expect(r.current.meets).toBe(true);
    expect(r.revised.meets).toBe(false);
    expect(r.revised.shortfall).toBe(30); // 1280 - 1250
    expect(r.revision.status).toBe('答申');
  });

  it('目安の県でも改定後の見込みで判定できる（状態は目安のまま返る）', () => {
    const aomori = byName('青森'); // 1,029円・Cランク → 見込み 1,085円
    const r = checkWage(aomori, 1050, asOf);
    expect(r.current.meets).toBe(true);
    expect(r.revised.minimumYen).toBe(1085);
    expect(r.revised.meets).toBe(false);
    expect(r.revision.status).toBe('目安');
  });

  it('上回っていれば余裕額を返す', () => {
    const r = checkWage(byName('沖縄'), 1200, asOf);
    expect(r.current.meets).toBe(true);
    expect(r.current.surplus).toBe(177); // 1200 - 1023
  });
});

describe('estimateIncome', () => {
  it('週の労働時間から年収・月収を概算する（年52週）', () => {
    const { annual, monthly } = estimateIncome(1200, 20);
    expect(annual).toBe(1200 * 20 * WEEKS_PER_YEAR); // 1,248,000
    expect(monthly).toBe(Math.round(annual / 12)); // 104,000
  });

  it('週30時間・時給1,280円ならおよそ200万円', () => {
    expect(estimateIncome(1280, 30).annual).toBe(1_996_800);
  });

  it('負の入力は0として扱う', () => {
    expect(estimateIncome(-100, 20)).toEqual({ annual: 0, monthly: 0 });
    expect(estimateIncome(1200, -5)).toEqual({ annual: 0, monthly: 0 });
  });
});

describe('wallsFor / nextWallFor（年収の壁への接続）', () => {
  const shortHours = { hoursPerWeek: 15, asOf: new Date('2026-08-14') };

  it('壁の定義は lib/nenshu-kabe.ts から引く（このツールでは持たない）', () => {
    const walls = wallsFor(1_000_000, shortHours);
    expect(walls.length).toBeGreaterThan(0);
    expect(walls.some((w) => w.label === '130万円の壁')).toBe(true);
  });

  it('2026年10月1日の賃金要件撤廃で106万円の壁が消える', () => {
    const opts = { hoursPerWeek: 25, size51: true };
    const before = wallsFor(1_000_000, { ...opts, asOf: new Date('2026-09-30') });
    const after = wallsFor(1_000_000, { ...opts, asOf: new Date('2026-10-01') });
    expect(before.map((w) => w.label)).toContain('106万円の壁');
    expect(after.map((w) => w.label)).not.toContain('106万円の壁');
  });

  it('勤務先の社保に加入する働き方では130万円の壁に到達しない', () => {
    // 週20時間以上 × 従業員51人以上 → 2026年10月以降は年収に関係なく加入するので、
    // 家族の扶養（130万円未満）という壁自体が無くなる
    const enrolled = wallsFor(1_250_000, {
      hoursPerWeek: 25,
      size51: true,
      asOf: new Date('2026-10-01'),
    });
    expect(enrolled.map((w) => w.label)).not.toContain('130万円の壁');
  });

  it('次に到達する壁を返す', () => {
    const next = nextWallFor(1_250_000, { hoursPerWeek: 15, asOf: new Date('2026-10-01') });
    expect(next?.label).toBe('130万円の壁');
    expect(next?.diff).toBe(50_000);
  });

  it('すべての壁を超えていれば undefined', () => {
    expect(nextWallFor(10_000_000, { hoursPerWeek: 15, asOf: new Date('2026-10-01') })).toBeUndefined();
  });
});

describe('表示のヘルパー', () => {
  it('formatYen は3桁区切りで円を付ける', () => {
    expect(formatYen(1280)).toBe('1,280円');
    expect(formatYen(1_996_800)).toBe('1,996,800円');
  });

  it('formatDate は和暦を使わず YYYY年M月D日 にする', () => {
    expect(formatDate('2026-10-01')).toBe('2026年10月1日');
    expect(formatDate('2025-11-21')).toBe('2025年11月21日');
  });
});
