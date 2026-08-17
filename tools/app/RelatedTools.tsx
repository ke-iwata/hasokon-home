import Link from 'next/link';
import { publicTools, tools, type ToolCategory } from '@/lib/registry';
import ToolIcon from '@/app/ToolIcon';

/**
 * ページ下部に置く関連ツールの一覧。
 *
 * 各ツールページの内部リンクがヘッダーとフッターだけだと、トップから1階層下りた
 * ところで行き止まりになる。クロールもされにくく、ページ同士で評価を渡し合えない。
 * 同じカテゴリのツールを並べて、ツール間を横に移動できるようにしている。
 *
 * registry.ts から生成するので、ツールを足せば全ページのリンクに自動で載る。
 *
 * @param current 今いるページのslug（自分自身へのリンクは出さない）
 * @param limit 同カテゴリだけで足りないときに他カテゴリから補って並べる最大件数
 */
export default function RelatedTools({
  current,
  limit = 6,
}: {
  current: string;
  limit?: number;
}) {
  const self = tools.find((t) => t.slug === current);
  const candidates = publicTools.filter((t) => t.slug !== current);

  // 同じカテゴリを優先し、足りなければ他のカテゴリで埋める。
  // 「お金・社会保険」など件数の少ないカテゴリでも、リンクが2〜3本で終わらないようにするため
  const sameCategory = candidates.filter((t) => t.category === self?.category);
  const others = candidates.filter((t) => t.category !== self?.category);
  const list = [...sameCategory, ...others].slice(0, limit);
  if (list.length === 0) return null;

  const categoryLabel: ToolCategory | undefined = self?.category;

  return (
    <section style={{ marginTop: 36 }}>
      <h2 style={{ fontSize: '1.1rem' }}>
        {categoryLabel ? `${categoryLabel}の他のツール` : '他のツール'}
      </h2>
      <div className="tool-grid">
        {list.map((t) => (
          <Link key={t.slug} className="tool-card" href={`/${t.slug}/`}>
            <div className="icon">
              <ToolIcon name={t.icon} />
            </div>
            <div className="name">{t.name}</div>
            <div className="desc">{t.description}</div>
          </Link>
        ))}
      </div>
      <p style={{ fontSize: '0.9rem' }}>
        <Link href="/">すべてのツールを見る →</Link>
      </p>
    </section>
  );
}
