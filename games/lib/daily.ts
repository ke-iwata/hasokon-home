/**
 * 日替わり（今日の1問）の共通基盤
 *
 * 仕様: docs/features/game-hoshioki-puzzle.md の「日替わり基盤の持ち主を決める」
 *
 * ## ここにあるもの
 *
 * - **日付をシードにした決定論的な乱数**（`mulberry32`）。サーバーを持たない
 *   静的サイトで「全員が同じ問題」を作るための唯一の手立て
 * - **「今日」の決め方**（`localDateKey`）と、**連続日数の数え方**（`nextStreak`）
 *
 * ## 「今日」は端末のローカル日付で決める
 *
 * `toISOString()`（UTC）を経由すると、日本時間の 0〜9時に**前日の問題**が出る。
 * 盤面のシードと連続日数の判定が別の日付の取り方をしていると、
 * 日付をまたぐ時間帯に「今日の1問を解いたのに連続が切れる」が起きるので、
 * **どちらもこのモジュールの `localDateKey` を通す**。
 *
 * ## 記録の置き場所
 *
 * 連続日数そのものは `lib/records.ts` の `RecordEntry`（`lastClearedOn` /
 * `streak`）が持つ。ここは「数え方」だけを持ち、保存には触らない。
 */

/** 日付キー（`YYYY-MM-DD`）。端末のローカル日付で作る */
export type DateKey = string;

/** `YYYY-MM-DD` として読める形かどうか（日付として妥当かまでは見る） */
export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

function daysInMonth(year: number, month: number): number {
  // 月末は Date に数えさせる（うるう年をここで判定しない）
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 「今日」の日付キー。**端末のローカル日付**をそのまま使う。
 *
 * `Date#getFullYear` などのローカル系のメソッドだけを使うこと
 * （`toISOString()` はUTCに直してしまうので使わない）。
 */
export function localDateKey(date: Date = new Date()): DateKey {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 日付キーの前日。連続日数の判定に使う */
export function previousDateKey(key: DateKey): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  // UTCで足し引きする（ローカルだと夏時間のある地域で1日ずれることがある）
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(
    prev.getUTCDate(),
  ).padStart(2, '0')}`;
}

/**
 * 日付キーからシードを作る。
 *
 * `YYYYMMDD` の数（20260918）をそのまま混ぜる。`version` は生成手順の版で、
 * **生成の手順を変えたら上げる**（上げないと、過去の「今日の1問」が
 * 黙って別の盤面になる）。
 *
 * 掛け算で散らしているのは、日付が1日進んだだけの種から
 * よく似た盤面が出ないようにするため。
 */
export function dailySeed(key: DateKey, version: number): number {
  const digits = Number(key.replace(/-/g, ''));
  return (Math.imul(digits, 0x9e3779b1) ^ Math.imul(version + 1, 0x85ebca6b)) | 0;
}

/**
 * mulberry32。同じ種から同じ数列が出る（`Math.random()` は使わない）。
 *
 * 返すのは `[0, 1)` を返す関数。生成器にはこれを渡し、
 * **`Math.random()` を直に呼ばない**（日替わりが端末ごとに変わってしまう）。
 */
export function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 連続日数を数える。
 *
 * - 同じ日に2回クリアしても増えない（`streak` をそのまま返す）
 * - 前日にクリアしていれば +1
 * - 1日でも空いたら 1 に戻る（**連続が切れる**）
 * - 記録が無い（`streak` を持たない旧バージョンの記録）なら 0 とみなして数え直す
 *
 * 日付は必ず `localDateKey` で作ったものを渡すこと。
 */
export function nextStreak(
  lastClearedOn: DateKey | undefined,
  today: DateKey,
  streak: number | undefined,
): number {
  const current = streak === undefined || streak < 1 ? 0 : Math.floor(streak);
  if (lastClearedOn === today) return Math.max(current, 1);
  if (lastClearedOn !== undefined && lastClearedOn === previousDateKey(today)) return current + 1;
  return 1;
}

/**
 * 連続日数が「いまも生きているか」。
 *
 * 記録に残っている `streak` は**最後にクリアした日のもの**なので、
 * 2日以上空いていれば表示のうえでは 0 に見せる（記録は書き換えない）。
 */
export function currentStreak(
  lastClearedOn: DateKey | undefined,
  today: DateKey,
  streak: number | undefined,
): number {
  if (streak === undefined || streak < 1 || lastClearedOn === undefined) return 0;
  if (lastClearedOn === today || lastClearedOn === previousDateKey(today)) return Math.floor(streak);
  return 0;
}
