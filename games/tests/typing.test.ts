import { describe, expect, it } from 'vitest';
import {
  accuracy,
  changeLevel,
  createGame,
  currentWord,
  finishRound,
  isLevel,
  kpm,
  makeQueue,
  orderedGame,
  pressKey,
  resultOf,
  ROUND_MS,
  scoreOf,
  shuffle,
  startRound,
  type TypingState,
} from '@/lib/typing';
import { WORDS } from '@/lib/typing-words';
import { defaultRomaji } from '@/lib/typing-romaji';

/**
 * 1ラウンド（60秒）の進行のテスト。
 *
 * 仕様: docs/features/game-typing.md（「遊び方（1ラウンド60秒）」）
 *
 * 時刻はこのモジュールに持たせていないので、テストでも時計を固める必要がない。
 * 残り時間は `Game.tsx` が測って渡す。
 */

/** 決定的な出題順にする（シャッフルで何も入れ替えない） */
const noShuffle = () => 0;

/** 1語ぶんの見本どおりに打ち込む */
function typeWord(state: TypingState, keys: string): TypingState {
  return [...keys].reduce((s, key) => pressKey(s, key), state);
}

/** 遊んでいる状態を作る */
function playing(level: 'easy' | 'normal' | 'hard' = 'easy'): TypingState {
  return startRound(createGame(level, noShuffle));
}

describe('createGame', () => {
  it('開始待ちで始まり、1語目が用意されている', () => {
    const state = createGame('easy', noShuffle);
    expect(state.status).toBe('ready');
    expect(state.index).toBe(0);
    expect(currentWord(state).length).toBeGreaterThan(0);
    expect(state.chunks.length).toBeGreaterThan(0);
  });

  it('数え始めはすべて0', () => {
    const state = createGame('normal', noShuffle);
    expect(state.hits).toBe(0);
    expect(state.misses).toBe(0);
    expect(state.cleared).toBe(0);
  });

  it('出題はそのレベルの語彙から出る', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const state = createGame(level, noShuffle);
      expect(WORDS[level]).toContain(currentWord(state));
    }
  });
});

describe('局面の移り変わり', () => {
  it('開始待ちのあいだは打鍵を数えない', () => {
    const state = createGame('easy', noShuffle);
    const after = pressKey(state, 'a');
    expect(after).toEqual(state);
  });

  it('startRound で遊べるようになる', () => {
    expect(startRound(createGame('easy', noShuffle)).status).toBe('playing');
  });

  it('finishRound で結果へ移る', () => {
    expect(finishRound(playing()).status).toBe('finished');
  });

  it('終わったあとの打鍵は数えない（結果が動かない）', () => {
    const done = finishRound(playing());
    expect(pressKey(done, 'a')).toEqual(done);
  });

  it('二重に開始・終了しても壊れない', () => {
    const state = playing();
    expect(startRound(state)).toEqual(state);
    const done = finishRound(state);
    expect(finishRound(done)).toEqual(done);
  });
});

describe('打鍵の判定', () => {
  it('正しい打鍵は hits が増える', () => {
    const state = playing();
    const romaji = defaultRomaji(currentWord(state));
    const after = pressKey(state, romaji[0]);
    expect(after.hits).toBe(1);
    expect(after.misses).toBe(0);
  });

  it('打ち間違いは misses が増えて進まない（仕様の「その場で赤くなる」）', () => {
    const state = playing();
    const wrong = defaultRomaji(currentWord(state))[0] === 'z' ? 'q' : 'z';
    const after = pressKey(state, wrong);
    expect(after.misses).toBe(1);
    expect(after.hits).toBe(0);
    expect(after.progress).toEqual(state.progress);
    expect(currentWord(after)).toBe(currentWord(state));
  });

  it('打鍵にならないキーは正確率に影響しない（Shift や矢印キー）', () => {
    const state = playing();
    for (const key of ['Shift', 'ArrowLeft', 'Enter', ' ']) {
      expect(pressKey(state, key)).toEqual(state);
    }
  });

  it('1語打ち切ると次の語へ進み、打てた語数が増える', () => {
    const state = playing();
    const word = currentWord(state);
    const after = typeWord(state, defaultRomaji(word));
    expect(after.cleared).toBe(1);
    expect(after.index).toBe(1);
    expect(currentWord(after)).not.toBe(word);
    expect(after.progress).toEqual({ chunk: 0, typed: '', text: '' });
    expect(after.misses).toBe(0);
  });

  it('何語でも続けて打てる（出題が尽きない）', () => {
    let state = playing();
    for (let i = 0; i < 30; i += 1) {
      state = typeWord(state, defaultRomaji(currentWord(state)));
    }
    expect(state.cleared).toBe(30);
    expect(state.misses).toBe(0);
    expect(currentWord(state).length).toBeGreaterThan(0);
  });

  it('打ち切った打鍵も hits に入る（KPMが1打ぶん減らない）', () => {
    const state = playing();
    const romaji = defaultRomaji(currentWord(state));
    const after = typeWord(state, romaji);
    expect(after.hits).toBe(romaji.length);
  });

  it('むずかしいの語も最後まで打てる', () => {
    let state = playing('hard');
    for (let i = 0; i < 10; i += 1) {
      state = typeWord(state, defaultRomaji(currentWord(state)));
    }
    expect(state.cleared).toBe(10);
    expect(state.misses).toBe(0);
  });
});

describe('レベルの切り替え', () => {
  it('開始待ちなら切り替えられる', () => {
    const state = changeLevel(createGame('easy', noShuffle), 'hard', noShuffle);
    expect(state.level).toBe('hard');
    expect(WORDS.hard).toContain(currentWord(state));
  });

  it('遊んでいるあいだは切り替えない（数え方が混ざるため）', () => {
    const state = playing();
    expect(changeLevel(state, 'hard', noShuffle)).toEqual(state);
  });

  it('同じレベルを選んでも出題を作り直さない', () => {
    const state = createGame('easy', noShuffle);
    expect(changeLevel(state, 'easy', noShuffle)).toEqual(state);
  });

  it('結果の画面からは切り替えられる（次のラウンドの準備）', () => {
    const done = finishRound(playing());
    const next = changeLevel(done, 'normal', noShuffle);
    expect(next.level).toBe('normal');
    expect(next.status).toBe('ready');
    expect(next.hits).toBe(0);
  });
});

describe('KPM と正確率', () => {
  it('60秒で240打なら 240 KPM', () => {
    expect(kpm(240)).toBe(240);
  });

  it('経過時間ではなくラウンドの長さで割る（開始直後に跳ねない）', () => {
    // 開始1秒で10打しても「60秒で10打」＝10 KPM。
    // 経過時間で割ると 600 KPM になり、数字が跳ねて意味を失う
    expect(kpm(10)).toBe(10);
    expect(kpm(0)).toBe(0);
  });

  it('30秒のラウンドなら倍のKPMになる', () => {
    expect(kpm(120, 30_000)).toBe(240);
  });

  it('長さが0以下でも落ちない', () => {
    expect(kpm(10, 0)).toBe(0);
    expect(kpm(10, -1)).toBe(0);
  });

  it('正確率は 正しい打鍵 ÷ 全打鍵', () => {
    expect(accuracy(90, 10)).toBe(100 - 10);
    expect(accuracy(1, 1)).toBe(50);
    expect(accuracy(0, 5)).toBe(0);
  });

  it('1打も打っていなければ100%（「正確率0%」と出さない）', () => {
    expect(accuracy(0, 0)).toBe(100);
  });

  it('resultOf は状態からそのまま結果を作る', () => {
    const state: TypingState = { ...playing(), hits: 300, misses: 20, cleared: 15 };
    expect(resultOf(state)).toEqual({
      kpm: 300,
      accuracy: 94,
      cleared: 15,
      hits: 300,
      misses: 20,
    });
  });

  it('記録に残すスコアはKPM（正確率をベストにすると1打100%が最高記録になる）', () => {
    expect(scoreOf(resultOf({ ...playing(), hits: 250, misses: 0, cleared: 12 }))).toBe(250);
  });

  it('ラウンドの長さは60秒', () => {
    expect(ROUND_MS).toBe(60_000);
  });
});

describe('出題の並び', () => {
  it('shuffle は元の配列を変えず、同じ要素を返す', () => {
    const source = ['a', 'b', 'c', 'd'];
    const shuffled = shuffle(source, () => 0.99);
    expect(source).toEqual(['a', 'b', 'c', 'd']);
    expect([...shuffled].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('makeQueue は重複のない語を並べる', () => {
    const queue = makeQueue('normal');
    expect(queue.length).toBe(new Set(queue).size);
    expect(queue.length).toBeGreaterThan(20);
    for (const word of queue) expect(WORDS.normal).toContain(word);
  });

  it('乱数を変えると並びが変わる（毎回同じ出題にならない）', () => {
    const a = makeQueue('easy', () => 0.1);
    const b = makeQueue('easy', () => 0.9);
    expect(a).not.toEqual(b);
  });

  /**
   * **hydration の回帰テスト。**
   *
   * 最初の状態を `createGame`（乱数で並べ替える）で作ると、静的書き出しの
   * HTMLに入るお題とブラウザが選ぶお題が食い違い、React の hydration が壊れる
   * （実測でサーバー「かわ」・ブラウザ「すいか」になっていた）。
   * `orderedGame` は何度呼んでも同じ状態を返す。
   */
  it('orderedGame は何度呼んでも同じ（サーバーとブラウザで食い違わない）', () => {
    expect(orderedGame('easy')).toEqual(orderedGame('easy'));
    expect(currentWord(orderedGame('easy'))).toBe(WORDS.easy[0]);
    expect(currentWord(orderedGame('hard'))).toBe(WORDS.hard[0]);
  });

  it('orderedGame も遊べる状態になっている（並べ替えていないだけ）', () => {
    const state = startRound(orderedGame('normal'));
    const after = typeWord(state, defaultRomaji(currentWord(state)));
    expect(after.cleared).toBe(1);
    expect(after.misses).toBe(0);
  });
});

describe('isLevel（保存された設定の読み戻し）', () => {
  it('正しいレベルだけを通す', () => {
    expect(isLevel('easy')).toBe(true);
    expect(isLevel('normal')).toBe(true);
    expect(isLevel('hard')).toBe(true);
    expect(isLevel('むずかしい')).toBe(false);
    expect(isLevel(null)).toBe(false);
    expect(isLevel(3)).toBe(false);
  });
});
