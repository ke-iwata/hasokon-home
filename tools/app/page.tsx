import Link from 'next/link';
import { categories, tools } from '@/lib/registry';

export default function Home() {
  return (
    <>
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
                    <div className="icon" aria-hidden="true">
                      {t.icon}
                    </div>
                    <div className="name">{t.name}</div>
                    <div className="desc">{t.description}</div>
                  </Link>
                ) : (
                  <div key={t.slug} className="tool-card coming" aria-disabled="true">
                    <div className="icon" aria-hidden="true">
                      {t.icon}
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
