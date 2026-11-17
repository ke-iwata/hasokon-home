/**
 * 正規表現の照合だけを行う Web Worker（仕様「安全の約束」1）。
 * 重いパターンで止まっても画面は固まらない。画面側が 1 秒で terminate して作り直す。
 * 受け取った文字列はこの中で照合して結果を返すだけで、どこにも送らない。
 */
import { compile, replaceWithMarks, runMatch, type MatchResult, type ReplacePiece } from '@/lib/regex-check';

export interface MatchRequest {
  id: number;
  pattern: string;
  flags: string;
  text: string;
  /** 置換しないときは null */
  replacement: string | null;
}

export interface MatchResponse {
  id: number;
  result?: MatchResult;
  replaced?: ReplacePiece[];
  /** compile は画面側で先に確かめているので、ここに来るのは想定外の例外だけ */
  error?: string;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<MatchRequest>) => void) | null;
  postMessage(message: MatchResponse): void;
};

ctx.onmessage = (e) => {
  const { id, pattern, flags, text, replacement } = e.data;
  const c = compile(pattern, flags);
  if ('error' in c) {
    ctx.postMessage({ id, error: c.error.message });
    return;
  }
  try {
    const result = runMatch(c.re, text);
    const replaced = replacement === null ? undefined : replaceWithMarks(c.re, text, replacement);
    ctx.postMessage({ id, result, replaced });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
