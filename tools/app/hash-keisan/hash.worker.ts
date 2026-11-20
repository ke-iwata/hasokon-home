/**
 * ファイルのハッシュ値を計算するだけの Web Worker（仕様「計算の約束」）。
 * `File.slice()` で 4MB ずつ読み、5つのアルゴリズムに同じ塊を流す。メインのスレッドは固めない。
 * 中止は画面側が terminate して作り直す。受け取ったファイルはここで読むだけで、どこにも送らない。
 */
import { hashBlob } from '@/lib/hash/file';
import type { Digests } from '@/lib/hash/digest';

export interface HashRequest {
  id: number;
  file: Blob;
}

export type HashResponse =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'done'; digests: Digests }
  | { id: number; type: 'error'; message: string };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<HashRequest>) => void) | null;
  postMessage(message: HashResponse): void;
};

ctx.onmessage = async (e) => {
  const { id, file } = e.data;
  try {
    let last = 0;
    const digests = await hashBlob(file, {
      onProgress: (done, total) => {
        // 進み具合は 1% ごとに送る（4MB ごとに送ると大きいファイルで画面の更新が多すぎる）
        if (done === total || done - last >= total / 100) {
          last = done;
          ctx.postMessage({ id, type: 'progress', done, total });
        }
      },
    });
    if (digests) ctx.postMessage({ id, type: 'done', digests });
  } catch (err) {
    ctx.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
