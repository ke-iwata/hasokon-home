import { describe, expect, it } from 'vitest';
import {
  DATA_CHECKED_AT,
  MEYASU_BY_RANK,
  NATIONAL_AVERAGE,
  PREFECTURES,
  SOURCE_MHLW_BESSHI,
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
 * 令和8年度の答申データの追補
 * （8都道府県 → 28都道府県 → 30都道府県 → 43都道府県 → 47都道府県）。
 *
 * 仕様: docs/features/saitei-chingin-r8-toshin-tsuiho.md
 *
 * 8〜9月は毎週どこかの県の答申が出るので、ここは**追補のたびに増えてきた**テスト。
 * 第4次追補（2026-09-09）で47都道府県すべてがそろい、令和8年度の追補は完了した。
 * 焼き込む金額は各県労働局の報道発表（一次情報）から読み取ったもので、
 * 集計サイトの数字を写したものではない。
 */
describe('令和8年度の答申データ（労働局の報道発表で確認できた県）', () => {
  /** 答申を確認できた県。追補したらここに足す */
  const ANSWERED: ReadonlyArray<readonly [string, number]> = [
    ['北海道', 1131],
    ['青森', 1090],
    ['岩手', 1090],
    ['宮城', 1098],
    ['秋田', 1090],
    ['山形', 1092],
    ['福島', 1094],
    ['茨城', 1136],
    ['栃木', 1125],
    ['群馬', 1120],
    ['埼玉', 1196],
    ['千葉', 1195],
    ['東京', 1280],
    ['神奈川', 1279],
    ['山梨', 1113],
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
    ['京都', 1180],
    ['大阪', 1231],
    ['兵庫', 1172],
    ['奈良', 1107],
    ['和歌山', 1101],
    ['鳥取', 1090],
    ['島根', 1092],
    ['岡山', 1104],
    ['広島', 1141],
    ['山口', 1101],
    ['徳島', 1103],
    ['香川', 1092],
    ['愛媛', 1093],
    ['高知', 1086],
    ['福岡', 1114],
    ['佐賀', 1095],
    ['長崎', 1087],
    ['熊本', 1092],
    ['大分', 1096],
    ['宮崎', 1085],
    ['鹿児島', 1090],
    ['沖縄', 1086],
  ];

  it.each(ANSWERED)('%s の答申額は %i 円（労働局の報道発表どおり）', (name, yen) => {
    expect(byName(name).answered?.yen).toBe(yen);
  });

  it('答申済みは47都道府県（第4次追補で全県そろった）', () => {
    const withAnswer = PREFECTURES.filter((p) => p.answered).map((p) => p.name);
    expect(withAnswer.sort()).toEqual(ANSWERED.map(([n]) => n).sort());
    expect(withAnswer).toHaveLength(47);
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
      // 第3次追補（2026-08-31）で入れた県。高知+63・鹿児島+64 は今年の最大級の上振れ
      ['鹿児島', 64],
      ['高知', 63],
      ['茨城', 62],
      ['宮崎', 62],
      ['青森', 61],
      ['福島', 61],
      ['山梨', 61],
      ['大分', 61],
      ['山形', 60],
      ['愛媛', 60],
      ['京都', 58],
      ['徳島', 57],
      // 第4次追補（2026-09-09）で入れた最後の4県。佐賀+65円は令和8年度で最大の上振れ
      ['佐賀', 65],
      ['沖縄', 63],
      ['岩手', 59],
      ['熊本', 58],
    ] as const;
    for (const [name, raise] of overMeyasu) {
      const pref = byName(name);
      const meyasuYen = pref.currentYen + MEYASU_BY_RANK[pref.rank];
      const r = revisionOf(pref, new Date('2026-08-31'));
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
      // 第3次追補（2026-08-31）。10月中旬〜11月中旬に散らばっていて、10月1日ではない
      ['福島', '2026-10-16'],
      ['茨城', '2026-10-18'],
      ['青森', '2026-10-29'],
      ['高知', '2026-10-29'],
      ['山形', '2026-10-30'],
      ['山梨', '2026-11-01'],
      ['徳島', '2026-11-01'],
      ['愛媛', '2026-11-01'],
      ['大分', '2026-11-01'],
      ['長崎', '2026-11-02'],
      ['京都', '2026-11-16'],
      // 第4次追補（2026-09-09）。最後の4県は11月中旬〜12月上旬で、いちばん遅い
      ['佐賀', '2026-11-15'],
      ['岩手', '2026-12-01'],
      ['熊本', '2026-12-01'],
      ['沖縄', '2026-12-02'],
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
   * 労働局が発効日を示していない県は、発効日を持たせない（決め打ちしない）。
   * この県は日付が過ぎても「答申」のままになる。
   *
   * 2026-09-16 の発効前メンテで9県の発効日が確認できたので、残るのは宮崎・鹿児島だけ。
   * **この2県の決定公示が確認できたら、このテストは削除してよい**
   * （残り0件になると「決め打ちしていない」を見張る対象が無くなるため）。
   */
  it('発効日が示されていない県は日付を持たず、日が過ぎても「答申」のまま', () => {
    for (const name of ['宮崎', '鹿児島']) {
      const pref = byName(name);
      expect(pref.answered, `${name}: 答申が無い`).toBeDefined();
      expect(pref.answered?.effectiveOn, `${name}: 発効日を決め打ちしている`).toBeUndefined();
      expect(revisionOf(pref, new Date('2026-12-01')).status, `${name}`).toBe('答申');
    }
  });

  /**
   * 第2次追補（2026-08-19）で入れた2県。
   * 広島は当初、労働局が報道発表ではなく異議申出のための公示で額と発効日を示していた
   * （その後404になり、いまは改正決定の発表を出典にしている）。秋田は報道発表（PDF）。
   * どちらも一次情報なので出典に持たせている。
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
   * 第3次追補（2026-08-31）で入れた13県。
   * 発効日が10月中旬〜11月中旬に散らばっていて、10月1日で決め打ちできないことと、
   * 労働局が発効日を示していない2県（宮崎・鹿児島）を持たせていないことを固定する。
   */
  it('第3次追補の13県は一次情報どおりの額・答申日・発効日を持つ', () => {
    const third = [
      ['青森', 1090, '2026-08-26', '2026-10-29'],
      ['山形', 1092, '2026-08-27', '2026-10-30'],
      ['福島', 1094, '2026-08-20', '2026-10-16'],
      ['茨城', 1136, '2026-08-24', '2026-10-18'],
      ['山梨', 1113, '2026-08-28', '2026-11-01'],
      ['京都', 1180, '2026-08-20', '2026-11-16'],
      ['徳島', 1103, '2026-08-24', '2026-11-01'],
      ['愛媛', 1093, '2026-08-21', '2026-11-01'],
      ['高知', 1086, '2026-08-28', '2026-10-29'],
      ['長崎', 1087, '2026-08-28', '2026-11-02'],
      ['大分', 1096, '2026-08-28', '2026-11-01'],
      // 労働局が発効日を条件付き・未記載でしか示していない2県
      ['宮崎', 1085, '2026-08-25', undefined],
      ['鹿児島', 1090, '2026-08-26', undefined],
    ] as const;
    for (const [name, yen, answeredOn, effectiveOn] of third) {
      const pref = byName(name);
      expect(pref.answered?.yen, `${name}: 答申額`).toBe(yen);
      expect(pref.answered?.answeredOn, `${name}: 答申日`).toBe(answeredOn);
      expect(pref.answered?.effectiveOn, `${name}: 発効予定日`).toBe(effectiveOn);
      expect(revisionOf(pref, new Date('2026-08-31')).status, `${name}`).toBe('答申');
    }
  });

  /**
   * 第4次追補（2026-09-09）で入れた最後の4県。
   * 発効日が11月中旬〜12月上旬と遅く、答申から発効までが3ヶ月ある県がある
   * （岩手は 8/31 答申 → 12/1 発効）ことを固定する。
   * 熊本は集計サイト経由のリードが「+62円」だったが、労働局の報道発表は
   * 「時間額１，０９２円」＝現行1,034円から**+58円**。一次情報で裏取りする約束が
   * 効いた例なので、引上げ額もここで焼き込んでおく。
   */
  it('第4次追補の4県は一次情報どおりの額・答申日・発効日を持つ', () => {
    const fourth = [
      ['岩手', 1090, 59, '2026-08-31', '2026-12-01'],
      ['佐賀', 1095, 65, '2026-09-01', '2026-11-15'],
      ['熊本', 1092, 58, '2026-09-01', '2026-12-01'],
      ['沖縄', 1086, 63, '2026-09-03', '2026-12-02'],
    ] as const;
    for (const [name, yen, raise, answeredOn, effectiveOn] of fourth) {
      const pref = byName(name);
      expect(pref.answered?.yen, `${name}: 答申額`).toBe(yen);
      expect(pref.answered?.answeredOn, `${name}: 答申日`).toBe(answeredOn);
      expect(pref.answered?.effectiveOn, `${name}: 発効予定日`).toBe(effectiveOn);
      const r = revisionOf(pref, new Date('2026-09-09'));
      expect(r.raise, `${name}: 引上げ額`).toBe(raise);
      expect(r.status, `${name}`).toBe('答申');
    }
  });

  /**
   * 令和8年度は47都道府県すべての答申が出そろった（沖縄の 2026-09-03 が最後）。
   * 二次情報（集計サイト）だけで答申額を書かない約束は残るので、
   * 追補が完了したこと自体をここで固定しておく
   * （翌年度の改定で `answered` を全件外すと、この件数で気づける）。
   */
  it('未答申の県はもう無い（47都道府県すべて答申済み）', () => {
    expect(PREFECTURES.filter((p) => !p.answered)).toHaveLength(0);
    for (const p of PREFECTURES) {
      expect(revisionOf(p, new Date('2026-09-09')).status, `${p.name}`).not.toBe('目安');
    }
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
    expect(DATA_CHECKED_AT >= '2026-09-09').toBe(true);
  });
});

/**
 * 10月発効前のメンテ（2026-09-16）。
 *
 * 仕様: docs/features/saitei-chingin-r8-hakko-mae-mente.md
 *
 * 答申時に発効日を持たせられなかった11県のうち9県は、労働局の決定公示・
 * 県の最低賃金ページで発効日を確認できた。**ここが埋まっていないと、
 * 10月1日に東京・大阪・千葉の表示が「答申」のまま止まる**ので、
 * このテストがいちばん守りたいのはそこ。
 *
 * **`'決定'` という状態は入れていない**（仕様書の案(b)）。決定公示を確認できているのは
 * 一部の県だけで、状態に出すと確認できていない県が「まだ決まっていない」と読めるため。
 */
describe('10月発効前のメンテ（決定公示の反映と出典の差し替え）', () => {
  /**
   * 答申時に発効日が無く、今回 決定公示・県の最低賃金ページで発効日を確認できた9県。
   * **この9県が埋まっていないと 10/1 に東京・大阪・千葉が「答申」のまま止まる。**
   */
  const NEWLY_DATED = [
    ['千葉', '2026-10-01'],
    ['東京', '2026-10-01'],
    ['新潟', '2026-10-01'],
    ['富山', '2026-10-01'],
    ['岐阜', '2026-10-01'],
    ['大阪', '2026-10-01'],
    ['香川', '2026-10-01'],
    ['群馬', '2026-10-03'],
    ['和歌山', '2026-10-03'],
  ] as const;

  it('決定公示を確認できた9県が発効日を持ち、その日に「発効済み」へ切り替わる', () => {
    for (const [name, on] of NEWLY_DATED) {
      const pref = byName(name);
      expect(pref.answered?.effectiveOn, `${name}: 発効日`).toBe(on);
      const dayBefore = new Date(`${on}T00:00:00Z`);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      expect(revisionOf(pref, dayBefore).status, `${name}: 発効前`).toBe('答申');
      expect(revisionOf(pref, new Date(`${on}T00:00:00`)).status, `${name}: 発効日`).toBe(
        '発効済み',
      );
    }
  });

  /** 仕様書がいちばん気にしている効果。10/1 に最大規模の県が「発効済み」になること */
  it('10月1日に東京・大阪・千葉の表示が「発効済み」になる', () => {
    for (const name of ['東京', '大阪', '千葉']) {
      const pref = byName(name);
      expect(revisionOf(pref, new Date('2026-09-30T00:00:00')).status, `${name}: 前日`).toBe('答申');
      expect(revisionOf(pref, new Date('2026-10-01T00:00:00')).status, `${name}: 発効日`).toBe(
        '発効済み',
      );
      // 仕様書が「いまの挙動」として挙げた再現手順（10/2 に「答申」のまま）が直っている
      expect(revisionOf(pref, new Date('2026-10-02T00:00:00')).status, `${name}: 10/2`).toBe(
        '発効済み',
      );
    }
  });

  /**
   * 決定公示がまだの県には、厚労省の別紙が示す「発効日（予定）」を持たせる。
   * **予定日では `'発効済み'` に切り替えない**（異議申出で動く余地があるため）。
   */
  it('予定日だけの県は plannedEffectiveOn を持ち、その日が来ても「答申」のまま', () => {
    const planned = [
      ['宮崎', '2026-10-24'],
      ['鹿児島', '2026-10-25'],
    ] as const;
    for (const [name, on] of planned) {
      const pref = byName(name);
      expect(pref.answered?.plannedEffectiveOn, `${name}: 予定日`).toBe(on);
      expect(pref.answered?.effectiveOn, `${name}: 予定日を発効日にしている`).toBeUndefined();
      const r = revisionOf(pref, new Date(`${on}T00:00:00`));
      expect(r.status, `${name}: 予定日で発効済みにしている`).toBe('答申');
      expect(r.effectiveOn, `${name}`).toBeUndefined();
    }
  });

  /**
   * 予定日を過ぎても決定公示を反映できていないとき、UIから日付を引っ込めるための旗。
   * これが無いと「10月24日 発効予定」が10月30日にも出続け、
   * 発効済みかもしれない県を「これから」と読ませてしまう。
   */
  it('予定日の前後で plannedDatePassed が切り替わる（日付を出し続けない）', () => {
    const miyazaki = byName('宮崎'); // 予定日 2026-10-24
    const before = revisionOf(miyazaki, new Date('2026-10-20T00:00:00'));
    expect(before.status).toBe('答申');
    expect(before.plannedEffectiveOn).toBe('2026-10-24');
    expect(before.plannedDatePassed).toBe(false);

    // 予定日当日から true。当日には発効している可能性があり「発効予定」と言い切れない
    expect(revisionOf(miyazaki, new Date('2026-10-24T00:00:00')).plannedDatePassed).toBe(true);

    const after = revisionOf(miyazaki, new Date('2026-10-30T00:00:00'));
    expect(after.status, '予定日超過で発効済みにしている').toBe('答申');
    expect(after.plannedDatePassed).toBe(true);
  });

  it('発効日が確定した県と目安の県は plannedDatePassed が立たない', () => {
    // 発効日が確定している県は、発効日を過ぎても「発効済み」であって「予定日超過」ではない
    const tokyo = revisionOf(byName('東京'), new Date('2026-10-30T00:00:00'));
    expect(tokyo.status).toBe('発効済み');
    expect(tokyo.plannedDatePassed).toBe(false);
    expect(tokyo.plannedEffectiveOn).toBeUndefined();

    expect(revisionOf(notAnsweredPref, new Date('2026-12-01')).plannedDatePassed).toBe(false);
  });

  it('発効日が確定している県は plannedEffectiveOn を持たない（二重に持たない）', () => {
    for (const p of PREFECTURES) {
      const a = p.answered;
      if (!a?.effectiveOn) continue;
      expect(a.plannedEffectiveOn, `${p.name}: 発効日と予定日を二重に持っている`).toBeUndefined();
      expect(revisionOf(p, new Date('2026-09-16')).plannedEffectiveOn, `${p.name}`).toBeUndefined();
    }
  });

  /**
   * 労働局のPDFは差し替えでURLが変わりやすく、広島・徳島・山梨の3件が404になっていた。
   * 報道発表のHTMLページに寄せる方針にそろえた（scripts/check-sources.mjs で手動確認）。
   */
  it('差し替えた3件の出典は労働局のHTMLページで、PDF直リンクではない', () => {
    for (const name of ['広島', '徳島', '山梨']) {
      const url = byName(name).answered?.source.url ?? '';
      expect(url, `${name}`).toMatch(/^https:\/\/jsite\.mhlw\.go\.jp\//);
      expect(url.endsWith('.pdf'), `${name}: PDF直リンクに戻っている`).toBe(false);
    }
  });

  it('徳島・山梨の出典の見出しは、ページどおり「答申」の発表だと分かる', () => {
    for (const name of ['徳島', '山梨']) {
      const label = byName(name).answered?.source.label ?? '';
      expect(label, `${name}: 公示ではなく答申の報道発表ページ`).toContain('答申');
      expect(label, `${name}: 古い「一般公示第◯号」の見出しが残っている`).not.toContain('一般公示');
    }
  });

  /**
   * 広島だけは**改正決定**の発表を出典にする。
   *
   * 答申のページ（houdou_newpage_00512）は発効日を「改正決定の効力発生日は、
   * **早ければ**令和８年１０月11日となる予定です」と条件付きでしか書いていない。
   * `effectiveOn` は決定公示で確認した日付だけを入れる約束なので、そこを出典にすると
   * 断定した日付を条件付きの記述で裏づけることになる。徳島・山梨の答申ページは
   * 添付PDFが「効力発生日は令和８年11月１日（日）となる」と断定しているので、そのままでよい。
   */
  it('広島の出典は答申ではなく改正決定の発表（発効日を断定しているページ）', () => {
    const source = byName('広島').answered?.source;
    expect(source?.url).toBe(
      'https://jsite.mhlw.go.jp/hiroshima-roudoukyoku/news_topics/houdou_newpage_00522.html',
    );
    expect(source?.label, '答申のページに戻っている').toContain('改正について');
    expect(source?.label, '発効日を見出しに持つページ').toContain('10月11日');
  });

  it('決定公示を反映した県の出典も、切れやすいPDF直リンクではない', () => {
    for (const [name] of NEWLY_DATED) {
      const url = byName(name).answered?.source.url ?? '';
      expect(url, `${name}`).toMatch(/^https:\/\/jsite\.mhlw\.go\.jp\//);
      expect(url.endsWith('.pdf'), `${name}: PDF直リンク`).toBe(false);
    }
  });

  it('別紙の出典を持っている（予定日と答申ベースの全国加重平均の根拠）', () => {
    expect(SOURCE_MHLW_BESSHI.url).toMatch(/^https:\/\/www\.mhlw\.go\.jp\//);
    expect(SOURCE_MHLW_BESSHI.checkedAt).toBe(DATA_CHECKED_AT);
  });

  it('データ最終確認日を発効前メンテの日まで進めてある', () => {
    expect(DATA_CHECKED_AT >= '2026-09-16').toBe(true);
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

  /**
   * 答申ベースの実績は目安を1円上回る（目安を上回る額で答申した県があるため）。
   * リード文とFAQがこの値を出しているので、目安と取り違えないよう固定しておく。
   * 出典は厚労省「（別紙）令和８年度地域別最低賃金額答申状況」。
   */
  it('答申ベースの全国加重平均は 1,177円（+56円）で、目安を上回る', () => {
    expect(NATIONAL_AVERAGE.answered).toBe(1177);
    expect(NATIONAL_AVERAGE.answered - NATIONAL_AVERAGE.current).toBe(56);
    expect(NATIONAL_AVERAGE.answered).toBeGreaterThan(NATIONAL_AVERAGE.meyasu);
  });
});

/**
 * 答申がまだ出ていない県を模した架空のエントリ。
 *
 * 令和8年度は47都道府県すべての答申がそろったので、実データからは「目安」の県が消えた。
 * ただし目安の分岐は**翌年度の改定でまた全県が通る道**（`answered` を全件外して
 * 始まる）なので、実データが無くなっても分岐そのものは固定しておく。
 * 値は第4次追補の前の岩手（Cランク・1,031円）と同じにしてある。
 */
const notAnsweredPref: Prefecture = {
  code: 3,
  name: '岩手',
  rank: 'C',
  currentYen: 1031,
  currentEffectiveOn: '2025-12-01',
  source: {
    label: '厚生労働省「地域別最低賃金の全国一覧」',
    url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/',
    checkedAt: DATA_CHECKED_AT,
  },
};

describe('revisionOf', () => {
  it('答申が無い県はランク別の目安を足した「目安」として返す', () => {
    const r = revisionOf(notAnsweredPref, new Date('2026-08-14'));
    expect(r.status).toBe('目安');
    expect(r.yen).toBe(notAnsweredPref.currentYen + 56);
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
    // 鹿児島は労働局の発表に効力発生日が載っていない
    expect(byName('鹿児島').answered?.effectiveOn).toBeUndefined();
    expect(revisionOf(byName('鹿児島'), new Date('2026-12-01')).status).toBe('答申');
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
    // 1,031円・Cランク → 見込み 1,087円（実データは全県答申済みなので架空のエントリで見る）
    const r = checkWage(notAnsweredPref, 1050, asOf);
    expect(r.current.meets).toBe(true);
    expect(r.revised.minimumYen).toBe(1087);
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
