'use client';

/**
 * 「スタート待ち」を盤の上に重ねる幕。
 *
 * 仕様: docs/features/cpu-speed.md（スタート待ちと速さは同じ回の変更）
 *
 * ## なぜ行ではなく「重ねる」のか
 *
 * 最初はスタートボタンを普通の行として盤の下に置いていたが、**押した瞬間に
 * その行ごと消えて、盤より下が57〜72pxせり上がる**（実測）。遊んでいる最中に
 * 画面が動くのは、運営者の言葉で「すごいストレス」。
 *
 * 行を常に確保しておく手もあるが、対局中ずっと空の帯が残る。**絶対配置で
 * 盤の上に重ねれば、出ても消えてもレイアウトは1pxも動かない。**
 * 「まだ盤は生きていない」ことが見た目でも伝わるので、合図としても分かりやすい。
 *
 * 幕は半透明にして盤を透かす。配られた手札や初期配置を見てから
 * 始められるようにするため（隠してしまうと、始める前に考えられない）。
 */

export function StartGate({
  show,
  onStart,
  children,
}: {
  /** スタート待ちか（false なら幕は出ない） */
  show: boolean;
  onStart: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="start-gate">
      {children}
      {show && (
        <div className="start-gate-veil">
          <button type="button" className="btn btn-primary" onClick={onStart}>
            スタート
          </button>
        </div>
      )}
    </div>
  );
}
