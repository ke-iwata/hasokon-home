'use client'

import { useEffect, useState } from 'react'

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
 * 向かい合う面の和が7になる、実際のサイコロと同じ配置にしている。
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
 * その目を手前に向けるための回転角 [X, Y]。
 * 面を配置した回転の逆をかければ正面に来る。
 */
const FACE_ROTATION: Record<number, [number, number]> = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
}

function Pips({ value }: { value: number }) {
  return (
    <svg viewBox="0 0 3 3" aria-hidden>
      {(PIPS[value] ?? PIPS[1]).map(([x, y], i) => (
        <circle key={i} cx={x + 0.5} cy={y + 0.5} r="0.3" />
      ))}
    </svg>
  )
}

interface Props {
  value: number
  /** 転がっている最中か */
  rolling: boolean
  /** 振るたびに増える番号。これが変わると回転量が増えて回り続ける */
  spin: number
  /** 何個目か。ダイスごとに回り方をずらして、同じ動きに見えないようにする */
  index: number
}

/**
 * 立体的に転がるサイコロ。
 *
 * WebGLは使わずCSSの3D変換で作っている。立方体なら見た目は十分で、
 * ライブラリを増やさずに済み、端末やブラウザを選ばないため。
 * 目の数が6のときだけ使い、それ以外は数字表示のままにしている。
 */
export default function Die3D({ value, rolling, spin, index }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const [rx, ry] = FACE_ROTATION[value] ?? FACE_ROTATION[1]

  // 振るたびに回転量を足していく。戻さずに増やし続けることで、
  // 同じ目が続けて出ても必ず一回転して見える
  const turnsX = reduceMotion ? 0 : spin * 2
  const turnsY = reduceMotion ? 0 : spin * 3 + index
  const transform = `rotateX(${turnsX * 360 + rx}deg) rotateY(${turnsY * 360 + ry}deg)`

  return (
    <div className={`die3d-wrap ${rolling && !reduceMotion ? 'tumbling' : ''}`}>
      {/* 少し傾けたまま見せる。正面から見ると立方体は正方形にしか見えないため、
          天面と側面が覗く角度に固定して立体だと分かるようにしている */}
      <div className="die3d-tilt">
        <div className="die3d" style={{ transform }} role="img" aria-label={`${value}`}>
          {FACES.map((f) => (
            <div key={f.cls} className={`die3d-face ${f.cls}`}>
              <Pips value={f.value} />
            </div>
          ))}
        </div>
      </div>
      <div className="die3d-shadow" aria-hidden />
    </div>
  )
}
