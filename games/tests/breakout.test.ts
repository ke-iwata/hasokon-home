import { describe, expect, it } from 'vitest';
import {
  buildBricks,
  hitsBrick,
  initialState,
  launch,
  nextStage,
  PADDLE_Y,
  step,
  type BreakoutState,
} from '@/lib/breakout';

const rng = () => 0.5; // 決定的にする（打ち出し角は真上になる）

const playing = (): BreakoutState => launch(initialState(rng));

describe('initialState / buildBricks', () => {
  it('5行10列のブロックで始まる', () => {
    const s = initialState(rng);
    expect(s.bricks).toHaveLength(50);
    expect(s.lives).toBe(3);
    expect(s.status).toBe('ready');
  });

  it('ブロックは重ならず、0〜1の範囲に収まる', () => {
    for (const b of buildBricks(1)) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(1);
      expect(b.y).toBeGreaterThan(0);
      expect(b.y + b.height).toBeLessThan(0.5);
    }
  });

  it('2面目は上2行が固いブロックになる', () => {
    const bricks = buildBricks(2);
    expect(bricks.filter((b) => b.hp === 2)).toHaveLength(20);
    expect(buildBricks(1).every((b) => b.hp === 1)).toBe(true);
  });
});

describe('step: 壁の反射', () => {
  it('左の壁で跳ね返る', () => {
    let s = playing();
    s = { ...s, ball: { ...s.ball, x: 0.01, y: 0.7, vx: -0.5, vy: 0.01 } };
    const next = step(s, 1 / 60, 0.5, rng);
    expect(next.ball.vx).toBeGreaterThan(0);
  });

  it('天井で跳ね返る', () => {
    let s = playing();
    // ブロックのない高さから天井に向かって直進させ、複数フレーム進める
    s = { ...s, bricks: [], ball: { ...s.ball, x: 0.5, y: 0.02, vx: 0, vy: -0.5 } };
    const next = step(s, 1 / 60, 0.5, rng);
    expect(next.ball.vy).toBeGreaterThan(0);
  });

  it('dt が大きくても突き抜けない（上限がかかる）', () => {
    let s = playing();
    s = { ...s, bricks: [], ball: { ...s.ball, x: 0.5, y: 0.5, vx: 0, vy: -1 } };
    const next = step(s, 5, 0.5, rng); // タブ復帰などで5秒経ったことにする
    // 1/30秒ぶんしか動かないので、まだ盤面の中にいる
    expect(next.ball.y).toBeGreaterThan(0.4);
  });
});

describe('step: パドル', () => {
  it('パドルに当たると上向きに反射する', () => {
    let s = playing();
    s = {
      ...s,
      bricks: [],
      ball: { ...s.ball, x: 0.5, y: PADDLE_Y - 0.005, vx: 0, vy: 0.5 },
    };
    const next = step(s, 1 / 60, 0.5, rng);
    expect(next.ball.vy).toBeLessThan(0);
  });

  it('端に当たるほど横に飛ぶ（中央なら真上）', () => {
    const hit = (ballX: number, paddleX: number) => {
      let s = playing();
      s = {
        ...s,
        bricks: [],
        ball: { ...s.ball, x: ballX, y: PADDLE_Y - 0.005, vx: 0, vy: 0.5 },
      };
      return step(s, 1 / 60, paddleX, rng).ball;
    };
    expect(Math.abs(hit(0.5, 0.5).vx)).toBeLessThan(0.01); // 中央 → ほぼ真上
    expect(hit(0.58, 0.5).vx).toBeGreaterThan(0.1); // 右端 → 右へ
    expect(hit(0.42, 0.5).vx).toBeLessThan(-0.1); // 左端 → 左へ
  });

  it('速さは反射で変わらない', () => {
    let s = playing();
    s = {
      ...s,
      bricks: [],
      ball: { ...s.ball, x: 0.55, y: PADDLE_Y - 0.005, vx: 0.1, vy: 0.5 },
    };
    const before = Math.hypot(0.1, 0.5);
    const b = step(s, 1 / 60, 0.5, rng).ball;
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(before, 5);
  });

  it('パドルは画面外に出ない', () => {
    const s = playing();
    expect(step(s, 1 / 60, -1, rng).paddleX).toBeCloseTo(s.paddleWidth / 2, 5);
    expect(step(s, 1 / 60, 2, rng).paddleX).toBeCloseTo(1 - s.paddleWidth / 2, 5);
  });
});

describe('step: ブロック', () => {
  it('当たるとhpが減り、得点が入り、反射する', () => {
    let s = playing();
    const target = s.bricks[45]; // 最下行（row4）のブロック
    s = {
      ...s,
      ball: {
        ...s.ball,
        x: target.x + target.width / 2,
        y: target.y + target.height + 0.02,
        vx: 0,
        vy: -0.5,
      },
    };
    const next = step(s, 1 / 60, 0.5, rng);
    expect(next.bricks[45].hp).toBe(0);
    expect(next.score).toBe(10); // 最下行は10点
    expect(next.ball.vy).toBeGreaterThan(0); // 下向きに反射
  });

  it('1フレームで消えるのは1個まで', () => {
    let s = playing();
    // 隣接する2ブロックの間を狙っても、先に見つかった1つだけが消える
    const a = s.bricks[0];
    s = {
      ...s,
      ball: { ...s.ball, x: a.x + a.width + 0.003, y: a.y + a.height / 2, vx: -0.3, vy: 0 },
    };
    const next = step(s, 1 / 60, 0.5, rng);
    const destroyed = next.bricks.filter((b) => b.hp === 0).length;
    expect(destroyed).toBeLessThanOrEqual(1);
  });

  it('全部消すとクリアになる', () => {
    let s = playing();
    const last = s.bricks[0];
    s = {
      ...s,
      bricks: s.bricks.map((b, i) => (i === 0 ? b : { ...b, hp: 0 })),
      ball: {
        ...s.ball,
        x: last.x + last.width / 2,
        y: last.y + last.height + 0.02,
        vx: 0,
        vy: -0.5,
      },
    };
    expect(step(s, 1 / 60, 0.5, rng).status).toBe('cleared');
  });
});

describe('step: 落下とゲームオーバー', () => {
  it('落とすと残機が減って ready に戻る', () => {
    let s = playing();
    s = { ...s, ball: { ...s.ball, x: 0.5, y: 1.05, vx: 0, vy: 0.5 } };
    const next = step(s, 1 / 60, 0.5, rng);
    expect(next.lives).toBe(2);
    expect(next.status).toBe('ready');
    expect(next.score).toBe(s.score); // 得点は保持
  });

  it('残機0でゲームオーバー', () => {
    let s = playing();
    s = { ...s, lives: 1, ball: { ...s.ball, x: 0.5, y: 1.05, vx: 0, vy: 0.5 } };
    expect(step(s, 1 / 60, 0.5, rng).status).toBe('gameover');
  });
});

describe('launch / nextStage', () => {
  it('ready からだけ打ち出せる', () => {
    const s = initialState(rng);
    expect(launch(s).status).toBe('playing');
    expect(launch(launch(s))).toEqual(launch(s)); // playing のまま
  });

  it('次の面ではブロックが復活し、球が速くなる', () => {
    let s = playing();
    s = { ...s, status: 'cleared' as const };
    const next = nextStage(s, rng);
    expect(next.stage).toBe(2);
    expect(next.bricks.filter((b) => b.hp > 0)).toHaveLength(50);
    const oldSpeed = Math.hypot(s.ball.vx, s.ball.vy);
    const newSpeed = Math.hypot(next.ball.vx, next.ball.vy);
    expect(newSpeed).toBeGreaterThan(oldSpeed);
  });
});

describe('hitsBrick', () => {
  const brick = { x: 0.4, y: 0.4, width: 0.1, height: 0.05, hp: 1, row: 0 };

  it('中に入っていれば当たり', () => {
    expect(hitsBrick({ x: 0.45, y: 0.42, vx: 0, vy: 0, radius: 0.015 }, brick)).toBe(true);
  });

  it('離れていれば外れ', () => {
    expect(hitsBrick({ x: 0.2, y: 0.2, vx: 0, vy: 0, radius: 0.015 }, brick)).toBe(false);
  });

  it('角にも半径ぶんの余裕で当たる', () => {
    expect(hitsBrick({ x: 0.39, y: 0.39, vx: 0, vy: 0, radius: 0.02 }, brick)).toBe(true);
    expect(hitsBrick({ x: 0.37, y: 0.37, vx: 0, vy: 0, radius: 0.02 }, brick)).toBe(false);
  });
});
