import Link from 'next/link';
import Breadcrumb from '../Breadcrumb';
import AdUnit from '../AdUnit';
import { articleFor, breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import { chapterBySlug, neighborsOf, parts } from '@/lib/curriculum';
import { resolveSources, SOURCE_KIND_LABEL } from '@/lib/sources';

/**
 * 章ページの外枠。
 *
 * **すべての章はこれを通す。** 免責・参考文献・前後ナビを個々のページに
 * 書かせないための共通部品で、書き忘れが起きない形にしてある
 * （docs/features/learn-toshi.md「守ること」）。
 *
 * - `sources` に渡したIDから参考文献リストを組み立てる。
 *   **未登録のIDはここでビルドが落ちる**（lib/sources.ts の sourceById が投げる）
 * - 免責は引数を取らない。章ごとに文言を変えられないようにするため
 * - 広告は本文の下にだけ置く（本文より上に広告を置かない。tools/docs/CONCEPT.md 5）
 */
export default function Chapter({
  slug,
  sources,
  children,
}: {
  slug: string;
  /** 本文が参照した参考文献のID（lib/sources.ts）。空にはできない */
  sources: readonly string[];
  children: React.ReactNode;
}) {
  const chapter = chapterBySlug(slug);
  const part = parts.find((p) => p.id === chapter.part);
  const trail = breadcrumbFor(slug);
  const { prev, next } = neighborsOf(slug);
  const refs = resolveSources(sources);

  return (
    <div className="card chapter">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [articleFor(slug), breadcrumbList(trail)],
          }),
        }}
      />

      <Breadcrumb trail={trail} />

      <p className="chapter-part">
        {part?.label} {part?.title}
      </p>
      <h1>{chapter.title}</h1>
      <p className="lead">{chapter.description}</p>

      <div className="chapter-body">{children}</div>

      <AdUnit position="below-body" />

      <section className="refs" aria-labelledby="refs-heading">
        <h2 id="refs-heading">参考文献</h2>
        <p className="note">
          この章の記述は以下にもとづいています。制度は変わるので、
          数字を実際に使う前に一次資料そのものを確かめてください。
        </p>
        <ol>
          {refs.map((s) => (
            <li key={s.id}>
              <span className="refs-kind">{SOURCE_KIND_LABEL[s.kind]}</span>
              {s.author && <span className="refs-author">{s.author}</span>}
              {s.year ? `(${s.year}) ` : ''}
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
              <span className="refs-pub">{s.publisher}</span>
              <span className="refs-date">確認日 {s.checkedAt}</span>
            </li>
          ))}
        </ol>
      </section>

      <Disclaimer />

      <nav className="chapter-nav" aria-label="章の移動">
        {prev ? (
          <Link className="chapter-nav-prev" href={`/${prev.slug}/`}>
            <span>前の章</span>
            {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link className="chapter-nav-next" href={`/${next.slug}/`}>
            <span>次の章</span>
            {next.title}
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <p className="chapter-toc-back">
        <Link href="/">目次にもどる</Link>
      </p>
    </div>
  );
}

/**
 * 免責。**全章に機械的に入る**（Chapter が必ず描画する）。
 *
 * このサイトは投資助言・代理業の登録をしていない。したがって個別銘柄の推奨も
 * 売買タイミングの助言もしないし、断定的判断も提供しない（金商法38条2号）。
 * その方針を読者にも明示する。文言を章ごとに変えられないよう引数は取らない。
 */
export function Disclaimer() {
  return (
    <aside className="disclaimer" aria-label="免責事項">
      <p>
        <strong>この教科書について。</strong>
        一般的・客観的な情報の提供を目的とした教育コンテンツです。
        特定の銘柄・商品の推奨や、売買時期の助言は行いません
        （投資助言・代理業の登録をしていないため）。
        将来の運用成果を約束するものでもありません。
        投資の判断はご自身の責任で行ってください。
      </p>
    </aside>
  );
}
