import { isUpper, UPPER_FACE, type Category } from '@/lib/yacht';

/**
 * 役の条件をひとめで見せる小さな絵。スコア表の役名の下に置く。
 *
 * **文字の説明（`CATEGORY_HINT`）は読み上げ用に残し、目で見るぶんはこの絵で伝える。**
 * 「フォーダイスは同じ目が4つ」のような条件は、遊びながら毎手番参照するのに
 * 文章を読み直すのが重い。
 *
 * ## 大きさの制限
 *
 * 役名の欄は**320px幅の端末で53px**しかなく、そこでは役名がすでに2行に折り返す
 * （実測）。行の高さは44pxで固定なので、**絵に使えるのは高さ10pxほど**。
 * 幅も50pxを超えられない。サイコロの目を描き分けられる限界に近いので、
 * **上段（エース〜シックス）だけ「その目のサイコロ1個」**にして大きく描き、
 * 下段は**四角の並び**で条件を表す。絵の言葉は2つになるが、
 * それぞれの役でいちばん分かりやすい描き方を採る。
 */

/** サイコロの目の位置（3×3のマス目の座標）。Die3D と同じ並び */
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

/** 絵の中の座標。1マス=10、すき間=2 で5個ぶん（58×10）を描く */
const CELL = 10;
const GAP = 2;
const STEP = CELL + GAP;
const WIDTH = STEP * 5 - GAP;

/** 四角1つ。`tone` で「そろえる組」を描き分ける */
function Box({ i, tone }: { i: number; tone: 'same' | 'other' | 'any' }) {
  const x = i * STEP;
  if (tone === 'any') {
    // 「なんでもよい」は枠線だけ。塗ると「そろえる」に見える
    return (
      <rect x={x + 0.6} y={0.6} width={CELL - 1.2} height={CELL - 1.2} rx="2" className="pat-any" />
    );
  }
  return (
    <rect
      x={x}
      y={0}
      width={CELL}
      height={CELL}
      rx="2"
      className={tone === 'same' ? 'pat-same' : 'pat-other'}
    />
  );
}

/** 連続する目（ストレート）。**高さの階段**で「続いている」ことを表す */
function Steps({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const h = CELL * (0.4 + (0.6 * i) / (count - 1));
        return (
          <rect
            key={i}
            x={i * STEP}
            y={CELL - h}
            width={CELL}
            height={h}
            rx="1.5"
            className="pat-same"
          />
        );
      })}
    </>
  );
}

/** 上段の役。**その目のサイコロを1個**描く（「この目を集める」の意味） */
function UpperDie({ face }: { face: number }) {
  return (
    <>
      <rect x="0" y="0" width={CELL} height={CELL} rx="2" className="pat-die" />
      {(PIPS[face] ?? PIPS[1]).map(([px, py], k) => (
        <circle key={k} cx={(px + 0.5) * (CELL / 3)} cy={(py + 0.5) * (CELL / 3)} r="1.15" className="pat-pip" />
      ))}
    </>
  );
}

function shapeOf(category: Category) {
  if (isUpper(category)) return <UpperDie face={UPPER_FACE[category]} />;
  switch (category) {
    case 'choice':
      // なんでもよい5個
      return [0, 1, 2, 3, 4].map((i) => <Box key={i} i={i} tone="any" />);
    case 'fourDice':
      // 同じ目4つ＋なんでも1つ
      return [0, 1, 2, 3, 4].map((i) => <Box key={i} i={i} tone={i < 4 ? 'same' : 'any'} />);
    case 'fullHouse':
      // 同じ目3つ＋別の同じ目2つ。**色を分けないと「5つそろえる」に見える**
      return [0, 1, 2, 3, 4].map((i) => <Box key={i} i={i} tone={i < 3 ? 'same' : 'other'} />);
    case 'sStraight':
      return <Steps count={4} />;
    case 'lStraight':
      return <Steps count={5} />;
    case 'yacht':
      return [0, 1, 2, 3, 4].map((i) => <Box key={i} i={i} tone="same" />);
    default:
      return null;
  }
}

/**
 * 役の条件の絵。**読み上げには出さない**（行の `aria-label` に
 * `CATEGORY_HINT` の文章が入っているので、二重に読ませない）
 */
export default function YakuMark({ category }: { category: Category }) {
  // **上段の役だけ大きく描く。** 上段の役名（エース〜シックス）は短くて
  // 320px幅でも1行に収まるので、44pxの行に余りが出る。
  // 下段は役名が2行に折り返すぶん、絵は小さいままにする（実測で決めた）
  const upper = isUpper(category);
  return (
    <svg
      className={`yc-pat${upper ? ' upper' : ''}`}
      viewBox={upper ? `0 0 ${CELL} ${CELL}` : `0 0 ${WIDTH} ${CELL}`}
      aria-hidden="true"
    >
      {shapeOf(category)}
    </svg>
  );
}
