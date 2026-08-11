'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initAnalytics, shouldTrack, trackPageView } from '@/lib/analytics';

/**
 * ページビューの送信。
 *
 * next/link での移動は通常のページ読み込みを伴わないため、
 * gtag の自動送信（send_page_view）は切って、ここでパスの変化を見て送っている。
 * 初回表示も含めてすべてこの経路で送るので、二重に数えられることはない。
 *
 * `shouldTrack()` は本番ホスト以外で false になるので、test.hasokon.com や
 * localhost では初期化もページビューも起きない（docs/features/measurement-hygiene.md）。
 */
export default function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!shouldTrack()) return;
    // 初回だけ gtag を初期化する（2回目以降は何もしない）
    initAnalytics();
    // pathname は「移動が起きたこと」の検知にだけ使い、値は渡さない。
    // usePathname() は basePath（/games）を取り除いたパスを返すため、
    // GA4に渡すと実際のURLと食い違う（docs/features/ga4-page-path.md）。
    // URLの確定は history への push が済んだあとなので、この時点の
    // window.location.href は移動後のURLになっている。
    trackPageView();
  }, [pathname]);

  return null;
}
