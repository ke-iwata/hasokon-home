import Link from 'next/link';
import { games } from '@/lib/registry';
import GameIcon from '@/app/GameIcon';

export const metadata = {
  title: 'ページが見つかりません',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <>
      <h1>ページが見つかりません</h1>
      <p className="lead">URLが変わったか、入力に誤りがあるかもしれません。</p>
      <div className="game-grid">
        {games
          .filter((g) => g.ready)
          .map((g) => (
            <Link key={g.slug} className="game-card" href={`/${g.slug}/`}>
              <div className="icon" aria-hidden="true">
                <GameIcon name={g.icon} />
              </div>
              <div className="name">{g.name}</div>
              <div className="desc">{g.description}</div>
            </Link>
          ))}
      </div>
    </>
  );
}
