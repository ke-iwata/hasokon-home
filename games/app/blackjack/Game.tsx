'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyHandRecord,
  BETS,
  canBet,
  canDouble,
  canHit,
  canSplit,
  canStand,
  deal,
  dealerStep,
  doubleDown,
  FRAME_CARDS,
  handValue,
  hit,
  isBroke,
  newSession,
  nextRound,
  setBet,
  setRules,
  split,
  stand,
  totalLabel,
  variantOf,
  visibleCards,
  type BlackjackState,
  type Hand,
  type HandOutcome,
  type Rules,
} from '@/lib/blackjack';
import { CardView } from '@/app/_cards/CardView';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import type { Card } from '@/lib/cards';
import type { Improved } from '@/lib/records';
import { trackToolUse } from '@/lib/analytics';
import {
  CpuSpeedSeg,
  delayFor,
  readCpuSpeed,
  writeCpuSpeed,
  type CpuSpeed,
} from '@/app/_cpu/CpuSpeed';

/**
 * ブラックジャックの画面。ロジックは `lib/blackjack.ts`（純関数）にあり、ここは入力と描画・間だけ。
 * 仕様: docs/features/game-blackjack.md
 *
 * 局面（`phase`）は betting → player → dealer → settled の 4 つで、
 * 表示の出し分けはすべて `phase` で決める（games/CLAUDE.md 7）。
 */

const SLUG = 'blackjack';

/** ディーラーが 1 手（伏せ札をめくる・1 枚引く）進めるまでの間。「ふつう」の値で、`delayFor` が倍率を掛ける */
const DEALER_MS = 700;

/** ソフト 17 の設定は覚えておく。遊んだ記録ではないので lib/records.ts には入れない */
const RULES_KEY = 'blackjack:rules';

function readRules(): Rules {
  try {
    return { hitSoft17: localStorage.getItem(RULES_KEY) === 'h17' };
  } catch {
    return { hitSoft17: false };
  }
}

function writeRules(rules: Rules): void {
  try {
    localStorage.setItem(RULES_KEY, variantOf(rules));
  } catch {
    // 覚えられなくても、その回は普通に遊べる
  }
}

const OUTCOME_LABEL: Record<HandOutcome, string> = {
  blackjack: 'ブラックジャック',
  win: '勝ち',
  push: '引き分け',
  loss: '負け',
};

function formatChips(n: number): string {
  return n.toLocaleString('ja-JP');
}

function signed(n: number): string {
  return n > 0 ? `+${formatChips(n)}` : n < 0 ? `−${formatChips(-n)}` : '±0';
}

/**
 * 1 手の札の枠。**高さは札 1 枚ぶん、幅は 6 枚ぶんの重ね幅で固定**して、
 * 札が増えても枠は伸びない（games/CLAUDE.md 1「盤面は動かさない」）。
 * 6 枚を超えたら重ね幅を詰めて枠の中に収める。
 */
function HandFrame({ cards, active = false, label }: { cards: Card[]; active?: boolean; label: string }) {
  const n = cards.length;
  const step =
    n <= FRAME_CARDS ? 'var(--bj-step)' : `calc((100% - var(--bj-card-w)) / ${n - 1})`;
  return (
    <div className={`bj-frame${active ? ' active' : ''}`} role="group" aria-label={label}>
      {cards.map((card, i) => (
        <span key={card.id} className="bj-slot" style={{ left: `calc(${i} * ${step})` }}>
          <CardView card={card} />
        </span>
      ))}
    </div>
  );
}

/**
 * 手の上に出す 1 行。**枠の幅（6 枚ぶん）に収まる長さにする**（行は折り返さない）。
 * スプリットの 2 手は枠が狭いので、賭け金を出さず「手1 17」だけにする（賭け金は 2 手とも同じ）
 */
function handLine(hand: Hand, index: number, count: number): string {
  const v = handValue(hand.cards);
  const total = v.isBust ? `${v.hard} バースト` : totalLabel(hand.cards);
  if (count > 1) return `手${index + 1}　${total}`;
  return `${total}　賭け ${formatChips(hand.bet)}${hand.doubled ? '（ダブル）' : ''}`;
}

export default function Game() {
  const [state, setState] = useState<BlackjackState>(() => newSession());
  const [speed, setSpeed] = useState<CpuSpeed>('normal');
  const [improved, setImproved] = useState<Improved | null>(null);
  const records = useRecords(SLUG);
  const variant = variantOf(state.rules);
  const entry = records.entry(variant);
  /** 記録済みの局（1 局 1 回にする） */
  const recordedRound = useRef(0);

  // 保存してある設定はブラウザに載ってから読む（静的書き出しの HTML と食い違わないように）
  useEffect(() => {
    const rules = readRules();
    setState((s) => setRules(s, rules));
    setSpeed(readCpuSpeed(SLUG));
  }, []);

  /** ディーラーの番。1 手ずつ間を置いて進める（games/CLAUDE.md 8） */
  useEffect(() => {
    if (state.phase !== 'dealer') return;
    const id = window.setTimeout(() => setState((s) => dealerStep(s)), delayFor(DEALER_MS, speed));
    return () => window.clearTimeout(id);
  }, [state, speed]);

  /** 精算したら記録する */
  useEffect(() => {
    if (state.phase !== 'settled' || !state.settlement) return;
    if (recordedRound.current === state.round) return;
    recordedRound.current = state.round;
    const { outcome } = state.settlement;
    const v = variantOf(state.rules);
    // 「ベスト更新」の判定は、書き込む前の記録から出す（update は結果を返さないため）
    const result = applyHandRecord(records.entry(v), outcome, state.chips);
    records.update(v, (e) => applyHandRecord(e, outcome, state.chips).entry);
    setImproved(result.improved);
    trackToolUse(SLUG, `${outcome}-${v}`);
  }, [state, records]);

  const onDeal = useCallback(() => {
    setImproved(null);
    const v = variantOf(state.rules);
    // 配った局を 1 プレイと数える（ページを開いただけでは増えない）
    records.start(v);
    trackToolUse(SLUG, `deal-${v}`);
    setState((s) => deal(s));
  }, [state.rules, records]);

  const onRestart = () => {
    setImproved(null);
    trackToolUse(SLUG, 'restart');
    setState((s) => newSession(s.rules));
  };

  const changeRules = (rules: Rules) => {
    writeRules(rules);
    setState((s) => setRules(s, rules));
  };

  const strip = useMemo(
    () => [
      // 記録が無くても出す（「—」）。はじめての精算で帯が現れると盤が押し下がるため
      {
        label: state.rules.hitSoft17 ? 'ソフト17ヒットの成績' : '成績',
        value: `${entry.wins ?? 0}勝${entry.losses ?? 0}敗${entry.draws ?? 0}分`,
      },
      { label: '最高チップ', value: entry.bestScore ? formatChips(entry.bestScore) : '—' },
    ],
    [state.rules.hitSoft17, entry],
  );

  const inRound = state.phase === 'player' || state.phase === 'dealer';
  const broke = state.phase !== 'player' && state.phase !== 'dealer' && isBroke(state);
  const dealerShown = visibleCards(state.dealer);
  const dealerHidden = state.dealer.length > dealerShown.length;
  const onTable = state.hands.reduce((sum, h) => sum + h.bet, 0);
  // 精算後は、手持ちが減って届かなくなった賭け金を次の局で下げる（nextRound と同じ値を出す）
  const nextBet = state.phase === 'settled' ? nextRound(state).bet : state.bet;

  const message = (() => {
    switch (state.phase) {
      case 'betting':
        return broke
          ? 'チップがなくなりました。「はじめから」で 1,000 枚から遊べます'
          : '賭け金を選んで「配る」を押してください';
      case 'player':
        return state.hands.length > 1
          ? `手${state.active + 1}の番です。ヒットかスタンドを選んでください`
          : 'ヒット・スタンド・ダブル・スプリットから選んでください';
      case 'dealer':
        return 'ディーラーの番です…';
      case 'settled': {
        const s = state.settlement;
        if (!s) return '';
        const head = s.dealerPeekBlackjack
          ? 'ディーラーのブラックジャック。'
          : state.hands.length > 1
            ? s.hands.map((h, i) => `手${i + 1} ${OUTCOME_LABEL[h.outcome]}`).join('・') + '。'
            : `${OUTCOME_LABEL[s.hands[0].outcome]}。`;
        return `${head}収支 ${signed(s.net)}${broke ? '　チップがなくなりました' : ''}`;
      }
    }
  })();

  return (
    <div className="card cardgame bj-game">
      <div className="btn-row bj-settings">
        <div className="seg" role="group" aria-label="賭け金">
          {BETS.map((bet) => (
            <button
              key={bet}
              type="button"
              className={bet === nextBet ? 'active' : ''}
              aria-pressed={bet === nextBet}
              disabled={!canBet(state, bet)}
              onClick={() => setState((s) => setBet(s, bet))}
            >
              {bet}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="ディーラーのソフト17">
          {([false, true] as const).map((hitSoft17) => (
            <button
              key={String(hitSoft17)}
              type="button"
              className={hitSoft17 === state.rules.hitSoft17 ? 'active' : ''}
              aria-pressed={hitSoft17 === state.rules.hitSoft17}
              disabled={inRound}
              title="ディーラーがソフト17（Aを11と数えた17）で止まるか引くか"
              onClick={() => changeRules({ hitSoft17 })}
            >
              {hitSoft17 ? 'S17で引く' : 'S17で止まる'}
            </button>
          ))}
        </div>
        <CpuSpeedSeg
          value={speed}
          onChange={(next) => {
            setSpeed(next);
            writeCpuSpeed(SLUG, next);
          }}
        />
      </div>

      <div className="status-bar">
        <span>
          チップ <strong>{formatChips(state.chips)}</strong>
        </span>
        <span>
          賭け <strong>{formatChips(inRound || state.phase === 'settled' ? onTable : state.bet)}</strong>
        </span>
      </div>

      <RecordStrip items={strip} />

      <div className="bj-table">
        <div className="bj-side">
          <p className="bj-line">
            ディーラー
            {state.dealer.length > 0 && (
              <strong>
                {dealerHidden ? `${totalLabel(dealerShown)} ＋ ？` : totalLabel(state.dealer)}
                {!dealerHidden && handValue(state.dealer).isBust ? ' バースト' : ''}
              </strong>
            )}
          </p>
          <div className="bj-hands">
            <HandFrame cards={state.dealer} label="ディーラーの札" />
          </div>
        </div>

        <div className="bj-side">
          <div className="bj-hands">
            {(state.hands.length > 0 ? state.hands : [null]).map((hand, i) => (
              <div key={i} className="bj-hand">
                <p className="bj-line">
                  {hand ? (
                    <>
                      {state.hands.length > 1 ? '' : 'あなた'}
                      {state.phase === 'settled' && state.settlement && state.hands.length > 1 ? (
                        <>
                          <strong>{`手${i + 1}　${totalLabel(hand.cards)}`}</strong>
                          <span className="bj-result">
                            {OUTCOME_LABEL[state.settlement.hands[i].outcome]}
                          </span>
                        </>
                      ) : (
                        <strong>{handLine(hand, i, state.hands.length)}</strong>
                      )}
                    </>
                  ) : (
                    'あなた'
                  )}
                </p>
                <HandFrame
                  cards={hand?.cards ?? []}
                  active={state.phase === 'player' && state.hands.length > 1 && i === state.active}
                  label={state.hands.length > 1 ? `あなたの手${i + 1}` : 'あなたの札'}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="bj-msg" aria-live="polite">
        {message}
        {state.phase === 'settled' && <BestBadge improved={improved} />}
      </p>

      <div className="bj-actions" role="group" aria-label="行動">
        <button type="button" className="btn" disabled={!canHit(state)} onClick={() => setState(hit)}>
          ヒット
        </button>
        <button type="button" className="btn" disabled={!canStand(state)} onClick={() => setState(stand)}>
          スタンド
        </button>
        <button type="button" className="btn" disabled={!canDouble(state)} onClick={() => setState(doubleDown)}>
          ダブル
        </button>
        <button type="button" className="btn" disabled={!canSplit(state)} onClick={() => setState(split)}>
          スプリット
        </button>
      </div>

      <div className="bj-main">
        {broke ? (
          <button type="button" className="btn btn-primary" onClick={onRestart}>
            はじめから
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={inRound} onClick={onDeal}>
            {state.phase === 'settled' ? `次の局を配る（賭け ${nextBet}）` : `配る（賭け ${nextBet}）`}
          </button>
        )}
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p className="bj-note">
          合計が「7 / 17」のように2つ出ているのは、Aを1と数えた値と11と数えた値です。
          ディーラーの2枚目は伏せてあり、アップカードがAか10点札のときだけ、先にブラックジャックかどうかを確かめます。
          チップはこのページの中だけの点数で、1,000枚から始まります。
        </p>
      </details>
    </div>
  );
}
