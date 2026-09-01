'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bestRemaining,
  canDraw,
  deal,
  draw,
  hint as findHint,
  isCleared,
  isStuck,
  newSeed,
  pick,
  remaining,
  wasteTop,
  type GolfState,
} from '@/lib/golf-solitaire';
import { trackToolUse } from '@/lib/analytics';
import { CardView, EmptySlot } from '@/app/_cards/CardView';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import { DEFAULT_VARIANT, type Improved } from '@/lib/records';

/**
 * ゴルフソリティアの画面。ルールは `lib/golf-solitaire.ts`（純関数）にあり、
 * ここは配置・入力・演出だけを持つ。
 *
 * 仕様: docs/features/game-golf-solitaire.md
 */

/**
 * 重ねた札の見える高さ（札の高さに対する比）。
 * **`app/globals.css` の .gf-board の計算と同じ値**（片方だけ直さないこと）。
 *
 * 札の高さは列幅の140%なので、負のマージンは `140 - 140 × STEP`（％）になる。
 * 0.5 にしてあるのは、5枚とも表向きのこのゲームでは
 * **奥の札の数字まで読めること**が手を組み立てる材料になるため。
 */
const STEP = 0.5;
/** 重ねる札に付ける負のマージン（列幅に対する%）。上の STEP から出す */
const OVERLAP = `${-(140 - 140 * STEP)}%`;

/** ヒントで光らせておく時間（ms）。トライピークス・ピラミッドと揃えてある */
const HINT_MS = 2200;
/** 取れない札を押したときの揺れの時間（ms）。globals.css の py-shake と揃える */
const SHAKE_MS = 320;

/** A↔K をつなげる設定は記録の区分を分ける（つながるほうが明らかに易しいため） */
const WRAP_VARIANT = 'wrap';

/** 揺れの対象を1枚に絞るための目印（列と、列の中の位置） */
const cardKey = (col: number, index: number) => `c${col}:${index}`;

export default function Game() {
  // 配るのに乱数を使うので、静的書き出しのHTMLと食い違わないよう
  // ブラウザに載ってから最初の盤面を作る
  const [state, setState] = useState<GolfState | null>(null);
  const [wrap, setWrap] = useState(false);
  const [hinted, setHinted] = useState<number | null>(null);
  const [shaken, setShaken] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<
    { cleared: boolean; left: number; chain: number; improved: Improved | null } | null
  >(null);
  // もどす用の履歴。取り・めくりのすべてを積む
  const history = useRef<GolfState[]>([]);
  const cleared = useRef(false);
  const ended = useRef(false);
  // この配りをプレイ数に数えたか（最初の1手で数える）
  const counted = useRef(false);
  const dealt = useRef(false);
  // 記録（docs/features/game-records.md）。ルール設定ごとに分けて持つ
  const variant = wrap ? WRAP_VARIANT : DEFAULT_VARIANT;
  const records = useRecords('golf-solitaire');
  const entry = records.entry(variant);

  const start = useCallback((seed: number, nextWrap: boolean, action: string) => {
    history.current = [];
    cleared.current = false;
    ended.current = false;
    counted.current = false;
    setHinted(null);
    setShaken(null);
    setNote(null);
    setResult(null);
    setWrap(nextWrap);
    setState(deal(seed, nextWrap));
    trackToolUse('golf-solitaire', action);
  }, []);

  // 最初の1回だけ配る
  useEffect(() => {
    if (dealt.current) return;
    dealt.current = true;
    start(newSeed(), false, 'new');
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
  const stuck = state ? isStuck(state) : false;
  const maxChain = state?.maxChain ?? 0;
  const left = state ? remaining(state) : 0;

  // クリア（残り0枚）。**これは1つの配りで1回だけ数える**
  useEffect(() => {
    if (!won || cleared.current) return;
    cleared.current = true;
    ended.current = true;
    trackToolUse('golf-solitaire', 'win');
    const { improved } = records.finish({ outcome: 'win', score: maxChain }, variant);
    setResult({ cleared: true, left: 0, chain: maxChain, improved });
  }, [won, maxChain, records, variant]);

  /**
   * 手詰まり。**負けではなく「残り◯枚」という結果として残す**（仕様書の
   * 「クリアは珍しい前提で設計する」）。`moves` に残り枚数を渡すと
   * `lib/records.ts` の `bestMoves`（小さいほうが良い）が最少残り枚数になる。
   *
   * 勝敗（`outcome`）は渡さない。詰みは「もどす」で戻ってやり直せるので、
   * 負け数として数えるとクリア率の母数が壊れる（トライピークスと同じ扱い）。
   */
  useEffect(() => {
    if (!stuck || ended.current) return;
    ended.current = true;
    trackToolUse('golf-solitaire', 'stuck');
    const { improved } = records.finish({ moves: left }, variant);
    setResult({ cleared: false, left, chain: maxChain, improved });
  }, [stuck, left, maxChain, records, variant]);

  if (!state) return <div className="card cardgame">配っています…</div>;

  const best = entry.bestScore ?? 0;
  const bestLeft = bestRemaining(entry.wins ?? 0, entry.bestMoves);

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

  const onCard = (col: number, index: number, front: boolean) => {
    if (won || stuck) return;
    if (!front) {
      setShaken(cardKey(col, index));
      setNote('取れるのは各列のいちばん手前（下）の1枚だけです。');
      return;
    }
    const next = pick(state, col);
    if (!next) {
      setShaken(cardKey(col, index));
      return;
    }
    advance(next);
    // **最長連鎖はクリアを待たずに残す。** クリアが珍しいゲームなので、
    // 詰んだ配りで出した連鎖を捨てると記録がほとんど育たない
    if (next.maxChain > best) {
      records.update(variant, (e) => ({ ...e, bestScore: next.maxChain }));
    }
  };

  const onStock = () => {
    if (won || stuck) return;
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
    // 戻ったら「終わった」判定はやり直す（別の手順で先へ進めるため）
    ended.current = false;
    setHinted(null);
    setNote(null);
    setResult(null);
    setState(prev);
  };

  const onHint = () => {
    if (won || stuck) return;
    const found = findHint(state);
    if (found !== null) {
      setHinted(found);
      setNote(null);
    } else {
      // **自動ではめくらない**（トライピークス・ピラミッドと同じく、テンポは本人に委ねる）
      setNote(
        canDraw(state)
          ? '取れる札がありません。山札を1枚めくってください。'
          : '取れる札がなく、山札も残っていません。',
      );
    }
    trackToolUse('golf-solitaire', 'hint');
  };

  const newGame = () => {
    if (!won && state.moves > 0 && !window.confirm('いまのゲームをやめて新しく配り直しますか？')) {
      return;
    }
    start(newSeed(), wrap, 'new');
  };

  const replay = () => {
    if (
      !won &&
      state.moves > 0 &&
      !window.confirm(`同じ配り（No.${state.seed}）で最初からやり直しますか？`)
    ) {
      return;
    }
    start(state.seed, wrap, 'replay');
  };

  /**
   * ルールの切り替え。**つながり方が変わると同じ局面の続きにならない**ので、
   * 配り直す（スパイダーの難易度切り替えと同じ作法）。
   */
  const changeWrap = (next: boolean) => {
    if (next === wrap) return;
    if (
      !won &&
      state.moves > 0 &&
      !window.confirm('つながり方を変えると新しく配り直しになります。よろしいですか？')
    ) {
      return;
    }
    start(newSeed(), next, next ? 'wrap-on' : 'wrap-off');
  };

  /**
   * 札のクラス。**ヒントも揺れも1枚にだけ付ける**（列ごと光らせると、
   * 取れるのが手前の1枚だけだという肝心の約束がぼやける）。
   */
  const cls = (col: number, index: number, front: boolean, extra: string[] = []) =>
    [
      ...extra,
      hinted === col && front ? 'hinted' : '',
      shaken === cardKey(col, index) ? 'shake' : '',
    ]
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
      {/* ルールの切り替え。**畳まない**（games/CLAUDE.md「設定は隠さない」）。
          名前を付けなくても選択肢そのものが説明になっているので、
          見出しの行は置かずに高さを節約している（読み上げには aria-label で渡す） */}
      <div className="gf-rules">
        <div className="seg" role="group" aria-label="AとKのつながり">
          <button
            type="button"
            className={wrap ? '' : 'active'}
            aria-pressed={!wrap}
            onClick={() => changeWrap(false)}
          >
            Kで止まる
          </button>
          <button
            type="button"
            className={wrap ? 'active' : ''}
            aria-pressed={wrap}
            onClick={() => changeWrap(true)}
          >
            A↔Kつなぐ
          </button>
        </div>
      </div>

      <div className="status-bar">
        <span>
          残り <strong>{left}</strong> 枚{'　'}連鎖 <strong>{state.chain}</strong>
        </span>
        <span>この配りの最長 {state.maxChain}連鎖</span>
      </div>

      {/* 記録の帯は1回も遊んでいなくても出す（games/CLAUDE.md「画面の約束」の1）。
          あとから現れると盤が押し下げられる。
          **ラベルは短いまま。** 値は遊ぶうちに「—」から「30枚」へ伸びるので、
          長いラベルだと幅320pxの端末で折り返しの段数が増え、そのぶん盤が下がる */}
      <RecordStrip
        items={[
          { label: 'クリア', value: `${entry.wins ?? 0}/${entry.plays ?? 0}` },
          { label: '最少残り', value: bestLeft === null ? '—枚' : `${bestLeft}枚` },
          { label: '最長', value: best > 0 ? `${best}連鎖` : '—連鎖' },
        ]}
      />

      {/* 文言が切り替わっても盤面が動かないよう、常に2行ぶんの高さ */}
      <p className="hint-row">
        {won ? (
          <span style={{ color: 'var(--ok)', fontWeight: 700 }}>
            🎉 残り0枚でクリア！この配りの最長 {result?.chain ?? state.maxChain}連鎖
            <BestBadge improved={result?.improved ?? null} />
          </span>
        ) : stuck ? (
          // **「負け」とは書かない。**残り枚数がこのゲームの結果そのもの。
          // やり直し方は真下のボタンが示しているので書かない。文言は2行
          // （幅320pxで約41文字）に収める——あふれると overflow: hidden で黙って切れる
          <span style={{ color: 'var(--brand)', fontWeight: 700 }}>
            今回は残り {result?.left ?? left} 枚。この配りの最長 {result?.chain ?? state.maxChain}
            連鎖
            <BestBadge improved={result?.improved ?? null} />
          </span>
        ) : note ? (
          <span style={{ color: 'var(--danger)' }}>{note}</span>
        ) : state.waste.length === 0 ? (
          // 配りはじめは捨て札が無いので、最初の1手は山札めくりしかない
          '山札をタップして1枚めくるところから始めます（捨て札は最初は空です）。'
        ) : (
          '捨て札と1つ違いの札を、各列の手前からタップして取ります。'
        )}
      </p>

      <div className="gf-board" role="group" aria-label="7列の場札">
        {state.columns.map((pile, col) => (
          <div key={col} className="gf-col">
            {/* 取り切った列も枠だけ残す。盤の footprint を動かさないため */}
            {pile.length === 0 && <div className="gf-gone" aria-hidden="true" />}
            {pile.map((card, i) => {
              const front = i === pile.length - 1;
              return (
                <CardView
                  key={card.id}
                  card={card}
                  style={i === 0 ? undefined : { marginTop: OVERLAP }}
                  onClick={() => onCard(col, i, front)}
                  className={cls(col, i, front, [front ? 'front' : 'behind'])}
                  labelSuffix={front ? '' : '（手前ではありません）'}
                />
              );
            })}
          </div>
        ))}
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
            2行に収まる長さなので、切り替えても高さは変わらない */}
        <div className="tp-side">
          <p className="tp-legend">
            1つ違いで取れる。
            {wrap ? (
              <>
                <strong>AはKにも2にも</strong>つながります
              </>
            ) : (
              <>
                <strong>KとAはつながりません</strong>
              </>
            )}
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
        <button type="button" className="btn" onClick={onHint} disabled={won || stuck}>
          ヒント
        </button>
        <button type="button" className="btn" onClick={newGame}>
          新しく配る
        </button>
      </div>
    </div>
  );
}
