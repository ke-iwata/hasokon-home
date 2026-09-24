import { buildLlmsTxt } from '@/lib/llms';

/**
 * `/tools/llms.txt`。AIアシスタント向けのツールの一覧（中身は `lib/llms.ts`）。
 *
 * **静的エクスポート（`output: 'export'`）なので、動的関数を使わない `GET` に限る**
 * （`app/sitemap.ts` と同じ扱い。仕様書 B-2c）。cookies / headers / request を読んだ時点で
 * ビルドが通らなくなる。
 */
export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(buildLlmsTxt(), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
