'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canDraw,
  canRedeal,
  deal,
  draw,
  hint as findHint,
  isExposed,
  isLost,
  isWon,
  newSeed,
  redeal,
  remaining,
  ROWS,
  rowOf,
  colOf,
  sameSpot,
  tap,
  type PyramidState,
  type Spot,
} from '@/lib/pyramid-solitaire';
import { trackToolUse } from '@/lib/analytics';
import { CardView, EmptySlot } from '@/app/_cards/CardView';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, type Improved } from '@/lib/records';

/**
 * ピラミッドソリティアの画面。ルールは `lib/pyramid-solitaire.ts`（純関数）にあり、
 * ここは配置・入力・演出だけを持つ。
 *
 * 仕様: docs/features/game-pyramid-solitaire.md
 */

/**
 * 段の縦の送り（札の高さに対する比）。**`app/globals.css` の `--py-step` と同じ値**。
 * 覆われた札も角の数字が見えるだけの隙間を残す。
 */
const STEP = 0.52;
/** 盤の高さ ÷ 札の高さ。段の送り × 6段ぶん ＋ 一番下の札1枚ぶん */
const DENOM = 1 + (ROWS - 1) * STEP;
/** 札1枚ぶんの幅（盤幅に対する%）。最下段の7枚で盤幅を使い切る */
const UNIT = 100 / ROWS;

/** ヒントで光らせておく時間（ms）。麻雀ソリティアと揃えてある */
const HINT_MS = 2200;
/** 無効な組を伝える揺れの時間（ms）。globals.css の py-shake と揃える */
const SHAKE_MS = 320;

/**
 * ピラミッドの1枚を置く位置。
 * 段は半マスずつずれるのでグリッドでは表せず、%指定の絶対配置で組む。
 */
function cardStyle(index: number): React.CSSProperties {
  const row = rowOf(index);
  const col = colOf(index);
  return {
    left: `${((ROWS - 1 - row) / 2 + col) * UNIT}%`,
    top: `${((row * STEP) / DENOM) * 100}%`,
    width: `${UNIT}%`,
  };
}

/** ヒント・揺れの対象かどうかを見るための、位置の文字列表現 */
function spotKey(spot: Spot): string {
  return spot.kind === 'waste' ? 'waste' : `p${spot.index}`;
}

export default function Game() {
  // 配るのに乱数を使うので、静的書き出しのHTMLと食い違わないよう
  // ブラウザに載ってから最初の盤面を作る
  const [state, setState] = useState<PyramidState | null>(null);
  const [hinted, setHinted] = useState<Spot[] | null>(null);
  const [shaken, setShaken] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<{ timeMs: number; improved: Improved } | null>(null);
  // もどす用の履歴。取り除き・めくり・引き直しのすべてを積む
  const history = useRef<PyramidState[]>([]);
  const finished = useRef(false);
  const notified = useRef(false);
  // この配りをプレイ数に数えたか（最初の1手で数える）
  const counted = useRef(false);
  const dealt = useRef(false);
  // 記録（docs/features/game-records.md）
  const records = useRecords('pyramid-solitaire');
  const entry = records.entry();
  const timer = useStopwatch();

  const start = useCallback(
    (seed: number, action: string) => {
      history.current = [];
      finished.current = false;
      notified.current = false;
      counted.current = false;
      setHinted(null);
      setShaken(null);
      setNote(null);
      setResult(null);
      timer.reset();
      setState(deal(seed));
      trackToolUse('pyramid-solitaire', action);
    },
    [timer],
  );

  // 最初の1回だけ配る（`start` は計測のリセットを含むので、タイマーが進むたびに
  // 作り直される。ここで配り直さないよう ref で止める）
  useEffect(() => {
    if (dealt.current) return;
    dealt.current = true;
    start(newSeed(), 'new');
  }, [start]);

  // 光らせっぱなし・揺れっぱなしにしない
  useEffect(() => {
    if (!hinted) return;
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

  useEffect(() => {
    if (!won || finished.current) return;
    finished.current = true;
    trackToolUse('pyramid-solitaire', 'win');
    const timeMs = timer.stop();
    const { improved } = records.finish({ outcome: 'win', timeMs });
    setResult({ timeMs, improved });
  }, [won, records, timer]);

  // 詰みは記録に残さない（「もどす」で戻ってやり直せるので、行き止まりに何度でも
  // 入れてしまう）。ソリティア系の帯は「プレイ数とクリア数」だけを出す
  useEffect(() => {
    if (!lost || notified.current) return;
    notified.current = true;
    trackToolUse('pyramid-solitaire', 'stuck');
  }, [lost]);

  if (!state) return <div className="card cardgame">配っています…</div>;

  /** 1手ぶんの状態を進める（履歴・プレイ数・計測をまとめて面倒みる） */
  const advance = (next: PyramidState) => {
    history.current = [...history.current, state];
    if (!counted.current) {
      counted.current = true;
      records.start();
    }
    timer.begin();
    setNote(null);
    setHinted(null);
    setState(next);
  };

  const onTap = (spot: Spot) => {
    if (won || lost) return;
    const r = tap(state, spot);
    if (r.effect === 'invalid') {
      setShaken(spotKey(spot));
      // 選択の移動（tap が返す新しい状態）は履歴に積まない。取り除いていないので
      // 「もどす」で戻る先は同じ盤面になり、押しても何も起きなく見えてしまう
      setState(r.state);
      return;
    }
    if (r.effect === 'remove') {
      advance(r.state);
      return;
    }
    setState(r.state);
  };

  const onStock = () => {
    if (won) return;
    const drawn = draw(state);
    if (drawn) {
      advance(drawn);
      return;
    }
    const back = redeal(state);
    if (back) {
      advance(back);
      trackToolUse('pyramid-solitaire', 'redeal');
      return;
    }
    setShaken('stock');
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
    if (found) {
      setHinted(found);
      setNote(null);
    } else {
      // **自動ではめくらない**（仕様「テンポは1人用なので本人に委ねる」）。
      // 取れる組が無いときだけ、山札に手を伸ばすよう促す
      setNote(
        canDraw(state)
          ? '取れる組がありません。山札を1枚めくってください。'
          : canRedeal(state)
            ? '取れる組がありません。「引き直す」で捨て札を山札に戻せます。'
            : '取れる組がなく、山札も引き直しも残っていません。',
      );
    }
    trackToolUse('pyramid-solitaire', 'hint');
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

  const isHinted = (spot: Spot) => !!hinted?.some((h) => sameSpot(h, spot));
  const isSelected = (spot: Spot) => !!state.selected && sameSpot(state.selected, spot);
  const cls = (spot: Spot, extra: string[] = []) =>
    [
      ...extra,
      isHinted(spot) ? 'hinted' : '',
      shaken === spotKey(spot) ? 'shake' : '',
    ]
      .filter(Boolean)
      .join(' ');

  // 山札の下に置ける幅は札1枚ぶん（スマホで約51px）しかなく、
  // 0.72remなら4文字で埋まる。**枚数は札の上に、引き直しの残り回数は状態の帯に
  // 出しているので、ここは名前だけにする**（詰めて入れると末尾が切れて読めない）
  const stockText = canDraw(state) ? '山札' : canRedeal(state) ? '引き直す' : '山札なし';
  // 読み上げには詰まった情報のほうを渡す
  const stockLabel = canDraw(state)
    ? `山札 残り${state.stock.length}枚。めくる`
    : canRedeal(state)
      ? `捨て札を山札に戻す（引き直し 残り${state.redeals}回）`
      : '山札なし。引き直しも残っていません';

  return (
    <div className="card cardgame">
      <div className="status-bar">
        <span>
          残り <strong>{remaining(state)}</strong> 枚{'　'}⏱ {formatTime(timer.ms)}
        </span>
        <span>引き直し 残り{state.redeals}回</span>
      </div>

      {/* 記録の帯は1回も遊んでいなくても出す（games/CLAUDE.md「画面の約束」の1）。
          あとから現れると盤が押し下げられる */}
      <RecordStrip
        items={[
          { label: 'ベスト', value: entry.bestTimeMs ? formatTime(entry.bestTimeMs) : '—' },
          { label: 'クリア', value: `${entry.wins ?? 0} / ${entry.plays ?? 0}回` },
        ]}
      />

      {/* 文言が切り替わっても盤面が動かないよう、常に2行ぶんの高さ */}
      <p className="hint-row">
        {won ? (
          <span style={{ color: 'var(--ok)', fontWeight: 700 }}>
            🎉 クリア！タイム {formatTime(result?.timeMs ?? timer.ms)}
            {result && !result.improved.time && entry.bestTimeMs
              ? `（ベスト ${formatTime(entry.bestTimeMs)}）`
              : ''}
            <BestBadge improved={result?.improved ?? null} />
          </span>
        ) : lost ? (
          <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
            取れる組がなく、山札も尽きました。「もどす」か「新しく配る」でやり直してください。
          </span>
        ) : note ? (
          <span style={{ color: 'var(--danger)' }}>{note}</span>
        ) : state.selected ? (
          '足して13になる相手をタップ。同じ札をもう一度タップすると選択を外せます。'
        ) : (
          '足して13になる2枚をタップして取り除きます。Kは1枚で取れます。'
        )}
      </p>

      <div className="py-board" role="group" aria-label="ピラミッドの盤面">
        {state.pyramid.map((card, index) => {
          const spot: Spot = { kind: 'pyramid', index };
          if (!card) return null;
          const open = isExposed(state.pyramid, index);
          return (
            <CardView
              key={card.id}
              card={card}
              selected={isSelected(spot)}
              style={cardStyle(index)}
              onClick={() => onTap(spot)}
              className={cls(spot, [open ? 'open' : 'covered'])}
              labelSuffix={open ? '' : '（いまは取れません）'}
            />
          );
        })}
      </div>

      <div className="py-piles">
        <div className="py-pile">
          <button
            type="button"
            className={`playing-card${canDraw(state) ? ' back' : ' empty'}${
              shaken === 'stock' ? ' shake' : ''
            }`}
            onClick={onStock}
            disabled={!canDraw(state) && !canRedeal(state)}
            aria-label={stockLabel}
          >
            {canDraw(state) ? <span className="py-count">{state.stock.length}</span> : '↻'}
          </button>
          <span className="py-pile-label">{stockText}</span>
        </div>

        <div className="py-pile">
          {state.waste.length > 0 ? (
            <CardView
              card={state.waste[state.waste.length - 1]}
              selected={isSelected({ kind: 'waste' })}
              onClick={() => onTap({ kind: 'waste' })}
              className={cls({ kind: 'waste' })}
            />
          ) : (
            <EmptySlot />
          )}
          <span className="py-pile-label">捨て札</span>
        </div>

        {/* 山札の横。数え方は常時出す（仕様「初見でも迷わせない」）。
            文言も高さも変わらないので、ここが盤を動かすことはない */}
        <div className="py-side">
          {/* 幅320pxの端末ではこの列が156pxしかなく、2行で入るのは26文字ほど。
              「Kは1枚で取れる」は案内の行と遊び方に書いてあるので、
              ここは数え方だけに絞る（詰め込むと末尾が切れて読めない） */}
          <p className="py-legend">
            数え方 A=1 / J=11 / Q=12 / <strong>K=13</strong>
          </p>
          <p className="py-seed">配り No.{state.seed}</p>
          <button type="button" className="btn" onClick={replay}>
            同じ配りをもう一度
          </button>
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 10, justifyContent: 'center' }}>
        {/* ラベルは短いまま。3つで幅320pxの端末の1行（268px）に収める */}
        <button type="button" className="btn" onClick={onUndo} disabled={history.current.length === 0}>
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
