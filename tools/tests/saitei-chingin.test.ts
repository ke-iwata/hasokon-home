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

/**
 * 令和8年度の答申データの追補（8都道府県 → 28都道府県 → 30都道府県）。
 *
 * 仕様: docs/features/saitei-chingin-r8-toshin-tsuiho.md
 *
 * 8〜9月は毎週どこかの県の答申が出るので、ここは**追補のたびに増える**テスト。
 * 焼き込む金額は各県労働局の報道発表（一次情報）から読み取ったもので、
 * 集計サイトの数字を写したものではない。
 */
describe('令和8年度の答申データ（労働局の報道発表で確認できた県）', () => {
  /** 答申を確認できた県。追補したらここに足す */
  const ANSWERED: ReadonlyArray<readonly [string, number]> = [
    ['北海道', 1131],
    ['宮城', 1098],
    ['秋田', 1090],
    ['栃木', 1125],
    ['群馬', 1120],
    ['埼玉', 1196],
    ['千葉', 1195],
    ['東京', 1280],
    ['神奈川', 1279],
    ['新潟', 1108],
    ['富山', 1119],
    ['石川', 1113],
    ['福井', 1112],
    ['長野', 1117],
    ['岐阜', 1121],
    ['静岡', 1154],
    ['愛知', 1195],
    ['三重', 1143],
    ['滋賀', 1136],
    ['大阪', 1231],
    ['兵庫', 1172],
    ['奈良', 1107],
    ['和歌山', 1101],
    ['鳥取', 1090],
    ['島根', 1092],
    ['岡山', 1104],
    ['広島', 1141],
    ['山口', 1101],
    ['香川', 1092],
    ['福岡', 1114],
  ];

  it.each(ANSWERED)('%s の答申額は %i 円（労働局の報道発表どおり）', (name, yen) => {
    expect(byName(name).answered?.yen).toBe(yen);
  });

  it('答申済みは30都道府県で、それ以外は答申を持たない', () => {
    const withAnswer = PREFECTURES.filter((p) => p.answered).map((p) => p.name);
    expect(withAnswer.sort()).toEqual(ANSWERED.map(([n]) => n).sort());
    expect(withAnswer).toHaveLength(30);
  });

  /**
   * このツールを直した動機そのもの。目安を上回った県では、目安から機械的に足した
   * 見込み額が実際の答申額より**低く**出ていた。追補後はその県が答申額を返す。
   */
  it('目安を上回った県は、目安ベースの見込みより高い答申額を返す', () => {
    const overMeyasu = [
      ['宮城', 60],
      ['鳥取', 60],
      ['秋田', 59],
      ['石川', 59],
      ['福井', 59],
      ['島根', 59],
      ['新潟', 58],
      ['山口', 58],
      ['栃木', 57],
      ['群馬', 57],
      ['富山', 57],
      ['静岡', 57],
      ['岡山', 57],
      ['福岡', 57],
    ] as const;
    for (const [name, raise] of overMeyasu) {
      const pref = byName(name);
      const meyasuYen = pref.currentYen + MEYASU_BY_RANK[pref.rank];
      const r = revisionOf(pref, new Date('2026-08-18'));
      expect(r.raise, `${name}: 引上げ額`).toBe(raise);
      expect(r.yen, `${name}: 答申額が見込みを上回っていない`).toBeGreaterThan(meyasuYen);
      expect(r.status, `${name}`).toBe('答申');
    }
  });

  it('埼玉はAランクの目安54円を1円上回る55円の引上げ', () => {
    const saitama = byName('埼玉');
    expect(saitama.answered?.yen).toBe(1196);
    expect(revisionOf(saitama, new Date('2026-08-18')).raise).toBe(55);
  });

  it('労働局が発効予定日を示した県は、その日を過ぎると「発効済み」になる', () => {
    const dated = [
      ['宮城', '2026-10-01'],
      ['栃木', '2026-10-01'],
      ['埼玉', '2026-10-01'],
      ['長野', '2026-10-02'],
      ['岡山', '2026-10-02'],
      ['石川', '2026-10-03'],
      ['滋賀', '2026-10-03'],
      ['鳥取', '2026-10-03'],
      ['福井', '2026-10-04'],
      ['奈良', '2026-10-04'],
      ['福岡', '2026-10-04'],
      ['山口', '2026-10-08'],
      ['島根', '2026-10-10'],
      ['広島', '2026-10-11'],
      ['秋田', '2026-10-14'],
      ['静岡', '2026-10-15'],
    ] as const;
    for (const [name, on] of dated) {
      const pref = byName(name);
      expect(pref.answered?.effectiveOn, `${name}: 発効予定日`).toBe(on);
      const dayBefore = new Date(`${on}T00:00:00Z`);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      expect(revisionOf(pref, dayBefore).status, `${name}: 発効前`).toBe('答申');
      expect(revisionOf(pref, new Date(`${on}T00:00:00`)).status, `${name}: 発効日`).toBe(
        '発効済み',
      );
    }
  });

  /**
   * 答申文が「効力発生の日 法定どおり」とだけ書く県、報道発表が「最短で」「早ければ」
   * 10月◯日と条件付きで書く県は、発効日を持たせない（決め打ちしない）。
   * この県は日付が過ぎても「答申」のままになる。
   */
  it('発効日が示されていない県は日付を持たず、日が過ぎても「答申」のまま', () => {
    for (const name of ['群馬', '新潟', '富山', '岐阜', '和歌山', '香川']) {
      const pref = byName(name);
      expect(pref.answered, `${name}: 答申が無い`).toBeDefined();
      expect(pref.answered?.effectiveOn, `${name}: 発効日を決め打ちしている`).toBeUndefined();
      expect(revisionOf(pref, new Date('2026-12-01')).status, `${name}`).toBe('答申');
    }
  });

  /**
   * 第2次追補（2026-08-19）で入れた2県。
   * 広島は労働局が報道発表ではなく**異議申出のための公示**で額と発効日を示していて、
   * 秋田は報道発表（PDF）。どちらも一次情報なので出典に持たせている。
   */
  it('第2次追補の2県は一次情報どおりの額・答申日・発効日を持つ', () => {
    const hiroshima = byName('広島');
    expect(hiroshima.answered?.yen).toBe(1141);
    expect(hiroshima.answered?.answeredOn).toBe('2026-08-17');
    expect(hiroshima.answered?.effectiveOn).toBe('2026-10-11');
    expect(revisionOf(hiroshima, new Date('2026-08-19')).raise).toBe(56);

    const akita = byName('秋田');
    expect(akita.answered?.yen).toBe(1090);
    expect(akita.answered?.answeredOn).toBe('2026-08-18');
    expect(akita.answered?.effectiveOn).toBe('2026-10-14');
    expect(revisionOf(akita, new Date('2026-08-19')).raise).toBe(59);
  });

  /**
   * まだ答申が出ていない17県。二次情報（集計サイト）だけで答申額を書かない約束を
   * テストでも見張る。答申が出て労働局の発表を確認できた県は、ここから ANSWERED へ移す。
   */
  it('未答申の17県は「目安」のまま（二次情報で足さない）', () => {
    const notAnswered = [
      '青森', '岩手', '山形', '福島', '茨城', '山梨', '京都', '徳島', '愛媛',
      '高知', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄',
    ];
    for (const name of notAnswered) {
      const pref = byName(name);
      expect(pref.answered, `${name}: 一次情報を確認せずに答申を足していないか`).toBeUndefined();
      expect(revisionOf(pref, new Date('2026-08-19')).status, `${name}`).toBe('目安');
    }
    expect(PREFECTURES.filter((p) => !p.answered)).toHaveLength(notAnswered.length);
  });

  it('答申の出典URLは県ごとに違う（使い回しの取り違えを防ぐ）', () => {
    const urls = PREFECTURES.filter((p) => p.answered).map((p) => p.answered!.source.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('追補分の出典の確認日はデータ最終確認日に揃っている', () => {
    for (const p of PREFECTURES) {
      if (!p.answered) continue;
      expect(p.answered.source.checkedAt, `${p.name}`).toBe(DATA_CHECKED_AT);
    }
  });

  it('データ最終確認日を追補した日まで進めてある', () => {
    expect(DATA_CHECKED_AT >= '2026-08-18').toBe(true);
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
    const aomori = byName('青森'); // Cランク・答申前
    const r = revisionOf(aomori, new Date('2026-08-14'));
    expect(r.status).toBe('目安');
    expect(r.yen).toBe(aomori.currentYen + 56);
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
