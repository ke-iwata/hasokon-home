/**
 * ソリティア3本（クロンダイク・スパイダー・フリーセル）の「つかんで運ぶ」操作の純関数部分。
 * 仕様: docs/features/card-games-drag-drop.md
 *
 * ルールの判定はここに書かない。置けるかどうかは各ゲームの `move()` が決める。
 * ここが持つのは「タップかドラッグか」「どこに落としたか」「ドラッグのあとの click を捨てるか」だけ。
 */

/** 押してからこれ以上動いたらドラッグ。未満で離したら今までどおりのタップ */
export const DRAG_THRESHOLD_PX = 6;

/** 置けなかったときに元の位置へ戻す時間（ms） */
export const DRAG_RETURN_MS = 150;

/**
 * 落とし先。フリーセルの `Target` と同じ形にしてあるので、フリーセルはそのまま `move()` に渡せる。
 * DOM 側は `data-drop="tableau:3"` / `"free:1"` / `"foundation"` で印を付ける
 */
export type DropTarget =
  | { kind: 'tableau'; col: number }
  | { kind: 'free'; index: number }
  | { kind: 'foundation' };

/** `data-drop` の値に直す */
export function dropKey(t: DropTarget): string {
  if (t.kind === 'foundation') return 'foundation';
  return t.kind === 'tableau' ? `tableau:${t.col}` : `free:${t.index}`;
}

/** `data-drop` の値を読む。知らない形なら null */
export function parseDrop(value: string | null | undefined): DropTarget | null {
  if (!value) return null;
  if (value === 'foundation') return { kind: 'foundation' };
  const m = /^(tableau|free):(\d+)$/.exec(value);
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] === 'tableau' ? { kind: 'tableau', col: n } : { kind: 'free', index: n };
}

export function sameDrop(a: DropTarget, b: DropTarget): boolean {
  return dropKey(a) === dropKey(b);
}

/** 押した点からの移動量がドラッグの閾値に達したか */
export function isDragDistance(dx: number, dy: number): boolean {
  return dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;
}

export interface Point {
  x: number;
  y: number;
}

export interface DropCandidate {
  target: DropTarget;
  /** 落とし先の要素の矩形（getBoundingClientRect） */
  rect: { left: number; top: number; width: number; height: number };
}

/**
 * 候補（離した点の下の落とし先・つかんだ札の中心の下の落とし先）から、
 * つかんだ札の中心に近いほうを採る。同じ近さなら先に渡したほう（離した点）を採る
 */
export function pickDrop(candidates: (DropCandidate | null)[], cardCenter: Point): DropTarget | null {
  let best: DropTarget | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    if (!c) continue;
    const cx = c.rect.left + c.rect.width / 2;
    const cy = c.rect.top + c.rect.height / 2;
    const d = (cx - cardCenter.x) ** 2 + (cy - cardCenter.y) ** 2;
    if (d < bestDist) {
      best = c.target;
      bestDist = d;
    }
  }
  return best;
}

/**
 * ドラッグのあとの click を1回だけ捨てる印。
 *
 * 6px 以上動かして同じ札の上で離すと、ブラウザは pointerup のあとに click も出す。
 * それがタップの経路（選択・自動移動）に流れないよう、ドラッグだったら印を立て、
 * click の捕捉段階で印を見て捨てる。click が来なかったときに次の本物のタップを捨てないよう、
 * 印は次のフレームで必ず下ろす（下ろすのは呼び出し側。`disarm` を渡す）
 */
export function createClickGuard() {
  let armed = false;
  return {
    arm() {
      armed = true;
    },
    disarm() {
      armed = false;
    },
    get armed() {
      return armed;
    },
    /** click が来たときに呼ぶ。捨てるべきなら true を返して印を下ろす */
    swallow(): boolean {
      if (!armed) return false;
      armed = false;
      return true;
    },
  };
}

export type ClickGuard = ReturnType<typeof createClickGuard>;

/** 計測のイベント名（1ゲームにつき1回だけ送る） */
export type FirstMoveVia = 'drag' | 'tap';

export function firstMoveAction(via: FirstMoveVia): string {
  return via === 'drag' ? 'first-move-drag' : 'first-move-tap';
}
