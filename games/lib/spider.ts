/**
 * スパイダーソリティアのロジック
 *
 * 一般的なルール:
 * - 2デック104枚。場札は10列（左4列に6枚、右6列に5枚。各列の一番下だけ表）
 * - 山札は残り50枚。配るときは全列に1枚ずつ（空列があると配れない）
 * - 移動できるのは「同スートで降順に連続した」表向きの並びだけ
 * - 置き先は「1つ大きいランク」ならスート不問。空列にはどれでも置ける
 * - K→Aまで同スートで13枚並んだ列は自動的に完成して場から取り除く
 * - 8組完成で勝ち
 * - 難易度はスート数（1/2/4）。枚数は常に104枚
 */

import { makeDeck, shuffle, type Card, type Suit } from './cards';

export const SPIDER_LEVELS = {
  one: { label: '1スート', suits: ['spade'] as readonly Suit[] },
  two: { label: '2スート', suits: ['spade', 'heart'] as readonly Suit[] },
  four: { label: '4スート', suits: ['spade', 'heart', 'diamond', 'club'] as readonly Suit[] },
} as const;

export type SpiderLevel = keyof typeof SPIDER_LEVELS;

export interface SpiderState {
  /** 場札10列（末尾が一番下＝手前の札） */
  tableau: Card[][];
  /** 山札。10枚ずつ配る（残回数 = stock.length / 10） */
  stock: Card[];
  /** 完成した組の数（8で勝ち） */
  completed: number;
  moves: number;
  level: SpiderLevel;
}

export function dealSpider(level: SpiderLevel, rng: () => number = Math.random): SpiderState {
  const deck = shuffle(makeDeck(2, SPIDER_LEVELS[level].suits), rng);
  const tableau: Card[][] = [];
  let pos = 0;
  for (let col = 0; col < 10; col += 1) {
    const count = col < 4 ? 6 : 5;
    tableau.push(
      deck.slice(pos, pos + count).map((c, i) => ({ ...c, faceUp: i === count - 1 })),
    );
    pos += count;
  }
  return { tableau, stock: deck.slice(pos), completed: 0, moves: 0, level };
}

/** pile の cardIndex から末尾までが「同スートで降順に連続した表向きの並び」か */
export function isMovableRun(pile: Card[], cardIndex: number): boolean {
  if (cardIndex < 0 || cardIndex >= pile.length) return false;
  for (let i = cardIndex; i < pile.length; i += 1) {
    const c = pile[i];
    if (!c.faceUp) return false;
    if (i > cardIndex) {
      const prev = pile[i - 1];
      if (c.suit !== prev.suit || c.rank !== prev.rank - 1) return false;
    }
  }
  return true;
}

/** 置けるか（1つ大きいランクならスート不問。空列は何でも可） */
export function canDropSpider(moving: Card, target: Card | undefined): boolean {
  if (!target) return true;
  return target.faceUp && moving.rank === target.rank - 1;
}

/** 列の一番下が裏なら表にする */
function flipTop(pile: Card[]): Card[] {
  if (pile.length === 0) return pile;
  const last = pile[pile.length - 1];
  return last.faceUp ? pile : [...pile.slice(0, -1), { ...last, faceUp: true }];
}

/** K→A の同スート13枚が末尾に完成していれば取り除く */
function collectRuns(tableau: Card[][], completed: number): { tableau: Card[][]; completed: number } {
  let done = completed;
  const next = tableau.map((pile) => {
    if (pile.length < 13) return pile;
    const start = pile.length - 13;
    if (pile[start].rank === 13 && isMovableRun(pile, start)) {
      done += 1;
      return flipTop(pile.slice(0, start));
    }
    return pile;
  });
  return { tableau: next, completed: done };
}

/** 場札から場札へ移動する。無効なら null */
export function moveSpider(
  s: SpiderState,
  fromCol: number,
  cardIndex: number,
  toCol: number,
): SpiderState | null {
  if (fromCol === toCol) return null;
  const pile = s.tableau[fromCol];
  if (!isMovableRun(pile, cardIndex)) return null;
  const moving = pile.slice(cardIndex);
  const target = s.tableau[toCol];
  if (!canDropSpider(moving[0], target[target.length - 1])) return null;
  const raw = s.tableau.map((p, i) => {
    if (i === fromCol) return flipTop(p.slice(0, cardIndex));
    if (i === toCol) return [...p, ...moving];
    return p;
  });
  const { tableau, completed } = collectRuns(raw, s.completed);
  return { ...s, tableau, completed, moves: s.moves + 1 };
}

/**
 * 山札から全列に1枚ずつ配る。
 * 本来のルールどおり、空列があるときは配れない（null を返す）。
 */
export function dealRow(s: SpiderState): SpiderState | null {
  if (s.stock.length === 0) return null;
  if (s.tableau.some((p) => p.length === 0)) return null;
  const row = s.stock.slice(-10);
  const raw = s.tableau.map((p, i) => [...p, { ...row[9 - i], faceUp: true }]);
  const { tableau, completed } = collectRuns(raw, s.completed);
  return { ...s, tableau, completed, stock: s.stock.slice(0, -10), moves: s.moves + 1 };
}

export function isSpiderWon(s: SpiderState): boolean {
  return s.completed >= 8;
}

/**
 * タップされた並びの「一番よい移動」を実行する。
 * 同スートで続けられる列を最優先し、次にランクだけ合う列、最後に空列。
 */
export function autoMoveSpider(
  s: SpiderState,
  fromCol: number,
  cardIndex: number,
): SpiderState | null {
  const pile = s.tableau[fromCol];
  if (!isMovableRun(pile, cardIndex)) return null;
  const moving = pile[cardIndex];
  const cols = [...Array(10).keys()].filter((c) => c !== fromCol);
  const score = (col: number): number => {
    const target = s.tableau[col];
    const top = target[target.length - 1];
    if (!top) return 1; // 空列は最後の手段
    if (!canDropSpider(moving, top)) return 0;
    return top.suit === moving.suit ? 3 : 2; // 同スートを優先
  };
  const ranked = cols
    .map((col) => ({ col, score: score(col) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  for (const { col } of ranked) {
    const r = moveSpider(s, fromCol, cardIndex, col);
    if (r) return r;
  }
  return null;
}
