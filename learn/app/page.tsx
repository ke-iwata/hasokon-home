import type { Metadata } from 'next';
import Link from 'next/link';
import Breadcrumb from './Breadcrumb';
import { Disclaimer } from './_chapter/Chapter';
import { breadcrumbList, breadcrumbTrail, HOME_URL } from '@/lib/jsonld';
import {
  chaptersOfSubject,
  publicChapters,
  publicSubjects,
  SITE_NAME,
  SITE_URL,
  subjectPath,
  subjectUrl,
} from '@/lib/curriculum';

/**
 * title の後ろ半分は分野名を書く（`SITE_NAME` はセクション名の「学ぶ」のまま。パンくずが重なるため）。
 * 「全◯章」は文字で書かず `publicChapters` から出す（docs/features/ichiran-page-title-refresh.md）。
 * 分野が2つ以上になったら、ここを subjects から組み立て直す（tests/curriculum.test.ts が落とす）
 */
export const metadata: Metadata = {
  title: `${SITE_NAME}｜投資の教科書（全${publicChapters.length}章）株式・投資信託・NISAの仕組み`,
  description: `株式・債券・投資信託・NISA・iDeCoの仕組みを、全${publicChapters.length}章で体系的に学べる無料の教科書。記述の根拠は各章の末尾に、一次資料へのリンクつきで並べています。`,
  alternates: { canonical: `${SITE_URL}/` },
};

export default function LearnTopPage() {
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
                hasPart: publicSubjects.map((s) => ({
                  '@type': 'CreativeWorkSeries',
                  name: s.name,
                  description: s.description,
                  url: subjectUrl(s.slug),
                })),
              },
              breadcrumbList(trail),
            ],
          }),
        }}
      />

      <Breadcrumb trail={trail} />

      <h1>{SITE_NAME}</h1>
      <p className="lead">
        腰を据えて読むための教材を置いています。
        計算して答えを出す<a href="/tools/">ツール</a>とは別に、
        <strong>仕組みそのものを理解するため</strong>のページです。
      </p>

      <ul className="subject-list">
        {publicSubjects.map((s) => {
          const total = chaptersOfSubject(s.slug).length;
          return (
            <li key={s.slug}>
              <Link className="subject-card" href={subjectPath(s.slug)}>
                <span className="subject-name">{s.name}</span>
                <span className="subject-count">全{total}章</span>
                <span className="subject-desc">{s.lead}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="note">
        分野はこれから増やしていきます。
        いまあるのは投資だけですが、URLは分野ごとに分かれているので
        （<code>/learn/toshi/</code>）、増えても既存のページは動きません。
      </p>

      <Disclaimer />
    </div>
  );
}
