'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canDraw,
  clearRate,
  deal,
  draw,
  hint as findHint,
  isCleared,
  isLost,
  newSeed,
  pick,
  remaining,
  variantOf,
  wasteTop,
  type GolfState,
} from '@/lib/golf-solitaire';
import { trackToolUse } from '@/lib/analytics';
import { CardView, EmptySlot } from '@/app/_cards/CardView';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import type { Improved } from '@/lib/records';

/**
 * ゴルフソリティアの画面。ルールは `lib/golf-solitaire.ts`（純関数）にあり、
 * ここは配置・入力・演出だけを持つ。
 *
 * 仕様: docs/features/game-golf-solitaire.md
 *
 * トライピークス（app/tripeaks/Game.tsx）を下敷きにしている。違うのは3点。
 * - 場が山型ではなく7列なので、絶対配置ではなく既存の `.tableau.cols7` に載せる
 * - **列のどこを押しても手前の1枚を取る**（奥の札は取れないが、押し間違いを
 *   「何も起きない」で終わらせないため、揺れは列全体ではなく手前の札に出す）
 * - A↔K をつなげるかを選べる。**ルールを変えたら配り直す**
 *   （途中で変えると同じ配りの記録がルールをまたいでしまうため。色水ソートの
 *   難易度切り替えと同じ作法）
 */

/** ヒントで光らせておく時間（ms）。ピラミッド・トライピークスと揃えてある */
const HINT_MS = 2200;
/** 取れない札を押したときの揺れの時間（ms）。globals.css の py-shake と揃える */
const SHAKE_MS = 320;

/** ルールの選択肢。ラベルは幅320pxの端末で1行に収まる長さにしてある */
const RULES = [
  { wrap: false, label: 'Kで止まる' },
  { wrap: true, label: 'A↔Kつなぐ' },
] as const;

export default function Game() {
  // 配るのに乱数を使うので、静的書き出しのHTMLと食い違わないよう
  // ブラウザに載ってから最初の盤面を作る
  const [state, setState] = useState<GolfState | null>(null);
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
  // 記録（docs/features/game-records.md）。区分はルールごと
  const records = useRecords('golf-solitaire');
  const variant = variantOf(state?.wrap ?? false);
  const entry = records.entry(variant);

  const start = useCallback((seed: number, action: string, wrap: boolean) => {
    history.current = [];
    finished.current = false;
    notified.current = false;
    counted.current = false;
    setHinted(null);
    setShaken(null);
    setNote(null);
    setResult(null);
    setState(deal(seed, wrap));
    trackToolUse('golf-solitaire', action);
  }, []);

  // 最初の1回だけ配る
  useEffect(() => {
    if (dealt.current) return;
    dealt.current = true;
    start(newSeed(), 'new', false);
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

  const won = state ? isCleared(state) : false;
  const lost = state ? isLost(state) : false;
  const maxChain = state?.maxChain ?? 0;

  useEffect(() => {
    if (!won || finished.current) return;
    finished.current = true;
    trackToolUse('golf-solitaire', 'win');
    const { improved } = records.finish({ outcome: 'win', score: maxChain }, variant);
    setResult({ chain: maxChain, improved });
  }, [won, maxChain, records, variant]);

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
      records.start(variant);
    }
    setNote(null);
    setHinted(null);
    setState(next);
  };

  const onColumn = (col: number) => {
    if (won || lost) return;
    const next = pick(state, col);
    if (!next) {
      setShaken(`c${col}`);
      return;
    }
    advance(next);
    // **最長連鎖はクリアを待たずに残す。** 連鎖はこのゲームの手応えそのもので、
    // 詰んだ配りで出した記録を捨てると「さっきの7連鎖」がどこにも残らない
    if (next.maxChain > best) {
      records.update(variant, (e) => ({ ...e, bestScore: next.maxChain }));
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
      // **自動ではめくらない**（ピラミッド・トライピークスと同じく、テンポは本人に委ねる）
      setNote(
        canDraw(state)
          ? '取れる札がありません。山札を1枚めくってください。'
          : '取れる札がなく、山札も残っていません。',
      );
    }
    trackToolUse('golf-solitaire', 'hint');
  };

  /** 遊びかけかどうか（配り直しの確認を出すかの判断に使う） */
  const inPlay = !won && (state.moves > 0 || state.waste.length > 0);

  const newGame = () => {
    if (inPlay && !window.confirm('いまのゲームをやめて新しく配り直しますか？')) return;
    start(newSeed(), 'new', state.wrap);
  };

  const replay = () => {
    if (inPlay && !window.confirm(`同じ配り（No.${state.seed}）で最初からやり直しますか？`)) return;
    start(state.seed, 'replay', state.wrap);
  };

  /** ルールの切り替え。取れる札が変わるので、配り直してから適用する */
  const changeRule = (wrap: boolean) => {
    if (wrap === state.wrap) return;
    if (inPlay && !window.confirm('ルールを変えると新しく配り直します。いまのゲームをやめますか？')) {
      return;
    }
    start(newSeed(), wrap ? 'new-wrap' : 'new', wrap);
  };

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

      {/* ルールは畳まない（games/CLAUDE.md「画面の約束」の5）。
          記録もこの区分ごとに分かれるので、いま何で遊んでいるかは常に見えている */}
      <div className="seg gf-rule" role="group" aria-label="AとKのつなぎ方">
        {RULES.map((rule) => (
          <button
            key={rule.label}
            type="button"
            className={rule.wrap === state.wrap ? 'active' : ''}
            aria-pressed={rule.wrap === state.wrap}
            onClick={() => changeRule(rule.wrap)}
          >
            {rule.label}
          </button>
        ))}
      </div>

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
        ) : top ? (
          '捨て札と1つ違いの札をタップして取ります。取れるのは各列の手前の1枚だけです。'
        ) : (
          'まず山札をタップして1枚めくります。そこから1つ違いの札をつないでいきます。'
        )}
      </p>

      <div className="gf-board tableau cols7" role="group" aria-label="7列の場札">
        {state.tableau.map((column, col) => (
          <div key={col} className="gf-col">
            {column.length === 0 ? (
              // 取り切った列。**枠だけ残す**（消すと列の幅が動く）
              <div className="gf-done" aria-label="取り切った列" role="img" />
            ) : (
              column.map((card, i) => {
                const front = i === column.length - 1;
                return (
                  <CardView
                    key={card.id}
                    card={card}
                    onClick={() => onColumn(col)}
                    className={[
                      front ? 'front' : 'covered',
                      front && hinted === col ? 'hinted' : '',
                      front && shaken === `c${col}` ? 'shake' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    labelSuffix={front ? '' : '（いまは取れません）'}
                  />
                );
              })
            )}
          </div>
        ))}
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
          <p className="gf-legend">
            1つ違いで取れる。
            {state.wrap ? (
              <>
                <strong>AはKにも2にも</strong>つながります
              </>
            ) : (
              <>
                <strong>AとKはつながりません</strong>
              </>
            )}
          </p>
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
