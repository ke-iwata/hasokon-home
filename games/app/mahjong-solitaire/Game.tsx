'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  availableMatches,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  cleared,
  deadlocked,
  hint as findHint,
  isFree,
  newGame,
  remaining,
  shuffleRemaining,
  tap,
  TILE_SPAN,
  TURTLE_LAYOUT,
  undo,
  type MahjongState,
} from '@/lib/mahjong-solitaire';
import { faceById } from '@/lib/mahjong-tiles';
import { trackToolUse } from '@/lib/analytics';
import TileFace from './TileFace';

/**
 * 描く順。下の段から、同じ段では奥（上）から手前（下）へ、左から右へ。
 * 絶対配置なので後に書いたものが上に重なる。牌の厚みは右下に落とす影で出しており、
 * この順に描くと、右どなり・下どなりの牌が影を隠してくれて板が繋がって見える。
 */
const DRAW_ORDER = TURTLE_LAYOUT.map((_, i) => i).sort((a, b) => {
  const s = TURTLE_LAYOUT[a];
  const t = TURTLE_LAYOUT[b];
  return s.layer - t.layer || s.y - t.y || s.x - t.x;
});

/**
 * 段が上がるごとに左上へずらす量（半マス単位）。
 * これで積み上がって見える。ずらすのは2段目以降だけなので、
 * 盤面の外枠（最下段が決めている 30×16）からはみ出さない。
 */
const LAYER_SHIFT_X = 0.2;
const LAYER_SHIFT_Y = 0.24;

/** ヒントで光らせておく時間（ms）。短すぎると目で追えない */
const HINT_MS = 2200;

function tileStyle(slot: number): React.CSSProperties {
  const { layer, x, y } = TURTLE_LAYOUT[slot];
  return {
    left: `${((x - layer * LAYER_SHIFT_X) / BOARD_WIDTH) * 100}%`,
    top: `${((y - layer * LAYER_SHIFT_Y) / BOARD_HEIGHT) * 100}%`,
    width: `${(TILE_SPAN / BOARD_WIDTH) * 100}%`,
    height: `${(TILE_SPAN / BOARD_HEIGHT) * 100}%`,
  };
}

export default function Game() {
  // 配るのに乱数を使うので、静的書き出しのHTMLと食い違わないよう
  // ブラウザに載ってから最初の盤面を作る（リバーシの ready と同じ理由）
  const [state, setState] = useState<MahjongState | null>(null);
  const [hinted, setHinted] = useState<[number, number] | null>(null);
  const finished = useRef(false);
  const notified = useRef(false);

  const start = useCallback(() => {
    finished.current = false;
    notified.current = false;
    setHinted(null);
    setState(newGame());
    trackToolUse('mahjong-solitaire', 'new');
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  // ヒントは一定時間で自然に消す（消し忘れて盤面が光り続けないように）
  useEffect(() => {
    if (!hinted) return;
    const timer = window.setTimeout(() => setHinted(null), HINT_MS);
    return () => window.clearTimeout(timer);
  }, [hinted]);

  const matches = useMemo(() => (state ? availableMatches(state) : []), [state]);
  const left = state ? remaining(state) : 0;
  const done = state ? cleared(state) : false;
  const stuck = state ? deadlocked(state) : false;

  useEffect(() => {
    if (!done || finished.current) return;
    finished.current = true;
    trackToolUse('mahjong-solitaire', 'clear');
  }, [done]);

  useEffect(() => {
    if (!stuck || notified.current) return;
    notified.current = true;
    trackToolUse('mahjong-solitaire', 'deadlock');
  }, [stuck]);

  const onTap = (slot: number) => {
    if (!state) return;
    setHinted(null);
    setState(tap(state, slot).state);
  };

  const onUndo = () => {
    if (!state || state.removed.length === 0) return;
    setHinted(null);
    notified.current = false;
    setState(undo(state));
    trackToolUse('mahjong-solitaire', 'undo');
  };

  const onHint = () => {
    if (!state) return;
    setHinted(findHint(state));
    trackToolUse('mahjong-solitaire', 'hint');
  };

  const onShuffle = () => {
    if (!state) return;
    setHinted(null);
    notified.current = false;
    setState(shuffleRemaining(state));
    trackToolUse('mahjong-solitaire', 'shuffle');
  };

  return (
    <div className="card">
      <div className="status-bar">
        <span>
          残り <strong>{left}</strong> 枚
        </span>
        <span>
          {done
            ? 'クリア！'
            : stuck
              ? '消せる組がありません'
              : `消せる組 ${matches.length}`}
        </span>
      </div>

      {done && (
        <p className="status-bar" style={{ color: 'var(--ok)', fontWeight: 700 }}>
          🎉 全部消せました！
        </p>
      )}

      {stuck && !done && (
        <p className="status-bar" style={{ color: 'var(--danger)', fontWeight: 700 }}>
          詰みです。「もどす」で打ち直すか、「並べ替え」で残りを配り直してください。
        </p>
      )}

      <div className="mj-board" role="group" aria-label="麻雀ソリティアの盤面">
        {state &&
          DRAW_ORDER.filter((slot) => state.present[slot]).map((slot) => {
            const face = faceById(state.faces[slot]);
            const free = isFree(state.present, slot);
            const cls = [
              'mj-tile',
              free ? 'free' : 'blocked',
              state.selected === slot ? 'selected' : '',
              hinted && (hinted[0] === slot || hinted[1] === slot) ? 'hinted' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={slot}
                type="button"
                className={cls}
                style={tileStyle(slot)}
                onClick={() => onTap(slot)}
                disabled={!free}
                aria-pressed={state.selected === slot}
                aria-label={`${face.name}${free ? '' : '（いまは取れません）'}`}
              >
                <TileFace id={state.faces[slot]} />
              </button>
            );
          })}
        {!state && <p className="mj-loading">牌を配っています…</p>}
      </div>

      <div className="btn-row" style={{ marginTop: 14, justifyContent: 'center' }}>
        <button
          type="button"
          className="btn"
          onClick={onUndo}
          disabled={!state || state.removed.length === 0}
        >
          ↩ もどす
        </button>
        <button type="button" className="btn" onClick={onHint} disabled={!state || matches.length === 0}>
          ヒント
        </button>
        <button type="button" className="btn" onClick={onShuffle} disabled={!state || done}>
          並べ替え
        </button>
        <button type="button" className="btn" onClick={start}>
          はじめから
        </button>
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
        同じ絵柄の牌を2つタップすると消えます。取れるのは
        <strong>上に牌が乗っておらず、左右のどちらかが空いている牌</strong>だけです。
        花牌（梅・蘭・菊・竹）と季節牌（春・夏・秋・冬）は、
        <strong>同じ組の中ならどれとでも合います</strong>。
        配られる盤面は必ず最後まで消せるようになっています。
      </p>
    </div>
  );
}
