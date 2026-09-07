import Link from 'next/link';

export const metadata = { title: 'ページが見つかりません', robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <div className="card">
      <h1>ページが見つかりません</h1>
      <p className="lead">
        URLが変わったか、まだ書かれていない章かもしれません。目次からお探しください。
      </p>
      <p>
        <Link href="/">目次にもどる</Link>
      </p>
    </div>
  );
}
