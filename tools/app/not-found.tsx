import type { Metadata } from 'next';
import Link from 'next/link';
import ToolArt, { categoryStyle } from '@/app/ToolArt';
import { categories, publicTools } from '@/lib/registry';

export const metadata: Metadata = {
  title: 'ページが見つかりません',
  // 存在しないURLを検索結果に載せない
  robots: { index: false, follow: true },
};

/**
 * 404ページ。
 * output: 'export' では、このファイルが out/404.html として書き出され、
 * CloudFront のカスタムエラーレスポンス（403/404 → /404.html）から使われる。
 */
export default function NotFound() {
  return (
    <>
      <h1>ページが見つかりません</h1>
      <p className="lead">
        URLが変わったか、入力に誤りがあるかもしれません。お探しのものが下にあるかもしれないので、よければご覧ください。
      </p>

      {categories.map((cat) => {
        const list = publicTools.filter((t) => t.category === cat);
        if (list.length === 0) return null;
        return (
          <section key={cat}>
            <h2>{cat}</h2>
            {/* 小さいタイルの絵（app/ToolArt.tsx）で並べる。探し物の途中なので、
                一覧（/tools/）の大きい絵より一度に多く見渡せるほうを選んだ */}
            <div className="tool-grid">
              {list.map((t) => (
                <Link key={t.slug} className="tool-card" style={categoryStyle(t.category)} href={`/${t.slug}/`}>
                  <div className="icon">
                    <ToolArt slug={t.slug} icon={t.icon} />
                  </div>
                  <div className="name">{t.name}</div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <p>
        <Link href="/">ツール一覧を見る</Link>
      </p>
    </>
  );
}
