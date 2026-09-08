/**
 * ボルダリング合体パズルの物理・進行ロジック
 *
 * 仕様: docs/features/game-bouldering-merge.md
 *
 * 描画（canvas）から切り離した純関数のステート機械。フルーツ合体パズルを
 * 置き換えたもので、遊びの骨格（段・連鎖・ライン・落下予測）はそのまま、
 * **当たり判定を円から凸多角形に変えてある**（運営者の「当たり判定は
 * ホールドの形に沿ってほしい」）。
 *
 * 座標系は**幅1×高さ1.5**の正規化空間。原点は箱の左上、yは下向きに正。
 * 縦横比を座標に持たせないと重力が縦横で違う強さになる。
 *
 * ## 円のときと何が変わるか
 *
 * - **接触点が要る。** 円は必ず1点で接するが、多角形は面で接する。
 *   1点しか作らないと、平らな面で載っているホールドが支えられずに回り続ける
 * - **形ごとに慣性モーメントが違う。** 円のときは半径から一律に出せたが、
 *   多角形は面積分で求める（`polygonInertia`）
 * - **総当たりが重い。** SAT は円どうしの距離判定よりずっと高い。
 *   外接円（`bound`）で弾いてから SAT に入る
 *
 * ## 名称・意匠の注意（仕様書の冒頭と同じ）
 *
 * ホールドの種類名（ガバ・カチ・ピンチ等）はクライミングの一般的な用語。
 * **特定メーカーの商品ホールドの形はなぞらない**（ホールドは造形物なので
 * 実在商品の意匠をなぞらない）。ここに置く形は種類の一般的な特徴から自分で起こす。
 */

/** 箱の内寸。幅1×高さ1.5（＝2:3の縦長） */
export const BOX_W = 1;
export const BOX_H = 1.5;

/**
 * ゲームオーバーライン。**箱の上端そのものではなく少し下**に置く。
 * 上端と同じにすると、落としたホールドが跳ねて一瞬顔を出しただけで
 * 警告が出て、突然死の理不尽さが残る
 */
export const LINE_Y = 0.26;

/** 持っているホールドが浮かぶ高さ（ラインより上＝判定に入らない） */
export const DROP_Y = 0.1;

/** ラインを超え続けて何秒で終わりにするか */
export const OVER_LIMIT = 2;

/** 連続で落とせない間隔（秒）。連打で重なって生まれるのを防ぐ */
export const DROP_INTERVAL = 0.32;

/** 合体してから次の合体までを「連鎖」とみなす時間（秒） */
export const CHAIN_WINDOW = 0.8;

/** 連鎖の倍率の上限 */
export const CHAIN_MAX = 5;

/** 落ちてくる段（0が最小）。予告に出るのは小さい方の5段階だけ */
export const DROPPABLE_TIERS = 5;

/** 最大同士を合体させたときのボーナス（2つとも消える） */
export const CLEAR_BONUS = 100;

/* ------------------------------------------------------------------ *
 * ホールドの定義
 * ------------------------------------------------------------------ */

export type Deco = 'flat' | 'hole' | 'ridge' | 'grain' | 'bolt';

export interface HoldDef {
  /** 表示名（遊び方・FAQで使う） */
  name: string;
  /** 大きさ。頂点は±1に正規化してあるので、これが実質の外接半径 */
  size: number;
  /** 本体の色（平塗り） */
  light: string;
  /** 影と輪郭の色 */
  dark: string;
  /** 飾りの描き分け。canvas 側で使う */
  deco: Deco;
  /**
   * 凸多角形の頂点。**重心をおよそ原点とし、±1に収まる大きさ**で書く。
   * 並びは一周する順であればよい（外向きの法線は重心との向きで決める）。
   * **凸であること**（凹ませると SAT が破綻する。ポケットの穴・ガバの
   * えぐれは絵だけで、当たり判定は外側の凸形）
   */
  points: readonly (readonly [number, number])[];
}

/**
 * 11段。小さく持ちにくいものから、大きく持ちやすいものへ。
 * 大きさの比は約1.185倍ずつ（フルーツ版から引き継ぎ。面積を保つ比だと
 * 3段目で箱を埋めてしまう）。
 *
 * **形（シルエット）で見分けられるようにする。** 色だけに頼らない
 * （games/CLAUDE.md「段の見分けを色だけに頼らない」）
 */
export const HOLDS: HoldDef[] = [
  {
    name: 'カチ',
    size: 0.034,
    light: '#93c5fd',
    dark: '#1e40af',
    deco: 'flat',
    // 薄い横長の板。指先しかかからない
    points: [
      [-1, -0.3],
      [1, -0.24],
      [0.92, 0.32],
      [-0.94, 0.28],
    ],
  },
  {
    name: 'ピンチ',
    size: 0.041,
    light: '#fca5a5',
    dark: '#991b1b',
    deco: 'ridge',
    // 縦長で上下がすぼまる。つまむ形
    points: [
      [-0.4, -1],
      [0.4, -1],
      [0.62, -0.1],
      [0.36, 1],
      [-0.36, 1],
      [-0.6, -0.1],
    ],
  },
  {
    name: 'ポケット',
    size: 0.049,
    light: '#c4b5fd',
    dark: '#5b21b6',
    deco: 'hole',
    // 丸っこい塊。指穴は絵だけで、当たり判定は外側の凸形
    points: [
      [-0.54, -0.84],
      [0.54, -0.84],
      [0.94, -0.3],
      [0.94, 0.36],
      [0.5, 0.88],
      [-0.5, 0.88],
      [-0.94, 0.36],
      [-0.94, -0.3],
    ],
  },
  {
    name: 'エッジ',
    size: 0.058,
    light: '#fdba74',
    dark: '#9a3412',
    deco: 'flat',
    // 横長の台形。上面が水平でかかりが良い
    points: [
      [-0.78, -0.5],
      [0.82, -0.4],
      [1, 0.44],
      [-1, 0.38],
    ],
  },
  {
    name: 'サイドプル',
    size: 0.069,
    light: '#5eead4',
    dark: '#115e59',
    deco: 'ridge',
    // 縦長の非対称。横向きに引く形
    points: [
      [0.12, -1],
      [0.86, 0.3],
      [0.22, 0.96],
      [-0.84, 0.52],
      [-0.62, -0.34],
    ],
  },
  {
    name: 'アンダー',
    size: 0.082,
    light: '#f9a8d4',
    dark: '#9d174d',
    deco: 'ridge',
    // かまぼこ。下が平らで、下から持つ
    points: [
      [-1, 0.56],
      [1, 0.56],
      [0.82, -0.2],
      [0.32, -0.76],
      [-0.34, -0.78],
      [-0.84, -0.24],
    ],
  },
  {
    name: 'スローパー',
    size: 0.097,
    light: '#bef264',
    dark: '#3f6212',
    deco: 'grain',
    // 丸みの強い塊。摩擦だけで保持する
    points: [
      [-0.62, -0.78],
      [0.62, -0.78],
      [0.98, -0.2],
      [0.98, 0.3],
      [0.6, 0.82],
      [-0.6, 0.82],
      [-0.98, 0.3],
      [-0.98, -0.2],
    ],
  },
  {
    name: 'ガバ',
    size: 0.115,
    light: '#fcd34d',
    dark: '#92400e',
    deco: 'hole',
    // 大きい塊。えぐれ（持つところ）は絵だけで、外形は凸
    points: [
      [-0.7, -0.72],
      [0.66, -0.8],
      [1, -0.14],
      [0.88, 0.52],
      [0.24, 0.9],
      [-0.56, 0.86],
      [-1, 0.24],
    ],
  },
  {
    name: 'デカガバ',
    size: 0.136,
    light: '#67e8f9',
    dark: '#155e75',
    deco: 'hole',
    points: [
      [-0.55, -0.92],
      [0.58, -0.86],
      [0.98, -0.1],
      [0.76, 0.72],
      [-0.18, 0.96],
      [-0.9, 0.5],
      [-0.98, -0.24],
    ],
  },
  {
    name: 'ボテ',
    size: 0.16,
    light: '#a5b4fc',
    dark: '#3730a3',
    deco: 'bolt',
    // ボリューム。三角の造形が定番
    points: [
      [0, -1],
      [0.96, 0.68],
      [-0.96, 0.68],
    ],
  },
  {
    name: 'トップホールド',
    size: 0.188,
    light: '#fda4af',
    dark: '#881337',
    deco: 'bolt',
    // 完登のゴール。大きい多角形
    points: [
      [-0.5, -0.95],
      [0.5, -0.95],
      [0.98, -0.2],
      [0.8, 0.66],
      [0, 1],
      [-0.8, 0.66],
      [-0.98, -0.2],
    ],
  },
];

/** 最大の段（これ同士は合体して消える） */
export const MAX_TIER = HOLDS.length - 1;

export function defOf(tier: number): HoldDef {
  return HOLDS[Math.max(0, Math.min(MAX_TIER, tier))];
}

/** 外接円の半径。広い当たり判定・落下予測・描画の余白に使う */
export function boundOf(tier: number): number {
  return shapeOf(tier).bound;
}

/**
 * 合体したときの素点。**できあがった段**で決まる（1,3,6,…,55）。
 * 大きいものを作るほど跳ね上がるので、消化より育成が得になる
 */
export function mergePoints(tier: number): number {
  return (tier * (tier + 1)) / 2;
}

/* ------------------------------------------------------------------ *
 * 多角形の幾何
 * ------------------------------------------------------------------ */

export interface ShapeInfo {
  /** 重心を原点に寄せた頂点（大きさは段ごとに掛け済み） */
  points: readonly (readonly [number, number])[];
  /** 外接円の半径。広い当たり判定に使う */
  bound: number;
  /** 面積（＝質量。面密度は1とする） */
  area: number;
  /** 重心まわりの慣性モーメント */
  inertia: number;
}

/** 多角形の符号付き面積。頂点の並びの向きも分かる */
function signedArea(pts: readonly (readonly [number, number])[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** 多角形の重心 */
function centroidOf(pts: readonly (readonly [number, number])[]): [number, number] {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-12) return [0, 0];
  return [cx / (6 * a), cy / (6 * a)];
}

/**
 * 重心まわりの慣性モーメント（面密度1）。
 *
 * **段ごとに違う。** 円のときは半径から一律に出せたが、多角形は形で変わる。
 * 三角形に分割して足し合わせる標準の式
 */
function polygonInertia(pts: readonly (readonly [number, number])[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const cross = Math.abs(x1 * y2 - x2 * y1);
    num += cross * (x1 * x1 + x1 * x2 + x2 * x2 + y1 * y1 + y1 * y2 + y2 * y2);
    den += cross;
  }
  if (den < 1e-12) return 1e-6;
  // I = (面積 × 上の比) / 6
  return (Math.abs(signedArea(pts)) * (num / den)) / 6;
}

const SHAPE_CACHE = new Map<number, ShapeInfo>();

/**
 * 段ごとの形。**毎フレーム作り直さない**（頂点の変換だけで十分重い）。
 * 頂点は重心を原点に寄せ、並びを反時計回りに揃えてある
 */
export function shapeOf(tier: number): ShapeInfo {
  const key = Math.max(0, Math.min(MAX_TIER, Math.floor(tier)));
  const hit = SHAPE_CACHE.get(key);
  if (hit) return hit;

  const def = HOLDS[key];
  const scaled = def.points.map(([x, y]) => [x * def.size, y * def.size] as const);
  const [cx, cy] = centroidOf(scaled);
  let pts = scaled.map(([x, y]) => [x - cx, y - cy] as const);
  // **並びの向きを揃える。** 揃えないと外向きの法線が裏返る
  if (signedArea(pts) < 0) pts = [...pts].reverse();

  const info: ShapeInfo = {
    points: pts,
    bound: Math.max(...pts.map(([x, y]) => Math.hypot(x, y))),
    area: Math.abs(signedArea(pts)),
    inertia: polygonInertia(pts),
  };
  SHAPE_CACHE.set(key, info);
  return info;
}

export interface Hold {
  id: number;
  /** 0〜10。同じ段どうしが触れると1段上になる */
  tier: number;
  x: number;
  y: number;
  /** 1秒あたりの移動量 */
  vx: number;
  vy: number;
  /** 向き（ラジアン） */
  angle: number;
  /** 角速度（ラジアン毎秒） */
  spin: number;
  /**
   * 一度でもゲームオーバーラインより下に入ったか。
   * 落とした直後のホールドを判定に入れないための目印
   */
  landed: boolean;
  /** 接していてほとんど動いていない状態が続いている秒数 */
  restSec: number;
  /** 静止判定の基準にしている位置（`restSec` を数え始めたときの位置） */
  restX: number;
  restY: number;
}

/** 世界座標での頂点。毎回作るので、呼ぶ側で使い回すこと */
function worldPoints(h: Hold): [number, number][] {
  const { points } = shapeOf(h.tier);
  const c = Math.cos(h.angle);
  const s = Math.sin(h.angle);
  const out: [number, number][] = new Array(points.length);
  for (let i = 0; i < points.length; i += 1) {
    const [px, py] = points[i];
    out[i] = [h.x + px * c - py * s, h.y + px * s + py * c];
  }
  return out;
}

export { worldPoints as holdPoints };

/** 多角形を軸に射影した範囲 */
function project(pts: readonly [number, number][], ax: number, ay: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, y] of pts) {
    const d = x * ax + y * ay;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

/**
 * 決まった軸に沿ったふたつの重なりの深さ。
 *
 * 押し戻しを繰り返すときに使う。**SATをやり直さない**（軸はもう分かっているので、
 * 射影しなおすだけでよい。SATは重いので繰り返しには使えない）
 */
function depthAlong(a: Hold, b: Hold, nx: number, ny: number): number {
  const [amin, amax] = project(worldPoints(a), nx, ny);
  const [bmin, bmax] = project(worldPoints(b), nx, ny);
  return Math.min(amax, bmax) - Math.max(amin, bmin);
}

export interface Contact {
  /** 法線（a から b へ向かう単位ベクトル） */
  nx: number;
  ny: number;
  /** めり込みの深さ */
  depth: number;
  /** 接触点（世界座標）。面で接していれば2点以上できる */
  points: [number, number][];
}

/**
 * 凸多角形どうしの当たり判定（SAT）。
 *
 * 重なっていれば、**最も浅い軸**を法線として返す。そこへ押し戻すのが
 * いちばん動きが小さくて済む。
 *
 * 接触点は**相手の内側に入った頂点**を集めて作る。
 * **1点しか作らないと、平らな面で載っている多角形が支えられずに回り続ける**
 * （円には無い問題）。面で接していれば2つの頂点が入るので自然に2点になる
 */
export function collide(a: Hold, b: Hold): Contact | null {
  // 広い判定。外接円で弾いてから SAT に入る（総当たりが重いため）
  const ba = shapeOf(a.tier).bound;
  const bb = shapeOf(b.tier).bound;
  const dxc = b.x - a.x;
  const dyc = b.y - a.y;
  if (dxc * dxc + dyc * dyc > (ba + bb) * (ba + bb)) return null;

  const pa = worldPoints(a);
  const pb = worldPoints(b);

  let bestDepth = Infinity;
  let bnx = 0;
  let bny = 0;

  for (let side = 0; side < 2; side += 1) {
    const pts = side === 0 ? pa : pb;
    for (let i = 0; i < pts.length; i += 1) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      let ax = y2 - y1;
      let ay = -(x2 - x1);
      const len = Math.hypot(ax, ay);
      if (len < 1e-12) continue;
      ax /= len;
      ay /= len;

      const [amin, amax] = project(pa, ax, ay);
      const [bmin, bmax] = project(pb, ax, ay);
      const overlap = Math.min(amax, bmax) - Math.max(amin, bmin);
      if (overlap <= 0) return null; // 分離軸が見つかった＝当たっていない
      if (overlap < bestDepth) {
        bestDepth = overlap;
        /**
         * 法線の向きは a から b へ寄せる（向きが揺れると押し合いが暴れる）。
         *
         * **いちばん浅い軸は、中心を結んだ線と直交することがある**
         * （横に並べた平たいホールドどうしで、縦の重なりのほうが浅い場合）。
         * そのとき内積は0になって向きが決まらないが、**どちら向きに押しても
         * 同じだけ離れる**ので、そのままでよい（最小移動ベクトルの性質）
         */
        const flip = ax * dxc + ay * dyc < 0;
        bnx = flip ? -ax : ax;
        bny = flip ? -ay : ay;
      }
    }
  }
  if (!Number.isFinite(bestDepth)) return null;

  const points = contactPoints(pa, pb);
  if (points.length === 0) {
    // 頂点が1つも内側に入っていない浅い当たり。中心のあいだに1点置く
    points.push([(a.x + b.x) / 2, (a.y + b.y) / 2]);
  }
  return { nx: bnx, ny: bny, depth: bestDepth, points };
}

/** 点が凸多角形（反時計回り）の内側にあるか */
function inside(pts: readonly [number, number][], x: number, y: number): boolean {
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    if ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1) < 0) return false;
  }
  return true;
}

/** 相手の内側に入った頂点を接触点として集める（最大4点） */
function contactPoints(
  pa: readonly [number, number][],
  pb: readonly [number, number][],
): [number, number][] {
  const out: [number, number][] = [];
  for (const [x, y] of pb) {
    if (inside(pa, x, y)) out.push([x, y]);
    if (out.length >= 4) return out;
  }
  for (const [x, y] of pa) {
    if (inside(pb, x, y)) out.push([x, y]);
    if (out.length >= 4) return out;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 物理の定数（フルーツ版から引き継ぎ、多角形向けに調整）
 * ------------------------------------------------------------------ */

/** 重力（1秒²あたり） */
const GRAVITY = 2.6;
/** 反発係数。低くしないと積んだ山が跳ね続けて落ち着かない */
const RESTITUTION = 0.05;
const WALL_RESTITUTION = 0.04;
/** 接線方向の摩擦。**接触点の速度に当てる**（中心に当てると「接着」になる） */
/**
 * 接線方向の摩擦。**接触点の速度に当てる**（中心に当てると「接着」になる）。
 *
 * **多角形では円のときより高く要る（円は0.35）。** 低いと、積んだ山が
 * 落ち着いたあとも**ゆっくり流れ続ける**（砂利のように）。実測では0.35のとき、
 * 落ち着いた山を30秒放置しただけで**勝手に6回合体し、最大0.16（箱の16%）
 * 崩れた**。0.6にすると10秒で完全に止まり、そのあとは1ミリも動かない
 */
const FRICTION = 0.6;
/** 空気抵抗（1秒あたりの減衰） */
const AIR = 0.08;
/** 速さの上限。無いと1フレームで相手をすり抜ける */
const MAX_SPEED = 4;
/** 角速度の上限 */
const MAX_SPIN = 22;
/** 許容するめり込み。ここまでは押し戻さない（毎フレーム押し合って震えるのを防ぐ） */
/**
 * 許容するめり込み。**外接円に対する割合で持つ。**
 *
 * 固定値（0.0006）にしていたときは、山の中で押し合って**解消しきれない
 * めり込み**（片方を押し出すともう片方に刺さる）を押し戻しが延々と追いかけ、
 * **全部眠っているのに山が1秒あたり0.002ずつ動き続けた**（80秒経っても収まらない）。
 * 大きいホールドほど深いめり込みが目立たないので、割合で持つのが素直
 */
const SLOP_RATIO = 0.03;
/** 1回の押し戻しでめり込みの何割を解消するか */
const CORRECTION = 0.7;
/**
 * 衝突を解く回数。
 *
 * **多角形は円より回数が要る。** 面で接するぶん接触点が増え、
 * 1点ずつ順に解くので伝わるのに回数がかかる。
 * ただし SAT は重いので、**当たり判定は1サブステップに1回だけ**行い、
 * その結果に対して力の解決だけを繰り返す（円のときは判定ごと繰り返していた）
 */
const ITERATIONS = 8;
/**
 * 押し戻し（位置）を何回繰り返すか。**積んだ山の深さぶんだけ要る。**
 * 1回だと36個の山で小さい方の3割までめり込んでいた（許容は1割）
 */
const POSITION_PASSES = 4;
/**
 * 止まったとみなす移動量（外接円に対する割合）。
 * この幅の中で行ったり来たりしているだけなら「止まっている」
 */
const REST_MOVE = 0.02;
/**
 * これを超える速さのものは、移動が小さくても止めない。
 * ぶつかった瞬間の一撃を「止まっている」と読み違えないための保険
 */
const MAX_REST_SPEED = 0.35;
/** 「遅い」が何秒続いたら止めるか。その場で止めると斜面のものが加速できない */
const REST_TIME = 0.14;
/**
 * 「下から支えられている」とみなす接触法線の縦成分（y は下向きに正）。
 * 眠っているホールドには重力を乗せない（`integrate`）ので、
 * 支えが無くなったら起こさないと、横の接触だけで宙に浮いたままになる
 */
const SUPPORT_NY = 0.1;
/** 反発を効かせる下限の相対速度。触れているだけの接触で跳ねさせない */
const BOUNCE_THRESHOLD = 0.3;

/** 1フレームを何回に割って進めるか */
export const SUBSTEPS = 4;
/** フレーム落ちしても物理が壊れないよう、1フレームの上限を決めておく */
const MAX_DT = 1 / 30;
/** 合体とみなす隙間 */
const MERGE_GAP = 0.004;

function invMass(h: Hold): number {
  return 1 / shapeOf(h.tier).area;
}


function invInertia(h: Hold): number {
  return 1 / shapeOf(h.tier).inertia;
}

function clampSpeed(h: Hold): void {
  const s = Math.hypot(h.vx, h.vy);
  if (s > MAX_SPEED) {
    h.vx = (h.vx / s) * MAX_SPEED;
    h.vy = (h.vy / s) * MAX_SPEED;
  }
  if (h.spin > MAX_SPIN) h.spin = MAX_SPIN;
  else if (h.spin < -MAX_SPIN) h.spin = -MAX_SPIN;
}

/**
 * 接触点1つぶんの力を当てる（法線の跳ね返し＋接線の摩擦）。
 *
 * **接触点の速度（`v + ω×r`）で見る。** 中心の速度で摩擦をかけると
 * 効きが「転がり」ではなく「接着」になる（フルーツ版で踏んだ罠。
 * docs/features/game-bouldering-merge.md の「引き継ぐもの」）
 *
 * @param b `null` なら壁・床（動かない相手）
 */
function applyImpulse(
  a: Hold,
  b: Hold | null,
  px: number,
  py: number,
  nx: number,
  ny: number,
  friction: number,
  bias = 0,
): void {
  const rax = px - a.x;
  const ray = py - a.y;
  const rbx = b ? px - b.x : 0;
  const rby = b ? py - b.y : 0;

  const ima = invMass(a);
  const iia = invInertia(a);
  const imb = b ? invMass(b) : 0;
  const iib = b ? invInertia(b) : 0;

  // 接触点での相対速度（b から見た a ではなく、a から b へ向かう法線に合わせる）
  const vax = a.vx - a.spin * ray;
  const vay = a.vy + a.spin * rax;
  const vbx = b ? b.vx - b.spin * rby : 0;
  const vby = b ? b.vy + b.spin * rbx : 0;
  const rvx = vbx - vax;
  const rvy = vby - vay;

  const vn = rvx * nx + rvy * ny;
  // `bias` はめり込みを押し返すための下駄（Baumgarte）。
  // 離れていく向きでも、まだ刺さっていれば押し返す
  if (vn >= 0 && bias <= 0) return;

  const raCrossN = rax * ny - ray * nx;
  const rbCrossN = rbx * ny - rby * nx;
  const kn = ima + imb + raCrossN * raCrossN * iia + rbCrossN * rbCrossN * iib;
  if (kn <= 0) return;

  // 触れているだけの接触では跳ねさせない（跳ねると山が落ち着かない）
  const e = -vn > BOUNCE_THRESHOLD ? RESTITUTION : 0;
  const jn = (-(1 + e) * vn + bias) / kn;
  if (jn <= 0) return;

  a.vx -= nx * jn * ima;
  a.vy -= ny * jn * ima;
  a.spin -= raCrossN * jn * iia;
  if (b) {
    b.vx += nx * jn * imb;
    b.vy += ny * jn * imb;
    b.spin += rbCrossN * jn * iib;
  }

  // 接線（摩擦）。**ここが「転がり」を生む**
  const tx = -ny;
  const ty = nx;
  const vax2 = a.vx - a.spin * ray;
  const vay2 = a.vy + a.spin * rax;
  const vbx2 = b ? b.vx - b.spin * rby : 0;
  const vby2 = b ? b.vy + b.spin * rbx : 0;
  const vt = (vbx2 - vax2) * tx + (vby2 - vay2) * ty;
  if (vt === 0) return;

  const raCrossT = rax * ty - ray * tx;
  const rbCrossT = rbx * ty - rby * tx;
  const kt = ima + imb + raCrossT * raCrossT * iia + rbCrossT * rbCrossT * iib;
  if (kt <= 0) return;

  // クーロン摩擦。法線の力を超えないところで頭打ちにする
  let jt = -vt / kt;
  const max = friction * Math.abs(jn);
  if (jt > max) jt = max;
  else if (jt < -max) jt = -max;

  a.vx -= tx * jt * ima;
  a.vy -= ty * jt * ima;
  a.spin -= raCrossT * jt * iia;
  if (b) {
    b.vx += tx * jt * imb;
    b.vy += ty * jt * imb;
    b.spin += rbCrossT * jt * iib;
  }
}

/**
 * 壁と床。**上は開いている**（落とし口なので蓋をしない）。
 *
 * 多角形なので「半径ぶん内側」では済まない。**はみ出した頂点それぞれ**を
 * 押し戻し、その頂点で力を当てる（角で立ったまま止まる、傾いて落ちる、
 * といった動きはここから出る）
 */
/** 箱の面。上は開いている（落とし口なので蓋をしない） */
const WALL_FACES: { nx: number; ny: number; limit: number; axis: 0 | 1; sign: 1 | -1 }[] = [
  { nx: 1, ny: 0, limit: 0, axis: 0, sign: -1 }, // 左の壁
  { nx: -1, ny: 0, limit: BOX_W, axis: 0, sign: 1 }, // 右の壁
  { nx: 0, ny: -1, limit: BOX_H, axis: 1, sign: 1 }, // 床
];

interface WallHit {
  nx: number;
  ny: number;
  over: number;
  px: number;
  py: number;
}

/**
 * 床に載っているか。
 *
 * 眠っているホールドは沈まないので、`wallOverlap`（はみ出し）では
 * 床との接触が取れない。頂点が床から `SLOP_RATIO` の幅にあれば載っているとみなす
 */
function onFloor(h: Hold): boolean {
  const tol = shapeOf(h.tier).bound * SLOP_RATIO;
  for (const [, y] of worldPoints(h)) {
    if (y >= BOX_H - tol) return true;
  }
  return false;
}

/** 面ごとに、いちばん外に出ている頂点と、その出っ張り量 */
function wallOverlap(h: Hold): WallHit[] {
  const pts = worldPoints(h);
  const out: WallHit[] = [];
  for (const f of WALL_FACES) {
    let worst = 0;
    let wx = 0;
    let wy = 0;
    for (const [x, y] of pts) {
      const v = f.axis === 0 ? x : y;
      const over = f.sign === 1 ? v - f.limit : f.limit - v;
      if (over > worst) {
        worst = over;
        wx = x;
        wy = y;
      }
    }
    if (worst > 0) out.push({ nx: f.nx, ny: f.ny, over: worst, px: wx, py: wy });
  }
  return out;
}

/**
 * 壁・床から受ける力だけを当てる。**位置は動かさない。**
 *
 * 力の解決を繰り返している最中に位置を動かすと、
 * 組ごとに1回だけ取ってある当たり判定（`Contact`）の前提が崩れて、
 * 積んだ山が落ち着かなくなる（実測で1秒あたり許容の6倍動いていた）。
 * 押し戻しは `correctWalls` に分けてある
 */
function wallImpulses(h: Hold): boolean {
  const hits = wallOverlap(h);
  for (const w of hits) {
    applyImpulse(h, null, w.px, w.py, -w.nx, -w.ny, FRICTION);
  }
  return hits.length > 0;
}

/**
 * 壁・床から押し出す（位置だけ）。
 *
 * **ここには「許すめり込み」を入れない。** 箱からはみ出して見えるのは、
 * 山がわずかに動き続けるより悪い（実測：外接円の3%を許したら、
 * 大きいホールドの頂点が15個も箱の外に出た）。箱は硬い制約として扱う
 */
function correctWalls(h: Hold): WallHit[] {
  const hits = wallOverlap(h);
  for (const w of hits) {
    h.x += w.nx * w.over;
    h.y += w.ny * w.over;
    if (w.nx !== 0) h.vx *= WALL_RESTITUTION;
    else if (h.vy > 0) h.vy *= WALL_RESTITUTION;
  }
  return hits;
}

/* ------------------------------------------------------------------ *
 * 状態と進行
 * ------------------------------------------------------------------ */

/** このフレームで起きた合体。**UIの演出用で、状態の判断には使わない** */
export interface MergeEvent {
  x: number;
  y: number;
  /** できあがった段。最大同士を消したときは -1 */
  tier: number;
  gain: number;
  chain: number;
}

export interface BoulderingMergeState {
  holds: Hold[];
  hold: number;
  next: number;
  aim: number;
  score: number;
  status: 'playing' | 'gameover';
  chain: number;
  chainSec: number;
  overSec: number;
  dropCool: number;
  cleared: number;
  merges: number;
  events: MergeEvent[];
  seed: number;
  nextId: number;
}

/** mulberry32。同じ種から同じ盤面が出る（`Math.random()` は使わない） */
export function nextRandom(seed: number): { seed: number; value: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  t = t | 0;
  return { seed: t, value };
}

function pickTier(seed: number): { seed: number; tier: number } {
  const next = nextRandom(seed);
  return { seed: next.seed, tier: Math.floor(next.value * DROPPABLE_TIERS) % DROPPABLE_TIERS };
}

function makeHold(id: number, tier: number, x: number, y: number, landed: boolean): Hold {
  return {
    id,
    tier,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    spin: 0,
    landed,
    restSec: 0,
    restX: x,
    restY: y,
  };
}

export function initialState(seed = 1): BoulderingMergeState {
  const first = pickTier(seed);
  const second = pickTier(first.seed);
  return {
    holds: [],
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

export function restart(seed = 1): BoulderingMergeState {
  return initialState(seed);
}

/** 落とす横位置を決める。壁を突き抜けないよう外接円ぶん内側に寄せる */
export function aimAt(state: BoulderingMergeState, x: number): BoulderingMergeState {
  const r = boundOf(state.hold);
  return { ...state, aim: Math.min(Math.max(x, r), BOX_W - r) };
}

export function canDrop(state: BoulderingMergeState): boolean {
  return state.status === 'playing' && state.dropCool <= 0;
}

export function drop(state: BoulderingMergeState): BoulderingMergeState {
  if (!canDrop(state)) return state;
  const r = boundOf(state.hold);
  const x = Math.min(Math.max(state.aim, r), BOX_W - r);
  const picked = pickTier(state.seed);
  return {
    ...state,
    holds: [...state.holds, makeHold(state.nextId, state.hold, x, DROP_Y, false)],
    hold: state.next,
    next: picked.tier,
    seed: picked.seed,
    nextId: state.nextId + 1,
    dropCool: DROP_INTERVAL,
  };
}

/**
 * 速度と位置を進める。
 *
 * **眠っているホールドには重力も動きも与えない。** 速度を0にするだけだと、
 * 次のサブステップで重力がまた乗って1歩ぶん沈み、押し戻しが接触の法線に
 * 沿って返す。**斜めの接触では、その差し引きが横向きに残る。** 眠ったまま
 * 毎ステップ同じ向きに 6e-6 ずつ流れ、実測では落ち着いた山の1つが30秒で
 * 0.045（最小の外接円を超える）動き、種によっては8回も勝手に合体した
 * （8種のうち4種で起きていた）。起こす条件は `solveContacts` の末尾
 */
function integrate(holds: Hold[], dt: number): void {
  const damp = Math.max(0, 1 - AIR * dt);
  for (const h of holds) {
    if (h.restSec >= REST_TIME) continue;
    h.vy += GRAVITY * dt;
    h.vx *= damp;
    h.vy *= damp;
    h.spin *= damp;
    clampSpeed(h);
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    h.angle += h.spin * dt;
  }
}

/**
 * 1サブステップぶんの接触を解く。
 *
 * **当たり判定（SAT）は1回だけ、力の解決だけを繰り返す。**
 * 円のときは判定ごと繰り返していたが、SAT はそれには重すぎる
 */
function solveContacts(holds: Hold[], dt: number): void {
  const touched = new Array<boolean>(holds.length).fill(false);
  /** 下から支えられているか（相手のホールドか床）。眠りを続けてよいかの条件 */
  const supported = new Array<boolean>(holds.length).fill(false);
  const pairs: { i: number; j: number; c: Contact }[] = [];

  for (let i = 0; i < holds.length; i += 1) {
    for (let j = i + 1; j < holds.length; j += 1) {
      const c = collide(holds[i], holds[j]);
      if (!c) continue;
      pairs.push({ i, j, c });
      touched[i] = true;
      touched[j] = true;
      // 法線は i から j へ向く。下向きなら i が j に載っている
      if (c.ny > SUPPORT_NY) supported[i] = true;
      else if (c.ny < -SUPPORT_NY) supported[j] = true;
    }
  }

  /**
   * 力の解決。**めり込みは「位置を直接動かす」のではなく、
   * 押し返す速度（bias）として法線の力に混ぜる。**
   *
   * 位置を直接動かす作りだと、速度を0にして眠らせても押し戻しが位置を
   * 動かしてしまい、**全部眠っているのに山が動き続けた**
   * （実測で1秒あたり0.002、80秒経っても止まらない）。
   * 速度に混ぜてしまえば、眠らせる処理がそのまま効く
   */
  for (let it = 0; it < ITERATIONS; it += 1) {
    for (const { i, j, c } of pairs) {
      for (const [px, py] of c.points) {
        applyImpulse(holds[i], holds[j], px, py, c.nx, c.ny, FRICTION);
      }
    }
    for (let i = 0; i < holds.length; i += 1) {
      if (wallImpulses(holds[i])) touched[i] = true;
    }
  }

  /**
   * 押し戻し（位置）。**繰り返す必要がある。**
   *
   * 1回だけだと押し戻しが山の下まで伝わらず、36個の山で
   * **小さい方の3割**までめり込んでいた（許容は1割）。
   * 1回の押し戻しは1接触ぶんしか伝わらないので、山の深さぶんだけ回数が要る。
   *
   * **接触点ごとではなく組ごとに押す。** 点の数だけ押すと、
   * 面で接している組が弾け飛ぶ
   */
  for (let pass = 0; pass < POSITION_PASSES; pass += 1) {
    for (const { i, j, c } of pairs) {
      const a = holds[i];
      const b = holds[j];
      const ima = invMass(a);
      const imb = invMass(b);
      const inv = ima + imb;
      if (inv <= 0) continue;
      // 押したぶん浅くなっているので、そのつど測りなおす
      const depth = depthAlong(a, b, c.nx, c.ny);
      const slop = Math.min(shapeOf(a.tier).bound, shapeOf(b.tier).bound) * SLOP_RATIO;
      if (depth <= slop) continue;
      const push = ((depth - slop) * CORRECTION) / inv;
      a.x -= c.nx * push * ima;
      a.y -= c.ny * push * ima;
      b.x += c.nx * push * imb;
      b.y += c.ny * push * imb;
    }
    // 箱は硬い制約なので、押し合いのあとに必ず入れ直す
    for (let i = 0; i < holds.length; i += 1) {
      const hits = correctWalls(holds[i]);
      if (hits.length === 0) continue;
      touched[i] = true;
      if (hits.some((w) => w.ny !== 0)) supported[i] = true; // 床
    }
  }

  /**
   * 震え止め。**「速さ」ではなく「どれだけ動いたか」で判断する。**
   *
   * 多角形の山は、面で支え合っているぶん力の解決が完全には収束せず、
   * **その場で振動する**。実測では38個の山の全部が速さ0.02〜0.06を持っていて、
   * それでも1秒の移動は0.0015しかなかった（つまり行ったり来たりしている）。
   * 速さで見ると `REST_SPEED` をいつまでも下回らず、**1つも止まらなかった**。
   *
   * 本当に見たいのは「どこかへ行こうとしているか」なので、基準の位置からの
   * 移動で見る。振動しているだけなら移動は増えないので止まり、
   * 転がり落ちている最中のものは移動が伸びるので止まらない。
   *
   * 眠ったホールドは `integrate` が進めない（重力も乗らない）。
   * それでも押し戻しでは動くので、上に載られれば譲るし、基準から
   * `room` を超えて押されれば起きる。加えて**支えを失ったときも起こす**
   * （`supported`）。重力が乗らないので、合体で真下が消えても横の接触が
   * 残っている限り宙に浮いたままになる。
   *
   * 「深く刺されたら起こす」は**やらない**。床の上の薄い板に重いホールドが
   * 載ると、押し戻しの取り分（質量の逆比）では板が床に押し返されるだけで
   * めり込みが7%で釣り合う。それを起こし続けると2つとも眠れず、
   * 震えが続いて9秒後に山を崩した（種16）。生まれたホールドの周りは
   * `resolveMerges` で起こす
   */
  for (let i = 0; i < holds.length; i += 1) {
    const h = holds[i];
    const room = shapeOf(h.tier).bound * REST_MOVE;
    const moved = Math.hypot(h.x - h.restX, h.y - h.restY);
    if (!supported[i] && onFloor(h)) {
      touched[i] = true;
      supported[i] = true;
    }
    if (
      !touched[i] ||
      !supported[i] ||
      moved > room ||
      Math.hypot(h.vx, h.vy) > MAX_REST_SPEED
    ) {
      h.restSec = 0;
      h.restX = h.x;
      h.restY = h.y;
      continue;
    }
    h.restSec += dt;
    if (h.restSec >= REST_TIME) {
      h.vx = 0;
      h.vy = 0;
      h.spin = 0;
    }
  }
}

/* ------------------------------------------------------------------ *
 * 合体
 * ------------------------------------------------------------------ */

interface MergeOutcome {
  holds: Hold[];
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
 * **1回の呼び出しで1つのホールドは1度しか合体しない。** 3つ並んでいるときに
 * 玉突きで2回合体すると、どちらの組が合体したのかが見た目と食い違う
 */
function resolveMerges(
  holds: Hold[],
  state: BoulderingMergeState,
  dt: number,
): MergeOutcome {
  const used = new Set<number>();
  const born: Hold[] = [];
  const events: MergeEvent[] = [];
  let score = state.score;
  let chain = state.chain;
  let chainSec = Math.max(0, state.chainSec - dt);
  let cleared = state.cleared;
  let merges = state.merges;
  let nextId = state.nextId;

  for (let i = 0; i < holds.length; i += 1) {
    const a = holds[i];
    if (used.has(a.id)) continue;
    for (let j = i + 1; j < holds.length; j += 1) {
      const b = holds[j];
      if (used.has(b.id) || a.tier !== b.tier) continue;

      // 外接円で先に弾く（SATを全組に走らせない）
      const reach = shapeOf(a.tier).bound + shapeOf(b.tier).bound + MERGE_GAP;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      if (!collide(a, b)) continue;

      used.add(a.id);
      used.add(b.id);
      merges += 1;
      chain = chainSec > 0 ? Math.min(chain + 1, CHAIN_MAX) : 1;
      chainSec = CHAIN_WINDOW;
      const mult = chain;
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;

      if (a.tier >= MAX_TIER) {
        // 最大どうしは消えてボーナス
        cleared += 1;
        const gain = CLEAR_BONUS * mult;
        score += gain;
        events.push({ x, y, tier: -1, gain, chain });
      } else {
        const tier = a.tier + 1;
        const gain = mergePoints(tier) * mult;
        score += gain;
        const grown = makeHold(
          nextId,
          tier,
          x,
          y,
          a.landed || b.landed || y - shapeOf(tier).bound > LINE_Y,
        );
        // 回り方だけ引き継ぐ（新しいホールドなので向きは0から）
        grown.spin = (a.spin + b.spin) / 2;
        grown.vx = (a.vx + b.vx) / 2;
        grown.vy = (a.vy + b.vy) / 2;
        born.push(grown);
        nextId += 1;
        events.push({ x, y, tier, gain, chain });
      }
      break;
    }
  }

  // **生まれたホールドを箱の中に収める。** 親より大きく、形も違うので、
  // 親の中点に置くと壁・床に刺さる（フルーツ版で床ぎわの合体が
  // 箱から出ていた件の一般化）
  for (const h of born) {
    for (let k = 0; k < 4; k += 1) {
      if (correctWalls(h).length === 0) break;
    }
    h.vx = 0;
    h.vy = 0;
  }

  const kept = used.size === 0 ? holds : holds.filter((h) => !used.has(h.id));

  // **生まれたホールドに触れているものを起こす。** 親より大きいので周りに刺さる。
  // 眠ったままだと押し戻しに譲るだけで、回って逃げられず、山の中に
  // 小さい方の外接円の15%のめり込みが残った（種8）
  for (const b of born) {
    for (const h of kept) {
      if (h.restSec < REST_TIME || !collide(h, b)) continue;
      h.restSec = 0;
      h.restX = h.x;
      h.restY = h.y;
    }
  }
  return {
    holds: born.length === 0 ? kept : [...kept, ...born],
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

export function step(
  state: BoulderingMergeState,
  dt: number,
  substeps = SUBSTEPS,
): BoulderingMergeState {
  const clamped = Math.min(Math.max(dt, 0), MAX_DT);
  if (state.status === 'gameover') {
    return state.events.length ? { ...state, events: [] } : state;
  }

  const holds = state.holds.map((h) => ({ ...h }));
  const steps = Math.max(1, Math.floor(substeps));
  const sub = clamped / steps;
  for (let s = 0; s < steps; s += 1) {
    integrate(holds, sub);
    solveContacts(holds, sub);
  }

  const merged = resolveMerges(holds, state, clamped);

  // ラインをくぐったものだけを判定の対象にする
  for (const h of merged.holds) {
    if (!h.landed && h.y - shapeOf(h.tier).bound > LINE_Y) h.landed = true;
  }

  let overSec = state.overSec;
  const over = merged.holds.some(
    (h) => h.landed && h.y - shapeOf(h.tier).bound < LINE_Y && Math.hypot(h.vx, h.vy) < 0.35,
  );
  overSec = over ? overSec + clamped : 0;

  return {
    ...state,
    holds: merged.holds,
    score: merged.score,
    chain: merged.chainSec > 0 ? merged.chain : 0,
    chainSec: merged.chainSec,
    cleared: merged.cleared,
    merges: merged.merges,
    events: merged.events,
    nextId: merged.nextId,
    dropCool: Math.max(0, state.dropCool - clamped),
    overSec,
    status: overSec >= OVER_LIMIT ? 'gameover' : 'playing',
  };
}

/** ラインを超えていて警告を出すべきか */
export function isWarning(state: BoulderingMergeState): boolean {
  return state.status === 'playing' && state.overSec > 0;
}

/**
 * 落下予測線。真下にあるホールドの上で止める。
 * 多角形なので外接円で近似する（線の役目は「だいたいここ」を示すこと）
 */
export function dropPreviewY(state: BoulderingMergeState): number {
  const r = boundOf(state.hold);
  let best = BOX_H - r;
  for (const h of state.holds) {
    const hr = shapeOf(h.tier).bound;
    if (Math.abs(h.x - state.aim) > r + hr) continue;
    const top = h.y - hr - r;
    if (top < best) best = top;
  }
  return Math.max(DROP_Y, best);
}

/* ------------------------------------------------------------------ *
 * 確認用（URLに ?debug=1 を付けると画面にボタンが出る）
 * ------------------------------------------------------------------ */

/** 11段を並べる。段ごとの形・色を見比べるため */
export function debugLadder(state: BoulderingMergeState): BoulderingMergeState {
  const holds: Hold[] = [];
  let id = state.nextId;
  let x = 0.1;
  for (let tier = 0; tier <= MAX_TIER; tier += 1) {
    const r = shapeOf(tier).bound;
    x = Math.min(Math.max(x + r, r), BOX_W - r);
    holds.push(makeHold(id, tier, x, BOX_H - r, true));
    id += 1;
    x += r;
    if (x > BOX_W - r) x = 0.1;
  }
  return { ...state, holds, nextId: id, status: 'playing', overSec: 0 };
}

/**
 * 山を作る。**積み上がりの安定を確かめる手段**（仕様書の公開の条件2）。
 * 置いた瞬間は重ならないよう、下から順に詰めていく
 */
export function debugFill(
  state: BoulderingMergeState,
  count: number,
  seed = 7,
): BoulderingMergeState {
  const holds: Hold[] = [];
  let id = state.nextId;
  let s = seed;
  let y = BOX_H;
  let x = 0;
  let rowMax = 0;

  for (let n = 0; n < count; n += 1) {
    const pick = nextRandom(s);
    s = pick.seed;
    const tier = Math.floor(pick.value * DROPPABLE_TIERS) % DROPPABLE_TIERS;
    const r = shapeOf(tier).bound;
    if (x + r * 2 > BOX_W) {
      // 次の段へ
      y -= rowMax * 2;
      x = 0;
      rowMax = 0;
    }
    if (y - r * 2 < LINE_Y) break;
    holds.push(makeHold(id, tier, x + r, y - r, true));
    id += 1;
    x += r * 2;
    rowMax = Math.max(rowMax, r);
  }
  return { ...state, holds, nextId: id, status: 'playing', overSec: 0 };
}
