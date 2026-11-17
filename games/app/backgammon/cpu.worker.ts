/**
 * バックギャモンの CPU の読みを画面の外で回す Web Worker（docs/features/cpu-speed.md）。
 * 読み込み方は囲碁（app/igo/cpu.worker.ts）と同じ
 * `new Worker(new URL('./cpu.worker.ts', import.meta.url))`。
 */
import { chooseMove, type CpuRequest } from '@/lib/backgammon-cpu';

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
  ctx.postMessage({ id, steps: chooseMove(req) });
};
