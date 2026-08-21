'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canRoll,
  canScore,
  CATEGORIES,
  CATEGORY_HINT,
  CATEGORY_LABEL,
  chooseCategory,
  chooseHold,
  hasRolled,
  initialState,
  LEVELS,
  LOWER_CATEGORIES,
  outcomeOf,
  ROLLS_PER_TURN,
  ROUNDS,
  rollDice,
  scoreCategory,
  scoreFor,
  setHold,
  toggleHold,
  totalScore,
  UPPER_BONUS,
  UPPER_CATEGORIES,
  UPPER_TARGET,
  upperBonus,
  upperSubtotal,
  type Category,
  type Level,
  type Side,
  type YachtState,
} from '@/lib/yacht';
import { trackToolUse } from '@/lib/analytics';
import { RecordStrip, useRecords } from '@/app/_records/Records';
import { averageScore, decidedGames } from '@/lib/records';
import {
  CpuSpeedSeg,
  delayFor,
  readCpuSpeed,
  writeCpuSpeed,
  type CpuSpeed,
} from '@/app/_cpu/CpuSpeed';
import { StartGate } from '@/app/_cpu/StartGate';

/**
 * 強さの選択は覚えておく（毎回選び直させない）。
 * 五目並べ・リバーシと同じく、これは「設定」であって遊んだ記録ではないので、
 * 記録（lib/records.ts）ではなくここで持つ。
 */
const LEVEL_KEY = 'yacht:level';

function readLevel(): Level {
  try {
    return localStorage.getItem(LEVEL_KEY) === 'hard' ? 'hard' : 'easy';
  } catch {
    return 'easy';
  }
}

function writeLevel(level: Level): void {
  try {
    localStorage.setItem(LEVEL_KEY, level);
  } catch {
    // 覚えられなくても、そのゲームは普通に遊べる
  }
}

/** CPUの1手（振る・キープ・記入）のあいだの間（ms、「ふつう」のとき）。
    倍率の3段階は app/_cpu/CpuSpeed.tsx が持つ */
const THINK_DELAY = 520;

/** サイコロの目の配置（3×3のどこに点を打つか） */
const PIPS: Record<number, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ face }: { face: number }) {
  const on = new Set(PIPS[face] ?? []);
  return (
    <span className="yc-face" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={on.has(i) ? 'yc-pip' : 'yc-pip off'} />
      ))}
    </span>
  );
}

export default function Game() {
  const [level, setLevel] = useState<Level>('easy');
  const [state, setState] = useState<YachtState>(initialState);
  // 設定を読むまでは動かさない（静的書き出し時のサーバー側と食い違わないように）
  const [ready, setReady] = useState(false);
  /** スタート待ち。押すまでCPUは動かない（五目並べ・リバーシと同じ作法） */
  const [begun, setBegun] = useState(false);
  const [speed, setSpeed] = useState<CpuSpeed>('normal');
  /**
   * CPUが「キープを決めた」ところを見せている途中かどうか。
   * 決めたキープをそのまま持っておき、次の間で振る（1手を2つに割る）。
   */
  const pendingHold = useRef<boolean[] | null>(null);
  const records = useRecords('yacht');
  const entry = records.entry(level);
  // 1ゲームにつき1回だけ数える
  const counted = useRef(false);
  const recorded = useRef(false);

  const mySheet = state.sheets.human;
  const myTurn = !state.finished && state.turn === 'human';
  const rolled = hasRolled(state);
  const outcome = outcomeOf(state);

  const start = useCallback((nextLevel: Level) => {
    pendingHold.current = null;
    counted.current = false;
    recorded.current = false;
    setState(initialState());
    setBegun(false);
    trackToolUse('yacht', `new-${nextLevel}`);
  }, []);

  useEffect(() => {
    setLevel(readLevel());
    setSpeed(readCpuSpeed('yacht'));
    setReady(true);
  }, []);

  // CPUの手番。「振る」「キープを決める」「記入する」を1つずつ、間をあけて進める
  useEffect(() => {
    if (!ready || !begun || state.finished || state.turn !== 'cpu') return;
    const timer = window.setTimeout(() => {
      const sheet = state.sheets.cpu;
      if (!hasRolled(state)) {
        pendingHold.current = null;
        setState(rollDice(state));
        return;
      }
      if (state.rollsLeft > 0) {
        const decided = pendingHold.current;
        if (decided === null) {
          const hold = chooseHold(state.dice, state.rollsLeft, sheet, level);
          // 全部キープ＝これ以上振らない。そのまま記入へ進む
          if (!hold.every(Boolean)) {
            pendingHold.current = hold;
            setState(setHold(state, hold));
            return;
          }
        } else {
          pendingHold.current = null;
          setState(rollDice(state));
          return;
        }
      }
      pendingHold.current = null;
      setState(scoreCategory(state, chooseCategory(state.dice, sheet, level)));
    }, delayFor(THINK_DELAY, speed));
    return () => window.clearTimeout(timer);
  }, [ready, begun, state, level, speed]);

  // 決着したら記録に残す（強さごとに分ける）
  useEffect(() => {
    if (!state.finished || outcome === null || recorded.current) return;
    recorded.current = true;
    const score = totalScore(state.sheets.human);
    records.finish({ outcome, score }, level);
    trackToolUse('yacht', `${outcome}-${level}`);
  }, [state, outcome, level, records]);

  const roll = () => {
    if (!myTurn || !canRoll(state)) return;
    // 自分から振ったときは、それをスタートの合図とみなす
    setBegun(true);
    if (!counted.current) {
      counted.current = true;
      records.start(level);
      trackToolUse('yacht', `roll-${level}`);
    }
    setState(rollDice(state));
  };

  const write = (category: Category) => {
    if (!myTurn || !canScore(state) || mySheet[category] !== null) return;
    setState(scoreCategory(state, category));
  };

  const changeLevel = (next: Level) => {
    setLevel(next);
    writeLevel(next);
    // 強さを変えるとCPUの打ち方が変わるので、そのゲームは仕切り直しになる
    start(next);
  };

  /** スコア表の1行ぶんの表示（自分・CPU） */
  const cellOf = (side: Side, category: Category): string => {
    const value = state.sheets[side][category];
    if (value !== null) return String(value);
    // 自分の番で振ってあれば、いま記入したら何点かを先に見せる
    if (side === 'human' && myTurn && rolled) return String(scoreFor(category, state.dice));
    return '–';
  };

  /**
   * ボーナスの行。**条件を満たすまでは上段の合計を出す**（あと何点かが分かる）。
   * `19/63` のように分母まで書くと、点数の欄（数字3桁ぶん）からはみ出す。
   * 63点という条件は行の名前と「この画面の見かた」に書いてある
   */
  const bonusCell = (side: Side): string => {
    const sheet = state.sheets[side];
    return upperBonus(sheet) > 0 ? `+${UPPER_BONUS}` : String(upperSubtotal(sheet));
  };

  const row = (category: Category) => {
    const filled = mySheet[category] !== null;
    const playable = myTurn && rolled && !filled;
    const preview = !filled && playable;
    return (
      <button
        key={category}
        type="button"
        className={`yc-row${filled ? ' filled' : ''}${playable ? ' playable' : ''}`}
        onClick={() => write(category)}
        disabled={!playable}
        aria-label={`${CATEGORY_LABEL[category]}（${CATEGORY_HINT[category]}）${
          filled
            ? `あなた${mySheet[category]}点`
            : playable
              ? `いま記入すると${scoreFor(category, state.dice)}点`
              : '未記入'
        } CPU${state.sheets.cpu[category] === null ? '未記入' : `${state.sheets.cpu[category]}点`}`}
      >
        <span className="yc-name">{CATEGORY_LABEL[category]}</span>
        <span className={`yc-val${preview ? ' preview' : ''}`}>{cellOf('human', category)}</span>
        <span className="yc-val cpu">{cellOf('cpu', category)}</span>
      </button>
    );
  };

  const sumRow = (name: string, mine: string, theirs: string) => (
    <div className="yc-row total">
      <span className="yc-name">{name}</span>
      <span className="yc-val">{mine}</span>
      <span className="yc-val cpu">{theirs}</span>
    </div>
  );

  const head = (
    // 「あなた」ではなく「自分」なのは字数の都合（3字だと狭い画面で列からはみ出す）。
    // 読み上げには行ごとの aria-label があるので、この見出しは見た目だけの目印
    <div className="yc-head" aria-hidden="true">
      <span className="yc-name">役</span>
      <span className="yc-val">自分</span>
      <span className="yc-val cpu">CPU</span>
    </div>
  );

  return (
    <div className="card yc-game">
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
        <CpuSpeedSeg
          value={speed}
          onChange={(next) => {
            setSpeed(next);
            writeCpuSpeed('yacht', next);
          }}
        />
      </div>

      <div className="status-bar">
        <span>
          {state.round} / {ROUNDS} 巡目
        </span>
        <span>
          {state.finished
            ? 'ゲーム終了'
            : !begun
              ? 'スタート待ち'
              : myTurn
                ? rolled
                  ? `あなたの番です（あと${state.rollsLeft}回振れます）`
                  : 'あなたの番です（振ってください）'
                : 'CPUの番です…'}
        </span>
      </div>

      {/* 記録は「いま選んでいる強さ」のもの。**1ゲームも終えていなくても出す**
          （終えた瞬間に帯が現れると、そのぶん下が押し下げられる） */}
      <RecordStrip
        items={[
          { label: `${LEVELS[level].label}でのベスト`, value: `${entry.bestScore ?? 0}点` },
          {
            label: '平均',
            value: averageScore(entry) === null ? '—' : `${averageScore(entry)}点`,
          },
          { label: '回数', value: `${decidedGames(entry)}回` },
        ]}
      />

      {/* 終局の知らせ。**出ても消えても下が動かないよう常に置く** */}
      <p
        className="result-row"
        style={{ color: outcome === 'win' ? 'var(--ok)' : 'var(--text)' }}
        aria-live="polite"
      >
        {outcome === null
          ? ''
          : `${totalScore(state.sheets.human)}点 対 ${totalScore(state.sheets.cpu)}点 — ${
              outcome === 'win' ? '🎉 あなたの勝ちです' : outcome === 'draw' ? '引き分けです' : 'あなたの負けです'
            }`}
      </p>

      <StartGate show={!begun && !state.finished} onStart={() => setBegun(true)}>
        <div className="yc-play">
          <div className="yc-dice" role="group" aria-label="サイコロ">
            {state.dice.map((face, i) => {
              const holdable = myTurn && rolled && state.rollsLeft > 0;
              return (
                <button
                  key={i}
                  type="button"
                  className={`yc-die${state.held[i] ? ' held' : ''}${rolled ? '' : ' idle'}`}
                  onClick={() => setState(toggleHold(state, i))}
                  disabled={!holdable}
                  aria-pressed={state.held[i]}
                  aria-label={
                    rolled
                      ? `${i + 1}個目 ${face}の目${state.held[i] ? '（キープ中）' : ''}`
                      : `${i + 1}個目 まだ振っていません`
                  }
                >
                  <Die face={face} />
                </button>
              );
            })}
          </div>

          <div className="yc-roll">
            <button
              type="button"
              className="btn btn-primary"
              onClick={roll}
              disabled={!myTurn || !canRoll(state)}
            >
              {rolled && state.rollsLeft > 0 ? `振り直す（残り${state.rollsLeft}回）` : 'サイコロを振る'}
            </button>
          </div>

          {/* 直前の手の知らせ。**行は常に置く**（文言が出入りしても表が動かない） */}
          <p className="hint-row yc-hint" aria-live="polite">
            {myTurn && rolled
              ? '残す目をタップ。振り直すか、役を選んで記入します'
              : state.last === null
                ? ''
                : `${state.last.side === 'human' ? 'あなた' : 'CPU'}：${
                    CATEGORY_LABEL[state.last.category]
                  } に ${state.last.points}点`}
          </p>

          {/* スコア表は上段6＋ボーナス／下段6＋合計の2列に折る。
              縦に13行並べるとスマホの1画面に収まらない（仕様書のレイアウト） */}
          <div className="yc-sheet">
            <div className="yc-col">
              {head}
              {UPPER_CATEGORIES.map((category) => row(category))}
              {sumRow(`上段計（${UPPER_TARGET}でボーナス）`, bonusCell('human'), bonusCell('cpu'))}
            </div>
            <div className="yc-col">
              {head}
              {LOWER_CATEGORIES.map((category) => row(category))}
              {sumRow(
                '合計',
                String(totalScore(state.sheets.human)),
                String(totalScore(state.sheets.cpu)),
              )}
            </div>
          </div>
        </div>
      </StartGate>

      <div className="btn-row" style={{ marginTop: 12, justifyContent: 'center' }}>
        <button type="button" className="btn" onClick={() => start(level)}>
          最初から
        </button>
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          サイコロは1手番に{ROLLS_PER_TURN}回まで振れます。残したいサイコロをタップすると
          キープになり、次に振ったときもその目のまま残ります。
          役の行を押すと、その時点の出目で点数が確定します（役にならない出目でも記入でき、
          そのときは0点です）。自分の列に薄い緑で出ている数字は「いま記入したら何点か」です。
          「上段計」の行にはエース〜シックスの合計が出ていて、{UPPER_TARGET}点以上になると
          ボーナスで+{UPPER_BONUS}点が付きます（付いた行は「+{UPPER_BONUS}」に変わります）。
          全{CATEGORIES.length}役を埋めて、合計点の高いほうが勝ちです。
        </p>
      </details>
    </div>
  );
}
