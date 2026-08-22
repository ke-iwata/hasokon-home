'use client';

import { useEffect, useState } from 'react';

/**
 * 立体的に転がるサイコロ（ヨット用）。
 *
 * WebGLもライブラリも使わず、CSSの3D変換だけで作る。立方体は面が6つしかないので
 * これで十分で、依存を増やさずに済む。**同じ作りを `tools/app/_roulette/Dice3D.tsx`
 * （サイコロツール）でも使っている。踏んだ罠はどちらも同じなので、片方を直したら
 * もう片方も見ること**（別アプリなのでコードは共有できない）。
 *
 * ヨット固有の事情が2つある:
 * - サイコロは押せる（キープの切り替え）。立方体はボタンの中に置く
 * - **キープした駒は転がさない。** 振り直しても手元に残っているのが見えないと、
 *   キープが効いているのか分からない。転がすかどうかは `spinKey` の変化で決める
 */

/** 面ごとの目の位置（3×3のマス目の座標） */
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

/**
 * 立方体のどの面にどの目を貼るか。
 * **向かい合う面の和が7**になる、実際のサイコロと同じ配置にしてある
 */
const FACES = ['front', 'back', 'right', 'left', 'top', 'bottom'] as const;
const FACE_PIP: Record<string, number> = {
  front: 1,
  back: 6,
  right: 3,
  left: 4,
  top: 2,
  bottom: 5,
};

/** 面の法線（立方体そのものの向きでの値） */
const FACE_NORMAL: Record<string, [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, -1, 0],
  bottom: [0, 1, 0],
};

/** その目を手前に向けるための回転角 [X, Y]。面を配置した回転の逆をかける */
const FACE_ROTATION: Record<number, [number, number]> = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
};

/**
 * 見る角度。少し上と横から覗く程度にする。
 * 正面から見ると立方体が正方形にしか見えず、平面と区別が付かない
 */
const TILT_X = 15;
const TILT_Y = -18;

/** 光の向き。左上手前から当てる（画面座標なのでYは下が正） */
const LIGHT: [number, number, number] = [-0.34, -0.66, 0.67];

const rad = (deg: number) => (deg * Math.PI) / 180;

/** CSSの rotateX と同じ回転 */
function rotX([x, y, z]: [number, number, number], deg: number): [number, number, number] {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [x, y * c - z * s, y * s + z * c];
}

/** CSSの rotateY と同じ回転 */
function rotY([x, y, z]: [number, number, number], deg: number): [number, number, number] {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [x * c + z * s, y, -x * s + z * c];
}

/**
 * 面の陰の濃さ（0〜1）を求める。
 *
 * **面ごとに固定の陰影を付けると、出目が変わって立方体が回った瞬間に
 * 手前の面が暗くなって破綻する。** 止まったときの向きから法線を計算して、
 * そのつど濃さを決めている。陰が無いと白い面が並ぶだけで紙のように見える
 */
export function shadeOf(faceCls: string, rx: number, ry: number): number {
  const n = rotY(rotX(rotX(rotY(FACE_NORMAL[faceCls], ry), rx), TILT_X), TILT_Y);
  const dot = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
  return 0.2 * (1 - Math.max(0, dot));
}

/**
 * 番号から決まる擬似乱数（0〜1）。
 *
 * **`Math.random()` を使わない。** このゲームは静的書き出しなので、描画のたびに
 * 値が変わるとサーバー側で書き出したHTMLと食い違う。転がり方が毎回違って
 * 見えれば足りるので、番号から決まる値で十分
 */
function noise(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * この端末で立体表示が実際に効くかを確かめる。
 *
 * `transform-style: preserve-3d` は「対応している」と報告されても、端末や
 * ブラウザによっては平面に潰れて描画されることがある。宣言の有無だけでは
 * 分からないので、実際に描かせて測る。
 *
 * 45度回した親の中で -45度回した子を作り、打ち消し合って元の幅に戻れば
 * 立体が効いている。潰れていれば cos45（約71%）に縮む。
 */
function detect3D(): boolean {
  if (typeof window === 'undefined' || typeof CSS === 'undefined') return false;
  if (!CSS.supports('transform-style', 'preserve-3d')) return false;

  const outer = document.createElement('div');
  outer.setAttribute(
    'style',
    'position:fixed;top:-9999px;left:0;width:100px;height:100px;' +
      'transform:rotateY(45deg);transform-style:preserve-3d;pointer-events:none;',
  );
  const inner = document.createElement('div');
  inner.setAttribute('style', 'position:absolute;inset:0;transform:rotateY(-45deg);');
  outer.appendChild(inner);
  document.body.appendChild(outer);
  const width = inner.getBoundingClientRect().width;
  document.body.removeChild(outer);

  return width > 90;
}

/**
 * 立体で描いてよいか・動かしてよいかを1回だけ調べる。
 *
 * **サイコロ5個それぞれで測らない**（同じ判定を5回やることになる）。
 * 判定はマウント後にしかできないので、判定前は平面で出しておき、
 * 使えると分かった時点で立体へ切り替える（逆だと崩れた状態が一瞬見える）
 */
export function useDiceLook(): { can3D: boolean; animate: boolean } {
  const [can3D, setCan3D] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setCan3D(detect3D());
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return { can3D, animate: !reduceMotion };
}

/** 立体が使えないときの平面表示（元からある3×3の目） */
function FlatDie({ face }: { face: number }) {
  return (
    <span className="yc-face" aria-hidden="true">
      <svg viewBox="0 0 3 3">
        {(PIPS[face] ?? PIPS[1]).map(([x, y], k) => (
          <circle key={k} cx={x + 0.5} cy={y + 0.5} r="0.3" />
        ))}
      </svg>
    </span>
  );
}

interface Props {
  face: number;
  /** 振るたびに増える番号。変わると転がる動きをやり直す（キープ中は増えない） */
  spinKey: number;
  can3D: boolean;
  animate: boolean;
}

export default function Die3D({ face, spinKey, can3D, animate }: Props) {
  if (!can3D) return <FlatDie face={face} />;

  const [rx, ry] = FACE_ROTATION[face] ?? FACE_ROTATION[1];

  // 振るたびに回り方を変える。**軸はどの成分もそこそこ大きい斜めにする。**
  // X軸やY軸だけで回すと、視線と揃った向きを頻繁に通って平たく見える
  const k = spinKey * 3;
  const axis: [number, number, number] = [
    0.5 + noise(k) * 0.5,
    0.4 + noise(k + 1) * 0.4,
    0.3 + noise(k + 2) * 0.4,
  ];
  // 回転量。多いほど勢いよく見えるが、増やしすぎると1コマあたりの角度が
  // 大きくなり、回っているというよりちらついて見える
  const spin = (3 + noise(k + 7) * 1.5) * 360;

  const style = {
    '--rx': `${rx}deg`,
    '--ry': `${ry}deg`,
    '--ax': `${axis[0]}`,
    '--ay': `${axis[1]}`,
    '--az': `${axis[2]}`,
    '--spin': `${spin}deg`,
    '--tilt-x': `${TILT_X}deg`,
    '--tilt-y': `${TILT_Y}deg`,
  } as React.CSSProperties;

  return (
    // spinKey が変わるたびに作り直して、転がる動きを最初から流す。
    // キープ中の駒は spinKey が変わらないので、その場に残る
    <span className="yc-cube-wrap" aria-hidden="true">
      <span key={spinKey} className={`yc-cube${animate ? ' rolling' : ''}`} style={style}>
        {FACES.map((cls) => (
          <span
            key={cls}
            className={`yc-cube-face ${cls}`}
            // 巨大な inset シャドウを陰の代わりに使う。**`filter` を使うと
            // 重ね合わせの文脈ができて立体が潰れる**
            style={{
              boxShadow: `inset 0 0 0 999px rgba(15, 23, 42, ${shadeOf(cls, rx, ry).toFixed(3)})`,
            }}
          >
            <svg viewBox="0 0 3 3">
              {(PIPS[FACE_PIP[cls]] ?? PIPS[1]).map(([x, y], j) => (
                <circle key={j} cx={x + 0.5} cy={y + 0.5} r="0.3" />
              ))}
            </svg>
          </span>
        ))}
      </span>
    </span>
  );
}
