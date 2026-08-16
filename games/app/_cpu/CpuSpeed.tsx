'use client';

/**
 * CPU対戦ゲームの「CPUの速さ」設定。
 *
 * 大富豪と七並べが別々に持っていた3段階の速度を、全CPU対戦ゲームで
 * 使い回せるように切り出したもの。仕様: docs/features/cpu-speed.md
 *
 * ## 遅延は「ふつう」の1つだけをゲームが決める
 *
 * ゲームごとに適切な間は違う（五目並べの1手と大富豪の1手では見るものの量が違う）。
 * かといって3段階ぶんの数値を各ゲームが持つと、段階の比が揃わなくなる。
 * **ゲームは「ふつう」の遅延だけを決め、ここが倍率を掛ける。**
 *
 * 倍率は元の2ゲームの実測値から取った（大富豪 2000/1300/700、
 * 七並べ 1600/1000/500 → おおよそ 1.6倍 / 1倍 / 0.5倍）。
 *
 * ## 「間を消す」選択肢は用意しない
 *
 * 0にすると何が起きたか分からないうちに自分の番が来る。いちばん速い
 * 「はやい」でも半分までに留めてある（大富豪の元の判断を引き継ぐ）。
 */

export const CPU_SPEEDS = ['slow', 'normal', 'fast'] as const;

export type CpuSpeed = (typeof CPU_SPEEDS)[number];

export const SPEED_LABELS: Record<CpuSpeed, string> = {
  slow: 'ゆっくり',
  normal: 'ふつう',
  fast: 'はやい',
};

/** 「ふつう」を1としたときの倍率 */
const SCALE: Record<CpuSpeed, number> = { slow: 1.6, normal: 1, fast: 0.5 };

/**
 * 「ふつう」のときの遅延（ms）から、いまの速さでの遅延を出す。
 *
 * @param normalMs そのゲームの「ふつう」での間
 */
export function delayFor(normalMs: number, speed: CpuSpeed): number {
  return Math.round(normalMs * SCALE[speed]);
}

function keyOf(slug: string): string {
  return `${slug}:speed`;
}

/**
 * 保存してある速さを読む。
 * 記録（lib/records.ts）ではなく「設定」なので、ゲームごとのキーで持つ。
 * ストレージが使えなくても落ちないようにする（Safariのプライベートブラウズ対策）。
 */
export function readCpuSpeed(slug: string): CpuSpeed {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(keyOf(slug));
  } catch {
    return 'normal';
  }
  return CPU_SPEEDS.includes(saved as CpuSpeed) ? (saved as CpuSpeed) : 'normal';
}

export function writeCpuSpeed(slug: string, speed: CpuSpeed): void {
  try {
    localStorage.setItem(keyOf(slug), speed);
  } catch {
    // 覚えられなくても、その回は普通に遊べる
  }
}

/** 速さの切り替え（`.seg`）。見た目は他の設定の切り替えと揃える */
export function CpuSpeedSeg({
  value,
  onChange,
}: {
  value: CpuSpeed;
  onChange: (next: CpuSpeed) => void;
}) {
  return (
    <div className="seg" role="group" aria-label="CPUの速さ">
      {CPU_SPEEDS.map((speed) => (
        <button
          key={speed}
          type="button"
          className={speed === value ? 'active' : ''}
          aria-pressed={speed === value}
          onClick={() => onChange(speed)}
        >
          {SPEED_LABELS[speed]}
        </button>
      ))}
    </div>
  );
}
