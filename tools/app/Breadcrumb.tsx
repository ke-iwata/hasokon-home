import Link from 'next/link';
import type { Crumb } from '@/lib/jsonld';

/**
 * 視覚的なパンくず。ページ見出し（h1）の直前に置く。
 *
 * JSON-LD の BreadcrumbList と同じ `trail`（lib/jsonld.ts）を受け取るので、
 * 表示と構造化データが食い違わない。
 *
 * - ホーム（hasokon.com 直下）は basePath の外にある別アプリなので `<a>`。
 *   `<Link>` にすると /tools/ 配下の存在しないURLへ飛ぶ
 * - 現在地（url を持たない段）はリンクにしない
 * - 区切り記号は aria-hidden。読み上げでは ol/li の構造が順序を伝える
 */
export default function Breadcrumb({ trail }: { trail: Crumb[] }) {
  return (
    <nav className="breadcrumb" aria-label="パンくずリスト">
      <ol>
        {trail.map((c, i) => (
          <li key={c.name}>
            {i > 0 && <span aria-hidden="true">＞</span>}
            {c.url === undefined ? (
              <span aria-current="page">{c.name}</span>
            ) : c.path === undefined ? (
              <a href={c.url}>{c.name}</a>
            ) : (
              <Link href={c.path}>{c.name}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
