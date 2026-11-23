import Link from 'next/link';
import ToolArt, { categoryStyle } from '@/app/ToolArt';
import RelatedToolLink from '@/app/RelatedToolLink';
import { pickRelatedTools, relatedHeading } from '@/lib/related';

/**
 * ページ下部に置く関連ツールの一覧。
 *
 * 各ツールページの内部リンクがヘッダーとフッターだけだと、トップから1階層下りた
 * ところで行き止まりになる。クロールもされにくく、ページ同士で評価を渡し合えない。
 *
 * 並びは lib/related.ts が決める。registry の `related`（手書きの「次に使うもの」）を先頭に、
 * 足りないぶんを同じカテゴリ → 他のカテゴリで埋める。`related` の無いツールの見え方は
 * 以前（同カテゴリを registry の並びで先頭から）と同じ。
 * 仕様: docs/features/related-tools-topical.md
 *
 * `related` 由来のカードと埋め草のカードの見た目は変えない（区別は related_click の
 * link_source で付ける）。
 *
 * @param current 今いるページのslug（自分自身へのリンクは出さない）
 * @param limit 並べる最大件数
 */
export default function RelatedTools({
  current,
  limit = 6,
}: {
  current: string;
  limit?: number;
}) {
  const list = pickRelatedTools(current, limit);
  if (list.length === 0) return null;

  return (
    <section style={{ marginTop: 36 }}>
      <h2 style={{ fontSize: '1.1rem' }}>{relatedHeading(current, list)}</h2>
      <div className="tool-grid">
        {list.map(({ tool: t, source }) => (
          <RelatedToolLink
            key={t.slug}
            className="tool-card"
            style={categoryStyle(t.category)}
            from={current}
            to={t.slug}
            source={source}
          >
            <div className="icon">
              <ToolArt slug={t.slug} icon={t.icon} />
            </div>
            <div className="name">{t.name}</div>
            <div className="desc">{t.description}</div>
          </RelatedToolLink>
        ))}
      </div>
      <p style={{ fontSize: '0.9rem' }}>
        <Link href="/">すべてのツールを見る →</Link>
      </p>
    </section>
  );
}
