// @vitest-environment jsdom
/**
 * ソリティア3本の「つかんで運ぶ」操作（docs/features/card-games-drag-drop.md）。
 *
 * 前半は lib/card-drag.ts の純関数、後半は jsdom で各 Game.tsx を描画し、
 * pointer のイベントを合成して「タップの経路を壊していないか」まで確かめる。
 * jsdom には PointerEvent・elementFromPoint・setPointerCapture が無いので、
 * MouseEvent に pointerId を足して代わりにし、落とし先の判定は elementFromPoint を差し替えて決める。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RANK_LABEL, SUIT_SYMBOL, type Card } from '@/lib/cards';
import {
  createClickGuard,
  DRAG_THRESHOLD_PX,
  dropKey,
  firstMoveAction,
  isDragDistance,
  parseDrop,
  pickDrop,
  type DropTarget,
} from '@/lib/card-drag';
import * as freecell from '@/lib/freecell';
import * as klondike from '@/lib/klondike';
import * as spider from '@/lib/spider';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ trackToolUse: track }));

// ---------------------------------------------------------------------------
// 純関数
// ---------------------------------------------------------------------------

describe('lib/card-drag', () => {
  it('data-drop の値を読み書きできる', () => {
    const all: DropTarget[] = [
      { kind: 'tableau', col: 3 },
      { kind: 'free', index: 1 },
      { kind: 'foundation' },
    ];
    for (const t of all) expect(parseDrop(dropKey(t))).toEqual(t);
    expect(parseDrop('tableau:x')).toBeNull();
    expect(parseDrop('')).toBeNull();
    expect(parseDrop(undefined)).toBeNull();
  });

  it('6px 未満はタップ、6px 以上でドラッグ', () => {
    expect(DRAG_THRESHOLD_PX).toBe(6);
    expect(isDragDistance(5, 0)).toBe(false);
    expect(isDragDistance(4, 4)).toBe(false); // 約 5.66px
    expect(isDragDistance(6, 0)).toBe(true);
    expect(isDragDistance(0, -6)).toBe(true);
  });

  it('候補のうち、つかんだ札の中心に近いほうを採る', () => {
    const a = { target: { kind: 'tableau', col: 0 } as DropTarget, rect: { left: 0, top: 0, width: 100, height: 300 } };
    const b = { target: { kind: 'tableau', col: 1 } as DropTarget, rect: { left: 100, top: 0, width: 100, height: 300 } };
    expect(pickDrop([a, b], { x: 160, y: 150 })).toEqual(b.target);
    expect(pickDrop([a, b], { x: 40, y: 150 })).toEqual(a.target);
    // 同じ近さなら先（離した点）を採る
    expect(pickDrop([a, b], { x: 100, y: 150 })).toEqual(a.target);
    expect(pickDrop([null, b], { x: 0, y: 0 })).toEqual(b.target);
    expect(pickDrop([null, null], { x: 0, y: 0 })).toBeNull();
  });

  it('click を捨てる印は1回だけ効き、下ろせば効かない', () => {
    const g = createClickGuard();
    expect(g.swallow()).toBe(false);
    g.arm();
    expect(g.swallow()).toBe(true);
    expect(g.swallow()).toBe(false);
    g.arm();
    g.disarm();
    expect(g.swallow()).toBe(false);
  });

  it('最初の1手のイベント名', () => {
    expect(firstMoveAction('drag')).toBe('first-move-drag');
    expect(firstMoveAction('tap')).toBe('first-move-tap');
  });
});

describe('freecell.canPickUp（動かせない並びはつかめない）', () => {
  it('maxMovable を超える枚数の並びはつかめない', () => {
    // 色違いの降順に並んだ7枚（K♠ Q♥ J♣ 10♦ 9♠ 8♥ 7♣）を列0に置く
    const run: Card[] = [
      { id: 101, suit: 'spade', rank: 13, faceUp: true },
      { id: 102, suit: 'heart', rank: 12, faceUp: true },
      { id: 103, suit: 'club', rank: 11, faceUp: true },
      { id: 104, suit: 'diamond', rank: 10, faceUp: true },
      { id: 105, suit: 'spade', rank: 9, faceUp: true },
      { id: 106, suit: 'heart', rank: 8, faceUp: true },
      { id: 107, suit: 'club', rank: 7, faceUp: true },
    ];
    const base = freecell.deal(1);
    const filler: Card = { id: 199, suit: 'diamond', rank: 2, faceUp: true };
    const s: freecell.FreecellState = {
      ...base,
      // 空き列を作らない（全列に1枚以上）
      tableau: [run, ...base.tableau.slice(1).map((p) => (p.length ? p : [filler]))],
      free: [filler, filler, null, null],
    };
    // 空きフリーセル2・空き列0 → 3枚まで
    expect(freecell.maxMovable(s)).toBe(3);
    expect(freecell.canPickUp(s, { kind: 'tableau', col: 0, cardIndex: 4 })).toBe(true); // 3枚
    expect(freecell.canPickUp(s, { kind: 'tableau', col: 0, cardIndex: 3 })).toBe(false); // 4枚
    expect(freecell.canPickUp(s, { kind: 'free', index: 0 })).toBe(true);
    expect(freecell.canPickUp(s, { kind: 'free', index: 2 })).toBe(false);
  });

  it('色違いの降順になっていない並びはつかめない', () => {
    const s = freecell.deal(1);
    const col = s.tableau.findIndex((p) => !freecell.isMovableRun(p, 0));
    expect(freecell.canPickUp(s, { kind: 'tableau', col, cardIndex: 0 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 画面（jsdom）
// ---------------------------------------------------------------------------

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;
/** 次の elementFromPoint が返す要素（＝落とした先） */
let dropEl: Element | null = null;

beforeEach(() => {
  track.mockClear();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  document.elementFromPoint = () => dropEl;
  window.confirm = () => true;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  dropEl = null;
  vi.restoreAllMocks();
});

/** 配りを決めるため Math.random を固定してから描画する */
async function render(Game: ComponentType, r: number) {
  vi.spyOn(Math, 'random').mockReturnValue(r);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Game));
  });
}

function fire(el: Element, type: string, x = 0, y = 0) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  if (type.startsWith('pointer')) {
    Object.defineProperty(e, 'pointerId', { value: 1 });
    Object.defineProperty(e, 'pointerType', { value: 'mouse' });
  }
  act(() => {
    el.dispatchEvent(e);
  });
}

/**
 * 札を (0,0) から (dx,dy) まで運んで、to の上で離す。
 * ブラウザと同じく、つかんだ札（pointer capture の先）に move/up を送り、最後に click も送る。
 * 置けて札が別の列へ移ると click は届かないので、捨てる印が次のフレームで下りるのを待つ
 */
async function dragCard(card: Element, to: Element, dx = 120, dy = 40) {
  fire(card, 'pointerdown', 0, 0);
  fire(card, 'pointermove', dx / 2, dy / 2);
  fire(card, 'pointermove', dx, dy);
  dropEl = to;
  fire(card, 'pointerup', dx, dy);
  fire(card, 'click', dx, dy);
  await act(() => new Promise((r) => setTimeout(r, 50)));
}

const pileEl = (key: string) => container.querySelector(`[data-drop="${key}"]`)!;
const cardsIn = (key: string) => [...pileEl(key).querySelectorAll('button.playing-card:not(.empty)')];
const labelsIn = (key: string) => cardsIn(key).map((b) => b.getAttribute('aria-label'));
const label = (c: Card) => (c.faceUp ? `${SUIT_SYMBOL[c.suit]}${RANK_LABEL[c.rank]}` : '裏向きの札');
const pileLabels = (pile: Card[]) => pile.map(label);
const movesText = () => container.textContent!.match(/手数: (\d+)/)![1];
const undoButton = () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'もどす')!;
const selectedCount = () => container.querySelectorAll('.playing-card.selected').length;

/** Math.random を r に固定したときに、場札どうしで1枚動かせる手を探す */
function findRandom<S>(
  dealWith: (r: number) => S,
  hasMove: (s: S) => { from: number; to: number } | null,
): { r: number; s: S; from: number; to: number } {
  for (let i = 1; i < 100; i += 1) {
    const r = i / 100;
    const s = dealWith(r);
    const m = hasMove(s);
    if (m) return { r, s, ...m };
  }
  throw new Error('場札どうしで動かせる配りが見つからない');
}

describe('フリーセル（app/freecell/Game.tsx）', async () => {
  const { default: Game } = await import('@/app/freecell/Game');
  const dealWith = (r: number) => freecell.deal(freecell.newSeed(() => r));
  const topMove = (s: freecell.FreecellState) => {
    for (let a = 0; a < 8; a += 1) {
      for (let b = 0; b < 8; b += 1) {
        const from = { kind: 'tableau' as const, col: a, cardIndex: s.tableau[a].length - 1 };
        if (a !== b && freecell.move(s, from, { kind: 'tableau', col: b })) return { from: a, to: b };
      }
    }
    return null;
  };

  it('列 A の札を列 B へドラッグすると、move() と同じ盤になる。もどすで戻る', async () => {
    const { r, s, from, to } = findRandom(dealWith, topMove);
    await render(Game, r);
    const expected = freecell.move(s, { kind: 'tableau', col: from, cardIndex: s.tableau[from].length - 1 }, { kind: 'tableau', col: to })!;

    const cards = cardsIn(`tableau:${from}`);
    await dragCard(cards[cards.length - 1], pileEl(`tableau:${to}`));

    expect(labelsIn(`tableau:${from}`)).toEqual(pileLabels(expected.tableau[from]));
    expect(labelsIn(`tableau:${to}`)).toEqual(pileLabels(expected.tableau[to]));
    expect(movesText()).toBe('1');
    expect(selectedCount()).toBe(0); // あとの click が選択に流れていない
    expect(track).toHaveBeenCalledWith('freecell', 'first-move-drag');
    expect(track).not.toHaveBeenCalledWith('freecell', 'first-move-tap');

    // ドラッグ1回 = 履歴1つ。もどすで元の盤へ、それ以上は戻れない
    fire(undoButton(), 'click');
    expect(labelsIn(`tableau:${from}`)).toEqual(pileLabels(s.tableau[from]));
    expect(labelsIn(`tableau:${to}`)).toEqual(pileLabels(s.tableau[to]));
    expect(movesText()).toBe('0');
    expect(undoButton().disabled).toBe(true);
  });

  it('フリーセルへドラッグできる', async () => {
    const r = 0.5;
    const s = dealWith(r);
    await render(Game, r);
    const cards = cardsIn('tableau:0');
    await dragCard(cards[cards.length - 1], pileEl('free:2'));
    const expected = freecell.move(s, { kind: 'tableau', col: 0, cardIndex: s.tableau[0].length - 1 }, { kind: 'free', index: 2 })!;
    expect(labelsIn('free:2')).toEqual(pileLabels([expected.free[2]!]));
    expect(labelsIn('tableau:0')).toEqual(pileLabels(expected.tableau[0]));
  });

  it('置けない列へ落とすと盤は変わらない（drag-miss は1ゲーム1回）', async () => {
    const r = 0.5;
    const s = dealWith(r);
    await render(Game, r);
    // 列0のいちばん下の札を置けない列を探す
    const from = { kind: 'tableau' as const, col: 0, cardIndex: s.tableau[0].length - 1 };
    const bad = [1, 2, 3, 4, 5, 6, 7].find((c) => !freecell.move(s, from, { kind: 'tableau', col: c }))!;
    const before = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => labelsIn(`tableau:${c}`));

    let cards = cardsIn('tableau:0');
    await dragCard(cards[cards.length - 1], pileEl(`tableau:${bad}`));
    cards = cardsIn('tableau:0');
    await dragCard(cards[cards.length - 1], pileEl(`tableau:${bad}`));

    expect([0, 1, 2, 3, 4, 5, 6, 7].map((c) => labelsIn(`tableau:${c}`))).toEqual(before);
    expect(movesText()).toBe('0');
    expect(selectedCount()).toBe(0);
    expect(track.mock.calls.filter(([, a]) => a === 'drag-miss')).toHaveLength(1);
  });

  it('6px 未満の移動で離すとタップ扱い（選択される）', async () => {
    await render(Game, 0.5);
    const cards = cardsIn('tableau:0');
    const card = cards[cards.length - 1];
    fire(card, 'pointerdown', 0, 0);
    fire(card, 'pointermove', 3, 2);
    fire(card, 'pointerup', 3, 2);
    fire(card, 'click', 3, 2);
    expect(card.classList.contains('selected')).toBe(true);
    expect(movesText()).toBe('0');
  });

  it('6px 以上動かして元の札の上で離すと、盤も選択も変わらない', async () => {
    const r = 0.5;
    const s = dealWith(r);
    await render(Game, r);
    const cards = cardsIn('tableau:0');
    const card = cards[cards.length - 1];
    await dragCard(card, pileEl('tableau:0'), 10, 0);
    expect(labelsIn('tableau:0')).toEqual(pileLabels(s.tableau[0]));
    expect(selectedCount()).toBe(0);
    expect(movesText()).toBe('0');
    expect(track).not.toHaveBeenCalledWith('freecell', 'drag-miss'); // 元の列に戻しただけ
  });

  it('動かせない並びはつかめない（揺れて戻り、あとの click も選択にならない）', async () => {
    const r = 0.5;
    const s = dealWith(r);
    await render(Game, r);
    const col = s.tableau.findIndex((p) => !freecell.isMovableRun(p, 0));
    const card = cardsIn(`tableau:${col}`)[0];
    expect(card.classList.contains('grabbable')).toBe(false);
    fire(card, 'pointerdown', 0, 0);
    fire(card, 'pointermove', 30, 0);
    expect(card.classList.contains('shake')).toBe(true);
    expect(container.querySelector('.drag-ghost')).toBeNull();
    dropEl = pileEl(`tableau:${(col + 1) % 8}`);
    fire(card, 'pointerup', 30, 0);
    fire(card, 'click', 30, 0);
    expect(selectedCount()).toBe(0);
    expect(movesText()).toBe('0');
  });

  it('運んでいる間は写しが出て、置ける列だけ緑の枠になる', async () => {
    const { r, s, from, to } = findRandom(dealWith, topMove);
    await render(Game, r);
    const cards = cardsIn(`tableau:${from}`);
    const card = cards[cards.length - 1];
    fire(card, 'pointerdown', 0, 0);
    fire(card, 'pointermove', 50, 50);
    expect(container.querySelector('.drag-ghost')).not.toBeNull();
    expect(card.classList.contains('drag-origin')).toBe(true);
    expect(pileEl(`tableau:${to}`).classList.contains('drop-ok')).toBe(true);
    const src = { kind: 'tableau' as const, col: from, cardIndex: s.tableau[from].length - 1 };
    for (let c = 0; c < 8; c += 1) {
      const ok = freecell.move(s, src, { kind: 'tableau', col: c }) !== null;
      expect(pileEl(`tableau:${c}`).classList.contains('drop-ok')).toBe(ok);
    }
    fire(card, 'pointercancel', 50, 50);
  });

  it('ダブルクリック1回（click → click → dblclick）で手が1つだけ進む', async () => {
    const r = 0.5;
    const s = dealWith(r);
    await render(Game, r);
    const src = { kind: 'tableau' as const, col: 0, cardIndex: s.tableau[0].length - 1 };
    const expected = freecell.autoMove(s, src)!;
    expect(expected).not.toBeNull();

    const cards = cardsIn('tableau:0');
    const card = cards[cards.length - 1];
    for (const type of ['pointerdown', 'pointerup', 'click', 'pointerdown', 'pointerup', 'click', 'dblclick']) {
      fire(card, type);
    }
    expect(movesText()).toBe('1');
    expect(labelsIn('tableau:0')).toEqual(pileLabels(expected.tableau[0]));
    expect(track).toHaveBeenCalledWith('freecell', 'first-move-tap');

    fire(undoButton(), 'click');
    expect(movesText()).toBe('0');
    expect(undoButton().disabled).toBe(true); // 履歴は1つだけだった
  });
});

describe('ソリティア（app/solitaire/Game.tsx）', async () => {
  const { default: Game } = await import('@/app/solitaire/Game');
  const dealWith = (r: number) => klondike.deal(() => r);
  const topMove = (s: klondike.KlondikeState) => {
    for (let a = 0; a < 7; a += 1) {
      for (let b = 0; b < 7; b += 1) {
        if (a !== b && klondike.tableauToTableau(s, { col: a, cardIndex: s.tableau[a].length - 1 }, b)) {
          return { from: a, to: b };
        }
      }
    }
    return null;
  };

  it('場札をドラッグで別の列へ運べる（裏の札がめくれる）・もどすで戻る', async () => {
    const { r, s, from, to } = findRandom(dealWith, topMove);
    await render(Game, r);
    const expected = klondike.tableauToTableau(s, { col: from, cardIndex: s.tableau[from].length - 1 }, to)!;
    const cards = cardsIn(`tableau:${from}`);
    await dragCard(cards[cards.length - 1], pileEl(`tableau:${to}`));
    expect(labelsIn(`tableau:${from}`)).toEqual(pileLabels(expected.tableau[from]));
    expect(labelsIn(`tableau:${to}`)).toEqual(pileLabels(expected.tableau[to]));
    expect(movesText()).toBe('1');
    expect(track).toHaveBeenCalledWith('solitaire', 'first-move-drag');
    fire(undoButton(), 'click');
    expect(labelsIn(`tableau:${from}`)).toEqual(pileLabels(s.tableau[from]));
    expect(undoButton().disabled).toBe(true);
  });

  it('裏向きの札はつかめない', async () => {
    await render(Game, 0.5);
    const back = cardsIn('tableau:6')[0];
    expect(back.getAttribute('aria-label')).toBe('裏向きの札');
    expect(back.classList.contains('grabbable')).toBe(false);
    fire(back, 'pointerdown', 0, 0);
    fire(back, 'pointermove', 40, 0);
    expect(container.querySelector('.drag-ghost')).toBeNull();
  });

  it('ダブルクリック1回で手が1つだけ進む', async () => {
    const { r, s, from } = findRandom(dealWith, (st) => {
      for (let c = 0; c < 7; c += 1) {
        if (klondike.autoMoveFromTableau(st, { col: c, cardIndex: st.tableau[c].length - 1 })) return { from: c, to: c };
      }
      return null;
    });
    await render(Game, r);
    const expected = klondike.autoMoveFromTableau(s, { col: from, cardIndex: s.tableau[from].length - 1 })!;
    const cards = cardsIn(`tableau:${from}`);
    const card = cards[cards.length - 1];
    for (const type of ['pointerdown', 'pointerup', 'click', 'pointerdown', 'pointerup', 'click', 'dblclick']) {
      fire(card, type);
    }
    expect(movesText()).toBe('1');
    expect(labelsIn(`tableau:${from}`)).toEqual(pileLabels(expected.tableau[from]));
  });
});

describe('スパイダー（app/spider/Game.tsx）', async () => {
  const { default: Game } = await import('@/app/spider/Game');
  const dealWith = (r: number) => spider.dealSpider('one', () => r);
  const topMove = (s: spider.SpiderState) => {
    for (let a = 0; a < 10; a += 1) {
      for (let b = 0; b < 10; b += 1) {
        if (a !== b && spider.moveSpider(s, a, s.tableau[a].length - 1, b)) return { from: a, to: b };
      }
    }
    return null;
  };

  it('並びをドラッグで別の列へ運べる・6px 以上動かして元の列で離すと何も変わらない', async () => {
    const { r, s, from, to } = findRandom(dealWith, topMove);
    await render(Game, r);

    let cards = cardsIn(`tableau:${from}`);
    await dragCard(cards[cards.length - 1], pileEl(`tableau:${from}`), 8, 0);
    expect(labelsIn(`tableau:${from}`)).toEqual(pileLabels(s.tableau[from]));
    expect(selectedCount()).toBe(0);

    const expected = spider.moveSpider(s, from, s.tableau[from].length - 1, to)!;
    cards = cardsIn(`tableau:${from}`);
    await dragCard(cards[cards.length - 1], pileEl(`tableau:${to}`));
    expect(labelsIn(`tableau:${from}`)).toEqual(pileLabels(expected.tableau[from]));
    expect(labelsIn(`tableau:${to}`)).toEqual(pileLabels(expected.tableau[to]));
    expect(movesText()).toBe('1');
    expect(track).toHaveBeenCalledWith('spider', 'first-move-drag');
  });
});
