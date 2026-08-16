'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyPass,
  applyPlay,
  chooseCpuPlay,
  DEFAULT_RULES,
  finishRound,
  matchStandings,
  newMatch,
  PASS_LIMIT,
  placeOf,
  PLACE_LABELS,
  PLAYER_COUNT,
  playableCards,
  ROUNDS,
  RULE_LABELS,
  standings,
  startNextRound,
  styleOf,
  type GameEvent,
  type MatchState,
  type RoundState,
  type Rules,
} from '@/lib/shichinarabe';
import { isRed, RANK_LABEL, SUITS, SUIT_SYMBOL, type Rank, type Suit } from '@/lib/cards';
import { CardView } from '@/app/_cards/CardView';
import { RecordStrip, useRecords } from '@/app/_records/Records';
import { trackToolUse } from '@/lib/analytics';

/**
 * 七並べの画面。ロジックは `lib/shichinarabe.ts`（純関数）にあり、ここは入力と描画だけ。
 * 仕様: docs/features/game-shichinarabe.md
 */

/** プレイヤーは常に0番。CPUは席順に1〜3 */
const HUMAN = 0;
const SEAT_NAMES = ['あなた', 'CPU 左', 'CPU 正面', 'CPU 右'];

/** 数字の並び。A（1）から K（13）まで */
const RANKS: Rank[] = Array.from({ length: 13 }, (_, i) => (i + 1) as Rank);

/** ルールとCPUの速さは覚えておく（毎回選び直させない）。遊んだ記録ではないので lib/records.ts には入れない */
const RULES_KEY = 'shichinarabe:rules';
const SPEED_KEY = 'shichinarabe:speed';

/** CPUが1手打つまでの間（ms）。大富豪と同じ3段階に揃えてある */
const SPEEDS = {
  slow: { label: 'ゆっくり', delay: 1600 },
  normal: { label: 'ふつう', delay: 1000 },
  fast: { label: 'はやい', delay: 500 },
} as const;

type Speed = keyof typeof SPEEDS;

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

function readSpeed(): Speed {
  const saved = readSetting(SPEED_KEY);
  return saved === 'slow' || saved === 'normal' || saved === 'fast' ? saved : 'normal';
}

/** 保存したローカルルール。知らない項目・壊れた値は既定に戻す */
function readRules(): Rules {
  const raw = readSetting(RULES_KEY);
  if (!raw) return DEFAULT_RULES;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rules = { ...DEFAULT_RULES };
    for (const { key } of RULE_LABELS) {
      if (typeof parsed[key] === 'boolean') rules[key] = parsed[key] as boolean;
    }
    return rules;
  } catch {
    return DEFAULT_RULES;
  }
}

/**
 * 場の実況。
 *
 * 「出した」は**何を出したかまで書く**（`state.last`）。盤の光る枠だけだと、
 * CPUが速いときに何が置かれたのか追えないため。
 */
function eventText(event: GameEvent, state: RoundState): string {
  const who = SEAT_NAMES[event.player];
  switch (event.kind) {
    case 'place':
      return state.last
        ? `${who}が ${SUIT_SYMBOL[state.last.suit]}${RANK_LABEL[state.last.rank]} を出しました`
        : `${who}が札を出しました`;
    case 'pass':
      return `${who}がパスしました`;
    case 'eliminate':
      return `${who}は4回目のパスで失格。手札がすべて場に開きました`;
    case 'out':
      return `${who}が上がりました`;
  }
}

/** 記録の区分。ルールが違えば別の記録として持つ */
function variantOf(rules: Rules): string {
  return rules.tunnel ? 'tunnel' : 'standard';
}

export default function Game() {
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [match, setMatch] = useState<MatchState | null>(null);
  // 設定を読むまでは配らない（静的書き出し時のサーバー側と食い違わないように）
  const [ready, setReady] = useState(false);
  /**
   * スタート待ち。配った直後は false で、CPUは動かない。
   * 「スタート」を押すか、自分が先に出すと true になる。
   * ♦7を持つCPUが、開いた瞬間に出し始めるのを防ぐ。
   * 2回戦以降は「第n回戦へ」を押した時点で始まってよいので、リセットしない
   */
  const [begun, setBegun] = useState(false);
  const records = useRecords('shichinarabe');
  const variant = variantOf(rules);
  const entry = records.entry(variant);
  // 1試合につき1回だけ数える
  const started = useRef(false);
  const recorded = useRef(false);

  const start = useCallback((nextRules: Rules) => {
    started.current = false;
    recorded.current = false;
    setBegun(false);
    setMatch(newMatch(nextRules));
    trackToolUse('shichinarabe', `new-${variantOf(nextRules)}`);
  }, []);

  useEffect(() => {
    const savedRules = readRules();
    setRules(savedRules);
    setSpeed(readSpeed());
    setMatch(newMatch(savedRules));
    setReady(true);
  }, []);

  /** 局面を進める。回戦が決着したらその場で得点を足す */
  const commit = useCallback((next: RoundState) => {
    setMatch((m) => {
      if (!m) return m;
      const updated = { ...m, state: next };
      return next.finished ? finishRound(updated) : updated;
    });
  }, []);

  const state = match?.state ?? null;
  const humanTurn = !!state && !state.finished && state.turn === HUMAN;

  // CPUの手番。読みは同期処理なので、いったん描画させてから動かす。
  // スタート前（!begun）は動かない
  useEffect(() => {
    if (!ready || !begun || !state || state.finished || state.turn === HUMAN) return;
    const timer = window.setTimeout(() => {
      const card = chooseCpuPlay(state, styleOf(state.turn));
      commit(card === null ? applyPass(state) : applyPlay(state, card));
    }, SPEEDS[speed].delay);
    return () => window.clearTimeout(timer);
  }, [ready, begun, state, commit, speed]);

  // 5回戦ぶんが終わったら記録する
  useEffect(() => {
    if (!match || !match.finished || recorded.current) return;
    recorded.current = true;
    const place = placeOf(match, HUMAN);
    const outcome = place === 0 ? 'win' : 'loss';
    trackToolUse('shichinarabe', `${outcome}-${variantOf(match.rules)}`);
    records.finish({ outcome, score: match.scores[HUMAN] }, variantOf(match.rules));
  }, [match, records]);

  /** いま自分が出せる札。手札と場のどちらの表示にも使う */
  const playable = useMemo(
    () => (state && humanTurn ? playableCards(state, HUMAN) : []),
    [state, humanTurn],
  );
  const playableIds = useMemo(() => new Set(playable.map((c) => c.id)), [playable]);
  /** 場のどのマスが「いま置ける場所」か（`suit-rank` のキー） */
  const targets = useMemo(
    () => new Set(playable.map((c) => `${c.suit}-${c.rank}`)),
    [playable],
  );

  const play = (id: number) => {
    if (!state || !humanTurn) return;
    const card = state.hands[HUMAN].find((c) => c.id === id);
    if (!card || !playableIds.has(id)) return;
    if (!started.current) {
      started.current = true;
      records.start(variant);
    }
    // ♦7が自分の手にあって先に出すときは、それをスタートの合図とみなす
    setBegun(true);
    commit(applyPlay(state, card));
  };

  const pass = () => {
    if (!state || !humanTurn) return;
    if (!started.current) {
      started.current = true;
      records.start(variant);
    }
    setBegun(true);
    commit(applyPass(state));
  };

  const changeRule = (key: keyof Rules, on: boolean) => {
    const next = { ...rules, [key]: on };
    setRules(next);
    writeSetting(RULES_KEY, JSON.stringify(next));
    // ルールを変えると場のつながり方が変わるので、試合を仕切り直す
    start(next);
  };

  if (!match || !state) {
    return (
      <div className="card cardgame">
        <p className="sn-msg">配っています…</p>
      </div>
    );
  }

  const order = standings(state);
  const finalOrder = matchStandings(match);
  const roundOver = state.finished;
  const passesLeft = PASS_LIMIT - state.passes[HUMAN];
  const outPlace = (player: number) => order.indexOf(player);
  const isEliminated = (player: number) => state.eliminated.some((e) => e.player === player);

  return (
    <div className="card cardgame sn-game">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="CPUの速さ">
          {(Object.keys(SPEEDS) as Speed[]).map((sp) => (
            <button
              key={sp}
              type="button"
              className={sp === speed ? 'active' : ''}
              aria-pressed={sp === speed}
              onClick={() => {
                setSpeed(sp);
                writeSetting(SPEED_KEY, sp);
              }}
            >
              {SPEEDS[sp].label}
            </button>
          ))}
        </div>

        <button type="button" className="btn" onClick={() => start(rules)}>
          最初から
        </button>
      </div>

      <details className="sn-rules">
        <summary>ローカルルール</summary>
        <ul>
          {RULE_LABELS.map(({ key, label, note }) => (
            <li key={key}>
              <label>
                <input
                  type="checkbox"
                  checked={rules[key]}
                  onChange={(e) => changeRule(key, e.currentTarget.checked)}
                />
                <span className="sn-rule-name">{label}</span>
                <span className="sn-rule-note">{note}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="sn-rule-note">切り替えると試合を最初からやり直します。</p>
      </details>

      <div className="status-bar">
        <span>
          第{match.round}回戦 / 全{ROUNDS}回戦
        </span>
        <span>
          あなたの通算 <strong>{match.scores[HUMAN]}点</strong>
        </span>
      </div>

      <RecordStrip
        items={
          // 1試合（5回戦）を終えるまでは出さない。0勝0敗の帯は情報が無い
          (entry.wins ?? 0) + (entry.losses ?? 0) === 0
            ? []
            : [
                {
                  label: rules.tunnel ? 'トンネルありの成績' : '標準ルールの成績',
                  value: `${entry.wins ?? 0}回 1位 / ${(entry.wins ?? 0) + (entry.losses ?? 0)}試合`,
                },
                { label: '最高通算点', value: `${entry.bestScore ?? 0}点` },
              ]
        }
      />

      <div className="sn-seats">
        {Array.from({ length: PLAYER_COUNT }, (_, i) => i)
          .filter((i) => i !== HUMAN)
          .map((i) => {
            const place = outPlace(i);
            const isTurn = !state.finished && state.turn === i;
            const style = styleOf(i);
            return (
              <div key={i} className={`sn-seat${isTurn ? ' active' : ''}`}>
                <span className="sn-seat-name">
                  {SEAT_NAMES[i]}
                  <span className="sn-seat-style">{style.label}</span>
                </span>
                <span className="sn-seat-count">
                  {isEliminated(i) ? '失格' : `${state.hands[i].length}枚`}
                </span>
                {/* 残り枚数を裏向きの札で見せる。数字だけだと減り具合が頭に入らない */}
                <span className="sn-seat-cards" aria-hidden>
                  {state.hands[i].map((c) => (
                    <span key={c.id} className="sn-back" />
                  ))}
                </span>
                <span className="sn-seat-state">
                  {/* 最後の1人は札を残したまま順位が決まる（残っても順位は変わらないので
                      そこで回戦を終える）。「上がり」と書くと嘘になるので分けている */}
                  {isEliminated(i)
                    ? '手札は場に開いた'
                    : place >= 0
                      ? state.hands[i].length === 0
                        ? `${PLACE_LABELS[place]}で上がり`
                        : `${PLACE_LABELS[place]}（札が残った）`
                      : `パス残り${PASS_LIMIT - state.passes[i]}回${isTurn ? '・考え中…' : ''}`}
                </span>
              </div>
            );
          })}
      </div>

      {/* 場。4スート×13マスの表で、置かれた札だけが色つきで出る。
          13列を本物のカードの絵で並べるとスマホで1枚が読めない大きさになるため、
          場は数字のマスにして、手札のほうに `_cards` の絵柄を使っている */}
      <div className="sn-board" aria-label="場">
        {SUITS.map((suit: Suit) => (
          <div key={suit} className="sn-row">
            <span className={`sn-suit${isRed(suit) ? ' red' : ''}`} aria-hidden>
              {SUIT_SYMBOL[suit]}
            </span>
            {RANKS.map((rank) => {
              const on = state.board[suit][rank];
              const hit = targets.has(`${suit}-${rank}`);
              const last =
                state.last !== null && state.last.suit === suit && state.last.rank === rank;
              return (
                <span
                  key={rank}
                  className={`sn-cell${on ? ' on' : ''}${hit ? ' hit' : ''}${last ? ' last' : ''}${
                    isRed(suit) ? ' red' : ''
                  }`}
                  aria-label={
                    on
                      ? `${SUIT_SYMBOL[suit]}${RANK_LABEL[rank]} は場にあります`
                      : `${SUIT_SYMBOL[suit]}${RANK_LABEL[rank]} は空き`
                  }
                >
                  {RANK_LABEL[rank]}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {/* 直前に起きたことと、いま誰の番かを両方出す。
          出来事だけを出すと、CPUの手のあとに自分の番が来たことに気づけない */}
      <p className="sn-msg" aria-live="polite">
        {roundOver
          ? match.finished
            ? `${ROUNDS}回戦が終わりました`
            : `第${match.round}回戦が終わりました`
          : !begun
            ? state.turn === HUMAN
              ? 'あなたが♦7を持っています。出したい札をタップすると始まります'
              : 'スタートを押すと始まります（♦7を持っていた人から出します）'
            : [
                state.events.map((e) => eventText(e, state)).join(' / '),
                humanTurn
                  ? playable.length === 0
                    ? '出せる札がありません。パスしてください'
                    : 'あなたの番です。出したい札をタップ'
                  : `${SEAT_NAMES[state.turn]}の番です`,
              ]
                .filter(Boolean)
                .join(' / ')}
      </p>

      {/* スタート待ち。押すまでCPUは出さない（♦7が自分なら初手でも始まる） */}
      {!begun && !roundOver && (
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={() => setBegun(true)}>
            スタート
          </button>
        </div>
      )}

      {roundOver && (
        <div className="sn-result">
          <h3>{match.finished ? '最終結果（通算点）' : `第${match.round}回戦の結果`}</h3>
          <ol>
            {(match.finished ? finalOrder : order).map((p, place) => (
              <li key={p} className={p === HUMAN ? 'me' : ''}>
                <span className="sn-result-rank">{PLACE_LABELS[place]}</span>
                <span className="sn-result-name">{SEAT_NAMES[p]}</span>
                <span className="sn-result-score">{match.scores[p]}点</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="sn-hand" aria-label="あなたの手札">
        {state.hands[HUMAN].length === 0 ? (
          <span className="sn-empty">
            {isEliminated(HUMAN)
              ? '失格したので、手札は場に開きました'
              : '手札はありません（上がり）'}
          </span>
        ) : (
          state.hands[HUMAN].map((c) => (
            <span
              key={c.id}
              className={`sn-slot${humanTurn && !playableIds.has(c.id) ? ' dim' : ''}`}
            >
              <CardView card={c} onClick={() => play(c.id)} />
            </span>
          ))
        )}
      </div>

      <div className="btn-row" style={{ marginTop: 12, justifyContent: 'center' }}>
        {roundOver ? (
          match.finished ? (
            <button type="button" className="btn btn-primary" onClick={() => start(rules)}>
              もう一度あそぶ
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                // 「第n回戦へ」を押すこと自体がスタートの合図
                setBegun(true);
                setMatch(startNextRound(match));
              }}
            >
              第{match.round + 1}回戦へ
            </button>
          )
        ) : (
          <button
            type="button"
            className={`btn${passesLeft <= 0 ? ' sn-danger' : ''}`}
            onClick={pass}
            disabled={!humanTurn}
          >
            {passesLeft > 0 ? `パス（あと${passesLeft}回）` : 'パス（失格になります）'}
          </button>
        )}
      </div>

      <p className="sn-note">
        パスは<strong>3回まで</strong>。4回目で失格になり、
        <strong>手札はすべて場に開きます</strong>。
        薄く表示されている札は、いまは場につながらないので出せません。
      </p>
    </div>
  );
}
