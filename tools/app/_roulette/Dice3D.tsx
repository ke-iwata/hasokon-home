'use client'

import { useEffect, useMemo, useState } from 'react'

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
}

/**
 * 立方体のどの面にどの目を貼るか。
 * 向かい合う面の和が7になる、実際のサイコロと同じ配置。
 */
const FACES = ['front', 'back', 'right', 'left', 'top', 'bottom'] as const
const FACE_PIP: Record<string, number> = {
  front: 1,
  back: 6,
  right: 3,
  left: 4,
  top: 2,
  bottom: 5,
}

/** 面の法線（立方体そのものの向きでの値） */
const FACE_NORMAL: Record<string, [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, -1, 0],
  bottom: [0, 1, 0],
}

/** その目を手前に向けるための回転角 [X, Y]。面を配置した回転の逆をかける */
const FACE_ROTATION: Record<number, [number, number]> = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
}

/**
 * 見る角度。少し上と横から覗く程度にする。
 * 正面から見ると立方体が正方形にしか見えず、平面と区別が付かない
 */
const TILT_X = 16
const TILT_Y = -20

/** 光の向き。左上手前から当てる（画面座標なのでYは下が正） */
const LIGHT: [number, number, number] = [-0.34, -0.66, 0.67]

const rad = (deg: number) => (deg * Math.PI) / 180

/** CSSの rotateX と同じ回転 */
function rotX([x, y, z]: [number, number, number], deg: number): [number, number, number] {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  return [x, y * c - z * s, y * s + z * c]
}

/** CSSの rotateY と同じ回転 */
function rotY([x, y, z]: [number, number, number], deg: number): [number, number, number] {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  return [x * c + z * s, y, -x * s + z * c]
}

/**
 * 面の陰の濃さ（0〜1）を求める。
 *
 * 面ごとに固定の陰影を付けると、サイコロが回ったときに手前の面が暗くなって
 * 破綻する。止まったときの向きから法線を計算して、そのつど濃さを決めている。
 * 陰が無いと白い面が並ぶだけで、紙のように見えてしまう
 */
function shadeOf(faceCls: string, rx: number, ry: number): number {
  const n = rotY(rotX(rotX(rotY(FACE_NORMAL[faceCls], ry), rx), TILT_X), TILT_Y)
  const dot = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]
  return 0.17 * (1 - Math.max(0, dot))
}

/**
 * この端末で立体表示が実際に効くかを確かめる。
 *
 * transform-style: preserve-3d は「対応している」と報告されても、
 * 端末やブラウザによっては平面に潰れて描画されることがある。
 * 宣言の有無だけでは分からないので、実際に描かせて測る。
 *
 * 45度回した親の中で -45度回した子を作り、打ち消し合って元の幅に
 * 戻れば立体が効いている。潰れていれば cos45（約71%）に縮む。
 */
function detect3D(): boolean {
  if (typeof window === 'undefined' || typeof CSS === 'undefined') return false
  if (!CSS.supports('transform-style', 'preserve-3d')) return false

  const outer = document.createElement('div')
  outer.setAttribute(
    'style',
    'position:fixed;top:-9999px;left:0;width:100px;height:100px;' +
      'transform:rotateY(45deg);transform-style:preserve-3d;pointer-events:none;',
  )
  const inner = document.createElement('div')
  inner.setAttribute('style', 'position:absolute;inset:0;transform:rotateY(-45deg);')
  outer.appendChild(inner)
  document.body.appendChild(outer)
  const width = inner.getBoundingClientRect().width
  document.body.removeChild(outer)

  return width > 90
}

/** 立体が使えないときの平面表示 */
function FlatDie({ value, size, rolling }: { value: number; size: number; rolling: boolean }) {
  return (
    <div
      className={`die-flat ${rolling ? 'rolling' : ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${value}`}
    >
      <svg viewBox="0 0 3 3" aria-hidden>
        {(PIPS[value] ?? PIPS[1]).map(([x, y], k) => (
          <circle key={k} cx={x + 0.5} cy={y + 0.5} r="0.3" />
        ))}
      </svg>
    </div>
  )
}

/** 個数が増えるほど小さくして、横に並べても収まるようにする */
function dieSize(count: number): number {
  if (count <= 2) return 62
  if (count <= 4) return 54
  if (count <= 6) return 46
  return 38
}

function Die({
  value,
  size,
  spin,
  axis,
  animate,
}: {
  value: number
  size: number
  spin: number
  axis: [number, number, number]
  animate: boolean
}) {
  const [rx, ry] = FACE_ROTATION[value] ?? FACE_ROTATION[1]

  // 入れ子の preserve-3d は iOS Safari で平面に潰れることがあるため、
  // 見る角度・向き・回転をすべて1つの transform にまとめ、
  // 3Dの階層をこの要素だけにしている
  const style = {
    '--rx': `${rx}deg`,
    '--ry': `${ry}deg`,
    '--ax': `${axis[0]}`,
    '--ay': `${axis[1]}`,
    '--az': `${axis[2]}`,
    '--spin': `${animate ? spin : 0}deg`,
    '--tilt-x': `${TILT_X}deg`,
    '--tilt-y': `${TILT_Y}deg`,
    '--size': `${size}px`,
  } as React.CSSProperties

  return (
    <div className="die3d-wrap" style={{ width: size, height: size }}>
      <div
        className={`die3d ${animate ? 'rolling' : ''}`}
        style={style}
        role="img"
        aria-label={`${value}`}
      >
        {FACES.map((cls) => (
          <div
            key={cls}
            className={`die3d-face ${cls}`}
            // 巨大な inset シャドウを陰の代わりに使う。filter を使うと
            // 重ね合わせの文脈ができて立体が潰れるため
            style={{
              boxShadow: `inset 0 0 0 999px rgba(15, 23, 42, ${shadeOf(cls, rx, ry).toFixed(3)})`,
            }}
          >
            <svg viewBox="0 0 3 3" aria-hidden>
              {(PIPS[FACE_PIP[cls]] ?? PIPS[1]).map(([x, y], k) => (
                <circle key={k} cx={x + 0.5} cy={y + 0.5} r="0.3" />
              ))}
            </svg>
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  values: number[]
  /** 振るたびに増える番号。変わると転がる動きをやり直す */
  spin: number
  /** 転がっている最中か（平面表示のときだけ使う） */
  rolling: boolean
}

/**
 * 立体的に転がるサイコロ。横に並べて表示する。
 *
 * WebGLは使わずCSSの3D変換で作っている。立方体なら見た目は十分で、
 * ライブラリを増やさずに済むため。
 * 立体が効かない端末では平面表示に切り替える（detect3D 参照）。
 */
export default function Dice3D({ values, spin, rolling }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false)
  // 判定はマウント後にしかできない。判定前は平面で出しておき、
  // 使えると分かった時点で立体に切り替える（逆だと崩れた状態が一瞬見える）
  const [can3D, setCan3D] = useState(false)

  useEffect(() => {
    setCan3D(detect3D())
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const size = dieSize(values.length)

  // 振るたびに回り方を変える。軸はどの成分もそこそこ大きい斜めにする。
  // X軸やY軸だけで回すと、視線と揃った向きを頻繁に通って平たく見えるため
  const rolls = useMemo(
    () =>
      values.map(() => ({
        axis: [
          0.5 + Math.random() * 0.5,
          0.4 + Math.random() * 0.4,
          0.3 + Math.random() * 0.4,
        ] as [number, number, number],
        // 回転量。多いほど勢いよく見える。
        // ただし増やしすぎると1コマあたりの角度が大きくなり、
        // 回っているというよりちらついて見えるので、この辺りが上限
        spin: (3 + Math.random() * 1.5) * 360,
      })),
    // 振るたびに決め直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values.length, spin],
  )

  return (
    <div className="dice-row">
      {values.map((v, i) =>
        can3D ? (
          // spin が変わるたびに作り直して、転がる動きを最初から流す
          <Die
            key={`${spin}-${i}`}
            value={v}
            size={size}
            axis={rolls[i].axis}
            spin={rolls[i].spin}
            animate={!reduceMotion}
          />
        ) : (
          <FlatDie
            key={`${spin}-${i}`}
            value={v}
            size={size}
            rolling={rolling && !reduceMotion}
          />
        ),
      )}
    </div>
  )
}
