import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  FU_OPTIONS,
  applySpecialForm,
  basePoints,
  calcFu,
  calcScore,
  defaultFuInput,
  impossibleReason,
  limitRows,
  parseRules,
  scoreLabel,
  tableCell,
  type FuInput,
  type HanSpec,
  type MahjongRules,
  type ScoreInput,
  type ScoreResult,
} from '@/lib/mahjong-tensu';

// 仕様: docs/features/mahjong-tensu-keisan.md の「テスト」1〜22

const KIRIAGE: MahjongRules = { ...DEFAULT_RULES, kiriageMangan: true };

function score(input: ScoreInput, rules: MahjongRules = DEFAULT_RULES): ScoreResult {
  const r = calcScore(input, rules);
  if (!r.ok) throw new Error(r.error);
  return r;
}

const ko = (fu: number, han: HanSpec, win: 'ron' | 'tsumo' = 'ron') => ({ dealer: false, win, fu, han });
const oya = (fu: number, han: HanSpec, win: 'ron' | 'tsumo' = 'ron') => ({ dealer: true, win, fu, han });

describe('点数（符と翻から）', () => {
  it('1. 子 30符1翻 ロン → 1,000', () => {
    expect(score(ko(30, 1)).ron).toBe(1000);
  });
  it('2. 子 30符3翻 ロン → 3,900', () => {
    expect(score(ko(30, 3)).ron).toBe(3900);
  });
  it('3. 子 30符4翻 ロン → 7,700（切り上げ満貫ありなら 8,000）', () => {
    expect(score(ko(30, 4)).ron).toBe(7700);
    expect(score(ko(30, 4)).limit).toBeNull();
    const k = score(ko(30, 4), KIRIAGE);
    expect(k.ron).toBe(8000);
    expect(k.limit).toBe('満貫');
    // 3翻60符も切り上げ満貫
    expect(score(ko(60, 3)).ron).toBe(7700);
    expect(score(ko(60, 3), KIRIAGE).ron).toBe(8000);
  });
  it('4. 親 30符4翻 ロン → 11,600（切り上げ満貫ありなら 12,000）', () => {
    expect(score(oya(30, 4)).ron).toBe(11600);
    expect(score(oya(30, 4), KIRIAGE).ron).toBe(12000);
  });
  it('5. 子 40符3翻 ロン → 5,200', () => {
    expect(score(ko(40, 3)).ron).toBe(5200);
  });
  it('6. 子 25符2翻 ロン → 1,600', () => {
    expect(score(ko(25, 2)).ron).toBe(1600);
  });
  it('7. 子 20符2翻 ツモ → 400・700', () => {
    const r = score(ko(20, 2, 'tsumo'));
    expect([r.tsumoKo, r.tsumoOya]).toEqual([400, 700]);
    expect(scoreLabel(r, false, 'tsumo')).toBe('400・700');
    expect(r.total).toBe(1500);
  });
  it('8. 子 30符1翻 ツモ → 300・500', () => {
    const r = score(ko(30, 1, 'tsumo'));
    expect([r.tsumoKo, r.tsumoOya]).toEqual([300, 500]);
  });
  it('9. 親 30符1翻 ツモ → 500オール', () => {
    const r = score(oya(30, 1, 'tsumo'));
    expect(scoreLabel(r, true, 'tsumo')).toBe('500オール');
    expect(r.total).toBe(1500);
  });
  it('10. 子 110符1翻 ロン → 3,600', () => {
    expect(score(ko(110, 1)).ron).toBe(3600);
  });
  it('11. 子 70符3翻 → 満貫 8,000（基本点 2,240 が 2,000 を超える）', () => {
    const r = score(ko(70, 3));
    expect(r.ron).toBe(8000);
    expect(r.limit).toBe('満貫');
    expect(r.base).toBe(2000);
  });
  it('12. 子 満貫ロン・2本場・供託2本 → 8,000 ＋ 600 ＋ 2,000', () => {
    const r = score({ ...ko(30, 5), honba: 2, kyotaku: 2 });
    expect(r.ron).toBe(8000);
    expect(r.honbaBonus).toBe(600);
    expect(r.kyotakuBonus).toBe(2000);
    expect(r.total).toBe(10600);
  });
  it('13. 13翻 → 数え役満 32,000（三倍満止めなら 24,000）', () => {
    const r = score(ko(30, 13));
    expect(r.ron).toBe(32000);
    expect(r.limit).toBe('数え役満');
    const s = score(ko(30, 13), { ...DEFAULT_RULES, kazoeYakuman: false });
    expect(s.ron).toBe(24000);
    expect(s.limit).toBe('三倍満');
  });
  it('17. 子 満貫ツモ → 2,000・4,000', () => {
    const r = score(ko(30, 5, 'tsumo'));
    expect(scoreLabel(r, false, 'tsumo')).toBe('2,000・4,000');
    expect(r.total).toBe(8000);
  });
  it('18. 親 満貫ツモ → 4,000オール', () => {
    const r = score(oya(30, 5, 'tsumo'));
    expect(scoreLabel(r, true, 'tsumo')).toBe('4,000オール');
    expect(r.total).toBe(12000);
  });
  it('19. ツモ＋本場：子 30符1翻 ツモ・1本場 → 400・600（各自＋100）', () => {
    const r = score({ ...ko(30, 1, 'tsumo'), honba: 1 });
    expect([r.payKo, r.payOya]).toEqual([400, 600]);
    expect(r.honbaBonus).toBe(300);
    expect(r.total).toBe(1400);
  });
  it('20. 親 13翻 ロン → 数え役満 48,000', () => {
    expect(score(oya(30, 13)).ron).toBe(48000);
  });

  it('満貫以上の区切り（跳満・倍満・三倍満）', () => {
    expect(basePoints(30, 6).base).toBe(3000);
    expect(basePoints(30, 7).limit).toBe('跳満');
    expect(basePoints(30, 8).base).toBe(4000);
    expect(basePoints(30, 10).limit).toBe('倍満');
    expect(basePoints(30, 11).base).toBe(6000);
    expect(basePoints(30, 12).limit).toBe('三倍満');
  });

  it('役満は 8,000 × 倍数。ダブル役満なしなら1倍で止める', () => {
    expect(score(ko(0, { yakuman: 1 })).ron).toBe(32000);
    expect(score(ko(0, { yakuman: 2 })).ron).toBe(64000);
    expect(score(ko(0, { yakuman: 2 })).limit).toBe('ダブル役満');
    expect(score(ko(0, { yakuman: 2 }), { ...DEFAULT_RULES, doubleYakuman: false }).ron).toBe(32000);
    expect(score(oya(0, { yakuman: 1 }, 'tsumo')).tsumoOya).toBe(16000);
  });

  it('親のツモの本場は各自＋100、供託はあがった人に', () => {
    const r = score({ ...oya(30, 1, 'tsumo'), honba: 2, kyotaku: 1 });
    expect(r.payKo).toBe(700);
    expect(r.total).toBe(700 * 3 + 1000);
  });

  it('本場・供託のおかしな値は0として扱う', () => {
    const r = score({ ...ko(30, 1), honba: -3, kyotaku: Number.NaN });
    expect(r.total).toBe(1000);
  });
});

describe('ありえない組み合わせ', () => {
  it('16. 20符1翻・20符ロン・25符1翻・25符2翻ツモはエラー。早見表の同じセルは「—」（null）', () => {
    expect(calcScore(ko(20, 1, 'tsumo')).ok).toBe(false);
    expect(calcScore(ko(20, 2, 'ron')).ok).toBe(false);
    expect(calcScore(ko(25, 1, 'ron')).ok).toBe(false);
    expect(calcScore(ko(25, 2, 'tsumo')).ok).toBe(false);
    expect(calcScore(oya(25, 2, 'tsumo')).ok).toBe(false);

    expect(tableCell(20, 1, false, 'tsumo')).toBeNull();
    expect(tableCell(20, 3, false, 'ron')).toBeNull();
    expect(tableCell(25, 1, true, 'ron')).toBeNull();
    expect(tableCell(25, 2, false, 'tsumo')).toBeNull();

    // ありうる組み合わせは値が出る
    expect(tableCell(25, 2, false, 'ron')).toBe('1,600');
    expect(tableCell(25, 3, false, 'tsumo')).toBe('800・1,600');
    expect(tableCell(20, 2, true, 'tsumo')).toBe('700オール');
  });

  it('エラーには理由の文が付く', () => {
    const r = calcScore(ko(25, 2, 'tsumo'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('門前清自摸和');
    expect(impossibleReason(20, 1, 'ron')).toContain('30符');
  });

  it('符が効かない5翻以上・役満では止めない', () => {
    expect(impossibleReason(20, 5, 'ron')).toBeNull();
    expect(impossibleReason(25, { yakuman: 1 }, 'tsumo')).toBeNull();
  });

  it('早見表の全セル（符20〜110×翻1〜4）が「—」か満貫以下の値になる', () => {
    for (const fu of FU_OPTIONS) {
      for (const han of [1, 2, 3, 4]) {
        for (const dealer of [false, true]) {
          for (const win of ['ron', 'tsumo'] as const) {
            const cell = tableCell(fu, han, dealer, win);
            if (cell === null) continue;
            const r = score({ dealer, win, fu, han });
            expect(r.total).toBeLessThanOrEqual(dealer ? 12000 : 8000);
          }
        }
      }
    }
  });

  it('満貫以上の行はルールに追従する', () => {
    expect(limitRows().map((r) => r.name)).toContain('数え役満（13翻以上）');
    expect(limitRows({ ...DEFAULT_RULES, kazoeYakuman: false }).map((r) => r.name)).not.toContain('数え役満（13翻以上）');
    expect(limitRows({ ...DEFAULT_RULES, doubleYakuman: false }).map((r) => r.name)).not.toContain('ダブル役満');
  });
});

function fuInput(patch: Partial<FuInput>): FuInput {
  return { ...defaultFuInput(), ...patch };
}

describe('符の組み立て', () => {
  it('14. 門前ロン・暗刻 么九1つ・単騎待ち・ほかは順子 → 20＋10＋8＋2＝40符', () => {
    const base = defaultFuInput();
    const r = calcFu(
      fuInput({
        win: 'ron',
        menzen: true,
        wait: 'tanki',
        melds: [{ kind: 'koutsu', open: false, yaochu: true }, base.melds[1], base.melds[2], base.melds[3]],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items.map((i) => i.fu)).toEqual([20, 10, 8, 2]);
    expect(r.raw).toBe(40);
    expect(r.fu).toBe(40);
  });

  it('15. 双碰待ちのロンで完成した刻子は明刻（中張なら2符）', () => {
    const base = defaultFuInput();
    const r = calcFu(
      fuInput({
        win: 'ron',
        wait: 'shanpon',
        melds: [
          { kind: 'koutsu', open: false, yaochu: false },
          { kind: 'koutsu', open: false, yaochu: false },
          base.melds[2],
          base.melds[3],
        ],
        ronCompleted: 1,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 副底20・門前ロン10・暗刻中張4・明刻中張2（ロンで完成）
    expect(r.items.map((i) => i.fu)).toEqual([20, 10, 4, 2]);
    expect(r.items[3].label).toContain('明刻');
    expect(r.raw).toBe(36);
    expect(r.fu).toBe(40);
    expect(r.notes.join()).toContain('明刻');
  });

  it('双碰待ちでもツモなら暗刻のまま', () => {
    const base = defaultFuInput();
    const r = calcFu(
      fuInput({
        win: 'tsumo',
        wait: 'shanpon',
        melds: [{ kind: 'koutsu', open: false, yaochu: true }, base.melds[1], base.melds[2], base.melds[3]],
        ronCompleted: 0,
      }),
    );
    expect(r.ok && r.items.map((i) => i.fu)).toEqual([20, 2, 8]);
  });

  it('21. 平和を選ぶと面子・待ち・雀頭・門前が固定され、ツモ20符／ロン30符になる', () => {
    const messy = fuInput({
      special: 'pinfu',
      menzen: false,
      wait: 'tanki',
      pair: 'yakuhai',
      melds: [
        { kind: 'kantsu', open: true, yaochu: true },
        { kind: 'koutsu', open: false, yaochu: true },
        { kind: 'shuntsu', open: true, yaochu: false },
        { kind: 'shuntsu', open: false, yaochu: false },
      ],
    });
    const fixed = applySpecialForm(messy);
    expect(fixed.menzen).toBe(true);
    expect(fixed.wait).toBe('ryanmen');
    expect(fixed.pair).toBe('plain');
    expect(fixed.melds.every((m) => m.kind === 'shuntsu' && !m.open)).toBe(true);

    const tsumo = calcFu({ ...messy, win: 'tsumo' });
    const ron = calcFu({ ...messy, win: 'ron' });
    expect(tsumo.ok && tsumo.fu).toBe(20);
    expect(ron.ok && ron.fu).toBe(30);
  });

  it('22. 双碰・ロンで「ロンで完成」を選ばないと計算しない', () => {
    const base = defaultFuInput();
    const r = calcFu(
      fuInput({
        win: 'ron',
        wait: 'shanpon',
        melds: [
          { kind: 'koutsu', open: false, yaochu: false },
          { kind: 'koutsu', open: false, yaochu: true },
          base.melds[2],
          base.melds[3],
        ],
        ronCompleted: null,
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('どちらの刻子がロンで完成しましたか');
    // 順子の行を選んでいても計算しない
    const r2 = calcFu(fuInput({ win: 'ron', wait: 'shanpon', ronCompleted: 2 }));
    expect(r2.ok).toBe(false);
  });

  it('七対子は25符固定（切り上げなし）', () => {
    const r = calcFu(fuInput({ special: 'chiitoi', win: 'tsumo', menzen: false, wait: 'kanchan' }));
    expect(r.ok && r.fu).toBe(25);
    expect(applySpecialForm(fuInput({ special: 'chiitoi', menzen: false })).menzen).toBe(true);
  });

  it('鳴いたのに面子がすべて「暗」ならエラー', () => {
    const r = calcFu(fuInput({ menzen: false }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('鳴いた面子を1つ以上『明』にしてください');
  });

  it('門前なのに「明」の面子があるならエラー', () => {
    const base = defaultFuInput();
    const r = calcFu(fuInput({ menzen: true, melds: [{ kind: 'koutsu', open: true, yaochu: false }, base.melds[1], base.melds[2], base.melds[3]] }));
    expect(r.ok).toBe(false);
  });

  it('喰い平和形（鳴いて符が20のままのロン）は30符', () => {
    const base = defaultFuInput();
    const r = calcFu(fuInput({ menzen: false, win: 'ron', melds: [{ kind: 'shuntsu', open: true, yaochu: false }, base.melds[1], base.melds[2], base.melds[3]] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.raw).toBe(20);
    expect(r.fu).toBe(30);
  });

  it('槓子の符（明槓 中張8・暗槓 么九32）と役牌・連風牌の雀頭', () => {
    const r = calcFu(
      fuInput({
        menzen: false,
        win: 'tsumo',
        pair: 'renpu',
        melds: [
          { kind: 'kantsu', open: true, yaochu: false },
          { kind: 'kantsu', open: false, yaochu: true },
          { kind: 'shuntsu', open: true, yaochu: false },
          { kind: 'shuntsu', open: true, yaochu: false },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items.map((i) => i.fu)).toEqual([20, 2, 8, 32, 2]);
    expect(r.fu).toBe(70);
    const r4 = calcFu(fuInput({ pair: 'renpu', wait: 'kanchan' }), { ...DEFAULT_RULES, renpuFu: 4 });
    expect(r4.ok && r4.items.map((i) => i.fu)).toEqual([20, 10, 4, 2]);
    const y = calcFu(fuInput({ pair: 'yakuhai' }));
    expect(y.ok && y.raw).toBe(32);
  });

  it('組み立てた符から点数を出せる（40符3翻ロン → 5,200）', () => {
    const r = calcFu(fuInput({ wait: 'kanchan', pair: 'yakuhai' })); // 20+10+2+2=34→40
    expect(r.ok && r.fu).toBe(40);
    if (r.ok) expect(score(ko(r.fu, 3)).ron).toBe(5200);
  });
});

describe('ルールの読み込み', () => {
  it('壊れた値は既定で埋める', () => {
    expect(parseRules(null)).toEqual(DEFAULT_RULES);
    expect(parseRules({ kiriageMangan: 'yes', renpuFu: 3 })).toEqual(DEFAULT_RULES);
    expect(parseRules({ kiriageMangan: true, renpuFu: 4, kazoeYakuman: false, doubleYakuman: false })).toEqual({
      kiriageMangan: true,
      renpuFu: 4,
      kazoeYakuman: false,
      doubleYakuman: false,
    });
  });
});
