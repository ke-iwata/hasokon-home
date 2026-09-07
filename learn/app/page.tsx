import type { Metadata } from 'next';
import Link from 'next/link';
import Breadcrumb from './Breadcrumb';
import { Disclaimer } from './_chapter/Chapter';
import { breadcrumbList, breadcrumbTrail, HOME_URL } from '@/lib/jsonld';
import {
  chapters,
  chaptersOfPart,
  parts,
  sectionIsPublic,
  SITE_NAME,
  SITE_URL,
} from '@/lib/curriculum';

export const metadata: Metadata = {
  title: `${SITE_NAME}｜体系的に学ぶ投資の基礎から実践まで`,
  description:
    '株式・債券・投資信託から暗号資産・デイトレードまで、投資を体系的に学べる無料の教科書。全35章。出典はすべて一次資料へのリンクつきで明示しています。',
  alternates: { canonical: `${SITE_URL}/` },
  // 公開したかどうかは章の `stage` から決める。sitemap と同じ判断を見るので、
  // 「sitemap には出ているのに noindex」という食い違いが起きない
  robots: sectionIsPublic() ? undefined : { index: false, follow: false },
};

const written = chapters.filter((c) => c.stage !== 'wip').length;

export default function TocPage() {
  const trail = breadcrumbTrail();

  return (
    <div className="card">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'CollectionPage',
                name: SITE_NAME,
                url: `${SITE_URL}/`,
                inLanguage: 'ja',
                isPartOf: { '@type': 'WebSite', url: HOME_URL },
              },
              breadcrumbList(trail),
            ],
          }),
        }}
      />

      <Breadcrumb trail={trail} />

      <h1>{SITE_NAME}</h1>
      <p className="lead">
        投資を「どの商品を買うか」から始めると、たいてい迷子になります。
        先に原理を押さえ、商品ごとの性質を知り、制度で器を選び、最後に実際の手を覚える。
        この順番で全{chapters.length}章に並べました。
        <strong>記述の根拠はすべて章の末尾に出典として並べます。</strong>
      </p>

      <p className="note toc-progress">
        いまは型を確かめている段階で、{written}章を先に書いています。
        書かれていない章は目次に出ていますがリンクされません。
      </p>

      {parts.map((part) => {
        const list = chaptersOfPart(part.id);
        return (
          <section key={part.id} className="part" aria-labelledby={`part-${part.id}`}>
            <h2 id={`part-${part.id}`}>
              <span className="part-label">{part.label}</span>
              {part.title}
            </h2>
            <p className="part-lead">{part.lead}</p>
            <ol className="chapter-list">
              {list.map((c) => {
                const n = chapters.indexOf(c) + 1;
                return (
                  <li key={c.slug} className={c.stage === 'wip' ? 'is-todo' : undefined}>
                    <span className="chapter-no">{n}</span>
                    {c.stage === 'wip' ? (
                      <span className="chapter-title">
                        {c.title}
                        <span className="chapter-todo">準備中</span>
                      </span>
                    ) : (
                      <Link className="chapter-title" href={`/${c.slug}/`}>
                        {c.title}
                      </Link>
                    )}
                    <span className="chapter-desc">{c.description}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      <Disclaimer />
    </div>
  );
}
