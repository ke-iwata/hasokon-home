/**
 * テキスト比較の計算を画面の外で回す Web Worker（仕様「比較の約束」5）。
 * 受け取った文字列はこの中で比べて結果を返すだけで、どこにも送らない。
 */
import { compareTexts, type IgnoreOptions } from '@/lib/text-hikaku';

export interface CompareRequest {
  id: number;
  left: string;
  right: string;
  opts: IgnoreOptions;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<CompareRequest>) => void) | null;
  postMessage(message: unknown): void;
};

ctx.onmessage = (e) => {
  const { id, left, right, opts } = e.data;
  ctx.postMessage({ id, result: compareTexts(left, right, opts) });
};
