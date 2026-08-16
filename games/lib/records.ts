/**
 * ゲームの記録（ベスト・勝敗・クリアタイム）を1か所で扱うモジュール
 *
 * 仕様: docs/features/game-records.md
 *
 * ## 方針
 *
 * - **キーはゲームごとに1本**（`hasokon-games:records:<gameId>:v1`）。
 *   値はJSONで、難易度・レベルなどの「区分（variant）」ごとに記録を持つ。
 *   区分を使わないゲームは `DEFAULT_VARIANT`（空文字）に入れる
 * - **落ちないこと。** SSR・プライベートブラウズ・容量超過など `localStorage` が
 *   使えない場面は普通にあるので、読み書きはすべて try/catch で包み、
 *   読めなければ「記録なし」として静かに動く（エラー表示はしない）
 * - **純関数とストレージ層を分ける。** 集計の判断（ベスト更新かどうか等）は
 *   すべて純関数側に置き、`tests/records.test.ts` から検証できるようにする
 *
 * ## 「プレイ数」の数え方
 *
 * `plays` は**実際に1手でも動かしたゲームの数**を数える（開いただけでは増えない）。
 * 勝敗が必ず決まるゲーム（マインスイーパー・リバーシ）は `wins` / `losses` /
 * `draws` も持ち、勝率はそこから出す。ソリティア系は途中でやめるのが普通なので、
 * 勝率ではなく「プレイ数とクリア数」を並べて出す。
 */

/** 保存形式のバージョン。壊す変更をするときだけ上げる（旧キーは移行して捨てる） */
export const RECORDS_VERSION = 1;

/** 区分を持たないゲーム（ソリティア・2048 など）が使う既定の区分 */
export const DEFAULT_VARIANT = '';

/** 1区分ぶんの記録。ゲームが使う項目だけを持つ（未使用の項目は持たない） */
export interface RecordEntry {
  /** 1手でも動かしたゲームの数 */
  plays?: number;
  /** 勝った（クリアした）数 */
  wins?: number;
  /** 負けた数（負けが明示されるゲームだけ） */
  losses?: number;
  /** 引き分けた数（リバーシだけ） */
  draws?: number;
  /** クリアタイムのベスト（ミリ秒。小さいほうが良い） */
  bestTimeMs?: number;
  /** スコアのベスト（大きいほうが良い） */
  bestScore?: number;
  /** 最少手数（小さいほうが良い） */
  bestMoves?: number;
  /**
   * 解き終えた問題のID。
   * ノノグラムが「一度解いた絵を出し直さない」ために使う
   * （出題の制御に使う値だが、実質「解いた問題の記録」なので同じキーに同居させる）
   */
  clearedIds?: string[];
}

/** ゲーム1本ぶんの記録。キーは区分（難易度・レベル）、区分なしは `DEFAULT_VARIANT` */
export type GameRecords = Record<string, RecordEntry>;

/** 1ゲームの結果。渡された項目だけが記録に反映される */
export interface PlayResult {
  /** 勝ち・負け・引き分け。省略すると勝敗は数えない */
  outcome?: 'win' | 'loss' | 'draw';
  /** かかった時間（ミリ秒）。勝ったときだけ渡す */
  timeMs?: number;
  /** スコア */
  score?: number;
  /** 手数。勝ったときだけ渡す */
  moves?: number;
}

/** どのベストが更新されたか（クリア画面で「ベスト更新！」を出すのに使う） */
export interface Improved {
  time: boolean;
  score: boolean;
  moves: boolean;
}

/** `localStorage` のうち、このモジュールが使う部分だけ。テストでは差し替える */
export interface RecordStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** ゲームIDから保存キーを作る */
export function storageKey(gameId: string): string {
  return `hasokon-games:records:${gameId}:v${RECORDS_VERSION}`;
}

/**
 * ブラウザの `localStorage`。使えなければ null。
 *
 * SSR（`window` が無い）だけでなく、Safari のプライベートブラウズや
 * サイトデータをブロックする設定では、**参照しただけで例外が飛ぶ**。
 */
export function browserStorage(): RecordStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 0以上の整数として読めるなら返す。それ以外（負数・NaN・文字列）は undefined */
function count(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

/** 正の数として読めるなら返す（タイム・スコアなど、0や負数は記録として無意味） */
function positive(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value);
}

/** undefined の項目を落とす（JSONに `null` や余計なキーを残さないため） */
function compact(entry: RecordEntry): RecordEntry {
  const out: RecordEntry = {};
  for (const [k, v] of Object.entries(entry)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/**
 * 読み込んだ値を記録として使える形にそろえる。
 * 知らない項目・壊れた値は黙って捨てる（他のブラウザ拡張や旧版が書いた値の混入対策）。
 */
export function sanitizeEntry(value: unknown): RecordEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  const ids = Array.isArray(v.clearedIds)
    ? v.clearedIds.filter((id): id is string => typeof id === 'string')
    : undefined;
  return compact({
    plays: count(v.plays),
    wins: count(v.wins),
    losses: count(v.losses),
    draws: count(v.draws),
    bestTimeMs: positive(v.bestTimeMs),
    bestScore: positive(v.bestScore),
    bestMoves: positive(v.bestMoves),
    clearedIds: ids && ids.length > 0 ? ids : undefined,
  });
}

/**
 * 保存された文字列を記録に戻す。
 * JSONとして壊れていても、中身が期待と違っても、例外を投げず空の記録を返す。
 */
export function parseRecords(raw: string | null): GameRecords {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const out: GameRecords = {};
  for (const [variant, value] of Object.entries(parsed as Record<string, unknown>)) {
    const entry = sanitizeEntry(value);
    if (Object.keys(entry).length > 0) out[variant] = entry;
  }
  return out;
}

/** 記録を保存用の文字列にする */
export function serializeRecords(records: GameRecords): string {
  return JSON.stringify(records);
}

/** 区分の記録を取り出す（無ければ空の記録） */
export function entryOf(records: GameRecords, variant: string = DEFAULT_VARIANT): RecordEntry {
  return records[variant] ?? {};
}

/** 2つの記録を「良いほうを残して」まとめる（旧キーの移行と、同時更新の取りこぼし対策） */
export function mergeEntry(base: RecordEntry, extra: RecordEntry): RecordEntry {
  const best = (
    a: number | undefined,
    b: number | undefined,
    pick: (x: number, y: number) => number,
  ) => (a === undefined ? b : b === undefined ? a : pick(a, b));
  const ids =
    base.clearedIds || extra.clearedIds
      ? [...new Set([...(base.clearedIds ?? []), ...(extra.clearedIds ?? [])])]
      : undefined;
  return compact({
    plays: best(base.plays, extra.plays, Math.max),
    wins: best(base.wins, extra.wins, Math.max),
    losses: best(base.losses, extra.losses, Math.max),
    draws: best(base.draws, extra.draws, Math.max),
    bestTimeMs: best(base.bestTimeMs, extra.bestTimeMs, Math.min),
    bestScore: best(base.bestScore, extra.bestScore, Math.max),
    bestMoves: best(base.bestMoves, extra.bestMoves, Math.min),
    clearedIds: ids,
  });
}

/** ゲームを始めた（1手目を指した）ことを記録に反映する */
export function applyStart(entry: RecordEntry): RecordEntry {
  return compact({ ...entry, plays: (entry.plays ?? 0) + 1 });
}

/**
 * 1ゲームの結果を記録に反映する。
 * 返り値の `improved` は、そのゲームでベストが更新されたかどうか
 * （はじめての記録も「更新」として扱う。クリア画面で祝うため）。
 */
export function applyResult(
  entry: RecordEntry,
  result: PlayResult,
): { entry: RecordEntry; improved: Improved } {
  const timeMs = positive(result.timeMs);
  const score = positive(result.score);
  const moves = positive(result.moves);
  const improved: Improved = {
    time: timeMs !== undefined && (entry.bestTimeMs === undefined || timeMs < entry.bestTimeMs),
    score: score !== undefined && (entry.bestScore === undefined || score > entry.bestScore),
    moves: moves !== undefined && (entry.bestMoves === undefined || moves < entry.bestMoves),
  };
  return {
    entry: compact({
      ...entry,
      wins: result.outcome === 'win' ? (entry.wins ?? 0) + 1 : entry.wins,
      losses: result.outcome === 'loss' ? (entry.losses ?? 0) + 1 : entry.losses,
      draws: result.outcome === 'draw' ? (entry.draws ?? 0) + 1 : entry.draws,
      bestTimeMs: improved.time ? timeMs : entry.bestTimeMs,
      bestScore: improved.score ? score : entry.bestScore,
      bestMoves: improved.moves ? moves : entry.bestMoves,
    }),
    improved,
  };
}

/**
 * 旧キー（各ゲームが個別に持っていた記録）の移行表。
 *
 * 読めたら新形式へ移し、旧キーは消す。保存に失敗したときは消さない
 * （読み取り専用のストレージで記録を失わないため）。
 *
 * リバーシの `reversi:level` / `reversi:color`、五目並べの `gomoku:level` /
 * `gomoku:first` はここに入れない。あれは「強さ・手番の設定」で、
 * 遊んだ記録ではないため各ゲーム側に残す。
 */
const LEGACY_KEYS: Record<string, { key: string; read: (raw: string) => RecordEntry }[]> = {
  '2048': [{ key: 'g2048:best', read: (raw) => compact({ bestScore: positive(Number(raw)) }) }],
  freecell: [
    // 旧形式は「秒」で持っていた
    { key: 'freecell:best', read: (raw) => compact({ bestTimeMs: positive(Number(raw) * 1000) }) },
  ],
  nonogram: [
    {
      key: 'nonogram:solved',
      read: (raw) => sanitizeEntry({ clearedIds: JSON.parse(raw) as unknown }),
    },
  ],
};

/**
 * 旧キーがあれば新形式に取り込む。取り込めた旧キーは消す。
 * 旧キーが無ければ何もしない（＝2回目以降は素通りする）。
 */
function migrateLegacy(gameId: string, records: GameRecords, storage: RecordStorage): GameRecords {
  const rules = LEGACY_KEYS[gameId];
  if (!rules) return records;

  let next = records;
  const done: string[] = [];
  for (const rule of rules) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(rule.key);
    } catch {
      continue;
    }
    if (raw === null) continue;
    let entry: RecordEntry = {};
    try {
      entry = rule.read(raw);
    } catch {
      // 壊れた旧データ。取り込めるものが無いだけなので、キーは消して先へ進む
      entry = {};
    }
    if (Object.keys(entry).length > 0) {
      next = {
        ...next,
        [DEFAULT_VARIANT]: mergeEntry(entryOf(next, DEFAULT_VARIANT), entry),
      };
    }
    done.push(rule.key);
  }
  if (done.length === 0) return records;
  // 保存できたときだけ旧キーを消す（消してから保存に失敗すると記録が消えてしまう）
  if (!saveRecords(gameId, next, storage)) return next;
  for (const key of done) {
    try {
      storage.removeItem(key);
    } catch {
      // 消せなくても実害はない（次回また同じ値を取り込むだけ）
    }
  }
  return next;
}

/** 記録を読む。読めない・壊れている・ストレージが無いときは空の記録 */
export function loadRecords(
  gameId: string,
  storage: RecordStorage | null = browserStorage(),
): GameRecords {
  if (!storage) return {};
  let raw: string | null = null;
  try {
    raw = storage.getItem(storageKey(gameId));
  } catch {
    return {};
  }
  return migrateLegacy(gameId, parseRecords(raw), storage);
}

/** 記録を保存する。保存できたら true（容量超過・保存禁止でも落ちない） */
export function saveRecords(
  gameId: string,
  records: GameRecords,
  storage: RecordStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(storageKey(gameId), serializeRecords(records));
    return true;
  } catch {
    return false;
  }
}

/**
 * 区分の記録を書き換えて保存する。
 * 保存に失敗しても更新後の記録を返す（保存できないブラウザでも、
 * そのセッションのあいだは画面上の記録が正しく動く）。
 */
export function updateEntry(
  gameId: string,
  variant: string,
  update: (entry: RecordEntry) => RecordEntry,
  storage: RecordStorage | null = browserStorage(),
): GameRecords {
  const records = loadRecords(gameId, storage);
  const next: GameRecords = { ...records, [variant]: update(entryOf(records, variant)) };
  saveRecords(gameId, next, storage);
  return next;
}

/** ゲームを始めた（1手目を指した）ことを記録する */
export function recordStart(
  gameId: string,
  variant: string = DEFAULT_VARIANT,
  storage: RecordStorage | null = browserStorage(),
): GameRecords {
  return updateEntry(gameId, variant, applyStart, storage);
}

/** 1ゲームの結果を記録する。ベスト更新かどうかも返す */
export function recordResult(
  gameId: string,
  result: PlayResult,
  variant: string = DEFAULT_VARIANT,
  storage: RecordStorage | null = browserStorage(),
): { records: GameRecords; entry: RecordEntry; improved: Improved } {
  const records = loadRecords(gameId, storage);
  const { entry, improved } = applyResult(entryOf(records, variant), result);
  const next: GameRecords = { ...records, [variant]: entry };
  saveRecords(gameId, next, storage);
  return { records: next, entry, improved };
}

/** タイムの表示（`2:41`）。1時間を超えたら `1:02:03` */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/**
 * 記録の保存先についての注記。
 *
 * 「急に消えた」と感じさせないため、**消える前に知らせておく**（仕様の対策1）。
 * Safari（iPhone / iPad / Mac）は ITP により、7日間そのサイトを訪れないと
 * スクリプトが書いた localStorage を削除する。`navigator.storage.persist()` は
 * これには効かないので、注記で先に伝えるのが唯一の手立てになる。
 */
export const RECORDS_NOTE =
  '記録はこの端末のブラウザに保存されます。ブラウザのデータ削除や、' +
  'iPhone / Mac の Safari では7日間訪問がない場合に消えることがあります。';

/**
 * 勝率（%）。勝ちと負けが決まった対局だけで計算する。
 * まだ1局も決着していなければ null（「勝率0%」と出さないため）。
 */
export function winRate(entry: RecordEntry): number | null {
  const decided = (entry.wins ?? 0) + (entry.losses ?? 0) + (entry.draws ?? 0);
  if (decided === 0) return null;
  return Math.round(((entry.wins ?? 0) / decided) * 100);
}
