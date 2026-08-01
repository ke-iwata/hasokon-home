'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isAnalyticsEnabled, trackPageView } from '@/lib/analytics';

/**
 * ページビューの送信。
 *
 * next/link での移動は通常のページ読み込みを伴わないため、
 * gtag の自動送信（send_page_view）は切って、ここでパスの変化を見て送っている。
 * 初回表示も含めてすべてこの経路で送るので、二重に数えられることはない。
 */
export default function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
