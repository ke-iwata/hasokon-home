'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyChoice,
  applyDraw,
  chooseCpuMatch,
  chooseCpuPlay,
  cpuKoikoi,
  CPU,
  CPU_LEVELS,
  declareKoikoi,
  declareStop,
  DEFAULT_OPTIONS,
  HUMAN,
  LEVEL_LABELS,
  matchesOf,
  newGame,
  nextRound,
  outcome,
  playFromHand,
  ROUND_CHOICES,
  scoreOf,
  variantOf,
  yakuOf,
  yakuProgress,
  type CpuLevel,
  type KoikoiState,
  type Options,
} from '@/lib/hanafuda';
import {
  cardOf,
  KIND_LABELS,
  sortForDisplay,
  sortHand,
  type HanafudaKind,
} from '@/lib/hanafuda-cards';
import { HanafudaBack, HanafudaCardView } from '@/app/_hanafuda/CardFace';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import { type Improved } from '@/lib/records';
import { trackToolUse } from '@/lib/analytics';
import {
  CpuSpeedSeg,
  delayFor,
  readCpuSpeed,
  writeCpuSpeed,
  type CpuSpeed,
} from '@/app/_cpu/CpuSpeed';
import { StartGate } from '@/app/_cpu/StartGate';

/**
 * 花札 こいこい の画面。ロジックは `lib/hanafuda.ts`（純関数）にあり、
 * ここは入力と描画だけ。仕様: docs/features/game-hanafuda-koikoi.md
 *
 * ## 進行のさせ方
 *
 * ターン制なので、スピードと違って**1本の効果で「次に自動で進む1歩」だけを
 * 予約する**。局面が変わるたびに張り直され、人間の入力を待つ場面
 * （自分の手番の `play` / `choose` / `koikoi`）では何も予約しない。
 *
 * 山札をめくる `draw` は**どちらの手番でも自動**にした。本物でも手札を出したら
 * 必ずめくるので選択の余地が無く、ボタンを押させると手数が倍になる。
 * ただし間は置く（`DRAW_MS`）。何がめくれて何と合ったのかを見せるため。
 */

/*
 * 自動で進む間（ms）。いずれも「ふつう」のときの値で、
 * 速さの設定に応じて `delayFor` が倍率を掛ける（app/_cpu/CpuSpeed.tsx）
 */
/** 山札をめくるまでの間 */
const DRAW_MS = 750;
/** CPUが手札を選ぶまでの間。読みは軽いので、これは演出のための待ち */
const THINK_MS = 800;
/** CPUが取り札を選ぶ・こいこいを決めるまでの間 */
const PICK_MS = 600;

/** 遊び方の設定。遊んだ記録ではないので lib/records.ts には入れない */
const PREFS_KEY = 'hanafuda-koikoi:options';

/** 最初の親（＝先攻）の決め方 */
type FirstChoice = 'you' | 'cpu' | 'random';

const FIRST_LABELS: Record<FirstChoice, string> = {
  you: 'あなたが親',
  cpu: 'CPUが親',
  random: 'ランダム',
};

interface Prefs extends Options {
  /** 札の右上に月数を出すか（初めての人が草木で月を見分けられないため） */
  showMonth: boolean;
  /** 最初の親（先攻）。2ヶ月目以降は勝った人が親を続ける（ゲームのルール） */
  first: FirstChoice;
}

const DEFAULT_PREFS: Prefs = { ...DEFAULT_OPTIONS, showMonth: true, first: 'random' };

function readPrefs(): Prefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFS_KEY);
  } catch {
    return DEFAULT_PREFS;
  }
  if (!raw) return DEFAULT_PREFS;
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      level: CPU_LEVELS.includes(p.level as CpuLevel) ? (p.level as CpuLevel) : DEFAULT_PREFS.level,
      rounds: ROUND_CHOICES.includes(p.rounds as number) ? (p.rounds as number) : DEFAULT_PREFS.rounds,
      sake: typeof p.sake === 'boolean' ? p.sake : DEFAULT_PREFS.sake,
      showMonth: typeof p.showMonth === 'boolean' ? p.showMonth : DEFAULT_PREFS.showMonth,
      first: p.first === 'you' || p.first === 'cpu' ? p.first : DEFAULT_PREFS.first,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 覚えられなくても、その回は普通に遊べる
  }
}

/** ルールだけを取り出す（表示の設定はゲームに渡さない） */
function rulesOf(prefs: Prefs): Options {
  return { level: prefs.level, rounds: prefs.rounds, sake: prefs.sake };
}

const SEAT_NAMES = ['あなた', 'CPU'];

export default function Game() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [state, setState] = useState<KoikoiState | null>(null);
  const [improved, setImproved] = useState<Improved | null>(null);
  /**
   * スタート待ち。配った直後は false で、自動進行（CPUの手・山札めくり）は動かない。
   * 「スタート」を押すか、親（先攻）の自分が先に出すと true になる。
   * 親がCPUのとき、開いた瞬間にCPUが出し始めるのを防ぐ。
   * 2ヶ月目以降は「次の月へ」を押した時点で始まってよいので、リセットしない
   */
  const [begun, setBegun] = useState(false);
  /** CPUの速さ。ルールではなく見せ方の設定なので、配り直さずその場で効く */
  const [speed, setSpeed] = useState<CpuSpeed>('normal');

  const records = useRecords('hanafuda-koikoi');
  const variant = variantOf(rulesOf(prefs));
  const entry = records.entry(variant);
  /** 1手でも動かしたか（プレイ数の数え方を他ゲームと揃える） */
  const counted = useRef(false);
  const scored = useRef(false);

  const start = useCallback((next: Prefs) => {
    counted.current = false;
    scored.current = false;
    setImproved(null);
    setBegun(false);
    setState(
      newGame(
        rulesOf(next),
        Math.random,
        next.first === 'you' ? HUMAN : next.first === 'cpu' ? CPU : null,
      ),
    );
  }, []);

  // 配るのに乱数を使うので、静的書き出しのHTMLと食い違わないよう
  // ブラウザに載ってから最初の局面を作る（神経衰弱・スピードと同じ理由）
  const dealt = useRef(false);
  useEffect(() => {
    if (dealt.current) return;
    dealt.current = true;
    const saved = readPrefs();
    setPrefs(saved);
    setSpeed(readCpuSpeed('hanafuda-koikoi'));
    start(saved);
  }, [start]);

  /**
   * 次に自動で進む1歩を予約する。
   * 人間の入力を待つ場面では何も予約しない（`step` が null のまま返る）。
   * スタート前（!begun）も何も予約しない
   */
  useEffect(() => {
    if (!state || !begun) return;
    const s = state;
    let delay = 0;
    let step: (() => KoikoiState) | null = null;

    if (s.phase === 'draw') {
      delay = delayFor(DRAW_MS, speed);
      step = () => applyDraw(s);
    } else if (s.turn === CPU) {
      if (s.phase === 'play') {
        delay = delayFor(THINK_MS, speed);
        step = () => {
          const move = chooseCpuPlay(s);
          return move ? playFromHand(s, move.card) : s;
        };
      } else if (s.phase === 'choose' || s.phase === 'draw-choose') {
        delay = delayFor(PICK_MS, speed);
        step = () => applyChoice(s, chooseCpuMatch(s) ?? (s.pending?.matches[0] as string));
      } else if (s.phase === 'koikoi') {
        delay = delayFor(PICK_MS, speed);
        step = () => (cpuKoikoi(s) ? declareKoikoi(s) : declareStop(s));
      }
    }

    if (!step) return;
    const run = step;
    const id = window.setTimeout(() => setState(run()), delay);
    return () => window.clearTimeout(id);
  }, [state, begun, speed]);

  /** ゲームが終わったら記録する */
  useEffect(() => {
    if (!state || state.phase !== 'game-over' || scored.current) return;
    scored.current = true;
    const decided = outcome(state) ?? 'draw';
    trackToolUse('hanafuda-koikoi', `${decided}-${variantOf(state.options)}`);
    const result = records.finish(
      // ベストスコアは「稼いだ文」。負けたゲームの文も実力なので常に渡す
      { outcome: decided, score: state.scores[HUMAN] },
      variantOf(state.options),
    );
    setImproved(result.improved);
  }, [state, records]);

  const change = (next: Prefs) => {
    setPrefs(next);
    writePrefs(next);
  };

  /** ルールを変えたら配り直す（途中でルールが変わらないように） */
  const changeRules = (next: Prefs) => {
    change(next);
    start(next);
  };

  const countPlay = useCallback(() => {
    if (counted.current) return;
    counted.current = true;
    records.start(variant);
    trackToolUse('hanafuda-koikoi', `new-${variant}`);
  }, [records, variant]);

  const tapHand = (id: string) => {
    if (!state || state.phase !== 'play' || state.turn !== HUMAN) return;
    countPlay();
    // 親（先攻）の自分が先に出すときは、それをスタートの合図とみなす
    setBegun(true);
    setState(playFromHand(state, id));
  };

  const tapField = (id: string) => {
    if (!state) return;
    if (state.phase !== 'choose' && state.phase !== 'draw-choose') return;
    if (state.turn !== HUMAN) return;
    setState(applyChoice(state, id));
  };

  const strip = useMemo(() => {
    // 1試合も終えていなくても出す。初戦の終わりに帯が現れると盤が押し下がるため
    return [
      {
        label: `${LEVEL_LABELS[prefs.level]}・${prefs.rounds}ヶ月戦の成績`,
        value: `${entry.wins ?? 0}勝${entry.losses ?? 0}敗${entry.draws ?? 0}分`,
      },
      { label: 'ベスト', value: entry.bestScore ? `${entry.bestScore}文` : '—' },
    ];
  }, [prefs.level, prefs.rounds, entry]);

  if (!state) {
    return (
      <div className="card cardgame">
        <p className="hf-msg">配っています…</p>
      </div>
    );
  }

  const myTurn = state.turn === HUMAN;
  const choosing = state.phase === 'choose' || state.phase === 'draw-choose';
  const targets = choosing && myTurn ? (state.pending?.matches ?? []) : [];
  const progress = yakuProgress(state.captured[HUMAN], rulesOf(prefs)).slice(0, 6);

  /**
   * 場の列数。基本は4列×2段で、9枚以上になったら列を増やして2段のまま収める。
   * 札が減っても段数は変えない（足りないぶんは空きスロットで埋める）
   */
  const fieldCols = Math.max(4, Math.ceil(state.field.length / 2));

  /** 場に出せば取れる札の月（自分の手番のときだけ、手札を光らせる） */
  const playableMonths = new Set(
    state.phase === 'play' && myTurn
      ? state.hands[HUMAN].filter((id) => matchesOf(state.field, id).length > 0).map(
          (id) => cardOf(id).month,
        )
      : [],
  );

  /**
   * 1人ぶんの取り札。**種類（光・タネ・短冊・カス）ごとの束に分けて見せる**。
   * こいこいの役は種類単位で数えるので、種類ごとに固まっていると
   * 「あと何枚で役か」がひと目で分かる（運営者の要望）。
   */
  const capturedRow = (player: number) => {
    const ids = sortForDisplay(state.captured[player]);
    const yaku = yakuOf(state, player);
    const groups = (Object.keys(KIND_LABELS) as HanafudaKind[])
      .map((kind) => ({ kind, ids: ids.filter((id) => cardOf(id).kind === kind) }))
      .filter((g) => g.ids.length > 0);
    return (
      <div className="hf-taken">
        <div className="hf-taken-head">
          <span className={player === HUMAN ? 'hf-seat me' : 'hf-seat'}>
            {SEAT_NAMES[player]}の取り札
          </span>
          <span className="hf-yaku-line">
            {yaku.length > 0 ? (
              <>
                {yaku.map((y) => (
                  <span key={y.id} className="hf-yaku">
                    {y.name} <strong>{y.points}</strong>
                  </span>
                ))}
                <span className="hf-yaku total">計 {scoreOf(state.captured[player], rulesOf(prefs))}文</span>
              </>
            ) : (
              <span className="hf-yaku none">役なし</span>
            )}
          </span>
        </div>
        <div className="hf-strip">
          {groups.length === 0 ? (
            <span className="hf-empty-note">まだありません</span>
          ) : (
            groups.map((g) => (
              <span key={g.kind} className="hf-kind-group">
                <span className="hf-kind-label">
                  {KIND_LABELS[g.kind]} {g.ids.length}
                </span>
                <span className="hf-kind-cards">
                  {g.ids.map((id) => (
                    <HanafudaCardView key={id} id={id} showMonth={prefs.showMonth} />
                  ))}
                </span>
              </span>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="card cardgame hf-game">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="CPUの強さ">
          {CPU_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={level === prefs.level ? 'active' : ''}
              aria-pressed={level === prefs.level}
              onClick={() => changeRules({ ...prefs, level })}
            >
              {LEVEL_LABELS[level]}
            </button>
          ))}
        </div>

        <CpuSpeedSeg
          value={speed}
          onChange={(next) => {
            setSpeed(next);
            writeCpuSpeed('hanafuda-koikoi', next);
          }}
        />

        <button type="button" className="btn" onClick={() => start(prefs)}>
          配り直す
        </button>
      </div>

      {/* 月数・最初の親・ローカルルールは**畳んでおく**。
          このゲームは設定が4つあり、切り替えを全部出すと狭い画面では
          それだけで3段（実測120px）使って盤が画面の外に出ていた。
          対局のたびに変えるものではないので、大富豪の `.df-rules` と
          同じく畳んでおく（仕様は docs/features/mobile-one-screen.md） */}
      <details className="hf-rules">
        <summary>対局の設定（月数・最初の親・ローカルルール）</summary>

        <div className="btn-row">
          <div className="seg" role="group" aria-label="月数">
            {ROUND_CHOICES.map((rounds) => (
              <button
                key={rounds}
                type="button"
                className={rounds === prefs.rounds ? 'active' : ''}
                aria-pressed={rounds === prefs.rounds}
                onClick={() => changeRules({ ...prefs, rounds })}
              >
                {rounds}ヶ月
              </button>
            ))}
          </div>

          {/* 最初の親（先攻）。2ヶ月目以降は勝った人が親を続ける（ルールどおり） */}
          <div className="seg" role="group" aria-label="最初の親">
            {(Object.keys(FIRST_LABELS) as FirstChoice[]).map((first) => (
              <button
                key={first}
                type="button"
                className={first === prefs.first ? 'active' : ''}
                aria-pressed={first === prefs.first}
                onClick={() => changeRules({ ...prefs, first })}
              >
                {FIRST_LABELS[first]}
              </button>
            ))}
          </div>
        </div>

        <div className="btn-row hf-toggles">
          <label className="hf-check">
            <input
              type="checkbox"
              checked={prefs.sake}
              onChange={(e) => changeRules({ ...prefs, sake: e.target.checked })}
            />
            花見酒・月見酒を役に入れる
          </label>
          <label className="hf-check">
            <input
              type="checkbox"
              checked={prefs.showMonth}
              onChange={(e) => change({ ...prefs, showMonth: e.target.checked })}
            />
            札に月数を出す
          </label>
        </div>
      </details>

      <div className="status-bar">
        <span>
          {state.round}<small>/{prefs.rounds}</small>ヶ月目
        </span>
        <span>
          あなた <strong>{state.scores[HUMAN]}文</strong>
        </span>
        <span>
          CPU <strong>{state.scores[CPU]}文</strong>
        </span>
        <span>
          親 <strong>{SEAT_NAMES[state.dealer]}</strong>
        </span>
      </div>

      <RecordStrip items={strip} />

      {/* CPU側。手札は伏せ、取り札は開く（本物と同じで取り札は公開情報） */}
      <div className="hf-hand cpu" aria-label="CPUの手札">
        {state.hands[CPU].map((id) => (
          <span key={id} className="hf-slot">
            <HanafudaBack />
          </span>
        ))}
      </div>
      {capturedRow(CPU)}

      <StartGate show={!begun && state.phase === 'play'} onStart={() => setBegun(true)}>
        <div className="hf-table">
          {/*
            左に山札、右に場札。山札の下は「いま注目する1枚」の定位置で、
            めくった札／出した札はここに出る。**中身が無くても枠は残す**
            （`.hf-empty`）。枠ごと消すと、札が出た瞬間に下の要素が動いて
            盤面がガタつくため
          */}
          <div
            className="hf-deck"
            aria-label={state.pending?.source === 'hand' ? '出した札' : '山札'}
          >
            <span className="hf-slot">
              <HanafudaBack />
              <span className="hf-count">{state.deck.length}</span>
            </span>
            <span className="hf-slot">
              {state.pending ? (
                <HanafudaCardView id={state.pending.card} showMonth={prefs.showMonth} selected />
              ) : state.lastDrawn ? (
                <HanafudaCardView id={state.lastDrawn} showMonth={prefs.showMonth} />
              ) : (
                <span className="hf-empty" aria-hidden />
              )}
            </span>
            <span className="hf-deck-note">
              {state.pending?.source === 'hand' ? '出した札' : 'めくった札'}
            </span>
          </div>

          {/*
            場は常に2段。9枚以上になったら列を増やして2段のまま収める
            （段が増えて盤面が上下に伸びないように。運営者の要望）。
            **札が減っても空きスロットで2段を保つ。** 4枚以下になるとグリッドが
            1段に詰まり、場が87px縮んで下が動いてしまうため
          */}
          <div
            className="hf-field"
            aria-label="場札"
            style={{ gridTemplateColumns: `repeat(${fieldCols}, minmax(0, 1fr))` }}
          >
            {state.field.map((id) => (
              <span key={id} className="hf-slot">
                <HanafudaCardView
                  id={id}
                  showMonth={prefs.showMonth}
                  highlight={targets.includes(id)}
                  dim={targets.length > 0 && !targets.includes(id)}
                  // 直前に山札から流れてきた札。どこから来たか追えるように光らせる
                  fresh={!state.pending && state.lastDrawn === id}
                  onClick={targets.includes(id) ? () => tapField(id) : undefined}
                />
              </span>
            ))}
            {Array.from({ length: Math.max(0, fieldCols * 2 - state.field.length) }, (_, i) => (
              <span key={`gap-${i}`} className="hf-slot" aria-hidden>
                <span className="hf-empty" />
              </span>
            ))}
          </div>
        </div>
      </StartGate>

      {capturedRow(HUMAN)}
      <div className="hf-hand" aria-label="あなたの手札">
        {sortHand(state.hands[HUMAN]).map((id) => (
          <span key={id} className="hf-slot">
            <HanafudaCardView
              id={id}
              showMonth={prefs.showMonth}
              highlight={state.phase === 'play' && myTurn && playableMonths.has(cardOf(id).month)}
              onClick={state.phase === 'play' && myTurn ? () => tapHand(id) : undefined}
            />
          </span>
        ))}
      </div>

      <p className="hf-msg" aria-live="polite">
        {message(state, myTurn, prefs, begun)}
        {state.phase === 'game-over' && <BestBadge improved={improved} />}
      </p>


      {/*
        局面ごとのボタン。**条件付きで行ごと出し入れせず、常に置く**
        （`.result-row` と同じ考え方。出た瞬間に下が57px動いていた）。
        こいこい・次の月へ・もう一度あそぶ は同時に出ないので1つの行で足りる
      */}
      <div className="hf-actions">
        {state.phase === 'koikoi' && myTurn && (
          <>
            <button type="button" className="btn btn-primary" onClick={() => setState(declareStop(state))}>
              あがる（{scoreOf(state.captured[HUMAN], rulesOf(prefs))}文）
            </button>
            <button
              type="button"
              className="btn"
              disabled={state.hands[HUMAN].length === 0}
              title={state.hands[HUMAN].length === 0 ? '手札が無いので、こいこいをしても流局になります' : undefined}
              onClick={() => setState(declareKoikoi(state))}
            >
              こいこい
            </button>
          </>
        )}

        {state.phase === 'round-over' && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              // 「次の月へ」を押すこと自体がスタートの合図（親がCPUでも待たない）
              setBegun(true);
              setState(nextRound(state));
            }}
          >
            {state.round >= prefs.rounds ? '結果を見る' : '次の月へ'}
          </button>
        )}

        {state.phase === 'game-over' && (
          <button type="button" className="btn btn-primary" onClick={() => start(prefs)}>
            もう一度あそぶ
          </button>
        )}
      </div>

      {/* 成立に近い役をハイライトして「何を狙うか」を学べるようにする（仕様書の初心者導線） */}
      <details className="hf-goal">
        <summary>あなたの役（あと何枚か）</summary>
        <ul className="hf-goal-list">
          {progress.map((p) => (
            <li key={p.def.id} className={p.done ? 'done' : ''}>
              <span className="name">{p.def.name}</span>
              <span className="note">{p.def.note}</span>
              <span className="state">
                {p.done ? `成立 ${p.points}文` : `あと${p.need - p.have}枚`}
              </span>
            </li>
          ))}
        </ul>
      </details>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p className="hf-note">
          場札と<strong>同じ月</strong>の手札を出すと2枚とももらえます。役ができたら
          <strong>あがる</strong>か<strong>こいこい</strong>を選びます。CPUの強さ「
          {LEVEL_LABELS[prefs.level]}」、{prefs.rounds}ヶ月戦。
        </p>
      </details>
    </div>
  );
}

/** 状況の説明。文言をここに集めて、盤面の描画から切り離しておく */
function message(state: KoikoiState, myTurn: boolean, prefs: Prefs, begun: boolean): string {
  const r = state.result;
  switch (state.phase) {
    case 'play':
      if (!begun) {
        return myTurn
          ? 'あなたが親（先攻）です。手札をタップすると始まります'
          : 'CPUが親（先攻）です。スタートを押すと始まります';
      }
      return myTurn
        ? '場札と同じ月の手札をタップします（合う札が無ければ、出した札が場に残ります）'
        : 'CPUが考えています…';
    case 'choose':
    case 'draw-choose':
      return myTurn
        ? 'どちらの札を取りますか？（光っている場札をタップ）'
        : 'CPUが取る札を選んでいます…';
    case 'draw':
      return '山札をめくります…';
    case 'koikoi':
      return myTurn
        ? `${scoreOf(state.captured[HUMAN], rulesOf(prefs))}文の役ができました。ここであがるか、こいこいで続けるかを選びます`
        : 'CPUが役をつくりました…';
    case 'round-over':
      if (!r) return '';
      if (r.reason === 'nagare') return `${state.round}ヶ月目は流局。だれも役をつくれませんでした`;
      if (r.reason === 'teshi' || r.reason === 'kuttsuki') {
        const name = r.reason === 'teshi' ? '手四' : 'くっつき';
        return `${SEAT_NAMES[r.winner as number]}の${name}（配られた手札で決まる役）。${r.points}文`;
      }
      return `${SEAT_NAMES[r.winner as number]}のあがり。${r.yaku
        .map((y) => `${y.name}${y.points}文`)
        .join('・')}${r.multiplier > 1 ? ` の${r.base}文 × ${r.multiplier}倍` : ''} で ${r.points}文`;
    case 'game-over': {
      const [mine, theirs] = state.scores;
      if (mine === theirs) return `引き分け。${mine}文ずつでした`;
      return mine > theirs
        ? `あなたの勝ち！ ${mine}文 対 ${theirs}文`
        : `CPUの勝ち。${mine}文 対 ${theirs}文でした`;
    }
    default:
      return '';
  }
}
