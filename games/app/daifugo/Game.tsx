'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyPass,
  applyPlay,
  cardLabel,
  chooseCpuPlay,
  classify,
  DEFAULT_RULES,
  finishRound,
  isLegalPlay,
  legalPlays,
  LEVELS,
  matchStandings,
  newMatch,
  placeOf,
  PLAYER_COUNT,
  RANK_LABELS,
  ROUNDS,
  RULE_LABELS,
  standings,
  startNextRound,
  type DCard,
  type GameEvent,
  type Level,
  type MatchState,
  type RoundState,
  type Rules,
} from '@/lib/daifugo';
import { SUIT_SYMBOL } from '@/lib/cards';
import { CardView, JokerView } from '@/app/_cards/CardView';
import { RecordStrip, useRecords } from '@/app/_records/Records';
import { winRate } from '@/lib/records';
import { trackToolUse } from '@/lib/analytics';

/**
 * 大富豪の画面。ロジックは `lib/daifugo.ts`（純関数）にあり、ここは入力と描画だけ。
 * 仕様: docs/features/game-daifugo.md
 */

/** プレイヤーは常に0番。CPUは席順に1〜3 */
const HUMAN = 0;
const SEAT_NAMES = ['あなた', 'CPU 左', 'CPU 正面', 'CPU 右'];

/** 強さ・ローカルルール・CPUの速さは覚えておく（毎回選び直させない）。
    遊んだ記録ではないので lib/records.ts には入れない */
const LEVEL_KEY = 'daifugo:level';
const RULES_KEY = 'daifugo:rules';
const SPEED_KEY = 'daifugo:speed';

/**
 * CPUが1手打つまでの間（ms）。
 *
 * 速いと「何が起きたか分からないうちに自分の番が来る」ので、既定はゆっくりめにした。
 * 場の実況（革命・8切りなど）を読む時間が要るため、待ちを消す選択肢は用意していない。
 */
const SPEEDS = {
  slow: { label: 'ゆっくり', delay: 2000 },
  normal: { label: 'ふつう', delay: 1300 },
  fast: { label: 'はやい', delay: 700 },
} as const;

type Speed = keyof typeof SPEEDS;

function readSpeed(): Speed {
  const saved = readSetting(SPEED_KEY);
  return saved === 'slow' || saved === 'normal' || saved === 'fast' ? saved : 'normal';
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
    // 覚えられなくても、その試合は普通に遊べる
  }
}

function readLevel(): Level {
  const saved = readSetting(LEVEL_KEY);
  return saved === 'easy' || saved === 'normal' || saved === 'hard' ? saved : 'normal';
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

const EVENT_TEXT: Record<GameEvent['kind'], (who: string) => string> = {
  revolution: (who) => `${who}の革命！ 強さが逆転します`,
  'counter-revolution': (who) => `${who}の革命返し。強さが元に戻りました`,
  'eight-cut': (who) => `8切り！ ${who}がもう一度出します`,
  'jack-back': (who) => `${who}の11バック！ この場は強さが逆転します`,
  lock: (who) => `${who}の一手で縛り成立。このスートしか出せません`,
  'spade-three': (who) => `スペ3返し！ ${who}がジョーカーを流しました`,
  clear: (who) => `場が流れました。${who}から出します`,
  out: (who) => `${who}が上がりました`,
  'five-skip': (who) => `5飛ばし！ ${who}の一手で次の人が飛ばされました`,
  'nine-reverse': (who) => `9リバース！ ${who}の一手で順番が逆回りになりました`,
  'city-fall': (who) => `都落ち！ ${who}が大貧民になりました`,
};

/** 1枚ぶんの表示。ジョーカーだけ別の絵柄になる */
function Card({
  card,
  selected = false,
  dim = false,
  onClick,
}: {
  card: DCard;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
}) {
  return (
    <span className={`df-slot${dim ? ' dim' : ''}`}>
      {card.joker ? (
        <JokerView selected={selected} onClick={onClick} />
      ) : (
        <CardView card={{ ...card, faceUp: true }} selected={selected} onClick={onClick} />
      )}
    </span>
  );
}

export default function Game() {
  const [level, setLevel] = useState<Level>('normal');
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [match, setMatch] = useState<MatchState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  // 設定を読むまでは配らない（静的書き出し時のサーバー側と食い違わないように）
  const [ready, setReady] = useState(false);
  /**
   * スタート待ち。配った直後は false で、CPUは動かない。
   * 「スタート」を押すか、自分が先に出すと true になる。
   * ♦3を持つCPUが、開いた瞬間に出し始めるのを防ぐ。
   * 2回戦以降は「第n回戦へ」を押した時点で始まってよいので、リセットしない
   */
  const [begun, setBegun] = useState(false);
  const records = useRecords('daifugo');
  const entry = records.entry(level);
  // 1試合につき1回だけ数える
  const started = useRef(false);
  const recorded = useRef(false);

  const start = useCallback((nextLevel: Level, nextRules: Rules) => {
    started.current = false;
    recorded.current = false;
    setSelected([]);
    setBegun(false);
    setMatch(newMatch(nextLevel, nextRules));
    trackToolUse('daifugo', `new-${nextLevel}`);
  }, []);

  useEffect(() => {
    const savedLevel = readLevel();
    const savedRules = readRules();
    setLevel(savedLevel);
    setRules(savedRules);
    setSpeed(readSpeed());
    setMatch(newMatch(savedLevel, savedRules));
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
    if (!ready || !begun || !match || !state || state.finished || state.turn === HUMAN) return;
    const timer = window.setTimeout(() => {
      const cards = chooseCpuPlay(state, match.level);
      commit(cards === null ? applyPass(state) : applyPlay(state, cards));
    }, SPEEDS[speed].delay);
    return () => window.clearTimeout(timer);
  }, [ready, begun, match, state, commit, speed]);

  // 5回戦ぶんが終わったら記録する
  useEffect(() => {
    if (!match || !match.finished || recorded.current) return;
    recorded.current = true;
    const place = placeOf(match, HUMAN);
    const outcome = place === 0 ? 'win' : 'loss';
    trackToolUse('daifugo', `${outcome}-${match.level}`);
    records.finish({ outcome, score: match.scores[HUMAN] }, match.level);
  }, [match, records]);

  /** いま自分が出せる役に含まれる札。手札のどれが使えるかを見せるのに使う */
  const playableIds = useMemo(() => {
    if (!state || !humanTurn) return new Set<number>();
    return new Set(legalPlays(state).flatMap((p) => p.cards.map((c) => c.id)));
  }, [state, humanTurn]);

  const hand = state?.hands[HUMAN] ?? [];
  const selectedCards = hand.filter((c) => selected.includes(c.id));
  const canPlay = !!state && humanTurn && isLegalPlay(state, selectedCards);
  const mustPass = humanTurn && playableIds.size === 0;

  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const play = () => {
    if (!state || !canPlay) return;
    if (!started.current) {
      started.current = true;
      records.start(level);
    }
    // ♦3が自分の手にあって先に出すときは、それをスタートの合図とみなす
    setBegun(true);
    setSelected([]);
    commit(applyPlay(state, selectedCards));
  };

  const pass = () => {
    if (!state || !humanTurn || !state.field) return;
    setSelected([]);
    commit(applyPass(state));
  };

  const changeLevel = (next: Level) => {
    setLevel(next);
    writeSetting(LEVEL_KEY, next);
    start(next, rules);
  };

  const changeRule = (key: keyof Rules, on: boolean) => {
    const next = { ...rules, [key]: on };
    setRules(next);
    writeSetting(RULES_KEY, JSON.stringify(next));
    // ルールを変えると場の意味が変わるので、試合を仕切り直す
    start(level, next);
  };

  const nextRound = () => {
    if (!match) return;
    setSelected([]);
    // 「第n回戦へ」を押すこと自体がスタートの合図
    setBegun(true);
    setMatch(startNextRound(match));
  };

  if (!match || !state) {
    return (
      <div className="card cardgame">
        <p className="df-msg">配っています…</p>
      </div>
    );
  }

  const order = standings(state);
  const finalOrder = matchStandings(match);
  const roundOver = state.finished;
  const events = state.events;

  return (
    <div className="card cardgame df-game">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="CPUの強さ">
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <button
              key={l}
              type="button"
              className={l === level ? 'active' : ''}
              aria-pressed={l === level}
              onClick={() => changeLevel(l)}
            >
              {LEVELS[l].label}
            </button>
          ))}
        </div>

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
      </div>

      <details className="df-rules">
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
                <span className="df-rule-name">{label}</span>
                <span className="df-rule-note">{note}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="df-rule-note">切り替えると試合を最初からやり直します。</p>
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
          winRate(entry) === null
            ? []
            : [
                {
                  label: `${LEVELS[level].label}との対戦`,
                  value: `${entry.wins ?? 0}回 大富豪 / ${(entry.wins ?? 0) + (entry.losses ?? 0)}試合`,
                },
                { label: '最高通算点', value: `${entry.bestScore ?? 0}点` },
              ]
        }
      />

      <div className="df-seats">
        {Array.from({ length: PLAYER_COUNT }, (_, i) => i)
          .filter((i) => i !== HUMAN)
          .map((i) => {
            const place = order.indexOf(i);
            const isTurn = !state.finished && state.turn === i;
            return (
              <div key={i} className={`df-seat${isTurn ? ' active' : ''}`}>
                <span className="df-seat-name">{SEAT_NAMES[i]}</span>
                <span className="df-seat-count">
                  {place >= 0 ? RANK_LABELS[place] : `${state.hands[i].length}枚`}
                </span>
                {/* 残り枚数を裏向きの札で見せる。数字だけだと「あと何枚か」が
                    ひと目で入ってこないため。中身は伏せたままなので情報は増えない */}
                <span className="df-seat-cards" aria-hidden>
                  {state.hands[i].map((c) => (
                    <span key={c.id} className="df-back" />
                  ))}
                </span>
                <span className="df-seat-state">
                  {state.dropped === i
                    ? '都落ち'
                    : place >= 0
                      ? `${place + 1}位で上がり`
                      : state.passed[i]
                        ? 'パス'
                        : isTurn
                          ? '考え中…'
                          : ''}
                </span>
              </div>
            );
          })}
      </div>

      <div className="df-flags">
        {state.revolution && <span className="df-flag rev">革命中</span>}
        {state.jackBack && <span className="df-flag rev">11バック中</span>}
        {state.lock && (
          <span className="df-flag lock">
            縛り {state.lock.map((s) => SUIT_SYMBOL[s]).join('')}
          </span>
        )}
      </div>

      <div className="df-field" aria-label="場">
        {state.field ? (
          <>
            <span className="df-field-who">{SEAT_NAMES[state.leader]}が出した</span>
            <span className="df-field-cards">
              {state.field.cards.map((c) => (
                <Card key={c.id} card={c} />
              ))}
            </span>
          </>
        ) : (
          <span className="df-field-empty">場は空です。好きな役を出せます</span>
        )}
      </div>

      <p className="df-msg" aria-live="polite">
        {roundOver
          ? match.finished
            ? '5回戦が終わりました'
            : `第${match.round}回戦が終わりました`
          : !begun
            ? state.turn === HUMAN
              ? 'あなたが♦3を持っています。札を選んで「出す」と始まります'
              : 'スタートを押すと始まります（♦3を持つ人から出します）'
            : events.length > 0
              ? events.map((e) => EVENT_TEXT[e.kind](SEAT_NAMES[e.player])).join(' / ')
              : humanTurn
                ? mustPass
                  ? '出せる札がありません。パスしてください'
                  : 'あなたの番です。札を選んで「出す」'
                : `${SEAT_NAMES[state.turn]}の番です`}
      </p>

      {/* スタート待ち。押すまでCPUは出さない（♦3が自分なら初手でも始まる） */}
      {!begun && !roundOver && (
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={() => setBegun(true)}>
            スタート
          </button>
        </div>
      )}

      {roundOver && (
        <div className="df-result">
          <h3>{match.finished ? '最終結果（通算点）' : `第${match.round}回戦の結果`}</h3>
          <ol>
            {(match.finished ? finalOrder : order).map((p, place) => (
              <li key={p} className={p === HUMAN ? 'me' : ''}>
                <span className="df-result-rank">{RANK_LABELS[place]}</span>
                <span className="df-result-name">{SEAT_NAMES[p]}</span>
                <span className="df-result-score">{match.scores[p]}点</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="df-hand" aria-label="あなたの手札">
        {hand.length === 0 ? (
          <span className="df-field-empty">手札はありません</span>
        ) : (
          hand.map((c) => (
            <Card
              key={c.id}
              card={c}
              selected={selected.includes(c.id)}
              dim={humanTurn && !playableIds.has(c.id)}
              onClick={() => toggle(c.id)}
            />
          ))
        )}
      </div>

      <div className="btn-row" style={{ marginTop: 12, justifyContent: 'center' }}>
        {roundOver ? (
          match.finished ? (
            <button type="button" className="btn btn-primary" onClick={() => start(level, rules)}>
              もう一度あそぶ
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={nextRound}>
              第{match.round + 1}回戦へ
            </button>
          )
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={play} disabled={!canPlay}>
              出す
              {selectedCards.length > 0 && classify(selectedCards) ? `（${selectedCards.length}枚）` : ''}
            </button>
            <button
              type="button"
              className="btn"
              onClick={pass}
              disabled={!humanTurn || !state.field}
            >
              パス
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setSelected([])}
              disabled={selected.length === 0}
            >
              選択解除
            </button>
          </>
        )}
      </div>

      <p className="df-note">
        選んだ札：
        {selectedCards.length === 0 ? 'なし' : selectedCards.map(cardLabel).join('・')}
        {selectedCards.length > 0 && !classify(selectedCards) && '（役になっていません）'}
      </p>

      <p className="df-note">
        あなたは0番の席で、CPUは「{LEVELS[level].label}」です。
        <strong>薄く表示されている札は、いまの場には出せません。</strong>
        カード交換は弱い側が最強の札を、強い側が最弱の札を自動で渡します。
      </p>
    </div>
  );
}
