import Link from 'next/link';
import { toolUpdatedAt } from '@/lib/jsonld';

/** '2026-08-02' → '2026年8月2日' */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/**
 * ツールページ下部の「このページについて」ブロック。
 *
 * 最終更新日・出典・免責をページごとに手書きしていると、書き忘れたページと
 * 書いてあるページが混ざる。実際に13本中4本にしか出典と更新日がなかったので、
 * 共通化して全ページに必ず出るようにした。
 *
 * 更新日は registry の updatedAt をそのまま使う。ページに表示する日付と
 * sitemap の lastmod が食い違わないようにするため。
 *
 * @param slug ツールのslug（更新日の取得に使う）
 * @param ymyl お金・健康など、判断を誤ると実害が出る内容か。
 *   true のとき「目安であること」「最終判断は公的機関で」の注意書きを出す
 * @param children 出典（一次情報へのリンク）。制度に関わるツールでは必須
 */
export default function ToolMeta({
  slug,
  ymyl = false,
  children,
}: {
  slug: string;
  ymyl?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      style={{
        marginTop: 32,
        paddingTop: 16,
        borderTop: '1px solid var(--border)',
        fontSize: '0.85rem',
        color: 'var(--muted)',
        lineHeight: 1.8,
      }}
    >
      <h2 style={{ fontSize: '0.95rem', margin: '0 0 6px', color: 'var(--text)' }}>
        このページについて
      </h2>

      {children && <p style={{ margin: '0 0 6px' }}>{children}</p>}

      {ymyl && (
        <p style={{ margin: '0 0 6px' }}>
          計算結果は目安です。実際の金額は加入している制度・自治体・契約内容によって変わります。手続きや申告の判断は、必ず公的機関の一次情報または専門家（税理士・社会保険労務士など）にご確認ください。本サイトは特定の個人に向けた税務・法律の助言を行うものではありません。
        </p>
      )}

      <p style={{ margin: 0 }}>
        最終更新：{formatDate(toolUpdatedAt(slug))}
        {' ／ '}
        {/* 計算のないツール（ルーレット等）で「計算の根拠」と書くと不自然なので出し分ける */}
        <Link href="/about/">{ymyl ? '計算の根拠と運営者について' : '運営者情報'}</Link>
      </p>
    </section>
  );
}
