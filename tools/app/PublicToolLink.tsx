import Link from 'next/link';
import type { ReactNode } from 'react';
import { isPublicTool } from '@/lib/registry';

/**
 * 公開中のページから、**公開前かもしれない**ツールへ張る本文中のリンク。
 *
 * 相手が `public` ならリンク、そうでなければ何も出さない。公開前（`noindex`）のページへ
 * 公開中のページからリンクすると、一覧や sitemap から外している意味が無くなるため。
 * `stage` を `public` に上げた時点で、呼び出し側を触らずにリンクが現れる。
 *
 * @param slug リンク先のツール
 * @param children リンクを含む文（公開前は文ごと出さない）
 */
export default function PublicToolLink({ slug, children }: { slug: string; children: ReactNode }) {
  if (!isPublicTool(slug)) return null;
  return <>{children}</>;
}

/** `PublicToolLink` の中で使うリンク本体。href は slug から作る */
export function ToolLink({ slug, children }: { slug: string; children: ReactNode }) {
  return <Link href={`/${slug}/`}>{children}</Link>;
}
