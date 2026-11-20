/**
 * ファイル（Blob）を 4MB ずつ読みながら5種を同時に計算する。
 *
 * 仕様: docs/features/hash-keisan.md「計算の約束」
 *
 * Web Worker（app/hash-keisan/hash.worker.ts）から呼ぶ。Worker の無い環境では画面側から
 * 直接呼ぶ（塊ごとに await するので、そのときも固まりっぱなしにはならない）。
 * ファイル全体をメモリに読まないので、何GBでも落ちない。
 */
import { MultiHasher, type Digests } from './digest';

/** 1回に読む大きさ */
export const CHUNK_BYTES = 4 * 1024 * 1024;

export interface HashBlobOptions {
  onProgress?: (done: number, total: number) => void;
  /** true を返したら止める */
  isCancelled?: () => boolean;
  chunkBytes?: number;
}

/** 止めたら null */
export async function hashBlob(blob: Blob, opts: HashBlobOptions = {}): Promise<Digests | null> {
  const chunk = opts.chunkBytes ?? CHUNK_BYTES;
  const hasher = new MultiHasher();
  const total = blob.size;
  for (let off = 0; off < total; off += chunk) {
    if (opts.isCancelled?.()) return null;
    const buf = await blob.slice(off, Math.min(off + chunk, total)).arrayBuffer();
    hasher.update(new Uint8Array(buf));
    opts.onProgress?.(Math.min(off + chunk, total), total);
  }
  if (opts.isCancelled?.()) return null;
  opts.onProgress?.(total, total);
  return hasher.digest();
}

export type SizeBand = 'lt10mb' | 'lt1gb' | 'ge1gb';

/** 計測に送るのは大きさの区分だけ（正確なバイト数は送らない） */
export function sizeBand(bytes: number): SizeBand {
  if (bytes < 10 * 1024 * 1024) return 'lt10mb';
  if (bytes < 1024 * 1024 * 1024) return 'lt1gb';
  return 'ge1gb';
}

export function formatBytes(n: number): string {
  const exact = `${n.toLocaleString('ja-JP')} バイト`;
  if (n < 1024) return exact;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB（${exact}）`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB（${exact}）`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB（${exact}）`;
}
