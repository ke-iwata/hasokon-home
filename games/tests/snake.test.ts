import { describe, expect, it } from 'vitest';
import {
  BASE_INTERVAL_MS,
  BOARD_SIZE,
  INITIAL_LENGTH,
  MIN_INTERVAL_MS,
  inBoard,
  initialState,
  intervalFor,
  nextCell,
  opposite,
  placeFood,
  sameCell,
  start,
  step,
  togglePause,
  turn,
  type Cell,
  type SnakeState,
} from '@/lib/snake';

/** 決定的にする（空きマスの一覧の真ん中を選ぶ） */
const rng = () => 0.5;
/** 空きマスの先頭（＝盤の左上に近いほう）を選ぶ乱数 */
const firstFree = () => 0;

/** 動いている状態を作る */
const playing = (): SnakeState => start(initialState(rng));

/**
 * 体と餌を好きな位置に置いた状態を作る。
 * 進行や当たり判定は「この配置ならこうなる」で確かめたいので、
 * initialState の中央配置に引きずられないようにする。
 */
function board(body: Cell[], dir: SnakeState['dir'], food: Cell | null, size = 9): SnakeState {
  return { size, body, dir, queued: [], food, score: 0, status: 'playing' };
}

describe('initialState', () => {
  it('中央から右向きに長さ3で始まり、スタート待ちになる', () => {
    const s = initialState(rng);
    expect(s.size).toBe(BOARD_SIZE);
    expect(s.body).toHaveLength(INITIAL_LENGTH);
    expect(s.dir).toBe('right');
    expect(s.status).toBe('ready');
    expect(s.score).toBe(0);
    const center = Math.floor(BOARD_SIZE / 2);
    expect(s.body[0]).toEqual({ x: center, y: center });
    // 体は頭の左に続く（右向きなので後ろが左）
    expect(s.body[1]).toEqual({ x: center - 1, y: center });
  });

  it('餌は体の上に置かれず、盤の中にある', () => {
    for (const seed of [0, 0.25, 0.5, 0.99]) {
      const s = initialState(() => seed);
      expect(s.food).not.toBeNull();
      expect(inBoard(s.food as Cell, s.size)).toBe(true);
      expect(s.body.some((c) => sameCell(c, s.food as Cell))).toBe(false);
    }
  });

  it('スタート待ちのあいだは step で動かない', () => {
    const s = initialState(rng);
    expect(step(s, rng)).toEqual(s);
    expect(start(s).status).toBe('playing');
  });
});

describe('placeFood', () => {
  it('空きマスからしか選ばない', () => {
    const body: Cell[] = [];
    for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) body.push({ x, y });
    // 3×3のうち (2,2) だけ空けておく
    const open = body.pop() as Cell;
    for (const seed of [0, 0.3, 0.7, 0.999]) {
      expect(placeFood(3, body, () => seed)).toEqual(open);
    }
  });

  it('空きが無ければ null（盤面を埋め尽くしたとき）', () => {
    const body: Cell[] = [];
    for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) body.push({ x, y });
    expect(placeFood(3, body, rng)).toBeNull();
  });

  it('乱数が1.0を返しても盤の外を指さない', () => {
    const food = placeFood(3, [], () => 1);
    expect(food).not.toBeNull();
    expect(inBoard(food as Cell, 3)).toBe(true);
  });
});

describe('step: 前進と成長', () => {
  it('1回で1マスだけ進み、長さは変わらない', () => {
    const s = board([{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }], 'right', { x: 8, y: 8 });
    const next = step(s, rng);
    expect(next.body[0]).toEqual({ x: 5, y: 4 });
    expect(next.body).toHaveLength(3);
    // 尾が1マス詰める
    expect(next.body[2]).toEqual({ x: 3, y: 4 });
    expect(next.score).toBe(0);
  });

  it('餌を食べると1節伸びてスコアが1増える', () => {
    const s = board([{ x: 4, y: 4 }, { x: 3, y: 4 }], 'right', { x: 5, y: 4 });
    const next = step(s, firstFree);
    expect(next.body).toHaveLength(3);
    expect(next.body[0]).toEqual({ x: 5, y: 4 });
    expect(next.score).toBe(1);
    // 次の餌が置き直され、体の上には無い
    expect(next.food).not.toBeNull();
    expect(next.body.some((c) => sameCell(c, next.food as Cell))).toBe(false);
    expect(next.status).toBe('playing');
  });

  it('伸びるのは食べた1回だけ（次の前進では尾が詰まる）', () => {
    const s = board([{ x: 4, y: 4 }, { x: 3, y: 4 }], 'right', { x: 5, y: 4 });
    const after = step(step(s, firstFree), firstFree);
    expect(after.body).toHaveLength(3);
  });
});

describe('step: 当たり判定', () => {
  it('壁に当たったらゲームオーバー（すり抜けない）', () => {
    const s = board([{ x: 8, y: 4 }, { x: 7, y: 4 }], 'right', { x: 0, y: 0 });
    const next = step(s, rng);
    expect(next.status).toBe('gameover');
    // 頭は盤の中に残したまま（描画が盤の外に出ないように）
    expect(next.body[0]).toEqual({ x: 8, y: 4 });
  });

  it('上の壁でもゲームオーバー', () => {
    const s = board([{ x: 4, y: 0 }, { x: 4, y: 1 }], 'up', { x: 8, y: 8 });
    expect(step(s, rng).status).toBe('gameover');
  });

  it('自分の体に当たったらゲームオーバー', () => {
    // 頭が下を向いていて、真下が自分の体
    const s = board(
      [
        { x: 4, y: 4 },
        { x: 3, y: 4 },
        { x: 3, y: 5 },
        { x: 4, y: 5 },
        { x: 5, y: 5 },
      ],
      'down',
      { x: 0, y: 0 },
    );
    expect(step(s, rng).status).toBe('gameover');
  });

  it('伸びない前進なら、尾のあったマスには進める', () => {
    // 4マスの輪。頭が尾のマスへ進むが、同じ瞬間に尾は空く
    const s = board(
      [
        { x: 4, y: 4 },
        { x: 5, y: 4 },
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ],
      'down',
      { x: 0, y: 0 },
    );
    const next = step(s, rng);
    expect(next.status).toBe('playing');
    expect(next.body[0]).toEqual({ x: 4, y: 5 });
  });

  it('餌を食べて伸びる先が尾のマスなら当たりになる（尾が残るため）', () => {
    const s = board(
      [
        { x: 4, y: 4 },
        { x: 5, y: 4 },
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ],
      'down',
      { x: 4, y: 5 },
    );
    expect(step(s, rng).status).toBe('gameover');
  });

  it('盤面を埋め尽くしたら cleared になる', () => {
    // 2×2の盤を3マスのヘビが占め、残る1マスに餌がある
    const s = board([{ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }], 'down', { x: 1, y: 1 }, 2);
    const next = step(s, rng);
    expect(next.status).toBe('cleared');
    expect(next.body).toHaveLength(4);
    expect(next.food).toBeNull();
    expect(next.score).toBe(1);
  });

  it('ゲームオーバーのあとは step でも動かない', () => {
    const s = board([{ x: 8, y: 4 }, { x: 7, y: 4 }], 'right', { x: 0, y: 0 });
    const over = step(s, rng);
    expect(step(over, rng)).toEqual(over);
  });
});

describe('turn: 方向転換', () => {
  it('直交する向きは受け付ける', () => {
    const s = turn(playing(), 'up');
    expect(s.queued).toEqual(['up']);
    expect(step(s, rng).dir).toBe('up');
  });

  it('逆方向への転換は無効（自分の首に刺さらないように）', () => {
    const s = playing(); // 右向き
    expect(turn(s, 'left').queued).toEqual([]);
    expect(step(turn(s, 'left'), rng).dir).toBe('right');
  });

  it('同じ向きの連打は積まない', () => {
    expect(turn(playing(), 'right').queued).toEqual([]);
  });

  it('積めるのは2つまで', () => {
    const s = turn(turn(turn(playing(), 'up'), 'left'), 'down');
    expect(s.queued).toEqual(['up', 'left']);
  });

  it('待ち行列の最後を基準に判定する（曲がってすぐ折り返せる）', () => {
    // 右向き → 上 → 左。「左」は今の向き（右）の逆だが、上を向いた後なら曲がれる
    const s = turn(turn(playing(), 'up'), 'left');
    expect(s.queued).toEqual(['up', 'left']);
    const first = step(s, rng);
    expect(first.dir).toBe('up');
    expect(step(first, rng).dir).toBe('left');
  });

  it('待ち行列の最後の逆方向は弾く', () => {
    const s = turn(turn(playing(), 'up'), 'down');
    expect(s.queued).toEqual(['up']);
  });

  it('1回の step で消費するのは1つだけ', () => {
    const s = turn(turn(playing(), 'up'), 'left');
    expect(step(s, rng).queued).toEqual(['left']);
  });

  it('ゲームオーバー後の入力は受け付けない', () => {
    const over = { ...playing(), status: 'gameover' as const };
    expect(turn(over, 'up')).toEqual(over);
  });
});

describe('一時停止', () => {
  it('止めているあいだは進まない', () => {
    const paused = togglePause(playing());
    expect(paused.status).toBe('paused');
    expect(step(paused, rng)).toEqual(paused);
  });

  it('もう一度呼ぶと再開する', () => {
    expect(togglePause(togglePause(playing())).status).toBe('playing');
  });

  it('スタート待ち・ゲームオーバーでは何も起きない', () => {
    const ready = initialState(rng);
    expect(togglePause(ready)).toEqual(ready);
    const over = { ...ready, status: 'gameover' as const };
    expect(togglePause(over)).toEqual(over);
  });
});

describe('加速', () => {
  it('スコア5ごとに少しずつ速くなる', () => {
    expect(intervalFor(0)).toBe(BASE_INTERVAL_MS);
    expect(intervalFor(4)).toBe(BASE_INTERVAL_MS);
    expect(intervalFor(5)).toBeLessThan(BASE_INTERVAL_MS);
    expect(intervalFor(10)).toBeLessThan(intervalFor(5));
  });

  it('速さには上限がある（際限なく速くならない）', () => {
    expect(intervalFor(1000)).toBe(MIN_INTERVAL_MS);
    for (let score = 0; score <= 300; score += 1) {
      expect(intervalFor(score)).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
      expect(intervalFor(score)).toBeLessThanOrEqual(BASE_INTERVAL_MS);
    }
  });

  it('スコアが増えても遅くはならない（単調）', () => {
    for (let score = 1; score <= 200; score += 1) {
      expect(intervalFor(score)).toBeLessThanOrEqual(intervalFor(score - 1));
    }
  });
});

describe('補助関数', () => {
  it('opposite は反対向きを返す', () => {
    expect(opposite('up')).toBe('down');
    expect(opposite('down')).toBe('up');
    expect(opposite('left')).toBe('right');
    expect(opposite('right')).toBe('left');
  });

  it('nextCell は向きどおりに1マス動く', () => {
    const c = { x: 3, y: 3 };
    expect(nextCell(c, 'up')).toEqual({ x: 3, y: 2 });
    expect(nextCell(c, 'down')).toEqual({ x: 3, y: 4 });
    expect(nextCell(c, 'left')).toEqual({ x: 2, y: 3 });
    expect(nextCell(c, 'right')).toEqual({ x: 4, y: 3 });
  });

  it('inBoard は盤の外を弾く', () => {
    expect(inBoard({ x: 0, y: 0 }, 5)).toBe(true);
    expect(inBoard({ x: 4, y: 4 }, 5)).toBe(true);
    expect(inBoard({ x: -1, y: 0 }, 5)).toBe(false);
    expect(inBoard({ x: 5, y: 0 }, 5)).toBe(false);
    expect(inBoard({ x: 0, y: 5 }, 5)).toBe(false);
  });
});

describe('通しの進行', () => {
  it('体は必ずつながっていて、重ならない', () => {
    let s = playing();
    // 適当に曲がりながら200歩進める（壁に当たったら作り直す）
    let dirIndex = 0;
    const dirs = ['up', 'right', 'down', 'right'] as const;
    for (let i = 0; i < 200; i += 1) {
      if (s.status !== 'playing') {
        s = playing();
        continue;
      }
      if (i % 5 === 0) {
        s = turn(s, dirs[dirIndex % dirs.length]);
        dirIndex += 1;
      }
      s = step(s, rng);
      for (let j = 1; j < s.body.length; j += 1) {
        const d =
          Math.abs(s.body[j].x - s.body[j - 1].x) + Math.abs(s.body[j].y - s.body[j - 1].y);
        expect(d).toBe(1);
      }
      const keys = new Set(s.body.map((c) => `${c.x},${c.y}`));
      expect(keys.size).toBe(s.body.length);
      for (const cell of s.body) expect(inBoard(cell, s.size)).toBe(true);
    }
  });

  it('長さは「最初の長さ＋スコア」と必ず一致する', () => {
    let s = playing();
    for (let i = 0; i < 60; i += 1) {
      if (s.status !== 'playing') break;
      s = step(s, rng);
      expect(s.body.length).toBe(INITIAL_LENGTH + s.score);
    }
  });
});
