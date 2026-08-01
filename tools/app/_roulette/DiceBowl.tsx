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

/**
 * その目を front 面（＝お椀の中では上を向く面）に持ってくる回転角 [X, Y]。
 * 面を配置したときの回転の逆をかければよい。
 */
const FACE_ROTATION: Record<number, [number, number]> = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
}

/**
 * お椀を見下ろす角度。
 * 0度が真上から。大きくすると浅い角度になり、上面より手前の側面が
 * 大きく見えて出目が読みにくくなるので、上から覗き込む程度に抑える
 */
const TILT = 34

/** 光の向き。左上手前から当てる（画面座標なのでYは下が正） */
const LIGHT: [number, number, number] = [-0.32, -0.72, 0.61]

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
 * 破綻する。転がり終わりの向きから法線を計算して、そのつど濃さを決めている。
 */
function shadeOf(faceCls: string, rx: number, ry: number): number {
  const n = rotX(rotX(rotY(FACE_NORMAL[faceCls], ry), rx), TILT)
  const dot = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]
  return 0.17 * (1 - Math.max(0, dot))
}

/** 個数が増えるほど小さくして、お椀に収まるようにする */
export function dieSize(count: number): number {
  if (count <= 2) return 62
  if (count <= 4) return 54
  if (count <= 6) return 46
  if (count <= 8) return 40
  return 36
}

interface Placement {
  x: number
  y: number
  /**
   * 転がる軸。X軸とY軸の回転を重ねると、視線と揃った向きを頻繁に通るため
   * 「平たいコインが回っている」ように見えてしまう。斜めの軸を1本決めて
   * その周りだけを回すと、素直に転がって見える
   */
  axis: [number, number, number]
  /** 転がり始めの回転量（度）。0まで戻しながら転がす */
  spin: number
}

/** お椀の中に散らす位置を決める */
function scatter(count: number, size: number): Placement[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.8
    // 個数が増えるほど広げないと重なる。お椀からはみ出さない範囲で頭打ちにする
    // 上から見下ろす角度は浅い（34度）ので、奥行きはほとんど潰れない。
    // お椀の内側に収まる範囲で抑える
    const radius = count === 1 ? 0 : Math.min(64, size * 0.34 + count * 4) + Math.random() * 10
    return {
      x: Math.cos(angle) * radius,
      // 上から見下ろす角度で奥行きは自然に潰れるので、ここでは縮めない
      y: Math.sin(angle) * radius,
      // どの成分もそこそこ大きい斜めの軸にする
      axis: [0.5 + Math.random() * 0.5, 0.4 + Math.random() * 0.4, 0.3 + Math.random() * 0.4],
      // 速すぎると回っているのが見えず、ちらついて平面に見える
      spin: (1.25 + Math.random() * 0.75) * 360,
    }
  })
}

function Die({
  value,
  faces,
  place,
  size,
  animate,
}: {
  value: number
  faces: number
  place: Placement
  size: number
  animate: boolean
}) {
  // 6面は出目の面が上を向くように回す。
  // それ以外は数字を front 面だけに出すので、front が上に来る向き（回転なし）に固定する
  const [rx, ry] = faces === 6 ? (FACE_ROTATION[value] ?? FACE_ROTATION[1]) : [0, 0]

  // 入れ子の preserve-3d は iOS Safari で平面に潰れることがあるため、
  // 見下ろす角度・位置・向きをすべて1つの transform にまとめ、
  // 3Dの階層をこの要素だけにしている
  const style = {
    '--x': `${place.x}px`,
    '--y': `${place.y}px`,
    '--rx': `${rx}deg`,
    '--ry': `${ry}deg`,
    '--ax': `${place.axis[0]}`,
    '--ay': `${place.axis[1]}`,
    '--az': `${place.axis[2]}`,
    '--spin': `${animate ? place.spin : 0}deg`,
    '--tilt': `${TILT}deg`,
    '--size': `${size}px`,
  } as React.CSSProperties

  return (
    <div
      className={`die3d ${animate ? 'rolling' : ''}`}
      style={style}
      role="img"
      aria-label={`${value}`}
    >
      {FACES.map((cls, i) => (
        <div
          key={cls}
          className={`die3d-face ${cls}`}
          // 巨大な inset シャドウを陰の代わりに使う。filter を使うと
          // 重ね合わせの文脈ができて立体が潰れるため
          style={{
            boxShadow: `inset 0 0 0 999px rgba(15, 23, 42, ${shadeOf(cls, rx, ry).toFixed(3)})`,
          }}
        >
          {faces === 6 ? (
            <svg viewBox="0 0 3 3" aria-hidden>
              {(PIPS[FACE_PIP[cls]] ?? PIPS[1]).map(([x, y], k) => (
                <circle key={k} cx={x + 0.5} cy={y + 0.5} r="0.3" />
              ))}
            </svg>
          ) : (
            // 6面より多い数は目で表せないので数字にする。
            // 側面に数字を入れると回転で逆さまに見えるため、上を向く面だけに出す。
            // 読むのは上面だけなので、これで足りる
            cls === 'front' && <span className="die3d-num">{value}</span>
          )}
        </div>
      ))}
    </div>
  )
}

interface Props {
  values: number[]
  /** サイコロの面の数 */
  faces: number
  /** 振るたびに増える番号。変わると転がる動きをやり直す */
  spin: number
}

/**
 * お椀を上から見た形のサイコロ。中で転がって止まる。
 *
 * WebGLは使わずCSSの3D変換で作っている。立方体なら見た目は十分で、
 * ライブラリを増やさずに済み、端末やブラウザを選ばないため。
 * 面が6より多いときも立方体のまま、上を向く面に数字を出す。
 */
export default function DiceBowl({ values, faces, spin }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const size = dieSize(values.length)
  // 振るたびに置き場所を決め直す
  const places = useMemo(() => scatter(values.length, size), [values.length, size, spin])

  return (
    // サイコロは perspective を持つこの要素の直接の子にする。
    // 間に要素を挟むと、そこにも preserve-3d が要り、
    // 入れ子が深いと iOS Safari で立体が潰れることがあるため
    <div className="dice-bowl">
      <div className="dice-bowl-dish" aria-hidden />
      {values.map((v, i) => (
        // spin が変わるたびに作り直して、転がる動きを最初から流す
        <Die
          key={`${spin}-${i}`}
          value={v}
          faces={faces}
          place={places[i]}
          size={size}
          animate={!reduceMotion}
        />
      ))}
    </div>
  )
}
