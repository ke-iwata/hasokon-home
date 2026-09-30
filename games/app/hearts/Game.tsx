'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cardName,
  chooseCpuCard,
  LENGTHS,
  LEVELS,
  legalCards,
  matchCollect,
  matchPlay,
  newMatch,
  nextRound,
  PASS_COUNT,
  passDirection,
  passSource,
  passTarget,
  PLAYER_COUNT,
  ranking,
  rawPoints,
  submitPass,
  trickWinner,
  type Level,
  type MatchLength,
  type MatchState,
  type PassDirection,
} from '@/lib/hearts';
import type { Card as CardModel } from '@/lib/cards';
import { CardView, EmptySlot } from '@/app/_cards/CardView';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import { trackToolUse } from '@/lib/analytics';
import type { Improved } from '@/lib/records';
import {
  CpuSpeedSeg,
  delayFor,
  readCpuSpeed,
  writeCpuSpeed,
  type CpuSpeed,
} from '@/app/_cpu/CpuSpeed';

/**
 * ハーツの画面。ロジックは `lib/hearts.ts`（純関数）にあり、ここは入力と描画だけ。
 * 仕様: docs/features/game-hearts.md
 */

/** プレイヤーは常に0番。CPUは席順に1〜3（大富豪の SEAT_NAMES に揃える） */
const HUMAN = 0;
const SEAT_NAMES = ['あなた', 'CPU 左', 'CPU 正面', 'CPU 右'];

const LEVEL_KEY = 'hearts:level';
const LENGTH_KEY = 'hearts:length';

/** CPUが1枚出すまでの間（ms、「ふつう」のとき） */
const THINK_MS = 900;
/** 4枚そろってから取るまでの間。誰が何を出したかを見せる */
const COLLECT_MS = 1300;

const PASS_TEXT: Record<Exclude<PassDirection, 'none'>, string> = {
  left: SEAT_NAMES[passTarget(HUMAN, 'left')],
  right: SEAT_NAMES[passTarget(HUMAN, 'right')],
  across: SEAT_NAMES[passTarget(HUMAN, 'across')],
};

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
    // 覚えられなくても、その試合は普通に遊べる
  }
}

function Card({
  card,
  selected = false,
  dim = false,
  onClick,
}: {
  card: CardModel;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
}) {
  return (
    <span className={`df-slot${dim ? ' dim' : ''}`}>
      <CardView card={card} selected={selected} onClick={onClick} />
    </span>
  );
}

export default function Game() {
  const [level, setLevel] = useState<Level>('normal');
  const [length, setLength] = useState<MatchLength>('hundred');
  const [speed, setSpeed] = useState<CpuSpeed>('normal');
  const [match, setMatch] = useState<MatchState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [improved, setImproved] = useState<Improved | null>(null);
  const [ready, setReady] = useState(false);
  const records = useRecords('hearts');
  const entry = records.entry(length);
  // 1試合につき1回だけ数える
  const started = useRef(false);
  const recorded = useRef(false);
  const [inPlay, setInPlay] = useState(false);

  const start = useCallback((nextLength: MatchLength, nextLevel: Level) => {
    started.current = false;
    recorded.current = false;
    setInPlay(false);
    setSelected([]);
    setImproved(null);
    setMatch(newMatch(nextLength, nextLevel));
    trackToolUse('hearts', `new-${nextLength}-${nextLevel}`);
  }, []);

  useEffect(() => {
    const savedLevel = readSetting(LEVEL_KEY);
    const savedLength = readSetting(LENGTH_KEY);
    const lv: Level = savedLevel === 'strong' ? 'strong' : 'normal';
    const len: MatchLength = savedLength === 'one' ? 'one' : 'hundred';
    setLevel(lv);
    setLength(len);
    setSpeed(readCpuSpeed('hearts'));
    setMatch(newMatch(len, lv));
    setReady(true);
  }, []);

  /** 札を1枚出す。試合の最初の1枚で1プレイと数える */
  const play = useCallback(
    (player: number, card: CardModel) => {
      if (!started.current) {
        started.current = true;
        setInPlay(true);
        records.start(length);
      }
      setMatch((m) => (m ? matchPlay(m, player, card) : m));
    },
    [records, length],
  );

  const round = match?.round ?? null;
  const phase = match?.phase ?? null;
  const trickFull = !!round && round.trick.length === PLAYER_COUNT;

  // CPUの手番と、4枚そろったトリックを取る間
  useEffect(() => {
    if (!ready || !match || !round || match.phase !== 'playing') return;
    if (trickFull) {
      const timer = window.setTimeout(() => {
        setMatch((m) => (m ? matchCollect(m) : m));
      }, delayFor(COLLECT_MS, speed));
      return () => window.clearTimeout(timer);
    }
    if (round.turn === HUMAN) return;
    const timer = window.setTimeout(() => {
      play(round.turn, chooseCpuCard(round, round.turn, match.level));
    }, delayFor(THINK_MS, speed));
    return () => window.clearTimeout(timer);
  }, [ready, match, round, trickFull, speed, play]);

  // 試合が終わったら記録する
  useEffect(() => {
    if (!match || match.phase !== 'matchEnd' || recorded.current) return;
    recorded.current = true;
    setInPlay(false);
    const place = ranking(match.totals)[HUMAN];
    const outcome = place === 0 ? 'win' : 'loss';
    trackToolUse('hearts', `${outcome}-${match.length}`);
    const result = records.finish({ outcome, score: match.moonCounts[HUMAN] }, match.length);
    setImproved(result.improved);
  }, [match, records]);

  const playableIds = useMemo(() => {
    if (!round || phase !== 'playing') return new Set<number>();
    return new Set(legalCards(round, HUMAN).map((c) => c.id));
  }, [round, phase]);

  if (!match || !round) {
    return (
      <div className="card cardgame">
        <p className="df-msg">配っています…</p>
      </div>
    );
  }

  const dir = passDirection(match.roundIndex);
  const passing = match.phase === 'passing';
  const humanTurn = match.phase === 'playing' && round.turn === HUMAN;
  const hand = round.hands[HUMAN];
  const livePoints = rawPoints(round.taken);
  const roundOver = match.phase === 'roundEnd' || match.phase === 'matchEnd';
  const places = ranking(match.totals);
  const settingsLocked = inPlay && !roundOver;

  const onCard = (card: CardModel) => {
    if (passing) {
      setSelected((prev) =>
        prev.includes(card.id)
          ? prev.filter((x) => x !== card.id)
          : prev.length < PASS_COUNT
            ? [...prev, card.id]
            : prev,
      );
      return;
    }
    if (humanTurn && playableIds.has(card.id)) play(HUMAN, card);
  };

  const pass = () => {
    if (!passing || selected.length !== PASS_COUNT) return;
    const pick = hand.filter((c) => selected.includes(c.id));
    setSelected([]);
    setMatch(submitPass(match, pick));
  };

  const changeLevel = (next: Level) => {
    setLevel(next);
    writeSetting(LEVEL_KEY, next);
    start(length, next);
  };

  const changeLength = (next: MatchLength) => {
    setLength(next);
    writeSetting(LENGTH_KEY, next);
    start(next, level);
  };

  /** パスの向きの1行。パス無しの局でも枠は空のまま置く */
  const passLine =
    dir === 'none'
      ? ''
      : passing
        ? `${PASS_TEXT[dir]}に${PASS_COUNT}枚渡します`
        : `${SEAT_NAMES[passSource(HUMAN, dir)]}から受け取り：${round.received[HUMAN].map(cardName).join('・')}`;

  const message = (() => {
    if (match.phase === 'matchEnd') {
      const place = places[HUMAN];
      return `試合終了。あなたは${place + 1}位${place === 0 ? '（勝ち）' : ''}です`;
    }
    if (match.phase === 'roundEnd') {
      return match.lastMoon !== null
        ? `${SEAT_NAMES[match.lastMoon]}がシュートザムーン！ 他の3人に26点`
        : `第${match.roundIndex + 1}局が終わりました`;
    }
    if (passing) return `渡す札を${PASS_COUNT}枚選んで「渡す」（あと${PASS_COUNT - selected.length}枚）`;
    if (trickFull) return `${SEAT_NAMES[trickWinner(round.trick)]}が取ります`;
    if (humanTurn) {
      if (round.tricksPlayed === 0 && round.trick.length === 0) return 'あなたが♣2を持っています。♣2から出します';
      return round.trick.length === 0
        ? round.heartsBroken
          ? 'あなたのリードです。好きな札を1枚'
          : 'あなたのリードです（ハートはまだ出せません）'
        : 'あなたの番です。持ち上がった札から1枚';
    }
    return `${SEAT_NAMES[round.turn]}の番です`;
  })();

  const trickCardOf = (seat: number) => round.trick.find((p) => p.player === seat)?.card;

  return (
    <div className="card cardgame df-game ht-game">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="試合の長さ">
          {(Object.keys(LENGTHS) as MatchLength[]).map((l) => (
            <button
              key={l}
              type="button"
              className={l === length ? 'active' : ''}
              aria-pressed={l === length}
              disabled={settingsLocked}
              onClick={() => changeLength(l)}
            >
              {LENGTHS[l].label}
            </button>
          ))}
        </div>
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
        <CpuSpeedSeg
          value={speed}
          onChange={(next) => {
            setSpeed(next);
            writeCpuSpeed('hearts', next);
          }}
        />
      </div>

      <RecordStrip
        items={[
          {
            label: LENGTHS[length].label,
            value: `${entry.wins ?? 0}勝 / ${(entry.wins ?? 0) + (entry.losses ?? 0)}試合`,
          },
          { label: 'シュートザムーン最多', value: `${entry.bestScore ?? 0}回` },
        ]}
      />

      <div className="df-seats">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`df-seat${round.turn === i && match.phase === 'playing' ? ' active' : ''}`}>
            <span className="df-seat-name">{SEAT_NAMES[i]}</span>
            <span className="ht-points">今局 {livePoints[i]}</span>
            <span className="ht-points">累計 {match.totals[i]}</span>
            <span className="df-seat-cards" aria-hidden>
              {round.hands[i].map((c) => (
                <span key={c.id} className="df-back" />
              ))}
            </span>
          </div>
        ))}
      </div>

      <p className="ht-pass">{passLine}</p>

      <div className="ht-trick" aria-label="トリック">
        {[0, 1, 2, 3].map((seat) => {
          const card = trickCardOf(seat);
          const lead = round.trick[0]?.player === seat;
          return (
            <div key={seat} className="ht-trick-seat">
              <span className="ht-trick-name">
                {SEAT_NAMES[seat]}
                {lead ? '（台札）' : ''}
              </span>
              <span className="df-slot">
                {card ? <CardView card={card} /> : <EmptySlot />}
              </span>
            </div>
          );
        })}
      </div>

      <p className="df-msg" aria-live="polite">
        {message}
      </p>

      <p className="ht-me">
        <span className={humanTurn ? 'ht-me-turn' : ''}>あなた</span>
        今局 <strong>{livePoints[HUMAN]}</strong>／累計 <strong>{match.totals[HUMAN]}</strong>
        {round.heartsBroken && <span className="ht-broken">ハートブレイク</span>}
      </p>

      <div className={`df-hand ht-hand${roundOver ? ' ht-hand-result' : ''}`} aria-label={roundOver ? '局の点' : 'あなたの手札'}>
        {roundOver ? (
          <div className="df-result ht-result">
            <h3>
              {match.phase === 'matchEnd' ? '最終結果' : `第${match.roundIndex + 1}局の点`}
              {match.phase === 'matchEnd' && <BestBadge improved={improved} />}
            </h3>
            <ol>
              {Array.from({ length: PLAYER_COUNT }, (_, i) => i)
                .sort((a, b) => places[a] - places[b] || a - b)
                .map((p) => (
                  <li key={p} className={p === HUMAN ? 'me' : ''}>
                    <span className="df-result-rank">{places[p] + 1}位</span>
                    <span className="df-result-name">
                      {SEAT_NAMES[p]}
                      {match.lastMoon === p ? '（ムーン）' : ''}
                    </span>
                    <span className="df-result-score">
                      +{match.lastRoundScores[p]}／{match.totals[p]}点
                    </span>
                  </li>
                ))}
            </ol>
          </div>
        ) : (
          hand.map((c) => (
            <Card
              key={c.id}
              card={c}
              selected={passing ? selected.includes(c.id) : humanTurn && playableIds.has(c.id)}
              dim={humanTurn && !playableIds.has(c.id)}
              onClick={() => onCard(c)}
            />
          ))
        )}
      </div>

      <div className="btn-row" style={{ marginTop: 12, justifyContent: 'center' }}>
        {match.phase === 'matchEnd' ? (
          <button type="button" className="btn btn-primary" onClick={() => start(length, level)}>
            もう一度あそぶ
          </button>
        ) : match.phase === 'roundEnd' ? (
          <button type="button" className="btn btn-primary" onClick={() => setMatch(nextRound(match))}>
            第{match.roundIndex + 2}局へ
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={pass}
            disabled={!passing || selected.length !== PASS_COUNT}
          >
            渡す
          </button>
        )}
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p className="df-note">
          あなたは下の席で、札は あなた → CPU 左 → CPU 正面 → CPU 右 の順に出します。
          <strong>持ち上がっている札だけが、いま出せる札です。</strong>
          点はハート1枚1点・♠Q 13点で、少ないほうが勝ちです。
        </p>
      </details>
    </div>
  );
}
