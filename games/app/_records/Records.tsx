'use client';

/**
 * 記録（ベスト・勝敗・クリアタイム）の表示と、各ゲームから使うフック。
 *
 * 仕様: docs/features/game-records.md
 * 保存まわりの中身は `lib/records.ts`（純関数＋ストレージ層）にある。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_VARIANT,
  entryOf,
  loadRecords,
  RECORDS_NOTE,
  recordResult,
  recordStart,
  updateEntry,
  type GameRecords,
  type Improved,
  type PlayResult,
  type RecordEntry,
} from '@/lib/records';

/**
 * ゲームの記録を読み書きするフック。
 *
 * 読み込みはマウント後に行う（静的書き出しのHTMLとブラウザで食い違わないように）。
 * `ready` になるまでは「記録なし」として描くこと。
 */
export function useRecords(gameId: string) {
  const [records, setRecords] = useState<GameRecords>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setRecords(loadRecords(gameId));
    setReady(true);
  }, [gameId]);

  /** 1手目を指した＝1プレイとして数える */
  const start = useCallback(
    (variant: string = DEFAULT_VARIANT) => {
      setRecords(recordStart(gameId, variant));
    },
    [gameId],
  );

  /** 決着を記録する。ベストを更新したかどうかを返す（クリア画面で祝うため） */
  const finish = useCallback(
    (result: PlayResult, variant: string = DEFAULT_VARIANT) => {
      const next = recordResult(gameId, result, variant);
      setRecords(next.records);
      return next;
    },
    [gameId],
  );

  /** 上記に当てはまらない更新（ノノグラムの「解いた問題ID」など） */
  const update = useCallback(
    (variant: string, fn: (entry: RecordEntry) => RecordEntry) => {
      setRecords(updateEntry(gameId, variant, fn));
    },
    [gameId],
  );

  const entry = useCallback(
    (variant: string = DEFAULT_VARIANT): RecordEntry => entryOf(records, variant),
    [records],
  );

  // 各ゲームの useCallback / useEffect の依存に入るので、
  // 記録が変わったときだけ作り直す（毎回作ると再購読が走る）
  return useMemo(
    () => ({ records, ready, entry, start, finish, update }),
    [records, ready, entry, start, finish, update],
  );
}

/**
 * クリアタイムのストップウォッチ。
 *
 * 表示用の `ms` は0.25秒ごとにしか進まないので、記録に残す時間は
 * `stop()` の返り値（止めた瞬間に計算した値）を使うこと。
 */
export function useStopwatch() {
  const startedAt = useRef<number | null>(null);
  const [running, setRunning] = useState(false);
  const [ms, setMs] = useState(0);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      if (startedAt.current !== null) setMs(Date.now() - startedAt.current);
    }, 250);
    return () => window.clearInterval(timer);
  }, [running]);

  /** 1手目で呼ぶ。2回目以降は何もしない（計測は最初の1手から） */
  const begin = useCallback(() => {
    if (startedAt.current !== null) return;
    startedAt.current = Date.now();
    setRunning(true);
  }, []);

  /** 止めて、かかった時間（ms）を返す。始まっていなければ0 */
  const stop = useCallback((): number => {
    const total = startedAt.current === null ? 0 : Date.now() - startedAt.current;
    setRunning(false);
    setMs(total);
    return total;
  }, []);

  /** 新しいゲームを始めるときに呼ぶ */
  const reset = useCallback(() => {
    startedAt.current = null;
    setRunning(false);
    setMs(0);
  }, []);

  // 記録の更新と同じく、依存に入れても余計な再実行が起きないようにまとめる
  return useMemo(() => ({ ms, running, begin, stop, reset }), [ms, running, begin, stop, reset]);
}

/** 帯に並べる1項目 */
export interface RecordItem {
  label: string;
  value: string;
}

/**
 * 盤面の上に出す記録の帯。
 *
 * 記録が1つも無いあいだは何も出さない（まだ何も無いのに枠だけあると邪魔なため）。
 *
 * **保存先の注記は自分から開かない。** 以前は最初の1回だけ開いて見せていたが、
 * 帯が139pxになり、スマホでは盤がその分だけ画面から押し出されていた（実測）。
 * 注記は「消えることがある」という但し書きで、遊ぶ前に読ませるものではない。
 * 見出し（`summary`）は常に出ているので、知りたい人はそこから開ける。
 */
export function RecordStrip({ items }: { items: RecordItem[] }) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="rec-strip">
      <span className="rec-items">
        {items.map((item) => (
          <span key={item.label} className="rec-item">
            {item.label} <strong>{item.value}</strong>
          </span>
        ))}
      </span>
      <details
        className="rec-note"
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
      >
        <summary>記録の保存について</summary>
        <p>{RECORDS_NOTE}</p>
      </details>
    </div>
  );
}

/** 「ベスト更新！」の吹き出し。クリア画面で使う */
export function BestBadge({ improved }: { improved: Improved | null }) {
  if (!improved || !(improved.time || improved.score || improved.moves)) return null;
  return <span className="rec-best">ベスト更新！</span>;
}
