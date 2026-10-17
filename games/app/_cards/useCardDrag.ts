'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createClickGuard,
  DRAG_RETURN_MS,
  dropKey,
  isDragDistance,
  parseDrop,
  pickDrop,
  type DropCandidate,
  type DropTarget,
} from '@/lib/card-drag';

/**
 * ソリティア3本で共有する「つかんで運ぶ」操作（docs/features/card-games-drag-drop.md）。
 *
 * - 押して 6px 未満で離したら何もしない（今までどおり `click` がタップの経路に流れる）
 * - 6px 以上動いたらドラッグ。つかんだ並びの写し（`DragGhost`）を指・カーソルに追従させる
 * - 離した点と札の中心の下にある `data-drop` を探し、`tryDrop` を呼ぶ（ルールの判定はゲーム側の `move()`）
 * - ドラッグとして扱った操作のあとの `click` は1回だけ捨てる（`boardProps.onClickCapture`）
 *
 * 追従は写しの外側の要素1つに `transform` をかけるだけで、盤は再描画しない。
 * React の状態を変えるのは「つかんだとき」と「離したとき」の2回だけ。
 */

export interface CardDragOptions<S> {
  /** その並びをつかめるか（動かせない並びは揺れて戻る） */
  canGrab: (src: S) => boolean;
  /** その落とし先に置けるか（運んでいる間の緑の枠。`move()` の試算） */
  canDrop: (src: S, target: DropTarget) => boolean;
  /** 実際に置く。置けたら true（履歴への積みはゲーム側の `apply`） */
  drop: (src: S, target: DropTarget) => boolean;
  /** 置けない所へ落としたとき（元の列に戻しただけのときは呼ばない） */
  onMiss?: () => void;
  /** つかみ始めたとき（タップの選択を解くなど） */
  onGrab?: () => void;
  /** 落とし先の一覧（強調の判定に使う） */
  targets: DropTarget[];
  /** 移動元が自分の列か（そこへ落としたら「やめた」扱い） */
  isHome: (src: S, target: DropTarget) => boolean;
  /** 移動元の識別子（揺れ・半透明の当て先） */
  keyOf: (src: S) => string;
}

export interface DragView<S> {
  src: S;
  /** 押したときの札の矩形（写しを置く位置と幅） */
  left: number;
  top: number;
  width: number;
  /** 置ける落とし先の `data-drop` の値 */
  ok: Set<string>;
}

interface Pending<S> {
  src: S;
  pointerId: number;
  x: number;
  y: number;
  dragging: boolean;
  rect: { left: number; top: number; width: number; height: number };
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** 次のフレームで実行する（rAF が無い環境では次のタスク） */
function nextFrame(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => fn());
  else setTimeout(fn, 0);
}

/** 点の下にある落とし先（`data-drop` の付いた祖先）を探す */
function dropAt(x: number, y: number): DropCandidate | null {
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return null;
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
  const target = parseDrop(el?.dataset.drop);
  if (!el || !target) return null;
  const r = el.getBoundingClientRect();
  return { target, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
}

export function useCardDrag<S>(opts: CardDragOptions<S>) {
  // 毎描画で新しい関数が来るので、ハンドラからは常に最新を読む
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const pending = useRef<Pending<S> | null>(null);
  const ghostEl = useRef<HTMLDivElement | null>(null);
  // 写しが描かれる前の移動量も、描かれた瞬間に当てる（1フレーム元の位置に出ないように）
  const offset = useRef({ dx: 0, dy: 0 });
  const ghostRef = useCallback((el: HTMLDivElement | null) => {
    ghostEl.current = el;
    if (el) el.style.transform = `translate(${offset.current.dx}px, ${offset.current.dy}px)`;
  }, []);
  const guard = useRef(createClickGuard()).current;
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drag, setDrag] = useState<DragView<S> | null>(null);
  const [shake, setShake] = useState<string | null>(null);
  // 揺らしただけの操作の pointerup を待つ印（pointerId）。離したあとの click を捨てるため
  const armGuardOnUp = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (returnTimer.current) clearTimeout(returnTimer.current);
    },
    [],
  );

  const moveGhost = (dx: number, dy: number, animate = false) => {
    offset.current = { dx, dy };
    const g = ghostEl.current;
    if (!g) return;
    g.style.transition = animate ? `transform ${DRAG_RETURN_MS}ms ease` : 'none';
    g.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  /** ドラッグを終える。置けなかったときは元の位置へ戻してから写しを消す */
  const finish = (returned: boolean) => {
    pending.current = null;
    if (returned && !prefersReducedMotion() && ghostEl.current) {
      moveGhost(0, 0, true);
      returnTimer.current = setTimeout(() => setDrag(null), DRAG_RETURN_MS);
    } else {
      setDrag(null);
    }
  };

  const armGuard = () => {
    guard.arm();
    nextFrame(() => guard.disarm());
  };

  const bind = (src: S) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // 運んでいる最中の2本目の指は無視する。押しただけで離しそびれた前回の分は上書きしてよい
      if (pending.current?.dragging) return;
      armGuardOnUp.current = null;
      const el = e.currentTarget;
      el.setPointerCapture?.(e.pointerId);
      const r = el.getBoundingClientRect();
      pending.current = {
        src,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        dragging: false,
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      };
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointerId) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (!p.dragging) {
        if (!isDragDistance(dx, dy)) return;
        const o = optsRef.current;
        if (!o.canGrab(p.src)) {
          // 動かせない並び: つかまずに揺らすだけ。離したあとの click も捨てる（タップではない）
          pending.current = null;
          armGuardOnUp.current = p.pointerId;
          setShake(o.keyOf(p.src));
          setTimeout(() => setShake(null), 320);
          return;
        }
        if (returnTimer.current) {
          clearTimeout(returnTimer.current);
          returnTimer.current = null;
        }
        p.dragging = true;
        o.onGrab?.();
        const ok = new Set(o.targets.filter((t) => o.canDrop(p.src, t)).map((t) => dropKey(t)));
        setDrag({ src: p.src, left: p.rect.left, top: p.rect.top, width: p.rect.width, ok });
      }
      moveGhost(dx, dy);
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      if (armGuardOnUp.current === e.pointerId) {
        armGuardOnUp.current = null;
        armGuard();
        return;
      }
      const p = pending.current;
      if (!p || e.pointerId !== p.pointerId) return;
      if (!p.dragging) {
        // 6px 未満: タップ。click はそのままタップの経路へ
        pending.current = null;
        return;
      }
      armGuard();
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      const center = { x: p.rect.left + dx + p.rect.width / 2, y: p.rect.top + dy + p.rect.height / 2 };
      const target = pickDrop([dropAt(e.clientX, e.clientY), dropAt(center.x, center.y)], center);
      const o = optsRef.current;
      if (target && o.isHome(p.src, target)) {
        finish(true);
        return;
      }
      if (target && o.drop(p.src, target)) {
        finish(false);
        return;
      }
      o.onMiss?.();
      finish(true);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
      if (armGuardOnUp.current === e.pointerId) armGuardOnUp.current = null;
      const p = pending.current;
      if (!p || e.pointerId !== p.pointerId) return;
      if (p.dragging) armGuard();
      finish(p.dragging);
    },
  });

  /** 盤の外側に付ける。ドラッグのあとの click を捕捉段階で捨てる */
  const boardProps = {
    onClickCapture: (e: React.MouseEvent) => {
      if (guard.swallow()) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };

  const key = (src: S) => optsRef.current.keyOf(src);

  return {
    drag,
    ghostRef,
    bind,
    boardProps,
    /** 揺らしている札か */
    isShaking: (src: S) => shake !== null && shake === key(src),
    /** 運んでいる間、置ける落とし先か（緑の枠） */
    isDropOk: (target: DropTarget) => drag !== null && drag.ok.has(dropKey(target)),
  };
}
