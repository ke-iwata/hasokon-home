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
const FACES: { cls: string; value: number }[] = [
  { cls: 'front', value: 1 },
  { cls: 'back', value: 6 },
  { cls: 'right', value: 3 },
  { cls: 'left', value: 4 },
  { cls: 'top', value: 2 },
  { cls: 'bottom', value: 5 },
]

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
/** サイコロの一辺の半分（CSSの .die3d の大きさと合わせる） */
const HALF = 27

interface Placement {
  x: number
  y: number
  /** 転がり終わりの向き（見た目を毎回変えるための余分な回転） */
  turnX: number
  turnY: number
  /** 投げ込まれてくる向き。-1 なら左から、1 なら右から */
  from: number
  /** 投げ込みの遅れ。0にしている（下の scatter のコメント参照） */
  delay: number
}

/**
 * お椀の中に散らす位置を決める。
 * 投げ込みに遅れは付けない。fill-mode を使わない都合上、
 * 待っている間は定位置が見えてしまうため
 */
function scatter(count: number): Placement[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.8
    // 個数が増えるほど広げないと重なる。お椀からはみ出さない範囲で頭打ちにする
    const radius = count === 1 ? 0 : Math.min(90, 20 + count * 8) + Math.random() * 16
    return {
      x: Math.cos(angle) * radius,
      // 上から見下ろす角度で奥行きは自然に潰れるので、ここでは縮めない
      y: Math.sin(angle) * radius,
      turnX: (1 + Math.floor(Math.random() * 2)) * 360,
      turnY: (1 + Math.floor(Math.random() * 2)) * 360,
      from: Math.random() < 0.5 ? -1 : 1,
      delay: 0,
    }
  })
}

function Die({
  value,
  place,
  animate,
}: {
  value: number
  place: Placement
  animate: boolean
}) {
  const [rx, ry] = FACE_ROTATION[value] ?? FACE_ROTATION[1]

  // 入れ子の preserve-3d は iOS Safari で平面に潰れることがあるため、
  // 見下ろす角度・位置・向きをすべて1つの transform にまとめ、
  // 3Dの階層をこの要素だけにしている
  const style = {
    '--x': `${place.x}px`,
    '--y': `${place.y}px`,
    '--rx': `${(animate ? place.turnX : 0) + rx}deg`,
    '--ry': `${(animate ? place.turnY : 0) + ry}deg`,
    '--from-x': `${place.from * 260}px`,
    '--delay': `${place.delay}ms`,
    '--tilt': `${TILT}deg`,
    '--half': `${HALF}px`,
  } as React.CSSProperties

  return (
    <div
      className={`die3d ${animate ? 'throwing' : ''}`}
      style={style}
      role="img"
      aria-label={`${value}`}
    >
      {FACES.map((f) => (
        <div key={f.cls} className={`die3d-face ${f.cls}`}>
          <svg viewBox="0 0 3 3" aria-hidden>
            {(PIPS[f.value] ?? PIPS[1]).map(([x, y], i) => (
              <circle key={i} cx={x + 0.5} cy={y + 0.5} r="0.3" />
            ))}
          </svg>
        </div>
      ))}
    </div>
  )
}

interface Props {
  values: number[]
  /** 振るたびに増える番号。変わると投げ込みの動きをやり直す */
  spin: number
}

/**
 * お椀を上から見た形のサイコロ。横から投げ込まれて中に転がり落ちる。
 *
 * WebGLは使わずCSSの3D変換で作っている。立方体なら見た目は十分で、
 * ライブラリを増やさずに済み、端末やブラウザを選ばないため。
 */
export default function DiceBowl({ values, spin }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // 振るたびに置き場所を決め直す
  const places = useMemo(() => scatter(values.length), [values.length, spin])

  return (
    // サイコロは perspective を持つこの要素の直接の子にする。
    // 間に要素を挟むと、そこにも preserve-3d が要り、
    // 入れ子が深いと iOS Safari で立体が潰れることがあるため
    <div className="dice-bowl">
      <div className="dice-bowl-dish" aria-hidden />
      {values.map((v, i) => (
        // spin が変わるたびに作り直して、投げ込む動きを最初から流す
        <Die key={`${spin}-${i}`} value={v} place={places[i]} animate={!reduceMotion} />
      ))}
    </div>
  )
}
