'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  afterReveal,
  call,
  cpuChoosePlay,
  cpuDecideCall,
  deal,
  eligibleCallers,
  firstCaller,
  handLayout,
  LEVELS,
  MAX_PLAY,
  pass,
  pickOfRank,
  placeOf,
  play,
  PLAYER_COUNT,
  publicView,
  resultFor,
  slotWidth,
  splitRows,
  UNTILS,
  visiblePerCard,
  type DoubtState,
  type Level,
  type Until,
} from '@/lib/doubt';
import { RANK_LABEL, type Card as CardModel, type Rank } from '@/lib/cards';
import { CardView } from '@/app/_cards/CardView';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { trackToolUse } from '@/lib/analytics';
import { formatTime, type Improved } from '@/lib/records';
import {
  CpuSpeedSeg,
  delayFor,
  readCpuSpeed,
  writeCpuSpeed,
  type CpuSpeed,
} from '@/app/_cpu/CpuSpeed';

/**
 * ダウトの画面。ロジックは `lib/doubt.ts`（純関数）にあり、ここは入力と描画だけ。
 * 仕様: docs/features/game-doubt.md
 */

/** プレイヤーは常に 0 番。CPU は時計回りに 1〜3 */
const HUMAN = 0;
const SEAT_NAMES = ['あなた', 'CPU 1', 'CPU 2', 'CPU 3'];

const LEVEL_KEY = 'doubt:level';
const UNTIL_KEY = 'doubt:until';

/** CPU が札を出すまでの間（ms、「ふつう」のとき） */
const THINK_MS = 900;
/** あなたが出したあと、CPU がダウトを言うか決めるまでの間 */
const RESOLVE_MS = 700;
/** CPU が出したあと、「ダウト！」「通す」を待つ時間。押さなければ「通す」 */
const CALL_WINDOW_MS = 3000;
/** ダウトの結果、表にした札を見せる間 */
const REVEAL_MS = 1500;

/** 「あなたが」「CPU 1 が」 */
function ga(seat: number): string {
  return seat === HUMAN ? 'あなたが' : `${SEAT_NAMES[seat]} が`;
}

function declText(rank: Rank, count: number): string {
  return `${RANK_LABEL[rank]} が ${count} 枚`;
}

function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 覚えられなくても、その局は普通に遊べる
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
/** 数のチップ 7 個の 1 段の幅 */
const CHIP_ROW_PX = 7 * 44 + 6 * 3;

export default function Game() {
  const [level, setLevel] = useState<Level>('normal');
  const [until, setUntil] = useState<Until>('first');
  const [speed, setSpeed] = useState<CpuSpeed>('normal');
  const [game, setGame] = useState<DoubtState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  /** 直前の 1 手の結果（通った・ダウトの結果）。席の上の 1 行に出す */
  const [note, setNote] = useState('');
  const [improved, setImproved] = useState<Improved | null>(null);
  const [inPlay, setInPlay] = useState(false);
  const [screenW, setScreenW] = useState(360);
  const [handPx, setHandPx] = useState<number | undefined>(undefined);
  const reduced = usePrefersReducedMotion();
  const records = useRecords('doubt');
  const watch = useStopwatch();
  const entry = records.entry(level);
  const started = useRef(false);
  const recorded = useRef(false);
  /** 今の 1 手にダウトと言う CPU（出た瞬間に決めておき、結果を出すときに使う） */
  const cpuCallers = useRef<number[]>([]);
  const handRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const start = useCallback(
    (nextUntil: Until, nextLevel: Level) => {
      started.current = false;
      recorded.current = false;
      cpuCallers.current = [];
      setInPlay(false);
      setSelected([]);
      setNote('');
      setImproved(null);
      watch.reset();
      setGame(deal(Math.random, nextUntil, HUMAN));
      trackToolUse('doubt', `new-${nextLevel}`);
    },
    [watch],
  );

  useEffect(() => {
    const savedLevel = readSetting(LEVEL_KEY);
    const savedUntil = readSetting(UNTIL_KEY);
    const lv: Level = savedLevel === 'easy' || savedLevel === 'hard' ? savedLevel : 'normal';
    const un: Until = savedUntil === 'all' ? 'all' : 'first';
    setLevel(lv);
    setUntil(un);
    setSpeed(readCpuSpeed('doubt'));
    setGame(deal(Math.random, un, HUMAN));
  }, []);

  // 手札の帯の幅を測る（並べ方の切り替えと札の重ね方に使う）
  useEffect(() => {
    const el = handRef.current;
    const measure = () => {
      setScreenW(window.innerWidth);
      if (el) setHandPx(el.clientWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver === 'function' && el ? new ResizeObserver(measure) : null;
    if (ro && el) ro.observe(el);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, []);

  /** 札が出た直後。CPU がダウトを言うかをその場で決めておく（伏せ札は見ない） */
  const afterPlay = useCallback(
    (next: DoubtState) => {
      cpuCallers.current = eligibleCallers(next).filter(
        (q) => q !== HUMAN && cpuDecideCall(publicView(next, q), level, Math.random),
      );
      setGame(next);
    },
    [level],
  );

  /** ダウトの受付を締める。`humanCalled` はあなたが「ダウト！」を押したか */
  const resolve = useCallback(
    (s: DoubtState, humanCalled: boolean) => {
      if (s.phase !== 'calling' || !s.current) return;
      const cur = s.current;
      const callers = humanCalled ? [...cpuCallers.current, HUMAN] : cpuCallers.current;
      const who = firstCaller(cur.player, callers);
      cpuCallers.current = [];
      if (who === null) {
        setNote(`${SEAT_NAMES[cur.player]}の「${declText(cur.rank, cur.cards.length)}」は通りました`);
        setGame(pass(s));
        return;
      }
      const next = call(s, who);
      const r = next.reveal;
      if (!r) return;
      if (humanCalled) {
        trackToolUse('doubt', 'call');
        if (!r.truthful) trackToolUse('doubt', 'call-hit');
      }
      const head = humanCalled && who !== HUMAN ? `${ga(who)}先にダウト！` : `${ga(who)}ダウト！`;
      const verdict = r.truthful ? '本当でした！' : 'ウソでした！';
      setNote(`${head} ${verdict} ${ga(r.taker)} ${r.taken} 枚を引き取ります`);
      setGame(next);
    },
    [],
  );

  const humanEligible = !!game && game.phase === 'calling' && eligibleCallers(game).includes(HUMAN);
  const waitingHuman = humanEligible && !!game?.current && game.current.player !== HUMAN;

  // CPU の手番・ダウトの締め・表にした札を見せる間
  useEffect(() => {
    if (!game) return;
    if (game.phase === 'play' && game.turn !== HUMAN) {
      const timer = window.setTimeout(() => {
        const p = game.turn;
        afterPlay(play(game, p, cpuChoosePlay(game.hands[p], game.rank, publicView(game, p), level, Math.random)));
      }, delayFor(THINK_MS, speed));
      return () => window.clearTimeout(timer);
    }
    if (game.phase === 'calling') {
      if (waitingHuman) {
        // 「ゆっくり」と動きを減らす設定では時間切れを無くし、どちらかを押すまで待つ
        if (speed === 'slow' || reduced) return;
        const timer = window.setTimeout(() => resolve(game, false), delayFor(CALL_WINDOW_MS, speed));
        return () => window.clearTimeout(timer);
      }
      const timer = window.setTimeout(() => resolve(game, false), delayFor(RESOLVE_MS, speed));
      return () => window.clearTimeout(timer);
    }
    if (game.phase === 'reveal') {
      const timer = window.setTimeout(() => setGame(afterReveal(game)), delayFor(REVEAL_MS, speed));
      return () => window.clearTimeout(timer);
    }
  }, [game, level, speed, reduced, waitingHuman, afterPlay, resolve]);

  // 局が終わったら記録する（遊び始めた局だけ）
  useEffect(() => {
    if (!game || game.phase !== 'finished' || recorded.current) return;
    recorded.current = true;
    setInPlay(false);
    const ms = watch.stop();
    trackToolUse('doubt', `finish-${level}`);
    if (!started.current) return;
    const result = records.finish(resultFor(game, HUMAN, ms), level);
    setImproved(result.improved);
  }, [game, level, records, watch]);

  const onDoubt = useCallback(() => {
    if (game && waitingHuman) resolve(game, true);
  }, [game, waitingHuman, resolve]);

  const onLetPass = useCallback(() => {
    if (game && waitingHuman) resolve(game, false);
  }, [game, waitingHuman, resolve]);

  // 「ダウト！」は D、「通す」は P。Space・Enter はフォーカスのあるボタンの標準の動きのまま
  useEffect(() => {
    if (!waitingHuman) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        onDoubt();
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        onLetPass();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [waitingHuman, onDoubt, onLetPass]);

  if (!game) {
    return (
      <div className="card cardgame">
        <p className="df-msg">配っています…</p>
      </div>
    );
  }

  const hand = game.hands[HUMAN];
  const humanTurn = game.phase === 'play' && game.turn === HUMAN;
  const finished = game.phase === 'finished';
  const settingsLocked = inPlay && !finished;
  const picked = hand.filter((c) => selected.includes(c.id));
  const lying = picked.some((c) => c.rank !== game.rank);

  const toggle = (card: CardModel) => {
    if (!humanTurn) return;
    setSelected((prev) =>
      prev.includes(card.id)
        ? prev.filter((x) => x !== card.id)
        : prev.length < MAX_PLAY
          ? [...prev, card.id]
          : prev,
    );
  };

  const addRank = (rank: Rank) => {
    if (!humanTurn) return;
    setSelected((prev) => {
      if (prev.length >= MAX_PLAY) return prev;
      const c = pickOfRank(hand, rank, prev);
      return c ? [...prev, c.id] : prev;
    });
  };

  const removeLast = () => setSelected((prev) => prev.slice(0, -1));

  const onPlay = () => {
    if (!humanTurn || picked.length < 1 || picked.length > MAX_PLAY) return;
    if (!started.current) {
      started.current = true;
      setInPlay(true);
      records.start(level);
      watch.begin();
    }
    setSelected([]);
    setNote('');
    afterPlay(play(game, HUMAN, picked));
  };

  const changeLevel = (next: Level) => {
    setLevel(next);
    writeSetting(LEVEL_KEY, next);
    start(until, next);
  };

  const changeUntil = (next: Until) => {
    setUntil(next);
    writeSetting(UNTIL_KEY, next);
    start(next, level);
  };

  const cur = game.current;
  const message = (() => {
    if (finished) {
      const place = placeOf(game, HUMAN);
      return game.finished[0] === HUMAN
        ? 'あなたが 1 位で上がりました！'
        : `${SEAT_NAMES[game.finished[0]]}が 1 位で上がりました。あなたは ${place + 1} 位です`;
    }
    if (game.phase === 'reveal' && game.reveal) return note;
    if (game.phase === 'calling' && cur) {
      if (waitingHuman) return `${SEAT_NAMES[cur.player]}が「${declText(cur.rank, cur.cards.length)}」。ダウト？`;
      return `${ga(cur.player)}「${declText(cur.rank, cur.cards.length)}」`;
    }
    if (humanTurn) return `あなたの番です。「${RANK_LABEL[game.rank]}」として出す札を 1〜${MAX_PLAY} 枚選んでください`;
    return `${SEAT_NAMES[game.turn]}の番です`;
  })();

  const layout = handLayout(
    hand.length,
    screenW,
    Math.max(...splitRows(hand).map((r) => r.length)),
    handPx,
  );
  const slot = slotWidth(screenW);

  const renderRow = (cards: CardModel[]) => {
    const visible = visiblePerCard(cards.length, screenW, handPx);
    return (
      <div className="dt-row">
        {cards.map((c, i) => {
          const on = selected.includes(c.id);
          return (
            <span
              key={c.id}
              className={`df-slot dt-slot${on ? ' on' : ''}`}
              style={{ width: slot, marginLeft: i === 0 ? 0 : visible - slot }}
            >
              <CardView
                card={c}
                selected={on}
                pressed={on}
                labelSuffix={on ? '、選択中' : ''}
                onClick={() => toggle(c)}
              />
            </span>
          );
        })}
      </div>
    );
  };

  const onChipKey = (e: React.KeyboardEvent, idx: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    for (let j = 1; j <= RANKS.length; j += 1) {
      const next = chipRefs.current[(idx + step * j + RANKS.length * 2) % RANKS.length];
      if (next && !next.disabled) {
        next.focus();
        return;
      }
    }
  };

  // 7 個 × 44px ＋ 隙間 3px × 6 ＝ 326px。帯（画面幅 − 34px）に入らない幅（360px 未満）では 3 段（5・4・4）にする
  const chipRows: Rank[][] =
    screenW - 34 < CHIP_ROW_PX ? [RANKS.slice(0, 5), RANKS.slice(5, 9), RANKS.slice(9)] : [RANKS.slice(0, 7), RANKS.slice(7)];

  const renderChips = () => (
    <div className="dt-chips" role="group" aria-label="数ごとの手札">
      {chipRows.map((row, ri) => (
        <div key={ri} className="dt-chip-row">
          {row.map((rank) => {
            const idx = rank - 1;
            const have = hand.filter((c) => c.rank === rank).length;
            const on = picked.filter((c) => c.rank === rank).length;
            return (
              <button
                key={rank}
                ref={(el) => {
                  chipRefs.current[idx] = el;
                }}
                type="button"
                className={`dt-chip${on > 0 ? ' on' : ''}${rank === game.rank ? ' now' : ''}`}
                disabled={have === 0}
                aria-label={`${RANK_LABEL[rank]}を${have}枚持っています${on > 0 ? `、${on}枚選択中` : ''}`}
                onClick={() => addRank(rank)}
                onKeyDown={(e) => onChipKey(e, idx)}
              >
                <span className="dt-chip-rank">{RANK_LABEL[rank]}</span>
                <span className="dt-chip-count">×{have - on}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  const places = Array.from({ length: PLAYER_COUNT }, (_, p) => placeOf(game, p));

  return (
    <div className="card cardgame df-game dt-game">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="CPUの強さ">
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <button
              key={l}
              type="button"
              className={l === level ? 'active' : ''}
              aria-pressed={l === level}
              disabled={settingsLocked}
              onClick={() => changeLevel(l)}
            >
              {LEVELS[l].label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="終わり方">
          {(Object.keys(UNTILS) as Until[]).map((u) => (
            <button
              key={u}
              type="button"
              className={u === until ? 'active' : ''}
              aria-pressed={u === until}
              disabled={settingsLocked}
              onClick={() => changeUntil(u)}
            >
              {UNTILS[u].label}
            </button>
          ))}
        </div>
        <CpuSpeedSeg
          value={speed}
          onChange={(next) => {
            setSpeed(next);
            writeCpuSpeed('doubt', next);
          }}
        />
      </div>

      {/* 項目は記録が無くても出す（1 局目の途中で帯が現れると盤が下にずれる） */}
      <RecordStrip
        items={[
          { label: LEVELS[level].label, value: `${entry.plays ?? 0}回` },
          { label: '勝ち', value: `${entry.wins ?? 0}` },
          { label: '負け', value: `${entry.losses ?? 0}` },
          { label: '最速の勝ち', value: entry.bestTimeMs ? formatTime(entry.bestTimeMs) : '—' },
        ]}
      />

      <div className="df-seats">
        {[1, 2, 3].map((i) => {
          const d = game.declared[i];
          const out = game.finished.includes(i);
          return (
            <div
              key={i}
              className={`df-seat${!finished && game.turn === i ? ' active' : ''}`}
            >
              <span className="df-seat-name">{SEAT_NAMES[i]}</span>
              <span className="df-seat-count">{game.hands[i].length}枚</span>
              <span className="dt-seat-decl">
                {out ? `${places[i] + 1}位で上がり` : d ? `直前 ${declText(d.rank, d.count)}` : ''}
              </span>
              <span className="df-seat-cards" aria-hidden>
                {game.hands[i].slice(0, 20).map((c) => (
                  <span key={c.id} className="df-back" />
                ))}
              </span>
            </div>
          );
        })}
      </div>

      <p className="dt-last">{game.phase === 'reveal' ? '' : note}</p>

      <div className="dt-field" aria-label="場">
        {(game.phase === 'calling' || game.phase === 'reveal') && cur ? (
          <>
            <span className="dt-field-who">
              {SEAT_NAMES[cur.player]}：「{declText(cur.rank, cur.cards.length)}」
            </span>
            <span className="dt-field-cards">
              {game.phase === 'reveal' && game.reveal
                ? game.reveal.cards.map((c) => (
                    <span key={c.id} className="df-slot dt-reveal">
                      <CardView card={c} />
                    </span>
                  ))
                : cur.cards.map((c) => <span key={c.id} className="dt-back" />)}
            </span>
          </>
        ) : (
          <>
            <span className="dt-field-who">{finished ? '終わり' : '次は'}</span>
            <span className="dt-next" aria-label={`次は${RANK_LABEL[game.rank]}`}>
              {finished ? '—' : RANK_LABEL[game.rank]}
            </span>
          </>
        )}
        <span className="dt-pile">場札 {game.pile.length} 枚</span>
      </div>

      <p className="df-msg" aria-live="polite">
        {message}
      </p>

      <p className="dt-me">
        <span className={humanTurn ? 'dt-me-turn' : ''}>あなた</span>
        <strong>{hand.length}</strong>枚
        {game.declared[HUMAN] && !finished && (
          <span className="dt-me-decl">直前 {declText(game.declared[HUMAN].rank, game.declared[HUMAN].count)}</span>
        )}
      </p>

      <div className="dt-picked">
        {picked.length > 0 && (
          <>
            <span className="dt-picked-label">選んだ札</span>
            {picked.map((c) => (
              <button
                key={c.id}
                type="button"
                className="dt-picked-card"
                aria-label={`${RANK_LABEL[c.rank]}を戻す`}
                onClick={() => setSelected((prev) => prev.filter((x) => x !== c.id))}
              >
                {RANK_LABEL[c.rank]}
              </button>
            ))}
            <button type="button" className="dt-picked-undo" aria-label="1枚戻す" onClick={removeLast}>
              −
            </button>
          </>
        )}
      </div>

      <div
        ref={handRef}
        className={`dt-hand dt-hand-${finished ? 'result' : layout}`}
        aria-label={finished ? '結果' : 'あなたの手札'}
      >
        {finished ? (
          <div className="df-result dt-result">
            <h3>
              結果
              <BestBadge improved={improved} />
            </h3>
            <ol>
              {Array.from({ length: PLAYER_COUNT }, (_, i) => i)
                .sort((a, b) => places[a] - places[b])
                .map((p) => (
                  <li key={p} className={p === HUMAN ? 'me' : ''}>
                    <span className="df-result-rank">{places[p] + 1}位</span>
                    <span className="df-result-name">{SEAT_NAMES[p]}</span>
                    <span className="df-result-score">残り {game.hands[p].length} 枚</span>
                  </li>
                ))}
            </ol>
          </div>
        ) : layout === 'chips' ? (
          renderChips()
        ) : layout === 'two' ? (
          <>
            {renderRow(splitRows(hand)[0])}
            {renderRow(splitRows(hand)[1])}
          </>
        ) : (
          renderRow(hand)
        )}
      </div>

      <div className="dt-actions">
        {finished ? (
          <button type="button" className="btn btn-primary" onClick={() => start(until, level)}>
            もう一度あそぶ
          </button>
        ) : waitingHuman ? (
          <>
            <button type="button" className="btn btn-primary dt-doubt" onClick={onDoubt} aria-keyshortcuts="D">
              ダウト！
            </button>
            <button type="button" className="btn dt-let" onClick={onLetPass} aria-keyshortcuts="P">
              通す
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onPlay}
            disabled={!humanTurn || picked.length === 0}
          >
            {humanTurn && picked.length > 0 ? `出す（${declText(game.rank, picked.length)}）` : '出す'}
          </button>
        )}
      </div>
      <p className="dt-lie">{humanTurn && lying ? 'ウソが混ざっています（あなたにだけ見えています）' : ''}</p>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p className="df-note">
          札は あなた → CPU 1 → CPU 2 → CPU 3 の順に出します。宣言する数は真ん中の「次は」の数で、
          A → 2 → … → K → A と順番に進みます。手札をタップして 1〜4 枚選び、「出す」を押します。
          CPU が出したら「ダウト！」（D キー）か「通す」（P キー）を選びます。
          手札が多くなると、数ごとにまとめた表示（「7 ×3」）に切り替わります。
        </p>
      </details>
    </div>
  );
}
