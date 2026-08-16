/**
 * 花札「こいこい」のロジック（配り・合わせ・役判定・こいこい・CPU）
 *
 * 仕様: docs/features/game-hanafuda-koikoi.md
 *
 * 札の表は `lib/hanafuda-cards.ts`、絵は `app/_hanafuda/CardFace.tsx` にある。
 * ルールも伝統的な絵柄もパブリックドメインで、権利者はいない
 * （games/CLAUDE.md の名称の約束）。
 *
 * ## 設計
 *
 * - **局面は札のIDの配列だけで持つ**。オブジェクトを持ち回らないので、
 *   テストで期待値を素直に書けて、構造的な比較がそのまま使える
 * - 状態はすべてイミュータブル。`playFromHand` / `applyChoice` / `applyDraw` /
 *   `declareKoikoi` / `declareStop` は新しい局面を返す（既存ゲームと同じ約束）
 * - **1手＝2段階**（手札を出す → 山札をめくる）を `phase` で明示的に分ける。
 *   自動で続けてしまうと、めくった札が何と合ったのかを画面で見せられない
 * - **役の判定はテーブル駆動**（`YAKU_TABLE`）。役ごとに「必要な札」か
 *   「種別と枚数」のどちらかで書けるようにして、境界をテストで固定する
 *   （仕様書の「役判定はテーブル駆動にして全役の境界をテストで固定する」）
 * - 乱数は注入できる（`seededRng` でテストから固定する）
 *
 * ## 採用したルール
 *
 * 仕様書の標準セットに、こいこいの倍率として一般的な2つを入れてある。
 *
 * - **合計7文以上で2倍**
 * - **相手がこいこいを宣言したあとに自分が上がると2倍**（こいこい返し）
 *
 * ローカルルール差の大きい花見酒・月見酒だけを設定で切り替えられる（仕様書）。
 * 賭けの要素は入れない。点数は「文」表記のゲーム内スコアだけ（仕様書の「やらないこと」）。
 */

import { shuffle } from './cards';
import {
  cardOf,
  HANAFUDA_DECK,
  sortHand,
  type HanafudaKind,
} from './hanafuda-cards';

// ---------------------------------------------------------------- 設定

/** CPUの強さ */
export type CpuLevel = 'easy' | 'normal' | 'hard';
export const CPU_LEVELS: readonly CpuLevel[] = ['easy', 'normal', 'hard'];

export const LEVEL_LABELS: Record<CpuLevel, string> = {
  easy: '弱',
  normal: '普通',
  hard: '強',
};

/** 難易度の説明。設定パネルと解説ページの単一の情報源 */
export const LEVEL_NOTES: Record<CpuLevel, string> = {
  easy: '合わせられる札を適当に選び、役ができたら必ずあがります。ルールを覚えるのに向いた相手です',
  normal: '取る札の価値を見て選び、点が低いうちはこいこいをします。互角の相手です',
  hard: '役の組み立てと、相手に渡す札の危なさまで見ます。こいこいの判断も慎重です',
};

/** 遊べる月数（半年戦・一年戦） */
export const ROUND_CHOICES: readonly number[] = [6, 12];

/** 席番号。0が人間・1がCPU */
export const HUMAN = 0;
export const CPU = 1;

/** 配る枚数（標準ルール）。手札8・場8で、山札は24枚 */
export const HAND_SIZE = 8;
export const FIELD_SIZE = 8;

/** 7文以上で2倍になる境目 */
export const DOUBLE_AT = 7;

/** 手四・くっつきの点。上がり役ではなく配った時点で決まる */
export const DEAL_WIN_POINTS = 6;

export interface Options {
  level: CpuLevel;
  /** 月数（6 か 12） */
  rounds: number;
  /**
   * 花見酒・月見酒を役に入れるか。
   * ローカルルール差が大きいので切り替えられるようにしてある（仕様書）。
   */
  sake: boolean;
}

export const DEFAULT_OPTIONS: Options = { level: 'normal', rounds: 6, sake: true };

/** 記録の区分。強さと月数ごとに別の記録として持つ */
export function variantOf(options: Options): string {
  return `cpu-${options.level}-${options.rounds}`;
}

// ---------------------------------------------------------------- 役

export type YakuId =
  | 'gokou'
  | 'shikou'
  | 'ame-shikou'
  | 'sankou'
  | 'inoshikacho'
  | 'akatan'
  | 'aotan'
  | 'hanami'
  | 'tsukimi'
  | 'tane'
  | 'tan'
  | 'kasu';

/**
 * 役の定義。
 *
 * - `cards` を持つ役は「その札をすべて持っていれば成立」
 * - `kind` を持つ役は「その種別を `min` 枚以上で成立」
 * - `exclude` は「その札を含んでいたら成立しない」（四光・三光の雨）
 * - `group` が同じ役は**いちばん高いものだけ**を採る（光の役どうし）
 * - `extra` を持つ役だけが「1枚増えるごとに1文」で伸びる（タネ・タン・カス）
 */
export interface YakuDef {
  id: YakuId;
  name: string;
  /** 読みがな抜きの短い説明。役一覧と成立時の表示に使う */
  note: string;
  points: number;
  cards?: readonly string[];
  exclude?: readonly string[];
  kind?: HanafudaKind;
  min?: number;
  /**
   * `min` を超えた1枚ごとに1文増えるか。**タネ・タン・カスだけが持つ。**
   *
   * この印を付けずに「枚数で決まる役はすべて伸びる」としていたことがある。
   * 四光（`kind: 'hikari'` / `min: 4`）にも同じ計算が当たっていて、
   * 光5枚のときの三光が6文になりえた。実際には `group` の排他と表の並び順が
   * 先に効いて表面化しなかったが、**表の順序を入れ替えただけで黙って点が狂う**。
   * 伸びる役を明示する側に倒し、`tests/hanafuda.test.ts` が
   * 「伸びるのはこの3つだけ」と「光の役は固定点」の両方を見張っている。
   */
  extra?: boolean;
  /** 排他グループ。同じ値の役は最高点の1つだけ成立する */
  group?: string;
  /** 設定で外せる役（花見酒・月見酒） */
  optional?: boolean;
}

/** 柳の光（雨）。四光・三光の判定でだけ特別扱いする */
export const RAIN_HIKARI = '11-1';
/** 菊に盃。花見酒・月見酒の相方 */
export const SAKE_CUP = '9-1';

/**
 * 役の表。**上から順に並べたものが、そのまま画面の役一覧の順**になる。
 * 点数も名前もここだけに書く（2か所に書くと片方だけ直して食い違う）。
 */
export const YAKU_TABLE: readonly YakuDef[] = [
  {
    id: 'gokou',
    name: '五光',
    note: '光5枚すべて',
    points: 10,
    cards: ['1-1', '3-1', '8-1', RAIN_HIKARI, '12-1'],
    group: 'hikari',
  },
  {
    id: 'shikou',
    name: '四光',
    note: '光4枚（柳を含まない）',
    points: 8,
    kind: 'hikari',
    min: 4,
    exclude: [RAIN_HIKARI],
    group: 'hikari',
  },
  {
    id: 'ame-shikou',
    name: '雨四光',
    note: '光4枚（柳を含む）',
    points: 7,
    kind: 'hikari',
    min: 4,
    group: 'hikari',
  },
  {
    id: 'sankou',
    name: '三光',
    note: '光3枚（柳を含まない）',
    points: 5,
    kind: 'hikari',
    min: 3,
    exclude: [RAIN_HIKARI],
    group: 'hikari',
  },
  {
    id: 'inoshikacho',
    name: '猪鹿蝶',
    note: '萩に猪・紅葉に鹿・牡丹に蝶',
    points: 5,
    cards: ['7-1', '10-1', '6-1'],
  },
  {
    id: 'akatan',
    name: '赤短',
    note: '松・梅・桜の赤い短冊',
    points: 5,
    cards: ['1-2', '2-2', '3-2'],
  },
  {
    id: 'aotan',
    name: '青短',
    note: '牡丹・菊・紅葉の青い短冊',
    points: 5,
    cards: ['6-2', '9-2', '10-2'],
  },
  {
    id: 'hanami',
    name: '花見で一杯',
    note: '桜に幕＋菊に盃',
    points: 5,
    cards: ['3-1', SAKE_CUP],
    optional: true,
  },
  {
    id: 'tsukimi',
    name: '月見で一杯',
    note: '芒に月＋菊に盃',
    points: 5,
    cards: ['8-1', SAKE_CUP],
    optional: true,
  },
  {
    id: 'tane',
    name: 'タネ',
    note: 'タネ5枚（以降1枚ごとに＋1文）',
    points: 1,
    kind: 'tane',
    min: 5,
    extra: true,
  },
  {
    id: 'tan',
    name: 'タン',
    note: '短冊5枚（以降1枚ごとに＋1文）',
    points: 1,
    kind: 'tanzaku',
    min: 5,
    extra: true,
  },
  {
    id: 'kasu',
    name: 'カス',
    note: 'カス10枚（以降1枚ごとに＋1文）',
    points: 1,
    kind: 'kasu',
    min: 10,
    extra: true,
  },
];

/** 成立した役 */
export interface Yaku {
  id: YakuId;
  name: string;
  points: number;
}

/** 役の進み具合。「あと何枚か」を画面で見せるために使う */
export interface YakuProgress {
  def: YakuDef;
  /** すでに持っている枚数 */
  have: number;
  /** 成立に必要な枚数 */
  need: number;
  /** 成立しているか */
  done: boolean;
  /** 成立していれば、いまの点数 */
  points: number;
}

function countKind(ids: readonly string[], kind: HanafudaKind): number {
  return ids.reduce((n, id) => (cardOf(id).kind === kind ? n + 1 : n), 0);
}

/**
 * 1つの役の進み具合を測る。
 *
 * 枚数で決まる役は `min` 枚で成立する。**`extra` を持つ役（タネ・タン・カス）だけ**
 * が、そこから1枚増えるごとに1文ずつ伸びる。光の役は枚数で決まるが伸びない
 * （`YakuDef.extra` のコメントを参照。ここを「枚数系はすべて伸びる」にすると、
 * 表の並び順を変えただけで三光が6文になる）。
 * 除外札（`exclude`）を持っていると、枚数が足りていても成立しない。
 */
function progressOf(def: YakuDef, captured: readonly string[]): YakuProgress {
  const owned = new Set(captured);
  if (def.cards) {
    const have = def.cards.filter((id) => owned.has(id)).length;
    const done = have === def.cards.length;
    return { def, have, need: def.cards.length, done, points: done ? def.points : 0 };
  }
  const kind = def.kind as HanafudaKind;
  const min = def.min as number;
  const blocked = (def.exclude ?? []).some((id) => owned.has(id));
  const have = countKind(captured, kind);
  const done = !blocked && have >= min;
  const bonus = def.extra ? have - min : 0;
  return { def, have, need: min, done, points: done ? def.points + bonus : 0 };
}

/**
 * 取り札から、成立している役をすべて出す。
 *
 * 光の役（五光・四光・雨四光・三光）は**いちばん高い1つだけ**を採る。
 * 4枚持っていれば三光も条件を満たすが、両方数えるルールは無い。
 */
export function evaluateYaku(
  captured: readonly string[],
  options: Options = DEFAULT_OPTIONS,
): Yaku[] {
  const out: Yaku[] = [];
  const takenGroups = new Set<string>();
  for (const def of YAKU_TABLE) {
    if (def.optional && !options.sake) continue;
    if (def.group && takenGroups.has(def.group)) continue;
    const p = progressOf(def, captured);
    if (!p.done) continue;
    if (def.group) takenGroups.add(def.group);
    out.push({ id: def.id, name: def.name, points: p.points });
  }
  return out;
}

/** 成立した役の合計（素点） */
export function totalPoints(yaku: readonly Yaku[]): number {
  return yaku.reduce((n, y) => n + y.points, 0);
}

/** 取り札の点数（素点）。`evaluateYaku` と `totalPoints` の近道 */
export function scoreOf(captured: readonly string[], options: Options = DEFAULT_OPTIONS): number {
  return totalPoints(evaluateYaku(captured, options));
}

/**
 * 役の進み具合の一覧。**あと1〜2枚の役を上に**並べる（仕様書の初心者導線）。
 * 成立済みの役が先頭、その次があと1枚の役、という順になる。
 */
export function yakuProgress(
  captured: readonly string[],
  options: Options = DEFAULT_OPTIONS,
): YakuProgress[] {
  const list = YAKU_TABLE.filter((def) => !(def.optional && !options.sake)).map((def) =>
    progressOf(def, captured),
  );
  return list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? -1 : 1;
    const ra = a.need - a.have;
    const rb = b.need - b.have;
    if (ra !== rb) return ra - rb;
    return b.def.points - a.def.points;
  });
}

/**
 * 上がりの点数を出す。
 *
 * - 素点が `DOUBLE_AT`（7文）以上なら2倍
 * - 相手がこいこいを宣言していたら2倍（こいこい返し）
 *
 * 両方に当てはまれば4倍になる。
 */
export function multiplierFor(base: number, opponentKoikoi: number): number {
  return (base >= DOUBLE_AT ? 2 : 1) * (opponentKoikoi > 0 ? 2 : 1);
}

// ---------------------------------------------------------------- 局面

export type Phase =
  /** 手番の人が手札から1枚出す */
  | 'play'
  /** 出した手札が場の2枚と合った。どちらを取るか選ぶ */
  | 'choose'
  /** 山札を1枚めくる */
  | 'draw'
  /**
   * めくった札を見せている（まだ場にも取り札にも移していない）。
   *
   * めくると同時に場へ流していた頃は、**同じ札が「めくった札」の枠と場の
   * 両方に出て**「まだ手元にあるのか、もう場に行ったのか」が読めなかった。
   * 見せる一拍を局面として持ち、移した瞬間に枠から消す。
   */
  | 'drawn'
  /** めくった札が場の2枚と合った */
  | 'draw-choose'
  /** 役ができた。あがるか こいこい か */
  | 'koikoi'
  /** その月の決着 */
  | 'round-over'
  /** 全月終了 */
  | 'game-over';

/** 選択待ちの札 */
export interface Pending {
  card: string;
  source: 'hand' | 'deck';
  /** 場にある同じ月の札（2枚のときだけ選ばせる） */
  matches: string[];
}

/** 決着のしかた */
export type RoundReason = 'agari' | 'teshi' | 'kuttsuki' | 'nagare';

export interface RoundResult {
  /** 勝った人。流局なら null */
  winner: number | null;
  reason: RoundReason;
  /** 役の素点 */
  base: number;
  /** 倍率 */
  multiplier: number;
  /** 実際に動いた文 */
  points: number;
  yaku: Yaku[];
}

export interface KoikoiState {
  options: Options;
  /** 何月戦か（1始まり） */
  round: number;
  /** 親。最初は乱数で決め、以降は前の月に勝った人が続ける */
  dealer: number;
  turn: number;
  /** 山札。末尾が次にめくる札 */
  deck: string[];
  hands: string[][];
  field: string[];
  captured: string[][];
  phase: Phase;
  pending: Pending | null;
  /** 直前にめくった山札の札（画面で見せるためだけに持つ） */
  lastDrawn: string | null;
  /** こいこいを宣言した時点の役の点数。これを超えないと再度あがれない */
  declared: number[];
  /** こいこいの回数 */
  koikoi: number[];
  /** 通算の文 */
  scores: number[];
  result: RoundResult | null;
}

/** 場の札のうち、その札と同じ月のもの */
export function matchesOf(field: readonly string[], cardId: string): string[] {
  const month = cardOf(cardId).month;
  return field.filter((id) => cardOf(id).month === month);
}

/** 同じ月が4枚あるか（配り直しの判定に使う） */
function hasFourOfAMonth(ids: readonly string[]): boolean {
  return maxMonthCount(ids) >= 4;
}

function monthCounts(ids: readonly string[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const id of ids) {
    const m = cardOf(id).month;
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return counts;
}

function maxMonthCount(ids: readonly string[]): number {
  let max = 0;
  for (const n of monthCounts(ids).values()) max = Math.max(max, n);
  return max;
}

/**
 * 配った手札そのもので決まる役。無ければ null。
 *
 * - **手四** … 同じ月が4枚そろっている
 * - **くっつき** … 同じ月2枚の組が4つ（＝手札が4種類の月だけでできている）
 *
 * どちらも6文で、その月はそこで終わる。手札8枚が前提の判定なので、
 * 枚数の違う手札に対しては使わない。
 */
export function handSpecial(hand: readonly string[]): 'teshi' | 'kuttsuki' | null {
  if (hand.length !== HAND_SIZE) return null;
  if (hasFourOfAMonth(hand)) return 'teshi';
  const counts = [...monthCounts(hand).values()];
  if (counts.length === 4 && counts.every((n) => n === 2)) return 'kuttsuki';
  return null;
}

/** 配った時点で決まる勝ち（手四・くっつき）。無ければ null */
function dealWin(
  hands: readonly string[][],
  dealer: number,
): { player: number; reason: RoundReason } | null {
  // 両者に同時に出たら親を優先する（同点の裁定を局面の側で決めておく）
  for (const player of [dealer, 1 - dealer]) {
    const special = handSpecial(hands[player]);
    if (special) return { player, reason: special };
  }
  return null;
}

/** 配り直しの上限。無限ループにしないための保険（実際は1〜2回で抜ける） */
const MAX_DEALS = 50;

/**
 * 1ヶ月ぶんを配る。
 *
 * 手札8枚ずつ・場8枚・山札24枚。**場に同じ月が4枚出たら配り直す**
 * （その月を最初に出した人が総取りになり、運の要素が大きくなりすぎるため）。
 * 手四・くっつきは配った時点で6文の勝ちにして、その月を終える。
 */
export function dealRound(
  state: Pick<KoikoiState, 'options' | 'round' | 'dealer' | 'scores'>,
  rng: () => number = Math.random,
): KoikoiState {
  let ids: string[] = [];
  for (let attempt = 0; attempt < MAX_DEALS; attempt += 1) {
    ids = shuffle(
      HANAFUDA_DECK.map((c) => c.id),
      rng,
    );
    if (!hasFourOfAMonth(ids.slice(HAND_SIZE * 2, HAND_SIZE * 2 + FIELD_SIZE))) break;
  }

  const hands = [
    sortHand(ids.slice(0, HAND_SIZE)),
    sortHand(ids.slice(HAND_SIZE, HAND_SIZE * 2)),
  ];
  const field = ids.slice(HAND_SIZE * 2, HAND_SIZE * 2 + FIELD_SIZE);
  const deck = ids.slice(HAND_SIZE * 2 + FIELD_SIZE);

  const base: KoikoiState = {
    options: state.options,
    round: state.round,
    dealer: state.dealer,
    turn: state.dealer,
    deck,
    hands,
    field,
    captured: [[], []],
    phase: 'play',
    pending: null,
    lastDrawn: null,
    declared: [0, 0],
    koikoi: [0, 0],
    scores: [...state.scores],
    result: null,
  };

  const win = dealWin(hands, state.dealer);
  if (!win) return base;

  const scores = [...base.scores];
  scores[win.player] += DEAL_WIN_POINTS;
  return {
    ...base,
    phase: 'round-over',
    scores,
    result: {
      winner: win.player,
      reason: win.reason,
      base: DEAL_WIN_POINTS,
      multiplier: 1,
      points: DEAL_WIN_POINTS,
      yaku: [],
    },
  };
}

/**
 * 新しいゲーム（1回戦目から）。
 *
 * 最初の親は `firstDealer` で指定できる（画面の「親（先攻）」設定）。
 * 省略か null なら乱数で決める。本来は札を引いて決めるが、それだけのために
 * 1画面を挟むと、遊び始めるまでが遠くなる。
 */
export function newGame(
  options: Options = DEFAULT_OPTIONS,
  rng: () => number = Math.random,
  firstDealer: number | null = null,
): KoikoiState {
  const dealer = firstDealer ?? (rng() < 0.5 ? HUMAN : CPU);
  return dealRound({ options, round: 1, dealer, scores: [0, 0] }, rng);
}

/**
 * 次の月へ進む。**勝った人が親を続ける**（流局なら親も続投）。
 * 決められた月数を終えたら `game-over`。
 */
export function nextRound(state: KoikoiState, rng: () => number = Math.random): KoikoiState {
  if (state.phase !== 'round-over') return state;
  if (state.round >= state.options.rounds) return { ...state, phase: 'game-over' };
  const dealer = state.result?.winner ?? state.dealer;
  return dealRound(
    { options: state.options, round: state.round + 1, dealer, scores: state.scores },
    rng,
  );
}

/** 人間から見た通算の勝敗。ゲームが終わっていなければ null */
export function outcome(state: KoikoiState): 'win' | 'loss' | 'draw' | null {
  if (state.phase !== 'game-over') return null;
  const [mine, theirs] = state.scores;
  if (mine === theirs) return 'draw';
  return mine > theirs ? 'win' : 'loss';
}

// ---------------------------------------------------------------- 手を進める

/** 出した（めくった）札と、取る札を取り札に移す。取らないなら場に置く */
function resolve(state: KoikoiState, card: string, taken: readonly string[] | null): KoikoiState {
  if (!taken || taken.length === 0) {
    return { ...state, field: [...state.field, card], pending: null };
  }
  const takenSet = new Set(taken);
  return {
    ...state,
    field: state.field.filter((id) => !takenSet.has(id)),
    captured: state.captured.map((own, i) =>
      i === state.turn ? [...own, card, ...taken] : own,
    ),
    pending: null,
  };
}

/**
 * 出した札を場と合わせる。
 *
 * - 合う札が0枚 … 場に置く
 * - 1枚 … その2枚を取る
 * - 2枚 … どちらを取るか選ぶ（`choose` / `draw-choose`）
 * - 3枚 … 同じ月が場に3枚そろっているので4枚まとめて取る
 */
function place(state: KoikoiState, card: string, source: 'hand' | 'deck'): KoikoiState {
  const matches = matchesOf(state.field, card);
  if (matches.length === 2) {
    return {
      ...state,
      phase: source === 'hand' ? 'choose' : 'draw-choose',
      pending: { card, source, matches },
    };
  }
  const next = resolve(state, card, matches.length === 0 ? null : matches);
  return source === 'hand' ? { ...next, phase: 'draw' } : endTurn(next);
}

/** 手札から1枚出す */
export function playFromHand(state: KoikoiState, cardId: string): KoikoiState {
  if (state.phase !== 'play') return state;
  if (!state.hands[state.turn].includes(cardId)) return state;
  const hands = state.hands.map((hand, i) =>
    i === state.turn ? hand.filter((id) => id !== cardId) : hand,
  );
  return place({ ...state, hands, lastDrawn: null }, cardId, 'hand');
}

/** 2枚と合ったときに、取る札を選ぶ */
export function applyChoice(state: KoikoiState, fieldCardId: string): KoikoiState {
  if (state.phase !== 'choose' && state.phase !== 'draw-choose') return state;
  const pending = state.pending;
  if (!pending || !pending.matches.includes(fieldCardId)) return state;
  const next = resolve(state, pending.card, [fieldCardId]);
  return pending.source === 'hand' ? { ...next, phase: 'draw' } : endTurn(next);
}

/**
 * 山札を1枚めくる。**めくるだけで、まだ場にも取り札にも移さない**（`drawn`）。
 * 移すのは次の `settleDrawn`。分けているのは、めくった札を一拍見せるため。
 *
 * 標準の配りでは山札24枚に対してめくるのは16回なので尽きないが、
 * 尽きていたら黙って手番を終える（局面だけで進めなくならないようにする）。
 */
export function applyDraw(state: KoikoiState): KoikoiState {
  if (state.phase !== 'draw') return state;
  if (state.deck.length === 0) return endTurn({ ...state, lastDrawn: null });
  const card = state.deck[state.deck.length - 1];
  return { ...state, deck: state.deck.slice(0, -1), lastDrawn: card, phase: 'drawn' };
}

/**
 * めくって見せた札を、場に置くか取り札に移す。
 *
 * `lastDrawn` は消さない。移したあと、場に流れた札を光らせる目印として使う
 * （`Game.tsx` の `fresh`）。**「めくった札」の枠に出すかどうかは
 * `phase === 'drawn'` で決めること。** `lastDrawn` の有無で決めると、
 * 移したあとも枠に残って同じ札が2か所に出る。
 */
export function settleDrawn(state: KoikoiState): KoikoiState {
  if (state.phase !== 'drawn' || !state.lastDrawn) return state;
  return place(state, state.lastDrawn, 'deck');
}

/** その人がいま持っている役 */
export function yakuOf(state: KoikoiState, player: number): Yaku[] {
  return evaluateYaku(state.captured[player], state.options);
}

/**
 * 手番の終わり。
 *
 * 役が**宣言済みの点数を超えて**できていたら、あがるか こいこい かを選ばせる。
 * 超えていなければ手番を渡し、双方の手札が尽きていたら流局にする。
 */
function endTurn(state: KoikoiState): KoikoiState {
  const total = scoreOf(state.captured[state.turn], state.options);
  if (total > state.declared[state.turn]) return { ...state, phase: 'koikoi' };
  return passTurn(state);
}

/** 手番を渡す。双方の手札が尽きていたら流局 */
function passTurn(state: KoikoiState): KoikoiState {
  if (state.hands.every((hand) => hand.length === 0)) {
    return {
      ...state,
      phase: 'round-over',
      pending: null,
      result: { winner: null, reason: 'nagare', base: 0, multiplier: 1, points: 0, yaku: [] },
    };
  }
  return { ...state, phase: 'play', turn: 1 - state.turn, pending: null };
}

/**
 * あがる。役の点数に倍率をかけて動かし、その月を終える。
 *
 * 点は**勝った人に加算するだけ**にしてある（相手からは引かない）。
 * 賭けの要素を持たせない方針（仕様書の「やらないこと」）に合わせ、
 * 通算は「稼いだ文の合計」として読めるようにする。
 */
export function declareStop(state: KoikoiState): KoikoiState {
  if (state.phase !== 'koikoi') return state;
  const player = state.turn;
  const yaku = yakuOf(state, player);
  const base = totalPoints(yaku);
  const multiplier = multiplierFor(base, state.koikoi[1 - player]);
  const points = base * multiplier;
  const scores = state.scores.map((n, i) => (i === player ? n + points : n));
  return {
    ...state,
    phase: 'round-over',
    pending: null,
    scores,
    result: { winner: player, reason: 'agari', base, multiplier, points, yaku },
  };
}

/**
 * こいこいを宣言する。いまの点数を「宣言済み」として覚え、手番を渡す。
 *
 * 次にあがれるのは**この点数を超える役ができたとき**だけ。
 * 宣言したあとに相手が上がると、相手の点が2倍になる（こいこい返し）。
 */
export function declareKoikoi(state: KoikoiState): KoikoiState {
  if (state.phase !== 'koikoi') return state;
  const player = state.turn;
  const total = scoreOf(state.captured[player], state.options);
  return passTurn({
    ...state,
    declared: state.declared.map((n, i) => (i === player ? total : n)),
    koikoi: state.koikoi.map((n, i) => (i === player ? n + 1 : n)),
  });
}

// ---------------------------------------------------------------- CPU

/**
 * 札1枚のうまみ。CPUの手の選択に使う簡易ヒューリスティック。
 *
 * 種別の基礎点に、**すでに集めている役へ効くぶん**を足す。
 * 読みではなく期待値の当てずっぽうなので、最強でも思考時間はゼロに近い
 * （仕様書の「最強でも思考時間を感じさせない軽さを保つ」）。
 */
export function cardValue(
  id: string,
  captured: readonly string[],
  options: Options = DEFAULT_OPTIONS,
): number {
  const card = cardOf(id);
  const owned = new Set(captured);
  let value = { hikari: 12, tane: 5, tanzaku: 5, kasu: 1 }[card.kind];

  for (const def of YAKU_TABLE) {
    if (def.optional && !options.sake) continue;
    if (def.cards) {
      if (!def.cards.includes(id)) continue;
      const have = def.cards.filter((c) => owned.has(c)).length;
      // あと1枚で成立する役の最後の1枚がいちばん重い
      const remaining = def.cards.length - have;
      if (remaining <= 0) continue;
      value += def.points * (remaining === 1 ? 1.6 : 0.5);
      continue;
    }
    if (def.kind !== card.kind) continue;
    const have = countKind(captured, def.kind);
    const min = def.min as number;
    if (have >= min) value += 1;
    else if (min - have <= 2) value += 2;
  }
  return value;
}

/** 取り札に加わる札の合計のうまみ */
function gainOf(ids: readonly string[], captured: readonly string[], options: Options): number {
  let sum = 0;
  const acc = [...captured];
  for (const id of ids) {
    sum += cardValue(id, acc, options);
    acc.push(id);
  }
  return sum;
}

/** CPUが選べる手（手札の札と、取る札） */
export interface CpuMove {
  card: string;
  /** 場の2枚と合うときだけ、どちらを取るかまで決める */
  match?: string;
}

/**
 * 場に置いたときの危なさ。**相手に拾われる札ほど高い**。
 *
 * 同じ月の札が場や自分の取り札に出そろっているほど、相手が合わせられる
 * 見込みは下がる。強レベルだけがこれを見る。
 */
function riskOf(state: KoikoiState, id: string): number {
  const month = cardOf(id).month;
  const seen = [
    ...state.field,
    ...state.captured[0],
    ...state.captured[1],
    ...state.hands[state.turn],
  ].filter((c) => cardOf(c).month === month).length;
  // 同月の4枚のうち、まだ見えていない枚数がそのまま拾われる目
  const unseen = Math.max(0, 4 - seen);
  return cardValue(id, state.captured[1 - state.turn], state.options) * unseen;
}

/**
 * CPUが出す手を選ぶ。
 *
 * - 弱 … 合わせられる札があれば適当に1枚、無ければ適当に捨てる
 * - 普通 … 取れる札のうまみがいちばん大きい手を選ぶ
 * - 強 … うまみに加えて、場に置く札の危なさ（相手に拾われる見込み）も引く
 */
export function chooseCpuPlay(state: KoikoiState, rng: () => number = Math.random): CpuMove | null {
  if (state.phase !== 'play') return null;
  const hand = state.hands[state.turn];
  if (hand.length === 0) return null;
  const { level } = state.options;

  const moves: { move: CpuMove; score: number }[] = [];
  for (const card of hand) {
    const matches = matchesOf(state.field, card);
    if (matches.length === 0) {
      const penalty = level === 'hard' ? riskOf(state, card) : 0;
      // 捨てる手は「手放す価値」がそのまま損。取れる手より必ず下に来るよう負にする
      moves.push({
        move: { card },
        score: -cardValue(card, state.captured[state.turn], state.options) - penalty,
      });
      continue;
    }
    if (matches.length === 2) {
      for (const match of matches) {
        moves.push({
          move: { card, match },
          score: gainOf([card, match], state.captured[state.turn], state.options),
        });
      }
      continue;
    }
    // 1枚合い、または場に3枚そろっていて4枚まとめて取る
    moves.push({
      move: { card },
      score: gainOf([card, ...matches], state.captured[state.turn], state.options),
    });
  }

  if (level === 'easy') {
    // 取れる手があればその中から、無ければ手札から適当に選ぶ
    const takes = moves.filter((m) => m.score > 0);
    const pool = takes.length > 0 ? takes : moves;
    return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].move;
  }

  let best = moves[0];
  for (const m of moves) if (m.score > best.score) best = m;
  return best.move;
}

/**
 * 山札をめくって2枚と合ったときに、CPUが取る札。
 * 弱は適当、それ以外はうまみの大きいほうを取る。
 */
export function chooseCpuMatch(state: KoikoiState, rng: () => number = Math.random): string | null {
  if (state.phase !== 'draw-choose' && state.phase !== 'choose') return null;
  const matches = state.pending?.matches ?? [];
  if (matches.length === 0) return null;
  if (state.options.level === 'easy') {
    return matches[Math.min(matches.length - 1, Math.floor(rng() * matches.length))];
  }
  let best = matches[0];
  let bestScore = -Infinity;
  for (const id of matches) {
    const score = cardValue(id, state.captured[state.turn], state.options);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/**
 * CPUが こいこい するかどうか。
 *
 * - 弱 … 必ずあがる（ルールを覚えるための相手）
 * - 普通 … 点が低く、手札がまだ残っているうちは続ける
 * - 強 … さらに、相手の取り札が育っていたら降りる
 */
export function cpuKoikoi(state: KoikoiState): boolean {
  if (state.phase !== 'koikoi') return false;
  const me = state.turn;
  const level = state.options.level;
  if (level === 'easy') return false;

  const total = scoreOf(state.captured[me], state.options);
  const left = state.hands[me].length;
  if (left === 0) return false;

  if (level === 'normal') return total < 5 && left >= 3;

  // 強。相手に役ができかけていたら、7文で倍になるのを待たずに降りる
  const rivalClose = yakuProgress(state.captured[1 - me], state.options).some(
    (p) => !p.done && p.need - p.have <= 1,
  );
  if (rivalClose) return total < 3 && left >= 4;
  return total < DOUBLE_AT && left >= 2;
}
