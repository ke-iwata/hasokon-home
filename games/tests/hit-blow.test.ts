import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/lib/daily';
import {
  allCodes,
  buildSecondMoveTable,
  consistent,
  cpuGuess,
  DAILY_DIGITS,
  DAILY_PROGRESS_KEY,
  dailySecret,
  EASY_MISTAKE_RATE,
  isSolved,
  isValidCode,
  matchOutcome,
  OPENING,
  randomCode,
  readDailyProgress,
  remainingCount,
  replay,
  score,
  SECOND_MOVE,
  shareText,
  strongGuess,
  turnEmoji,
  variantOf,
  writeDailyProgress,
  type Code,
  type Digits,
  type Turn,
} from '@/lib/hit-blow';

/** 仕様: docs/features/game-hit-blow.md */

/** テスト用の localStorage */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

/** 答え `secret` に対して CPU を当てきるまで回し、手の列を返す */
function playOut(secret: Code, next: (history: Turn[]) => Code, limit = 60): Turn[] {
  const history: Turn[] = [];
  while (history.length < limit) {
    const guess = next(history);
    const fb = score(secret, guess);
    history.push({ guess, ...fb });
    if (isSolved(fb, secret.length as Digits)) break;
  }
  return history;
}

describe('score（ヒットとブロー）', () => {
  it('代表例', () => {
    expect(score('1234', '1243')).toEqual({ hit: 2, blow: 2 });
    expect(score('1234', '5612')).toEqual({ hit: 0, blow: 2 });
    expect(score('0123', '0456')).toEqual({ hit: 1, blow: 0 });
    expect(score('012', '210')).toEqual({ hit: 1, blow: 2 });
  });

  it('0 ヒット 0 ブロー／全ヒット／全ブロー', () => {
    expect(score('1234', '5678')).toEqual({ hit: 0, blow: 0 });
    expect(score('1234', '1234')).toEqual({ hit: 4, blow: 0 });
    expect(score('1234', '4321')).toEqual({ hit: 0, blow: 4 });
    expect(score('1234', '2143')).toEqual({ hit: 0, blow: 4 });
  });

  it('同じ数字が同じ場所にあるときはヒットだけに数える（ブローに二重に数えない）', () => {
    for (const s of ['0123', '9876', '5038']) {
      for (const g of allCodes(4).slice(0, 500)) {
        const { hit, blow } = score(s, g);
        expect(hit + blow).toBeLessThanOrEqual(4);
        const common = [...g].filter((c) => s.includes(c)).length;
        expect(hit + blow).toBe(common);
      }
    }
  });

  it('答えと推測を入れ替えても同じヒントになる', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const a = randomCode(4, rng);
      const b = randomCode(4, rng);
      expect(score(a, b)).toEqual(score(b, a));
    }
  });
});

describe('isValidCode・allCodes', () => {
  it('桁数・重複なし・数字だけ', () => {
    expect(isValidCode('0123', 4)).toBe(true);
    expect(isValidCode('012', 3)).toBe(true);
    expect(isValidCode('0123', 3)).toBe(false);
    expect(isValidCode('1123', 4)).toBe(false);
    expect(isValidCode('12a4', 4)).toBe(false);
    expect(isValidCode('', 4)).toBe(false);
  });

  it('3 桁 720 通り・4 桁 5,040 通り。どれも有効で、辞書順に並び重複しない', () => {
    for (const [d, n] of [
      [3, 720],
      [4, 5040],
    ] as const) {
      const codes = allCodes(d);
      expect(codes.length).toBe(n);
      expect(new Set(codes).size).toBe(n);
      expect(codes.every((c) => isValidCode(c, d))).toBe(true);
      expect([...codes].sort()).toEqual([...codes]);
    }
  });
});

describe('consistent（ヒントと矛盾しない候補）', () => {
  it('全 5,040 通りの答えで、ふつうの CPU の手順で当てきるまで答えが候補に残る', () => {
    const rng = mulberry32(2026);
    let maxMoves = 0;
    for (const secret of allCodes(4)) {
      let cands: Code[] = [...allCodes(4)];
      let moves = 0;
      for (;;) {
        const guess = cands[Math.floor(rng() * cands.length)];
        const fb = score(secret, guess);
        moves++;
        if (isSolved(fb, 4)) break;
        cands = consistent(cands, [{ guess, ...fb }]);
        expect(cands).toContain(secret);
        expect(cands).not.toContain(guess);
      }
      maxMoves = Math.max(maxMoves, moves);
    }
    expect(maxMoves).toBeLessThanOrEqual(12);
  });

  it('remainingCount は consistent の数と一致する', () => {
    const history = replay('5038', ['0123', '4567']);
    expect(remainingCount(history, 4)).toBe(consistent(allCodes(4), history).length);
    expect(remainingCount([], 3)).toBe(720);
  });
});

describe('つよい CPU', () => {
  it('2 手目の表は、その場で計算した手と一致する（表は buildSecondMoveTable の写し）', () => {
    for (const d of [3, 4] as const) {
      const built = buildSecondMoveTable(d);
      // 食い違ったら、この差分を lib/hit-blow.ts の SECOND_MOVE に写す
      expect(SECOND_MOVE[d], JSON.stringify(built)).toEqual(built);
    }
  });

  it('1 手目は定数・2 手目は表から引く', () => {
    expect(strongGuess([], 4)).toBe(OPENING[4]);
    expect(strongGuess([], 3)).toBe(OPENING[3]);
    expect(strongGuess([{ guess: '0123', hit: 0, blow: 0 }], 4)).toBe(SECOND_MOVE[4]['0-0']);
  });

  it('同じ履歴からは同じ手（乱数に左右されない）', () => {
    const history = replay('7381', ['0123', '1456']);
    const a = cpuGuess('strong', history, () => 0);
    const b = cpuGuess('strong', history, () => 0.999);
    expect(a).toBe(b);
  });

  /**
   * つよい CPU は履歴から決定的に決まるので、**判定木を 1 度だけ作る**。
   * 根（1 手目）から応答ごとに残り候補を分け、次の手を 1 回だけ計算して、
   * 葉（当たり）までの深さで全答えの手数を出す。あわせて 3 手目以降の 1 手の時間の最悪を測る。
   */
  function decisionTree(d: Digits) {
    const depthOf = new Map<Code, number>();
    let slowest = 0;
    const walk = (cands: Code[], history: Turn[]) => {
      const start = performance.now();
      const guess = strongGuess(history, d);
      if (history.length >= 2) slowest = Math.max(slowest, performance.now() - start);
      const groups = new Map<string, Code[]>();
      for (const c of cands) {
        const fb = score(c, guess);
        const key = `${fb.hit}-${fb.blow}`;
        const list = groups.get(key) ?? [];
        list.push(c);
        groups.set(key, list);
      }
      for (const [key, list] of groups) {
        const [hit, blow] = key.split('-').map(Number);
        if (hit === d) depthOf.set(list[0], history.length + 1);
        else walk(list, [...history, { guess, hit, blow }]);
      }
    };
    walk([...allCodes(d)], []);
    const depths = [...depthOf.values()];
    return {
      count: depthOf.size,
      average: depths.reduce((s, x) => s + x, 0) / depths.length,
      max: Math.max(...depths),
      slowest,
      depthOf,
    };
  }

  it('4 桁で全答えを当てきる。平均 5.5 手以下・最大 7 手以下（実測は平均 5.38・最大 7）', () => {
    const tree = decisionTree(4);
    expect(tree.count).toBe(5040);
    expect(tree.average).toBeLessThanOrEqual(5.5);
    expect(tree.max).toBeLessThanOrEqual(7);
    // 1 手目は定数・2 手目は表なので、測るのは 3 手目以降の最悪（実測は 30ms 台）
    expect(tree.slowest).toBeLessThan(100);
  }, 20_000);

  it('3 桁で全答えを当てきる（実測は平均 5.16・最大 6）', () => {
    const tree = decisionTree(3);
    expect(tree.count).toBe(720);
    expect(tree.average).toBeLessThanOrEqual(5.3);
    expect(tree.max).toBeLessThanOrEqual(6);
  });

  it('判定木の手数は、実際に cpuGuess で回した手数と一致する', () => {
    const tree = decisionTree(3);
    for (const secret of ['012', '987', '360', '574']) {
      const history = playOut(secret, (h) => cpuGuess('strong', h, () => 0, 3));
      expect(history.length).toBe(tree.depthOf.get(secret));
    }
  });
});

describe('ふつう・やさしい CPU', () => {
  it('ふつう：いつも矛盾しない候補から選び、当てきる', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 100; i++) {
      const secret = randomCode(4, rng);
      const history = playOut(secret, (h) => {
        const guess = cpuGuess('normal', h, rng);
        expect(consistent([guess], h)).toEqual([guess]);
        return guess;
      });
      expect(history.at(-1)?.guess).toBe(secret);
    }
  });

  it('やさしい：矛盾する手（まだ出していない数）がおよそ 3 手に 1 回混ざる（300 手で 0.25〜0.42）', () => {
    const rng = mulberry32(31);
    let moves = 0;
    let mistakes = 0;
    while (moves < 300) {
      const secret = randomCode(4, rng);
      playOut(secret, (h) => {
        const guess = cpuGuess('easy', h, rng);
        // 1 手目はどの数も矛盾しないので数えない
        if (h.length > 0) {
          moves++;
          if (consistent([guess], h).length === 0) mistakes++;
        }
        expect(h.some((t) => t.guess === guess)).toBe(false);
        return guess;
      });
    }
    const rate = mistakes / moves;
    expect(EASY_MISTAKE_RATE).toBeCloseTo(1 / 3);
    expect(rate).toBeGreaterThanOrEqual(0.25);
    expect(rate).toBeLessThanOrEqual(0.42);
  });

  it('やさしいも最後は当てる', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 50; i++) {
      const secret = randomCode(3, rng);
      const history = playOut(secret, (h) => cpuGuess('easy', h, rng, 3));
      expect(history.at(-1)?.guess).toBe(secret);
    }
  });

  it('cpuGuess は利用者の隠した数を引数に取らない（履歴・乱数・桁数だけ）', () => {
    // 引数は (level, history, rng, digits) の 4 つ。答えを渡す口が無い
    expect(cpuGuess.length).toBeLessThanOrEqual(4);
    const src = cpuGuess.toString();
    expect(src).not.toMatch(/secret/);
  });
});

describe('matchOutcome（対戦の勝敗）', () => {
  it('先手が当て、後手も同じ手数目で当てたら引き分け', () => {
    expect(matchOutcome(5, 5)).toBe('draw');
  });

  it('先手が当て、後手が同じ手数目で外したら先手の勝ち', () => {
    expect(matchOutcome(5, null)).toBe('first');
  });

  it('後手が先に当てたら（先手は外している）後手の勝ち', () => {
    expect(matchOutcome(null, 4)).toBe('second');
  });

  it('どちらもまだなら続ける', () => {
    expect(matchOutcome(null, null)).toBeNull();
  });
});

describe('今日の 1 問', () => {
  it('同じ日で同じ・日が違えば変わる・重複が無い 4 桁', () => {
    expect(dailySecret('2026-10-15')).toBe(dailySecret('2026-10-15'));
    const seen = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      const s = dailySecret(`2026-11-${String(d).padStart(2, '0')}`);
      expect(isValidCode(s, DAILY_DIGITS)).toBe(true);
      seen.add(s);
    }
    // 28 日で同じ答えがほとんど重ならない（5,040 通りから選んでいる）
    expect(seen.size).toBeGreaterThanOrEqual(26);
  });

  it('途中経過は日付と推測だけを保存し、再読み込みで戻る', () => {
    const storage = memoryStorage();
    writeDailyProgress(storage, { dateKey: '2026-10-15', guesses: ['0123', '4567'] });
    const raw = storage.data.get(DAILY_PROGRESS_KEY) as string;
    expect(raw).not.toContain(dailySecret('2026-10-15'));
    expect(readDailyProgress(storage, '2026-10-15')).toEqual(['0123', '4567']);
  });

  it('別の日の途中経過・壊れた値・読めないストレージは空として扱う', () => {
    const storage = memoryStorage({ [DAILY_PROGRESS_KEY]: JSON.stringify({ dateKey: '2026-10-14', guesses: ['0123'] }) });
    expect(readDailyProgress(storage, '2026-10-15')).toEqual([]);
    expect(readDailyProgress(memoryStorage({ [DAILY_PROGRESS_KEY]: '{' }), '2026-10-15')).toEqual([]);
    expect(readDailyProgress(null, '2026-10-15')).toEqual([]);
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readDailyProgress(broken, '2026-10-15')).toEqual([]);
    expect(() => writeDailyProgress(broken, { dateKey: '2026-10-15', guesses: [] })).not.toThrow();
  });

  it('不正な推測は捨て、当たりのあとの手は残さない', () => {
    const today = '2026-10-15';
    const secret = dailySecret(today);
    const other = allCodes(4).find((c) => c !== secret) as Code;
    const storage = memoryStorage({
      [DAILY_PROGRESS_KEY]: JSON.stringify({ dateKey: today, guesses: [other, '1123', secret, other] }),
    });
    expect(readDailyProgress(storage, today)).toEqual([other, secret]);
  });

  it('共有文は 🟢🟡⚪ と手数だけで、答えの数字を入れない', () => {
    const today = '2026-10-15';
    const secret = dailySecret(today);
    const history = replay(secret, ['0123', '4567', secret]);
    const text = shareText({ dateKey: today, history, streak: 3, url: 'https://hasokon.com/games/hit-blow/' });
    expect(text).toContain('10/15');
    expect(text).toContain('3手で正解');
    expect(text).toContain('連続3日');
    expect(text).toContain('🟢🟢🟢🟢');
    // URL を除いた本文に答えの数字列が無い
    expect(text.replace(/https:\/\/\S+/, '')).not.toContain(secret);
    expect(text.split('\n')).toHaveLength(5);
  });

  it('turnEmoji は桁数ぶんの絵文字を並べる', () => {
    expect(turnEmoji({ hit: 1, blow: 2 }, 4)).toBe('🟢🟡🟡⚪');
    expect(turnEmoji({ hit: 0, blow: 0 }, 3)).toBe('⚪⚪⚪');
  });
});

describe('記録の変種キー', () => {
  it('daily-4・practice-3・practice-4・cpu-<level>', () => {
    expect(variantOf('daily', 3, 'easy')).toBe('daily-4');
    expect(variantOf('practice', 3, 'easy')).toBe('practice-3');
    expect(variantOf('practice', 4, 'strong')).toBe('practice-4');
    expect(variantOf('cpu', 4, 'strong')).toBe('cpu-strong');
    expect(variantOf('cpu', 4, 'easy')).toBe('cpu-easy');
  });
});
