/**
 * 盤の上の案内（`.hint-row`）に出す文言。
 *
 * 仕様: docs/features/game-golf-solitaire.md
 *
 * **1か所にまとめてあるのは、長さをテストで見張るため。**
 * `.hint-row` は `height: 3em` ＋ `overflow: hidden` なので、2行に収まらない文言は
 * **画面上で黙って切れる**（切れても誰も気づかない。だから目視では守れない）。
 *
 * 上限は**全角36文字ぶん**。幅320pxの端末で37文字目からあふれることを
 * Playwright で実測した（360pxでは40、390pxでは44まで入るので、いちばん狭い
 * 320pxが効く）。ASCIIは半角なので0.5文字ぶんとして数える。
 * `tests/golf-solitaire.test.ts` が、値がいちばん長くなる場合も含めて見張っている。
 *
 * **文言を足すときは、ここに定数として足して `allHintRowMessages()` にも入れること。**
 * `Game.tsx` に直書きすると見張りの網から外れる（それも同じテストが落とす）。
 */

/** 収まる上限（全角換算の文字数）。実測値なので、詰めたくなったら測り直すこと */
export const HINT_ROW_MAX_WIDTH = 36;

/** 全角換算の幅。ASCII（数字・空白・記号）は半角なので0.5と数える */
export function textWidth(text: string): number {
  return [...text].reduce((total, ch) => total + (/[\x00-\x7F]/.test(ch) ? 0.5 : 1), 0);
}

/** 配りはじめ。捨て札が無いので、最初の1手は山札めくりしかない */
export const GUIDE_FIRST_DRAW =
  '山札をタップして1枚めくるところから始めます（捨て札は最初は空です）。';

/** 捨て札が出てからの通常の案内 */
export const GUIDE_PICK = '捨て札と1つ違いの札を、各列の手前からタップして取ります。';

/** 手前でない札を押したとき */
export const NOTE_NOT_FRONT = '取れるのは各列のいちばん手前（下）の1枚だけです。';

/** ヒントを押したが取れる札が無く、山札は残っているとき */
export const NOTE_DRAW_NEEDED = '取れる札がありません。山札を1枚めくってください。';

/** ヒントを押したが取れる札も山札も無いとき */
export const NOTE_DEAD_END = '取れる札がなく、山札も残っていません。';

/** クリア（残り0枚）。**「残り0枚」を結果として前に出す** */
export function clearMessage(chain: number): string {
  return `🎉 残り0枚でクリア！この配りの最長 ${chain}連鎖`;
}

/**
 * 手詰まり。**「負け」とは書かない**——残り枚数がこのゲームの結果そのもの
 * （仕様書「クリアは珍しい前提で設計する」）。
 * やり直し方は真下のボタンが示しているので、文言には入れない。
 */
export function stuckMessage(left: number, chain: number): string {
  return `今回は残り ${left} 枚。この配りの最長 ${chain}連鎖`;
}

/** クリア・手詰まりの行の後ろに付く `BestBadge`（app/_records/Records.tsx）の文字 */
export const BEST_BADGE_TEXT = 'ベスト更新！';

/**
 * 出しうる文言をすべて、**いちばん長くなる値**で作る（テストが使う）。
 *
 * 連鎖と残り枚数は場札35枚が上限なので、2桁の35をいちばん長い値として入れる。
 * ベスト更新のバッジは同じ行に並ぶので、その幅も足したものを見る。
 */
export function allHintRowMessages(): string[] {
  const worst = 35;
  return [
    GUIDE_FIRST_DRAW,
    GUIDE_PICK,
    NOTE_NOT_FRONT,
    NOTE_DRAW_NEEDED,
    NOTE_DEAD_END,
    clearMessage(worst) + BEST_BADGE_TEXT,
    stuckMessage(worst, worst) + BEST_BADGE_TEXT,
  ];
}
