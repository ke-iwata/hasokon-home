import { buildAdsTxt } from '@/lib/adsense';

// output: 'export' では静的生成であることの明示が必要
export const dynamic = 'force-static';

/**
 * /ads.txt を配信する。
 * パブリッシャーIDを lib/adsense.ts の1箇所だけで管理するため、
 * public/ads.txt に直接置かずここで組み立てている。
 */
export function GET() {
  return new Response(buildAdsTxt(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
