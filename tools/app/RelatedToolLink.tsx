'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { trackRelatedClick } from '@/lib/analytics';
import type { RelatedLinkSource } from '@/lib/related';

/**
 * 関連ツールのカード1枚分のリンク。押されたら related_click を送る。
 *
 * RelatedTools はサーバーコンポーネントなので、onClick だけをこの部品に分けている。
 * リンクは next/link のまま（`<a href>` として出力される）。素の `<a>` にすると
 * クライアント側の遷移が壊れる。href があるので JS が無くても遷移し、クローラーも辿れる。
 * 仕様: docs/features/related-tools-topical.md の 3
 */
export default function RelatedToolLink({
  from,
  to,
  source,
  className,
  style,
  children,
}: {
  from: string;
  to: string;
  source: RelatedLinkSource;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Link
      className={className}
      style={style}
      href={`/${to}/`}
      onClick={() => trackRelatedClick(from, to, source)}
    >
      {children}
    </Link>
  );
}
