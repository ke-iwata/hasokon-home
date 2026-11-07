/**
 * 囲碁の CPU の探索を画面の外で回す Web Worker（仕様「CPU」：画面は止めない）。
 * 読み込み方はテキスト比較（tools/app/text-hikaku/compare.worker.ts）と同じ
 * `new Worker(new URL('./cpu.worker.ts', import.meta.url))` で、2通りにしない。
 */
import { chooseMove, type CpuRequest } from '@/lib/igo-cpu';

export interface WorkerRequest {
  id: number;
  req: CpuRequest;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: unknown): void;
};

ctx.onmessage = (e) => {
  const { id, req } = e.data;
  ctx.postMessage({ id, result: chooseMove(req) });
};
