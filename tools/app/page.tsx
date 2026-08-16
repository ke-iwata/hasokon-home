import type { Metadata } from 'next';
import Link from 'next/link';
import { categories, tools, SITE_NAME, SITE_URL } from '@/lib/registry';
import { breadcrumbList, breadcrumbTrail, PUBLISHER } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import ToolIcon from '@/app/ToolIcon';

/**
 * 自己参照canonical（docs/features/self-canonical-coverage.md）。
 * title / description は layout.tsx の既定値をそのまま使いたいので書かない
 * （title.template が '%s' なので、ここに title を書くと title.default が消える）。
 */
export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/` },
};

// 一覧ページ自身は2段（ホーム ＞ 無料計算ツール集）。ここが階層の中間になる
const trail = breadcrumbTrail();

/**
 * サイト全体の発行者と、サイトそのものを表す構造化データ。
 * 各ページの publisher はここで定義した @id を参照している。
 * トップに実体を置くことで「同じ運営者による一連のページ」として結び付けられる。
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    PUBLISHER,
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      inLanguage: 'ja',
      publisher: { '@id': `${SITE_URL}/#publisher` },
    },
    breadcrumbList(trail),
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <section className="hero">
        <h1>
          暮らしと仕事の<span className="grad">計算ツール</span>を、
          <br />
          ぜんぶ無料で。
        </h1>
        <p className="lead">
          給与・社会保険からちょっとした変換まで。登録不要、すべてブラウザ内で完結します。
        </p>
        <div className="badges">
          <span>無料</span>
          <span>登録不要</span>
          <span>データ送信なし</span>
        </div>
        <p className="lead">
          制度に関わる計算機は、法令や官公庁の一次資料にもとづいて作り、根拠へのリンクと最終更新日を各ページに載せています。年収の壁・iDeCo・高額療養費・高校無償化など、2026年の制度改正にも対応しています。詳しくは
          <Link href="/about/">運営者情報と計算の根拠について</Link>
          をご覧ください。
        </p>
      </section>

      {categories.map((cat) => {
        const list = tools.filter((t) => t.category === cat);
        if (list.length === 0) return null;
        return (
          <section key={cat}>
            <div className="section-title">
              <h2>{cat}</h2>
              <span className="count">{list.length}件</span>
            </div>
            <div className="tool-grid">
              {list.map((t) =>
                t.ready ? (
                  <Link key={t.slug} className="tool-card" href={`/${t.slug}/`}>
                    <div className="icon">
                      <ToolIcon name={t.icon} />
                    </div>
                    <div className="name">{t.name}</div>
                    <div className="desc">{t.description}</div>
                  </Link>
                ) : (
                  <div key={t.slug} className="tool-card coming" aria-disabled="true">
                    <div className="icon">
                      <ToolIcon name={t.icon} />
                    </div>
                    <div className="name">
                      {t.name}
                      <span className="badge">準備中</span>
                    </div>
                    <div className="desc">{t.description}</div>
                  </div>
                )
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}
