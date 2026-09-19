/**
 * 1円未満の端数処理（切り捨て・四捨五入・切り上げ）
 *
 * 割引・パーセント計算（`waribiki-percent.ts`）と消費税計算（`shohizei.ts`）が
 * 同じ丸めを使う。**この小さなファイルを独立させてあるのは循環importを避けるため。**
 * 税率の一次情報は `shohizei.ts` にあり、`waribiki-percent.ts` はそこから import する。
 * 丸めを `waribiki-percent.ts` に置いたままにすると
 * `shohizei.ts` → `waribiki-percent.ts` → `shohizei.ts` の輪ができ、
 * モジュール評価の順番によって早見表の生成（トップレベルの `const`）が
 * TDZ（初期化前アクセス）で落ちる。
 *
 * 既定の丸め方はツールごとに違うので、ここには置かない
 * （割引は四捨五入・消費税は切り捨て。理由はそれぞれのファイルに書いてある）。
 *
 * 純関数のみで DOM/React には依存しない。
 */

/** 端数の丸め方 */
export type Rounding = 'floor' | 'round' | 'ceil';

export interface RoundingOption {
  id: Rounding;
  /** UIラベル */
  label: string;
  /** 内訳表示・チップ表示用の短い名前 */
  short: string;
}

/**
 * 選べる端数処理。並び順は「切り捨て → 四捨五入 → 切り上げ」で、
 * 大きくなる順に並べている（既定がどれかは呼び出し側が決める）。
 */
export const ROUNDINGS: RoundingOption[] = [
  { id: 'floor', label: '切り捨て', short: '切捨' },
  { id: 'round', label: '四捨五入', short: '四捨' },
  { id: 'ceil', label: '切り上げ', short: '切上' },
];

/**
 * 値を整数（1円）に丸める。
 * 4捨5入・切り上げ・切り捨てのどれを選んでも、負の数の扱いは
 * 「値を0方向へ近づける（`ceil` は上へ・`floor` は下へ）」で
 * JavaScript の標準と同じ。負の値は割引計算では基本的に出ないが、
 * 逆算モードで「増えた（マークアップ）」を計算するときのため保険で挙げておく。
 *
 * 無効値（NaN・Infinity）は `NaN` を返す。呼び出し側で `Number.isFinite`
 * で受けて表示を落とせるように、null は返さない（数値のシグネチャは崩さない）。
 */
export function roundBy(value: number, rounding: Rounding): number {
  if (!Number.isFinite(value)) return Number.NaN;
  switch (rounding) {
    case 'floor':
      return Math.floor(value);
    case 'ceil':
      return Math.ceil(value);
    case 'round':
      // Number.EPSILON を足して丸めると、二進小数の誤差で
      // 「2.5円は2円に丸まる」ような境界のブレを避けられる。
      // ただし負の値を上へ寄せるので、非負の値だけに適用する
      if (value >= 0) return Math.round(value + Number.EPSILON);
      return Math.round(value);
  }
}
