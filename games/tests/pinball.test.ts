import { describe, expect, it } from 'vitest';
import {
  BALL_R,
  buildLanes,
  buildSaucer,
  buildTargets,
  contactSegment,
  flipperTip,
  initialState,
  LANE_X,
  step,
  TABLE_H,
  WALLS,
  type PinballInput,
  type PinballState,
} from '@/lib/pinball';

const IDLE: PinballInput = { left: false, right: false, plunger: false };
const PULL: PinballInput = { ...IDLE, plunger: true };
const FRAME = 1 / 60;

/** n フレーム進める（入力は据え置き） */
function run(state: PinballState, frames: number, input: PinballInput = IDLE): PinballState {
  let s = state;
  for (let i = 0; i < frames; i += 1) s = step(s, FRAME, input);
  return s;
}

/** プランジャーを sec 秒引いてから離す（＝打ち出す）。
    引く時間が0でも1フレームは押す（0フレームだと溜まらず打ち出せない） */
function launch(state: PinballState, sec = 0.5): PinballState {
  return step(run(state, Math.max(1, Math.round(sec * 60)), PULL), FRAME, IDLE);
}

describe('スピナー（レーンの回転板）', () => {
  it('打ち出すと回り、回った分だけ点が入る', () => {
    const shot = launch(initialState(), 0.5);
    // 打ち出した球はレーンを上ってスピナーの線をまたぐ
    const s = run(shot, 30);
    expect(s.spinner.spin).toBeGreaterThan(0);
    expect(s.score).toBeGreaterThan(0);
  });

  it('**強く打つほど長く回って点が伸びる。**これが打ち出しの手応えになる', () => {
    const weak = run(launch(initialState(), 0), 90).score;
    const strong = run(launch(initialState(), 1), 90).score;
    expect(strong).toBeGreaterThan(weak);
  });

  it('勢いは尽きる（回りっぱなしで点が入り続けない）', () => {
    const s = run(launch(initialState(), 1), 60 * 8);
    expect(s.spinner.spin).toBeLessThan(0.5);
  });
});

describe('天井のレーン', () => {
  /** レーンの真上に球を置いて、通り抜けさせる */
  function pass(state: PinballState, index: number): PinballState {
    const lane = state.lanes[index];
    return step(
      { ...state, ball: { x: lane.x, y: lane.y - 0.02, vx: 0, vy: 1.2 } },
      FRAME,
      IDLE,
    );
  }

  it('通ると点灯して点が入る', () => {
    const s = pass(launch(initialState()), 0);
    expect(s.lanes[0].lit).toBe(true);
    expect(s.lanes[1].lit).toBe(false);
  });

  it('同じレーンを何度通っても二重に点は入らない', () => {
    const once = pass(launch(initialState()), 0);
    const twice = pass(once, 0);
    expect(twice.score).toBe(once.score);
  });

  it('3つそろうと倍率が上がり、レーンは消灯して次を狙える', () => {
    let s = launch(initialState());
    const before = s.multiplier;
    for (let i = 0; i < 3; i += 1) s = pass(s, i);
    expect(s.multiplier).toBe(before + 1);
    expect(s.lanes.every((l) => !l.lit)).toBe(true);
  });
});

describe('吸い込みホール', () => {
  /** ホールの真上に球を置く */
  function drop(state: PinballState): PinballState {
    const h = state.saucer;
    return step({ ...state, ball: { x: h.x, y: h.y - 0.01, vx: 0, vy: 0.5 } }, FRAME, IDLE);
  }

  it('入ると抱えて、点が入る', () => {
    const s = drop(launch(initialState()));
    expect(s.saucer.hold).toBeGreaterThan(0);
    expect(s.score).toBeGreaterThan(0);
  });

  it('**抱えているあいだ球は落ちない。**重力で抜けていくと待つ意味が無くなる', () => {
    const held = drop(launch(initialState()));
    const later = run(held, 30);
    expect(later.ball.x).toBeCloseTo(held.saucer.x);
    expect(later.ball.y).toBeCloseTo(held.saucer.y);
    expect(later.balls).toBe(held.balls);
  });

  it('しばらくすると上へ撃ち出される', () => {
    let s = drop(launch(initialState()));
    const held = s.saucer.hold;
    // 抱えているあいだは動かない。抱え終わった最初のフレームを見る
    while (s.saucer.hold > 0) s = step(s, FRAME, IDLE);
    expect(held).toBeGreaterThan(0);
    expect(s.ball.vy).toBeLessThan(0);
    expect(s.ball.y).toBeLessThan(buildSaucer().y);
  });

  it('**撃ち出した直後は吸い込まない。**でないと出入りを繰り返して抜け出せない', () => {
    const shot = run(drop(launch(initialState())), 60);
    expect(shot.saucer.cool).toBeGreaterThan(0);
    // 出口に置き直しても、冷却中は捕まらない
    const again = step(
      { ...shot, ball: { x: shot.saucer.x, y: shot.saucer.y, vx: 0, vy: 0 } },
      FRAME,
      IDLE,
    );
    expect(again.saucer.hold).toBe(0);
  });
});

describe('球を落としたとき', () => {
  it('的とレーンは元に戻る（倍率が1に戻るのと同じ扱い）', () => {
    let s = launch(initialState());
    s = step({ ...s, lanes: buildLanes().map((l) => ({ ...l, lit: true })) }, FRAME, IDLE);
    // 台の下へ抜けさせる
    s = step({ ...s, ball: { ...s.ball, x: 0.45, y: TABLE_H + 0.1, vx: 0, vy: 2 } }, FRAME, IDLE);
    expect(s.balls).toBe(2);
    expect(s.multiplier).toBe(1);
    expect(s.lanes.every((l) => !l.lit)).toBe(true);
    expect(s.targets.every((t) => !t.down)).toBe(true);
    expect(s.saucer.hold).toBe(0);
  });
});

describe('初期状態', () => {
  it('球はレーンの底で打ち出しを待つ', () => {
    const s = initialState();
    expect(s.status).toBe('ready');
    expect(s.balls).toBe(3);
    expect(s.score).toBe(0);
    expect(s.multiplier).toBe(1);
    expect(s.ball.x).toBeCloseTo(LANE_X);
    expect(s.ball.vx).toBe(0);
    expect(s.ball.vy).toBe(0);
  });

  it('打ち出す前は重力で落ちない（放っておいても始まらない）', () => {
    const s = run(initialState(), 120);
    expect(s.status).toBe('ready');
    expect(s.ball.y).toBe(initialState().ball.y);
  });
});

describe('プランジャー', () => {
  it('引いているあいだ溜まり、離すと上向きに打ち出す', () => {
    const pulled = run(initialState(), 30, PULL);
    expect(pulled.status).toBe('ready');
    expect(pulled.plunger).toBeGreaterThan(0.4);

    const shot = step(pulled, FRAME, IDLE);
    expect(shot.status).toBe('playing');
    expect(shot.plunger).toBe(0);
    expect(shot.ball.vy).toBeLessThan(0); // 上向き
    expect(shot.hits).toContain('launch');
  });

  it('強く引くほど速く打ち出される', () => {
    const weak = launch(initialState(), 0.05);
    const strong = launch(initialState(), 1.2);
    expect(Math.abs(strong.ball.vy)).toBeGreaterThan(Math.abs(weak.ball.vy));
  });

  it('いちばん弱く打っても盤面の上まで届く（レーンに戻って詰まらない）', () => {
    let s = launch(initialState(), 0);
    let top = s.ball.y;
    for (let i = 0; i < 240; i += 1) {
      s = step(s, FRAME, IDLE);
      top = Math.min(top, s.ball.y);
    }
    // レーンの内側の壁は y=0.34 で終わる。そこより上まで上がれば盤面へ出られる
    expect(top).toBeLessThan(0.34);
  });
});

describe('台の中に収まっている', () => {
  it('長く遊んでも球が壁を突き抜けない', () => {
    let s = launch(initialState(), 0.6);
    for (let i = 0; i < 900; i += 1) {
      s = step(s, FRAME, i % 40 < 4 ? { left: true, right: true, plunger: false } : IDLE);
      if (s.status === 'ready') s = launch(s, 0.6);
      if (s.status === 'gameover') break;
      expect(s.ball.x).toBeGreaterThan(-0.05);
      expect(s.ball.x).toBeLessThan(1.05);
      expect(s.ball.y).toBeGreaterThan(-0.05);
      expect(s.ball.y).toBeLessThan(TABLE_H + 0.1);
    }
  });

  it('放っておけば球はいずれ落ちて、3球でゲームオーバーになる', () => {
    let s = launch(initialState(), 0.6);
    for (let i = 0; i < 3000 && s.status !== 'gameover'; i += 1) {
      s = step(s, FRAME, IDLE);
      if (s.status === 'ready') s = launch(s, 0.6);
    }
    expect(s.status).toBe('gameover');
    expect(s.balls).toBe(0);
  });

  it('ゲームオーバーのあとは進めても何も起きない', () => {
    let s = launch(initialState(), 0.6);
    for (let i = 0; i < 3000 && s.status !== 'gameover'; i += 1) {
      s = step(s, FRAME, IDLE);
      if (s.status === 'ready') s = launch(s, 0.6);
    }
    const frozen = run(s, 60);
    expect(frozen.score).toBe(s.score);
    expect(frozen.ball).toEqual(s.ball);
  });
});

describe('得点', () => {
  it('バンパーに当たると点が入り、弾き返される', () => {
    const base = initialState();
    const bumper = base.bumpers[1];
    // バンパーの真上から落とす
    const s: PinballState = {
      ...base,
      status: 'playing',
      ball: { x: bumper.x, y: bumper.y - bumper.r - BALL_R - 0.01, vx: 0, vy: 1.2 },
    };
    const next = run(s, 3);
    expect(next.score).toBeGreaterThan(0);
    expect(next.ball.vy).toBeLessThan(0); // 上へ弾かれた
  });

  it('的に当たると倒れて点が入る', () => {
    const base = initialState();
    const t = base.targets[0];
    const s: PinballState = {
      ...base,
      status: 'playing',
      ball: { x: t.x + t.w / 2, y: t.y - BALL_R - 0.01, vx: 0, vy: 1.2 },
    };
    const next = run(s, 3);
    expect(next.targets[0].down).toBe(true);
    expect(next.score).toBeGreaterThanOrEqual(250);
  });

  it('的を全部倒すと倍率が上がって的が戻る', () => {
    const base = initialState();
    // 最後の1枚だけ残した状態から倒す
    const last = base.targets.length - 1;
    const t = base.targets[last];
    const s: PinballState = {
      ...base,
      status: 'playing',
      targets: base.targets.map((x, i) => (i === last ? x : { ...x, down: true })),
      ball: { x: t.x + t.w / 2, y: t.y - BALL_R - 0.01, vx: 0, vy: 1.2 },
    };
    const next = run(s, 3);
    expect(next.multiplier).toBe(2);
    expect(next.targets.every((x) => !x.down)).toBe(true);
    expect(next.score).toBeGreaterThanOrEqual(250 + 1000);
  });

  it('倍率は5で頭打ちになる', () => {
    const base = initialState();
    const last = base.targets.length - 1;
    const t = base.targets[last];
    const s: PinballState = {
      ...base,
      status: 'playing',
      multiplier: 5,
      targets: base.targets.map((x, i) => (i === last ? x : { ...x, down: true })),
      ball: { x: t.x + t.w / 2, y: t.y - BALL_R - 0.01, vx: 0, vy: 1.2 },
    };
    expect(run(s, 3).multiplier).toBe(5);
  });

  it('球を落とすと残機が減り、倍率と的は元に戻る', () => {
    const base = initialState();
    const s: PinballState = {
      ...base,
      status: 'playing',
      multiplier: 4,
      targets: buildTargets().map((t) => ({ ...t, down: true })),
      // フリッパーのあいだ（排水口）を真下に抜けていく球
      ball: { x: 0.45, y: TABLE_H - 0.01, vx: 0, vy: 2 },
    };
    const next = run(s, 3);
    expect(next.balls).toBe(2);
    expect(next.multiplier).toBe(1);
    expect(next.targets.every((t) => !t.down)).toBe(true);
    expect(next.status).toBe('ready');
  });
});

describe('フリッパー', () => {
  it('押すと上がり、離すと元の角度に戻る', () => {
    const start = initialState();
    const up = run(start, 20, { left: true, right: true, plunger: false });
    expect(up.flippers[0].angle).toBeCloseTo(up.flippers[0].upAngle, 3);
    expect(up.flippers[1].angle).toBeCloseTo(up.flippers[1].upAngle, 3);

    const back = run(up, 20);
    expect(back.flippers[0].angle).toBeCloseTo(back.flippers[0].restAngle, 3);
    expect(back.flippers[1].angle).toBeCloseTo(back.flippers[1].restAngle, 3);
  });

  it('振り上げると球を上へ打ち返す（落ちてくるより速く返る）', () => {
    const base = initialState();
    const f = base.flippers[0];
    const tip = flipperTip(f);
    // 左フリッパーの先寄りに、ゆっくり落ちてくる球を置く
    const s: PinballState = {
      ...base,
      status: 'playing',
      ball: { x: (f.pivotX + tip.x) / 2, y: (f.pivotY + tip.y) / 2 - 0.04, vx: 0, vy: 0.6 },
    };
    const hit = run(s, 6, { left: true, right: false, plunger: false });
    expect(hit.ball.vy).toBeLessThan(-0.6);
  });

  it('押していないフリッパーの上では、球はそこまで飛ばない', () => {
    const base = initialState();
    const f = base.flippers[0];
    const tip = flipperTip(f);
    const s: PinballState = {
      ...base,
      status: 'playing',
      ball: { x: (f.pivotX + tip.x) / 2, y: (f.pivotY + tip.y) / 2 - 0.04, vx: 0, vy: 0.6 },
    };
    const idle = run(s, 6);
    expect(idle.ball.vy).toBeGreaterThan(-0.6);
  });
});

describe('詰まり対策', () => {
  it('ほとんど動かない状態が続くと、自動で横に突かれる', () => {
    const base = initialState();
    // 壁や的の上に乗って止まった状況の代わりに、速度0の球で規則だけを見る
    const s: PinballState = {
      ...base,
      status: 'playing',
      ball: { x: 0.19, y: 0.6, vx: 0, vy: 0 },
      restSec: 1.49,
    };
    const next = run(s, 1);
    expect(Math.abs(next.ball.vx)).toBeGreaterThan(0.1);
    expect(next.restSec).toBe(0);
  });

  it('普通に動いている球は突かれない', () => {
    const base = initialState();
    const s: PinballState = {
      ...base,
      status: 'playing',
      ball: { x: 0.5, y: 0.85, vx: 0, vy: 1 },
      restSec: 1.49,
    };
    expect(run(s, 1).restSec).toBe(0);
    expect(run(s, 1).ball.vx).toBe(0);
  });
});

describe('当たり判定の部品', () => {
  it('線分から遠い球は当たらない', () => {
    expect(contactSegment({ x: 0.5, y: 0.5, vx: 0, vy: 0 }, 0, 0, 1, 0, 0.01)).toBeNull();
  });

  it('線分に重なった球は、球がいる側へ押し出す法線を返す', () => {
    // yは下向きが正。線分より上（y<0）にいる球は上へ、下にいる球は下へ押し出す
    const above = contactSegment({ x: 0.5, y: -0.02, vx: 0, vy: 0 }, 0, 0, 1, 0, 0.01);
    expect(above).not.toBeNull();
    expect((above as { ny: number }).ny).toBeLessThan(0);

    const below = contactSegment({ x: 0.5, y: 0.02, vx: 0, vy: 0 }, 0, 0, 1, 0, 0.01);
    expect((below as { ny: number }).ny).toBeGreaterThan(0);
  });

  it('線分の端より外の球は、端との距離で見る', () => {
    // 線分は x=0..0.5。その右外の球は端点 (0.5, 0) との距離で判定される
    expect(contactSegment({ x: 0.9, y: 0, vx: 0, vy: 0 }, 0, 0, 0.5, 0, 0.01)).toBeNull();
    expect(contactSegment({ x: 0.52, y: 0, vx: 0, vy: 0 }, 0, 0, 0.5, 0, 0.01)).not.toBeNull();
  });
});

describe('台の形', () => {
  it('壁はすべて台の中に収まっている', () => {
    for (const w of WALLS) {
      for (const [x, y] of [
        [w.x1, w.y1],
        [w.x2, w.y2],
      ]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(TABLE_H);
      }
    }
  });

  it('フリッパーの先端のあいだには、球1つぶんより広い隙間がある（落ちる余地）', () => {
    const [left, right] = initialState().flippers;
    const gap = flipperTip(right).x - flipperTip(left).x;
    expect(gap).toBeGreaterThan(BALL_R * 2);
  });
});

describe('遊びとして成立している', () => {
  /**
   * 球1つぶんの寿命（秒）。**打ち出しの強さを9通り試して平均を見る。**
   *
   * 物理は初期値のわずかな違いで結果が大きく振れるので、1回だけ測ると
   * 「たまたま長かった/短かった」を掴んで、意味のない数字で見張ることになる
   * （実際、同じ台で1回測りだと連打5.1秒、9回の平均だと15.0秒だった）。
   * 打ち直し（弱い打ち出しでレーンに戻る）は球を失っていないので、自動で打ち直す。
   */
  const PULLS = [0, 0.12, 0.25, 0.37, 0.5, 0.62, 0.75, 0.87, 1];
  const CAP = 60 * 150;

  function life(pull: number, pick: (s: PinballState, f: number) => { left: boolean; right: boolean }) {
    let s = initialState();
    const start = s.balls;
    let frames = 0;
    let pulling = Math.max(1, Math.round(pull * 60));
    while (s.balls === start && frames < CAP) {
      const ready = s.status === 'ready';
      s = step(s, FRAME, { ...pick(s, frames), plunger: ready && pulling-- > 0 });
      if (!ready) pulling = Math.max(1, Math.round(pull * 60));
      frames += 1;
    }
    return frames / 60;
  }

  const lives = (pick: (s: PinballState, f: number) => { left: boolean; right: boolean }) =>
    PULLS.map((p) => life(p, pick));
  const mean = (xs: number[]) => xs.reduce((a, c) => a + c, 0) / xs.length;

  const idle = () => ({ left: false, right: false });
  /** 球が下りてきたときだけ近い側を振る＝ちゃんと狙って打つ人 */
  const aimed = (s: PinballState) => {
    const near = s.ball.y > 1.18 && s.ball.vy > 0;
    return { left: near && s.ball.x < 0.45, right: near && s.ball.x >= 0.45 };
  };
  /** 何も見ずに両方を連打する人 */
  const mash = (_s: PinballState, f: number) => {
    const on = Math.floor(f / 12) % 2 === 0;
    return { left: on, right: on };
  };

  it('放っておけば球は必ず落ちる（どこにも挟まらない）', () => {
    const xs = lives(idle);
    expect(mean(xs)).toBeLessThan(8);
    // **1つでも落ちない打ち出しがあってはいけない。** 楔になる隙間があると、
    // 球がそこで止まって遊びが終わらなくなる（実測で55秒動かなかったことがある）
    expect(Math.max(...xs)).toBeLessThan(15);
  });

  it('**両方を連打しても、いつかは落ちる。**' +
    ' フリッパーの先端の隙間が狭すぎると、連打で永久に落ちなくなって遊びが成立しない', () => {
    expect(Math.max(...lives(mash))).toBeLessThan(60);
  });

  it('**狙って振るほうが連打よりはっきり良い。**これが崩れると腕前の意味が無くなる', () => {
    expect(mean(lives(aimed))).toBeGreaterThan(mean(lives(mash)) * 2);
  });
});
