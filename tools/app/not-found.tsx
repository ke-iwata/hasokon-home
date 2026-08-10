import type { Metadata } from 'next';
import Link from 'next/link';
import { categories, tools } from '@/lib/registry';

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
        const list = tools.filter((t) => t.category === cat && t.ready);
        if (list.length === 0) return null;
        return (
          <section key={cat}>
            <h2>{cat}</h2>
            <ul>
              {list.map((t) => (
                <li key={t.slug}>
                  <Link href={`/${t.slug}/`}>{t.name}</Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <p>
        <Link href="/">ツール一覧を見る</Link>
      </p>
    </>
  );
}
