'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canDraw,
  clearRate,
  COLUMN_SIZE,
  COLUMNS,
  deal,
  draw,
  hint as findHint,
  isCleared,
  isLost,
  newSeed,
  pick,
  remaining,
  VARIANT_LABEL,
  VARIANT_NOTE,
  VARIANTS,
  wasteTop,
  type GolfState,
  type GolfVariant,
} from '@/lib/golf-solitaire';
import { trackToolUse } from '@/lib/analytics';
import { CardView, EmptySlot } from '@/app/_cards/CardView';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import { type Improved } from '@/lib/records';

/**
 * ゴルフソリティアの画面。ルールは `lib/golf-solitaire.ts`（純関数）にあり、
 * ここは配置・入力・演出だけを持つ。
 *
 * 仕様: docs/features/game-golf-solitaire.md
 */

/**
 * 列の中の縦の送り（札の高さに対する比）。**`app/globals.css` の gf-board の
 * 計算と同じ値**（片方だけ直さないこと）。
 * 手前の札しか取れないので、奥の札は数字とスートが読めれば足りる。
 */
const STEP = 0.36;
/** 列の高さ ÷ 札の高さ。送り × 4枚ぶん ＋ 手前の札1枚ぶん */
const DENOM = 1 + (COLUMN_SIZE - 1) * STEP;
/** 札1枚ぶんの幅（盤幅に対する%）。7列で盤幅を使い切る */
const UNIT = 100 / COLUMNS;

/** ヒントで光らせておく時間（ms）。他のソリティアと揃えてある */
const HINT_MS = 2200;
/** 取れない札を押したときの揺れの時間（ms）。globals.css の py-shake と揃える */
const SHAKE_MS = 320;

/**
 * 場札1枚を置く位置。
 * 列の中で重なるので、%指定の絶対配置で組む（`.tp-board` と同じつくり）。
 */
function cardStyle(column: number, row: number): React.CSSProperties {
  return {
    left: `${column * UNIT}%`,
    top: `${((row * STEP) / DENOM) * 100}%`,
    width: `${UNIT}%`,
  };
}

export default function Game() {
  // 配るのに乱数を使うので、静的書き出しのHTMLと食い違わないよう
  // ブラウザに載ってから最初の盤面を作る
  const [state, setState] = useState<GolfState | null>(null);
  const [variant, setVariant] = useState<GolfVariant>('standard');
  const [hinted, setHinted] = useState<number | null>(null);
  const [shaken, setShaken] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<{ chain: number; improved: Improved } | null>(null);
  // もどす用の履歴。取り・めくりのすべてを積む
  const history = useRef<GolfState[]>([]);
  const finished = useRef(false);
  const notified = useRef(false);
  // この配りをプレイ数に数えたか（最初の1手で数える）
  const counted = useRef(false);
  const dealt = useRef(false);
  // 記録（docs/features/game-records.md）。**区分はルールの区分と同じ文字列**
  const records = useRecords('golf-solitaire');
  const entry = records.entry(variant);

  const start = useCallback((seed: number, rule: GolfVariant, action: string) => {
    history.current = [];
    finished.current = false;
    notified.current = false;
    counted.current = false;
    setHinted(null);
    setShaken(null);
    setNote(null);
    setResult(null);
    setState(deal(seed, rule));
    trackToolUse('golf-solitaire', action);
  }, []);

  // 最初の1回だけ配る
  useEffect(() => {
    if (dealt.current) return;
    dealt.current = true;
    start(newSeed(), 'standard', 'new');
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

  const cleared = state ? isCleared(state) : false;
  const lost = state ? isLost(state) : false;
  const maxChain = state?.maxChain ?? 0;
  const playing = state?.variant ?? variant;

  useEffect(() => {
    if (!cleared || finished.current) return;
    finished.current = true;
    trackToolUse('golf-solitaire', 'win');
    const { improved } = records.finish({ outcome: 'win', score: maxChain }, playing);
    setResult({ chain: maxChain, improved });
  }, [cleared, maxChain, playing, records]);

  // 詰みは記録に残さない（「もどす」で戻ってやり直せるので、行き止まりに何度でも
  // 入れてしまう）。ソリティア系の帯は「プレイ数とクリア数」だけを出す
  useEffect(() => {
    if (!lost || notified.current) return;
    notified.current = true;
    trackToolUse('golf-solitaire', 'stuck');
  }, [lost]);

  if (!state) return <div className="card cardgame">配っています…</div>;

  const best = entry.bestScore ?? 0;
  const rate = clearRate(entry.wins ?? 0, entry.plays ?? 0);
  const top = wasteTop(state);

  /** 1手ぶんの状態を進める（履歴・プレイ数をまとめて面倒みる） */
  const advance = (next: GolfState) => {
    history.current = [...history.current, state];
    if (!counted.current) {
      counted.current = true;
      records.start(state.variant);
    }
    setNote(null);
    setHinted(null);
    setState(next);
  };

  const onCard = (column: number) => {
    if (cleared || lost) return;
    const next = pick(state, column);
    if (!next) {
      setShaken(`c${column}`);
      return;
    }
    advance(next);
    // **最長連鎖はクリアを待たずに残す**（トライピークスと同じ）。
    // 詰んだ配りで出した記録を捨てると「さっきの6連鎖」がどこにも残らない
    if (next.maxChain > best) {
      records.update(state.variant, (e) => ({ ...e, bestScore: next.maxChain }));
    }
  };

  const onStock = () => {
    if (cleared || lost) return;
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
    if (cleared || lost) return;
    const found = findHint(state);
    if (found !== null) {
      setHinted(found);
      setNote(null);
    } else {
      // **自動ではめくらない**（ピラミッド・トライピークスと同じく、
      // テンポは本人に委ねる）
      setNote(
        canDraw(state)
          ? '取れる札がありません。山札を1枚めくってください。'
          : '取れる札がなく、山札も残っていません。',
      );
    }
    trackToolUse('golf-solitaire', 'hint');
  };

  /** 途中のゲームを捨てる操作の前に一声かける（クリア後は聞かない） */
  const confirmAbandon = (message: string) =>
    cleared || state.moves === 0 || window.confirm(message);

  const newGame = () => {
    if (!confirmAbandon('いまのゲームをやめて新しく配り直しますか？')) return;
    start(newSeed(), variant, 'new');
  };

  const replay = () => {
    if (!confirmAbandon(`同じ配り（No.${state.seed}）で最初からやり直しますか？`)) return;
    start(state.seed, state.variant, 'replay');
  };

  /** ルールを変えたら配り直す（途中で条件が変わると連鎖の記録が意味を失う） */
  const changeVariant = (next: GolfVariant) => {
    if (next === variant) return;
    if (!confirmAbandon('ルールを変えて新しく配り直しますか？')) return;
    setVariant(next);
    start(newSeed(), next, 'variant');
  };

  /**
   * 札1枚のクラス。**ヒントは手前の1枚だけを光らせる**（取れるのはその札だけ。
   * 列ごと光らせると「どれを押すのか」が伝わらない）。
   * 揺れは列ごとにかける（押した札が奥でも「この列は取れない」と読める）。
   */
  const cls = (column: number, open: boolean) =>
    [
      open ? 'open' : 'covered',
      open && hinted === column ? 'hinted' : '',
      shaken === `c${column}` ? 'shake' : '',
    ]
      .filter(Boolean)
      .join(' ');

  // 札1枚ぶん（スマホで約51px）に収まる長さにする。残り枚数は札の上に出す
  const stockText = canDraw(state) ? '山札' : '山札なし';
  const stockLabel = canDraw(state)
    ? `山札 残り${state.stock.length}枚。めくる`
    : '山札なし。引き直しはありません';

  return (
    <div className="card cardgame">
      {/* ルールの区分は畳まない（games/CLAUDE.md「設定は隠さない」）。
          カードの先頭なので上の余白だけ詰めて、盤に使える高さを残す */}
      <div className="btn-row" style={{ marginTop: 0 }}>
        <div className="seg" role="group" aria-label="ルール">
          {VARIANTS.map((v) => (
            <button
              key={v}
              type="button"
              className={v === variant ? 'active' : ''}
              aria-pressed={v === variant}
              onClick={() => changeVariant(v)}
            >
              {VARIANT_LABEL[v]}
            </button>
          ))}
        </div>
      </div>

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

      {/* 文言が切り替わっても盤面が動かないよう、常に3行ぶんの高さ */}
      <p className="hint-row">
        {cleared ? (
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
        ) : top ? (
          '各列の手前の1枚だけ取れます。続けて取るほど連鎖が伸びます。'
        ) : (
          '山札をタップして1枚めくると始まります。'
        )}
      </p>

      <div className="gf-board" role="group" aria-label="7列の盤面">
        {state.columns.map((pile, column) =>
          pile.map((card, row) => {
            const open = row === pile.length - 1;
            return (
              <CardView
                key={card.id}
                card={card}
                style={cardStyle(column, row)}
                onClick={() => onCard(column)}
                className={cls(column, open)}
                labelSuffix={open ? '' : '（列の奥。いまは取れません）'}
              />
            );
          }),
        )}
      </div>

      <div className="gf-piles">
        <div className="gf-pile">
          <button
            type="button"
            className={`playing-card${canDraw(state) ? ' back' : ' empty'}${
              shaken === 'stock' ? ' shake' : ''
            }`}
            onClick={onStock}
            disabled={!canDraw(state)}
            aria-label={stockLabel}
          >
            {canDraw(state) ? <span className="gf-count">{state.stock.length}</span> : '—'}
          </button>
          <span className="gf-pile-label">{stockText}</span>
        </div>

        <div className="gf-pile">
          {/* 捨て札は組の相手を示すだけで、押しても何もしない（取るのは場札だけ） */}
          {top ? <CardView card={top} /> : <EmptySlot />}
          <span className="gf-pile-label">捨て札</span>
        </div>

        {/* 山札の横。つながり方は常時出す（初見でも迷わせない）。
            文言も高さも変わらないので、ここが盤を動かすことはない */}
        <div className="gf-side">
          <p className="gf-legend">{VARIANT_NOTE[state.variant]}</p>
          <p className="gf-seed">配り No.{state.seed}</p>
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
        <button type="button" className="btn" onClick={onHint} disabled={cleared || lost}>
          ヒント
        </button>
        <button type="button" className="btn" onClick={newGame}>
          新しく配る
        </button>
      </div>
    </div>
  );
}
