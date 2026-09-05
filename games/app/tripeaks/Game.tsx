'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canDraw,
  deal,
  draw,
  hint as findHint,
  isExposed,
  isLost,
  isWon,
  newSeed,
  remaining,
  ROWS,
  rowOf,
  take,
  wasteTop,
  xOf,
  type TriPeaksState,
} from '@/lib/tripeaks';
import { trackToolUse } from '@/lib/analytics';
import { clearRate } from '@/lib/tripeaks';
import { CardView, EmptySlot } from '@/app/_cards/CardView';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import { DEFAULT_VARIANT, type Improved } from '@/lib/records';

/**
 * トライピークスの画面。ルールは `lib/tripeaks.ts`（純関数）にあり、
 * ここは配置・入力・演出だけを持つ。
 *
 * 仕様: docs/features/game-tripeaks.md
 */

/**
 * 段の縦の送り（札の高さに対する比）。**`app/globals.css` の tp-board の
 * 計算と同じ値**。ピラミッド（0.52・7段）より段数が少なく縦に余裕があるので、
 * 覆われた札の見える面積を広めに取っている。
 */
const STEP = 0.6;
/** 盤の高さ ÷ 札の高さ。段の送り × 3段ぶん ＋ 一番下の札1枚ぶん */
const DENOM = 1 + (ROWS - 1) * STEP;
/** 札1枚ぶんの幅（盤幅に対する%）。最下段の10枚で盤幅を使い切る */
const UNIT = 10;

/** ヒントで光らせておく時間（ms）。ピラミッド・麻雀ソリティアと揃えてある */
const HINT_MS = 2200;
/** 取れない札を押したときの揺れの時間（ms）。globals.css の py-shake と揃える */
const SHAKE_MS = 320;

/**
 * 場札1枚を置く位置。
 * 山型は段ごとに半マスずれるのでグリッドでは表せず、%指定の絶対配置で組む。
 * 横位置（`xOf`）はロジック側に置いてあり、覆う2枚の中間に来ることを
 * `tests/tripeaks.test.ts` が確かめている。
 */
function cardStyle(index: number): React.CSSProperties {
  return {
    left: `${(xOf(index) - 0.5) * UNIT}%`,
    top: `${((rowOf(index) * STEP) / DENOM) * 100}%`,
    width: `${UNIT}%`,
  };
}

export default function Game() {
  // 配るのに乱数を使うので、静的書き出しのHTMLと食い違わないよう
  // ブラウザに載ってから最初の盤面を作る
  const [state, setState] = useState<TriPeaksState | null>(null);
  const [hinted, setHinted] = useState<number | null>(null);
  const [shaken, setShaken] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<{ chain: number; improved: Improved } | null>(null);
  // もどす用の履歴。取り・めくりのすべてを積む
  const history = useRef<TriPeaksState[]>([]);
  const finished = useRef(false);
  /**
   * この配りで最長連鎖のベストを更新したか。
   *
   * **`records.finish` の `improved.score` は当てにできない。** 最長連鎖は
   * クリアを待たずに `records.update` で先に保存しているので、終わったときには
   * すでにベストと同じ値になっていて、`score > bestScore` が必ず false になる
   * （つまり🎉のバッジが一度も出ない）。更新した瞬間をここで覚えておく
   */
  const beatChain = useRef(false);
  const notified = useRef(false);
  // この配りをプレイ数に数えたか（最初の1手で数える）
  const counted = useRef(false);
  const dealt = useRef(false);
  // 記録（docs/features/game-records.md）
  const records = useRecords('tripeaks');
  const entry = records.entry();

  const start = useCallback((seed: number, action: string) => {
    history.current = [];
    finished.current = false;
    beatChain.current = false;
    notified.current = false;
    counted.current = false;
    setHinted(null);
    setShaken(null);
    setNote(null);
    setResult(null);
    setState(deal(seed));
    trackToolUse('tripeaks', action);
  }, []);

  // 最初の1回だけ配る
  useEffect(() => {
    if (dealt.current) return;
    dealt.current = true;
    start(newSeed(), 'new');
  }, [start]);

  // 光らせっぱなし・揺れっぱなしにしない
  useEffect(() => {
    if (hinted === null) return;
    const t = window.setTimeout(() => setHinted(null), HINT_MS);
    return () => window.clearTimeout(t);
  }, [hinted]);

  useEffect(() => {
    if (!shaken) return;
    const t = window.setTimeout(() => setShaken(null), SHAKE_MS);
    return () => window.clearTimeout(t);
  }, [shaken]);

  const won = state ? isWon(state) : false;
  const lost = state ? isLost(state) : false;
  const maxChain = state?.maxChain ?? 0;

  useEffect(() => {
    if (!won || finished.current) return;
    finished.current = true;
    trackToolUse('tripeaks', 'win');
    const { improved } = records.finish({ outcome: 'win', score: maxChain });
    setResult({
      chain: maxChain,
      improved: { ...improved, score: improved.score || beatChain.current },
    });
  }, [won, maxChain, records]);

  // 詰みは記録に残さない（「もどす」で戻ってやり直せるので、行き止まりに何度でも
  // 入れてしまう）。ソリティア系の帯は「プレイ数とクリア数」だけを出す
  useEffect(() => {
    if (!lost || notified.current) return;
    notified.current = true;
    trackToolUse('tripeaks', 'stuck');
  }, [lost]);

  if (!state) return <div className="card cardgame">配っています…</div>;

  const best = entry.bestScore ?? 0;
  const rate = clearRate(entry.wins ?? 0, entry.plays ?? 0);

  /** 1手ぶんの状態を進める（履歴・プレイ数をまとめて面倒みる） */
  const advance = (next: TriPeaksState) => {
    history.current = [...history.current, state];
    if (!counted.current) {
      counted.current = true;
      records.start();
    }
    setNote(null);
    setHinted(null);
    setState(next);
  };

  const onCard = (index: number) => {
    if (won || lost) return;
    const next = take(state, index);
    if (!next) {
      setShaken(`c${index}`);
      return;
    }
    advance(next);
    // **最長連鎖はクリアを待たずに残す。** 連鎖はこのゲームの手応えそのもので、
    // 詰んだ配りで出した記録を捨てると「さっきの7連鎖」がどこにも残らない
    if (next.maxChain > best) {
      beatChain.current = true;
      records.update(DEFAULT_VARIANT, (e) => ({ ...e, bestScore: next.maxChain }));
    }
  };

  const onStock = () => {
    if (won || lost) return;
    const drawn = draw(state);
    if (!drawn) {
      setShaken('stock');
      return;
    }
    advance(drawn);
  };

  const onUndo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    notified.current = false;
    setHinted(null);
    setNote(null);
    setState(prev);
  };

  const onHint = () => {
    if (won || lost) return;
    const found = findHint(state);
    if (found !== null) {
      setHinted(found);
      setNote(null);
    } else {
      // **自動ではめくらない**（ピラミッドと同じく、テンポは本人に委ねる）
      setNote(
        canDraw(state)
          ? '取れる札がありません。山札を1枚めくってください。'
          : '取れる札がなく、山札も残っていません。',
      );
    }
    trackToolUse('tripeaks', 'hint');
  };

  const newGame = () => {
    if (!won && state.moves > 0 && !window.confirm('いまのゲームをやめて新しく配り直しますか？')) {
      return;
    }
    start(newSeed(), 'new');
  };

  const replay = () => {
    if (
      !won &&
      state.moves > 0 &&
      !window.confirm(`同じ配り（No.${state.seed}）で最初からやり直しますか？`)
    ) {
      return;
    }
    start(state.seed, 'replay');
  };

  const cls = (index: number, extra: string[] = []) =>
    [...extra, hinted === index ? 'hinted' : '', shaken === `c${index}` ? 'shake' : '']
      .filter(Boolean)
      .join(' ');

  const top = wasteTop(state);
  // 札1枚ぶん（スマホで約51px）に収まる長さにする。残り枚数は札の上に出す
  const stockText = canDraw(state) ? '山札' : '山札なし';
  const stockLabel = canDraw(state)
    ? `山札 残り${state.stock.length}枚。めくる`
    : '山札なし。引き直しはありません';

  return (
    <div className="card cardgame">
      <div className="status-bar">
        <span>
          残り <strong>{remaining(state)}</strong> 枚{'　'}連鎖 <strong>{state.chain}</strong>
        </span>
        <span>この配りの最長 {state.maxChain}連鎖</span>
      </div>

      {/* 記録の帯は1回も遊んでいなくても出す（games/CLAUDE.md「画面の約束」の1）。
          あとから現れると盤が押し下げられる */}
      <RecordStrip
        items={[
          { label: 'クリア', value: `${entry.wins ?? 0} / ${entry.plays ?? 0}回` },
          { label: 'クリア率', value: rate === null ? '—' : `${rate}%` },
          { label: '最長連鎖', value: best > 0 ? `${best}連鎖` : '—' },
        ]}
      />

      {/* 文言が切り替わっても盤面が動かないよう、常に2行ぶんの高さ */}
      <p className="hint-row">
        {won ? (
          <span style={{ color: 'var(--ok)', fontWeight: 700 }}>
            🎉 クリア！この配りの最長 {result?.chain ?? state.maxChain}連鎖
            <BestBadge improved={result?.improved ?? null} />
          </span>
        ) : lost ? (
          <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
            取れる札がなく、山札も尽きました。「もどす」か「新しく配る」でやり直してください。
          </span>
        ) : note ? (
          <span style={{ color: 'var(--danger)' }}>{note}</span>
        ) : (
          '捨て札と1つ違いの札をタップして取ります。続けて取るほど連鎖が伸びます。'
        )}
      </p>

      <div className="tp-board" role="group" aria-label="3つのピークの盤面">
        {state.tableau.map((card, index) => {
          if (!card) return null;
          const open = isExposed(state.tableau, index);
          return (
            <CardView
              key={card.id}
              card={card}
              style={cardStyle(index)}
              onClick={() => onCard(index)}
              className={cls(index, [open ? 'open' : 'covered'])}
              labelSuffix={open ? '' : '（いまは取れません）'}
            />
          );
        })}
      </div>

      <div className="tp-piles">
        <div className="tp-pile">
          <button
            type="button"
            className={`playing-card${canDraw(state) ? ' back' : ' empty'}${
              shaken === 'stock' ? ' shake' : ''
            }`}
            onClick={onStock}
            disabled={!canDraw(state)}
            aria-label={stockLabel}
          >
            {canDraw(state) ? <span className="tp-count">{state.stock.length}</span> : '—'}
          </button>
          <span className="tp-pile-label">{stockText}</span>
        </div>

        <div className="tp-pile">
          {/* 捨て札は組の相手を示すだけで、押しても何もしない（取るのは場札だけ） */}
          {top ? <CardView card={top} /> : <EmptySlot />}
          <span className="tp-pile-label">捨て札</span>
        </div>

        {/* 山札の横。つながり方は常時出す（初見でも迷わせない）。
            文言も高さも変わらないので、ここが盤を動かすことはない */}
        <div className="tp-side">
          <p className="tp-legend">
            1つ違いで取れる。<strong>AはKにも2にも</strong>つながります
          </p>
          <p className="tp-seed">配り No.{state.seed}</p>
          <button type="button" className="btn" onClick={replay}>
            同じ配りをもう一度
          </button>
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 10, justifyContent: 'center' }}>
        {/* ラベルは短いまま。3つで幅320pxの端末の1行（268px）に収める */}
        <button
          type="button"
          className="btn"
          onClick={onUndo}
          disabled={history.current.length === 0}
        >
          もどす
        </button>
        <button type="button" className="btn" onClick={onHint} disabled={won || lost}>
          ヒント
        </button>
        <button type="button" className="btn" onClick={newGame}>
          新しく配る
        </button>
      </div>
    </div>
  );
}
