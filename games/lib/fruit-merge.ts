/**
 * フルーツ合体パズルの物理・進行ロジック
 *
 * 仕様: docs/features/game-fruit-merge.md
 *
 * 描画（canvas）から切り離した純関数のステート機械。ピンボール
 * （`lib/pinball.ts`）と同じ作りで、UI側は毎フレーム `step()` を呼んで
 * 返ってきた状態を描くだけにする。こうしておくと「積み上がりの安定」
 * （震え・すり抜け）と合体・連鎖・ゲームオーバー判定をテストできる。
 *
 * 座標系は**幅1×高さ1.5**の正規化空間。原点は箱の左上、yは下向きに正。
 * ピンボールと同じく、縦横比を座標に持たせないと重力が縦横で違う強さになる。
 * 描画側は canvas の縦横比を 2:3 に固定して、この座標をそのまま拡大する。
 *
 * **名称・意匠の注意**（仕様書の冒頭と同じ）。落として同じものを合体させる
 * メカニクス自体はアイデアであって権利の対象ではないが、同系の商品名
 * （スイカゲーム＝Aladdin X 社の商標）と、その顔つきの果物の意匠は使わない。
 * ここで並べている果物は自前で選んだ11種で、最大もスイカにしていない。
 */

/** 箱の内寸。幅1×高さ1.5（＝2:3の縦長） */
export const BOX_W = 1;
export const BOX_H = 1.5;

/**
 * ゲームオーバーライン。**箱の上端そのものではなく少し下**に置く。
 * 上端と同じにすると、落とした果物が跳ねて一瞬顔を出しただけで
 * 警告が出て、突然死の理不尽さが残る。
 */
export const LINE_Y = 0.26;

/** 持っている果物が浮かぶ高さ（ラインより上＝この果物は判定に入らない） */
export const DROP_Y = 0.1;

/** ラインを超え続けて何秒で終わりにするか。短いと理不尽、長いと締まらない */
export const OVER_LIMIT = 2;

/** 連続で落とせない間隔（秒）。連打で果物が重なって生まれるのを防ぐ */
export const DROP_INTERVAL = 0.32;

/** 合体してから次の合体までを「連鎖」とみなす時間（秒） */
export const CHAIN_WINDOW = 0.8;

/** 連鎖の倍率の上限 */
export const CHAIN_MAX = 5;

/** 落ちてくる果物の段（0が最小）。予告に出るのは小さい方の5段階だけ */
export const DROPPABLE_TIERS = 5;

/** 最大同士を合体させたときのボーナス（2つとも消える） */
export const CLEAR_BONUS = 100;

/**
 * 果物の見た目。**canvas から参照するのでロジック側に置いてある**
 * （段ごとの大きさは物理そのもので、UIの都合ではない）。
 *
 * 絵柄は「丸い実＋へた・葉」だけのフラットな自作で、
 * 特定の商品の顔つきのデフォルメは真似ていない。
 */
export interface FruitDef {
  /** 表示名（遊び方・FAQで使う） */
  name: string;
  /** 半径（正規化座標） */
  r: number;
  /** 実の色（明るい側） */
  light: string;
  /** 実の色（暗い側。陰を付けて平面の丸から脱する） */
  dark: string;
  /** へた・葉の色 */
  stem: string;
  /** 飾りの描き分け。canvas 側で使う */
  deco: 'leaf' | 'stem' | 'dots' | 'net' | 'crown';
}

/**
 * 11段階の果物。**大きさの比は約1.185倍ずつ**にしてある。
 * 面積を保つ比（√2＝1.41倍）にすると3段目で箱を埋めてしまうので、
 * 同系の作法どおり緩やかに大きくする。
 */
export const FRUITS: FruitDef[] = [
  { name: 'さくらんぼ', r: 0.034, light: '#f87171', dark: '#b91c1c', stem: '#4d7c0f', deco: 'stem' },
  { name: 'いちご', r: 0.041, light: '#fb7185', dark: '#be123c', stem: '#4d7c0f', deco: 'dots' },
  { name: 'ぶどう', r: 0.049, light: '#a78bfa', dark: '#6d28d9', stem: '#4d7c0f', deco: 'dots' },
  { name: 'みかん', r: 0.058, light: '#fdba74', dark: '#ea580c', stem: '#4d7c0f', deco: 'leaf' },
  // みかんの次なので**濃い朱色にして、飾りもへただけにする**。
  // どちらも橙のままだと、隣り合う段が大きさでしか見分けられない
  { name: 'かき', r: 0.069, light: '#f97316', dark: '#7c2d12', stem: '#65a30d', deco: 'stem' },
  { name: 'りんご', r: 0.082, light: '#f472b6', dark: '#be123c', stem: '#65a30d', deco: 'leaf' },
  { name: 'なし', r: 0.097, light: '#fde68a', dark: '#a16207', stem: '#65a30d', deco: 'dots' },
  { name: 'もも', r: 0.115, light: '#fbcfe8', dark: '#db2777', stem: '#65a30d', deco: 'leaf' },
  { name: 'グレープフルーツ', r: 0.136, light: '#fef08a', dark: '#a16207', stem: '#4d7c0f', deco: 'stem' },
  { name: 'メロン', r: 0.16, light: '#bbf7d0', dark: '#15803d', stem: '#4d7c0f', deco: 'net' },
  // いちばん大きい段。グレープフルーツと同じ黄にしないよう、こちらは濃い山吹に振る
  { name: 'パイナップル', r: 0.188, light: '#fbbf24', dark: '#92400e', stem: '#15803d', deco: 'crown' },
];

/** 最大の段（これ同士は合体して消える） */
export const MAX_TIER = FRUITS.length - 1;

export function radiusOf(tier: number): number {
  return FRUITS[Math.max(0, Math.min(MAX_TIER, tier))].r;
}

/**
 * 合体したときの素点。**できあがった段**で決まる（1,3,6,10,…,55）。
 * 大きいものを作るほど跳ね上がるので、消化より育成が得になる
 */
export function mergePoints(tier: number): number {
  return (tier * (tier + 1)) / 2;
}

export interface Fruit {
  id: number;
  /** 0〜10。同じ段どうしが触れると1段上になる */
  tier: number;
  x: number;
  y: number;
  /** 1秒あたりの移動量 */
  vx: number;
  vy: number;
  /**
   * 一度でもゲームオーバーラインより下に入ったか。
   *
   * **落とした直後の果物を判定に入れないための目印。** 落とす位置は
   * ラインより上なので、`age`（経過時間）で外すと落ち方によって
   * 判定がぶれる。「線をくぐったか」で見れば落ち方に依存しない
   */
  landed: boolean;
}

/** このフレームで起きた合体。**UIの演出用で、状態の判断には使わない** */
export interface MergeEvent {
  x: number;
  y: number;
  /** できあがった段。最大同士を消したときは -1 */
  tier: number;
  /** 入った点（連鎖の倍率を掛けたあと） */
  gain: number;
  /** 何連鎖目か */
  chain: number;
}

export interface FruitMergeState {
  fruits: Fruit[];
  /** いま持っている段（次に落とすもの） */
  hold: number;
  /** 予告に出す段（`hold` の次） */
  next: number;
  /** 落とす横位置（果物の中心。壁ぎわは自動で内側に寄る） */
  aim: number;
  score: number;
  status: 'playing' | 'gameover';
  /** 連鎖の段数（0で連鎖していない） */
  chain: number;
  /** 連鎖の残り時間（秒） */
  chainSec: number;
  /** ラインを超え続けている秒数。`0` なら超えていない */
  overSec: number;
  /** 次に落とせるまでの残り秒 */
  dropCool: number;
  /** 最大同士を消した回数 */
  cleared: number;
  /** 合体の総数（コツの案内に使う） */
  merges: number;
  /** このフレームの合体。演出用（`hits` と同じ扱い） */
  events: MergeEvent[];
  /** 乱数の状態。`Math.random()` を使わず静的書き出しと食い違わせない */
  seed: number;
  /** 次に配る `id` */
  nextId: number;
}

/* ------------------------------------------------------------------ *
 * 乱数（シード付き）
 * ------------------------------------------------------------------ */

/**
 * mulberry32。シードを持ち回す純関数にしてあるので、同じ種から同じ盤面が出る。
 * ヨットと同じ作法で、`Math.random()` は使わない
 */
export function nextRandom(seed: number): { seed: number; value: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  t = t | 0;
  return { seed: t, value };
}

/** 落ちてくる果物を1つ引く（小さい方の5段階から） */
function pickTier(seed: number): { seed: number; tier: number } {
  const next = nextRandom(seed);
  return { seed: next.seed, tier: Math.floor(next.value * DROPPABLE_TIERS) % DROPPABLE_TIERS };
}

/* ------------------------------------------------------------------ *
 * 物理の定数
 * ------------------------------------------------------------------ */

/** 重力（1秒²あたり）。箱の高さ1.5をおよそ1.1秒で落ちる強さ */
const GRAVITY = 2.6;
/**
 * 反発係数。**低くしてある。** 高いと積んだ山が跳ね続けて落ち着かず、
 * 「震え（ジッター）が目視で出ない」という公開の条件を満たせない
 */
const RESTITUTION = 0.08;
const WALL_RESTITUTION = 0.05;
/** 接線方向の摩擦。無いと果物が山の上を延々と滑って止まらない */
const FRICTION = 0.3;
/** 空気抵抗（1秒あたりの減衰）。速度の暴走を抑える */
const AIR = 0.08;
/**
 * 速さの上限。これが無いと、上から落ちてきた大きい果物が
 * 1フレームで小さい果物を**すり抜ける**
 */
const MAX_SPEED = 4.5;
/**
 * 許容するめり込み。ここまでは押し戻さない。
 * 0にすると、接している果物どうしを毎フレーム押し合って震える
 */
const SLOP = 0.0006;
/** 1回の押し戻しでめり込みの何割を解消するか。1にすると跳ね返って震える */
const CORRECTION = 0.9;
/**
 * 1サブステップで衝突を何回解くか。
 *
 * **積んだ山の深さぶんだけ回数が要る。** 押し戻しは1回で1接触ぶんしか
 * 伝わらないので、回数が足りないと下の方が潰れる。3回だと60個の山で
 * 半径の17%めり込んでいた（テストの「深くめり込まない」で検出）。
 * 5回で6%まで下がり、60個でも1フレーム0.4msに収まっている
 */
const ITERATIONS = 5;
/**
 * 接している果物がこの速さを下回ったら止める（震え対策の要）。
 *
 * **上限は「1秒で動いてよい距離」から決める。** 0.02 にしていたときは、
 * 落ち着いたはずの山が1秒で 0.02（いちばん小さい果物の半径の6割）
 * 動き続けていて、目で見て分かる震えになっていた
 */
const REST_SPEED = 0.006;
/** 反発を効かせる下限の相対速度。触れているだけの接触で跳ねさせない */
const BOUNCE_THRESHOLD = 0.3;

/** 1フレームを何回に割って進めるか。低速端末では減らす（仕様書の「パフォーマンス」） */
export const SUBSTEPS = 4;
/** フレーム落ちしても物理が壊れないよう、1フレームの上限を決めておく */
const MAX_DT = 1 / 30;
/** 合体とみなす隙間。ぴったり接触した瞬間だけだと取りこぼす */
const MERGE_GAP = 0.004;

/* ------------------------------------------------------------------ *
 * 初期化
 * ------------------------------------------------------------------ */

export function initialState(seed = 1): FruitMergeState {
  const first = pickTier(seed);
  const second = pickTier(first.seed);
  return {
    fruits: [],
    hold: first.tier,
    next: second.tier,
    aim: 0.5,
    score: 0,
    status: 'playing',
    chain: 0,
    chainSec: 0,
    overSec: 0,
    dropCool: 0,
    cleared: 0,
    merges: 0,
    events: [],
    seed: second.seed,
    nextId: 1,
  };
}

export function restart(seed = 1): FruitMergeState {
  return initialState(seed);
}

/* ------------------------------------------------------------------ *
 * 操作
 * ------------------------------------------------------------------ */

/** 落とす横位置を決める。壁を突き抜けないよう半径ぶん内側に寄せる */
export function aimAt(state: FruitMergeState, x: number): FruitMergeState {
  const r = radiusOf(state.hold);
  const aim = Math.max(r, Math.min(BOX_W - r, x));
  return aim === state.aim ? state : { ...state, aim };
}

/** いま落とせるか。連投の間隔を空けていないと果物が重なって生まれる */
export function canDrop(state: FruitMergeState): boolean {
  return state.status === 'playing' && state.dropCool <= 0;
}

/**
 * 持っている果物を落とす。
 *
 * 落ちてくる先は `aim`（クランプ済み）。予告の果物が手元に来て、
 * 新しい予告を1つ引く
 */
export function drop(state: FruitMergeState): FruitMergeState {
  if (!canDrop(state)) return state;
  const r = radiusOf(state.hold);
  const x = Math.max(r, Math.min(BOX_W - r, state.aim));
  const picked = pickTier(state.seed);
  return {
    ...state,
    fruits: [
      ...state.fruits,
      { id: state.nextId, tier: state.hold, x, y: DROP_Y, vx: 0, vy: 0, landed: false },
    ],
    nextId: state.nextId + 1,
    hold: state.next,
    next: picked.tier,
    seed: picked.seed,
    dropCool: DROP_INTERVAL,
    events: [],
  };
}

/* ------------------------------------------------------------------ *
 * 物理
 * ------------------------------------------------------------------ */

/** 質量は面積に比例させる（大きい果物は小さい果物に押し負けない） */
function invMass(f: Fruit): number {
  const r = radiusOf(f.tier);
  return 1 / (r * r);
}

function clampSpeed(f: Fruit): void {
  const s = Math.hypot(f.vx, f.vy);
  if (s > MAX_SPEED) {
    f.vx = (f.vx / s) * MAX_SPEED;
    f.vy = (f.vy / s) * MAX_SPEED;
  }
}

/**
 * 壁と床。**上は開いている**（落とし口なので蓋をしない）。
 * @returns 触れていれば true（止める判断に使う）
 */
function solveWalls(f: Fruit): boolean {
  const r = radiusOf(f.tier);
  let touched = false;
  if (f.x - r < 0) {
    f.x = r;
    if (f.vx < 0) f.vx = -f.vx * WALL_RESTITUTION;
    f.vy *= 1 - FRICTION * 0.25;
    touched = true;
  } else if (f.x + r > BOX_W) {
    f.x = BOX_W - r;
    if (f.vx > 0) f.vx = -f.vx * WALL_RESTITUTION;
    f.vy *= 1 - FRICTION * 0.25;
    touched = true;
  }
  if (f.y + r > BOX_H) {
    f.y = BOX_H - r;
    if (f.vy > 0) f.vy = -f.vy * WALL_RESTITUTION;
    f.vx *= 1 - FRICTION * 0.5;
    touched = true;
  }
  return touched;
}

/**
 * 果物どうしの接触を1組解く。
 *
 * めり込みを押し戻し（位置補正）てから、法線方向の速度を跳ね返し、
 * 接線方向に摩擦をかける。**位置補正を先にやる**のは、深く刺さったまま
 * 速度だけ直すと次のフレームでまた刺さって震えるため
 */
function solvePair(a: Fruit, b: Fruit): boolean {
  const ra = radiusOf(a.tier);
  const rb = radiusOf(b.tier);
  const sum = ra + rb;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= sum * sum) return false;

  let d = Math.sqrt(d2);
  if (d < 1e-9) {
    // 完全に重なった（同じ場所に生まれた）。上下に割って抜け出させる
    dx = 0;
    dy = 1;
    d = 1e-9;
  } else {
    dx /= d;
    dy /= d;
  }

  const ima = invMass(a);
  const imb = invMass(b);
  const inv = ima + imb;

  const depth = sum - d;
  const push = (Math.max(depth - SLOP, 0) * CORRECTION) / inv;
  a.x -= dx * push * ima;
  a.y -= dy * push * ima;
  b.x += dx * push * imb;
  b.y += dy * push * imb;

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const vn = rvx * dx + rvy * dy;
  if (vn < 0) {
    // 触れているだけの接触では跳ねさせない（跳ねると山が落ち着かない）
    const e = -vn > BOUNCE_THRESHOLD ? RESTITUTION : 0;
    const j = (-(1 + e) * vn) / inv;
    a.vx -= dx * j * ima;
    a.vy -= dy * j * ima;
    b.vx += dx * j * imb;
    b.vy += dy * j * imb;

    // 接線方向（摩擦）。これが無いと山の上を滑り続けて積み上がらない
    const tx = -dy;
    const ty = dx;
    const vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
    const jt = (-vt * FRICTION) / inv;
    a.vx -= tx * jt * ima;
    a.vy -= ty * jt * ima;
    b.vx += tx * jt * imb;
    b.vy += ty * jt * imb;
  }
  return true;
}

/**
 * 1サブステップ進める。`fruits` は破壊的に更新する
 * （`step` の中でコピー済みの配列だけを渡すこと）
 */
function integrate(fruits: Fruit[], dt: number): void {
  const damp = Math.max(0, 1 - AIR * dt);
  for (const f of fruits) {
    f.vy += GRAVITY * dt;
    f.vx *= damp;
    f.vy *= damp;
    clampSpeed(f);
    f.x += f.vx * dt;
    f.y += f.vy * dt;
  }
}

function solveContacts(fruits: Fruit[]): void {
  const touched = new Array<boolean>(fruits.length).fill(false);
  for (let it = 0; it < ITERATIONS; it += 1) {
    for (let i = 0; i < fruits.length; i += 1) {
      for (let j = i + 1; j < fruits.length; j += 1) {
        if (solvePair(fruits[i], fruits[j])) {
          touched[i] = true;
          touched[j] = true;
        }
      }
    }
    // **壁は必ず最後に解く。** 先に解くと、そのあとの押し合いで床や壁に
    // 押し戻されたぶんが残り、果物が箱から少しはみ出したまま止まる
    for (let i = 0; i < fruits.length; i += 1) {
      if (solveWalls(fruits[i])) touched[i] = true;
    }
  }
  // **震え（ジッター）を止める。** 何かに接していて、ほとんど動いていない
  // ものは速度を0にする。空中では止めない（浮いたまま固まってしまう）
  for (let i = 0; i < fruits.length; i += 1) {
    if (!touched[i]) continue;
    const f = fruits[i];
    if (Math.hypot(f.vx, f.vy) < REST_SPEED) {
      f.vx = 0;
      f.vy = 0;
    }
  }
}

/* ------------------------------------------------------------------ *
 * 合体
 * ------------------------------------------------------------------ */

interface MergeOutcome {
  fruits: Fruit[];
  events: MergeEvent[];
  score: number;
  chain: number;
  chainSec: number;
  cleared: number;
  merges: number;
  nextId: number;
}

/**
 * 触れている同じ段どうしを合体させる。
 *
 * **1回の呼び出しで1つの果物は1度しか合体しない。** 3つ並んでいるときに
 * 玉突きで2回合体すると、どちらの組が合体したのかが見た目と食い違う
 */
function resolveMerges(
  fruits: Fruit[],
  state: FruitMergeState,
  dt: number,
): MergeOutcome {
  let chain = state.chain;
  let chainSec = Math.max(0, state.chainSec - dt);
  if (chainSec <= 0) chain = 0;

  const used = new Set<number>();
  const events: MergeEvent[] = [];
  const born: Fruit[] = [];
  let score = state.score;
  let cleared = state.cleared;
  let merges = state.merges;
  let nextId = state.nextId;

  for (let i = 0; i < fruits.length; i += 1) {
    const a = fruits[i];
    if (used.has(a.id)) continue;
    for (let j = i + 1; j < fruits.length; j += 1) {
      const b = fruits[j];
      if (used.has(b.id) || b.tier !== a.tier) continue;
      const reach = radiusOf(a.tier) + radiusOf(b.tier) + MERGE_GAP;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx * dx + dy * dy > reach * reach) continue;

      used.add(a.id);
      used.add(b.id);
      chain += 1;
      chainSec = CHAIN_WINDOW;
      merges += 1;
      const mult = Math.min(chain, CHAIN_MAX);
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;

      if (a.tier >= MAX_TIER) {
        // 最大どうしは消えてボーナス。詰まった箱を開ける唯一の手段になる
        const gain = CLEAR_BONUS * mult;
        score += gain;
        cleared += 1;
        events.push({ x, y, tier: -1, gain, chain });
      } else {
        const tier = a.tier + 1;
        const gain = mergePoints(tier) * mult;
        score += gain;
        born.push({
          id: nextId,
          tier,
          x,
          y,
          vx: (a.vx + b.vx) / 2,
          vy: (a.vy + b.vy) / 2,
          // 生まれた場所がラインより下なら、そのまま判定の対象にする
          landed: a.landed || b.landed || y - radiusOf(tier) > LINE_Y,
        });
        nextId += 1;
        events.push({ x, y, tier, gain, chain });
      }
      break;
    }
  }

  const kept = used.size === 0 ? fruits : fruits.filter((f) => !used.has(f.id));
  return {
    fruits: born.length === 0 ? kept : [...kept, ...born],
    events,
    score,
    chain,
    chainSec,
    cleared,
    merges,
    nextId,
  };
}

/* ------------------------------------------------------------------ *
 * 1フレーム
 * ------------------------------------------------------------------ */

/**
 * 1フレーム進める。
 *
 * @param state 現在の状態（変更しない）
 * @param dt 経過秒（requestAnimationFrame の間隔。上限を設けてすり抜けを防ぐ）
 * @param substeps 物理の分割数。低速端末では減らして描画を優先する
 */
export function step(state: FruitMergeState, dt: number, substeps = SUBSTEPS): FruitMergeState {
  const clamped = Math.min(Math.max(dt, 0), MAX_DT);
  if (state.status === 'gameover') {
    return state.events.length ? { ...state, events: [] } : state;
  }

  const fruits = state.fruits.map((f) => ({ ...f }));
  const steps = Math.max(1, Math.floor(substeps));
  const sub = clamped / steps;
  for (let s = 0; s < steps; s += 1) {
    integrate(fruits, sub);
    solveContacts(fruits);
  }

  const merged = resolveMerges(fruits, state, clamped);

  // ---- ラインをくぐったものだけを判定の対象にする
  for (const f of merged.fruits) {
    if (!f.landed && f.y - radiusOf(f.tier) > LINE_Y) f.landed = true;
  }
  const over = merged.fruits.some((f) => f.landed && f.y - radiusOf(f.tier) < LINE_Y);
  const overSec = over ? state.overSec + clamped : 0;

  const nextState: FruitMergeState = {
    ...state,
    fruits: merged.fruits,
    score: merged.score,
    chain: merged.chain,
    chainSec: merged.chainSec,
    cleared: merged.cleared,
    merges: merged.merges,
    nextId: merged.nextId,
    events: merged.events,
    dropCool: Math.max(0, state.dropCool - clamped),
    overSec,
  };

  if (overSec >= OVER_LIMIT) {
    return { ...nextState, status: 'gameover', overSec: OVER_LIMIT };
  }
  return nextState;
}

/**
 * ラインを超えている＝警告中か。UIは超えているあいだラインを点滅させる
 * （突然死の理不尽感を消すため。仕様書「遊びやすさ」）
 */
export function isWarning(state: FruitMergeState): boolean {
  return state.status === 'playing' && state.overSec > 0;
}

/** 落とす前の予測線が届く高さ。いちばん上にある果物の頭（無ければ床） */
export function dropPreviewY(state: FruitMergeState): number {
  const r = radiusOf(state.hold);
  const x = Math.max(r, Math.min(BOX_W - r, state.aim));
  let y = BOX_H;
  for (const f of state.fruits) {
    const fr = radiusOf(f.tier);
    const dx = Math.abs(f.x - x);
    if (dx > fr + r) continue;
    // 円の上端ではなく、落ちてくる円が乗る高さ（中心距離が r+fr になる位置）
    const dy = Math.sqrt(Math.max(0, (fr + r) * (fr + r) - dx * dx));
    y = Math.min(y, f.y - dy);
  }
  return Math.max(DROP_Y, y);
}

/* ------------------------------------------------------------------ *
 * デバッグ（公開の条件2の再現手段）
 * ------------------------------------------------------------------ */

/**
 * 箱に果物を自動で積む。**仕様書「公開の条件」の2**——
 * 「果物を60個積んだ状態で、震えとすり抜けが目視で出ない」を
 * 誰でも同じ手順で確かめられるようにするための再現手段。
 *
 * 同じ段が隣り合うとすぐ合体して数が減るので、**隣どうしが違う段になる**
 * ように配って、指定した数がそのまま箱に入るようにしてある。
 */
/**
 * 11段を1つずつ箱に入れる。**preview 段階で果物の絵を見比べるための手**。
 *
 * 合体でしか出てこない大きい段（メロン・パイナップル）は、普通に遊んでいると
 * 確かめるまでに何分もかかる。隣り合う段の色や飾りが紛れていないかは、
 * 並べて見ないと分からない
 */
export function debugLadder(state: FruitMergeState): FruitMergeState {
  const fruits: Fruit[] = [];
  let id = state.nextId;
  let x = 0;
  let y = BOX_H;
  let rowMax = 0;
  let prevR = 0;
  // 大きいものから入れる（小さいものを先に入れると下敷きになって見えない）
  for (let tier = MAX_TIER; tier >= 0; tier -= 1) {
    const r = radiusOf(tier);
    if (x === 0 || x + prevR + r * 2 > BOX_W) {
      y -= rowMax === 0 ? r : rowMax + r;
      x = r;
      rowMax = r;
    } else {
      x += prevR + r;
      rowMax = Math.max(rowMax, r);
    }
    prevR = r;
    fruits.push({ id, tier, x, y, vx: 0, vy: 0, landed: y - r > LINE_Y });
    id += 1;
  }
  return { ...state, fruits, nextId: id, events: [] };
}

export function debugFill(state: FruitMergeState, count: number, seed = 7): FruitMergeState {
  const fruits: Fruit[] = [];
  let s = seed;
  let id = state.nextId;
  /**
   * 小さい方の6段で積む。**段の種類が少ないと山にならない。**
   * 4段でやったときは、落ち着くまでに同じ段が触れ合って合体が連鎖し、
   * 60個が31個まで減って「60個の山」を確かめられなかった。
   * 6段なら合体は1回で済み、59個が残る（大きい段まで使うと今度は箱に入らない）
   */
  const tiers = [0, 1, 2, 3, 4, 5];
  /**
   * **隙間なく詰める。** 格子に並べると列どうしが離れて立ち、
   * 果物が互いに触れない「棒が並んだだけ」の絵になる。それでは
   * 押し合いが起きないので、確かめたい震えもすり抜けも出てこない。
   * 半径のぶんだけ進めて、置いた瞬間から隣と接している山を作る
   */
  let x = 0;
  let y = BOX_H;
  let rowMax = 0;
  let prevR = 0;
  let index = 0;
  for (let i = 0; i < count; i += 1) {
    const rnd = nextRandom(s);
    s = rnd.seed;
    // 隣どうしが違う段になる並べ方。同じ段が隣り合うと置いた瞬間に合体して、
    // 数えたい個数が箱に入らない
    const tier = tiers[index % tiers.length];
    const r = radiusOf(tier);
    if (x === 0 || x + prevR + r * 2 > BOX_W) {
      // 行を上げる。前の行のいちばん大きい果物のぶんだけ上げれば重ならない
      y -= rowMax === 0 ? r : rowMax + r;
      x = r;
      rowMax = r;
      prevR = r;
    } else {
      x += prevR + r;
      prevR = r;
      rowMax = Math.max(rowMax, r);
    }
    // ほんの少しだけ横にずらす。まっすぐ並べると左右対称の力が釣り合って、
    // 実際の遊びでは起きない「崩れない山」になってしまう
    const jitter = (rnd.value - 0.5) * 0.004;
    const px = Math.max(r, Math.min(BOX_W - r, x + jitter));
    fruits.push({ id, tier, x: px, y, vx: 0, vy: 0, landed: y - r > LINE_Y });
    id += 1;
    index += 1;
  }

  /**
   * **触れ合っている同じ段をずらす。**
   *
   * 行ごとに段を送るだけでは、上下・斜めで同じ段が接する組が残る。
   * それを放っておくと、置いた瞬間から合体が連鎖して**60個が30個まで減り、
   * 「60個の山」を確かめられない**（実測：60個が31個になっていた）。
   * 接している組を見つけたら片方を1段ずらす、を数回まわして解消する
   */
  for (let pass = 0; pass < 8; pass += 1) {
    let fixed = false;
    for (let i = 0; i < fruits.length; i += 1) {
      for (let j = i + 1; j < fruits.length; j += 1) {
        const a = fruits[i];
        const b = fruits[j];
        if (a.tier !== b.tier) continue;
        // 落ち着くまでに少し動くので、接触の判定は余裕をもって広めに見る
        const reach = radiusOf(a.tier) + radiusOf(b.tier) + 0.012;
        if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > reach * reach) continue;
        b.tier = tiers[(tiers.indexOf(b.tier) + 1) % tiers.length];
        fixed = true;
      }
    }
    if (!fixed) break;
  }

  return { ...state, fruits, nextId: id, seed: s, events: [] };
}
