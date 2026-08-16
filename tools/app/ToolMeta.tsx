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
 *   true のとき「目安であること」「最終判断は公的機関で」の注意書きを出す。
 *   'legal' は法制度（違反の判定・裁判所の算定・法律上の期限など）向けで、
 *   「参考情報であり法的助言ではない」「専門家・窓口へ」の文言に置き換わる
 * @param children 出典（一次情報へのリンク）。制度に関わるツールでは必須
 */
export default function ToolMeta({
  slug,
  ymyl = false,
  children,
}: {
  slug: string;
  ymyl?: boolean | 'legal';
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

      {ymyl === 'legal' ? (
        <p style={{ margin: '0 0 6px' }}>
          本ページの内容と計算・判定の結果は、<strong>日本の法令</strong>と官公庁の公表資料にもとづく参考情報であり、法的助言ではありません。日本国内の制度だけを対象としており、他の国・地域の制度には対応していません。個別の事情によって結論が変わることがあります。権利や義務に関わる判断・手続きは、必ず公的機関（裁判所・警察・自治体など）の一次情報や窓口、または弁護士などの専門家にご確認ください。
        </p>
      ) : (
        ymyl && (
          <p style={{ margin: '0 0 6px' }}>
            計算結果は、日本の制度を対象とした目安です。実際の金額は加入している制度・自治体・契約内容によって変わります。手続きや申告の判断は、必ず公的機関の一次情報または専門家（税理士・社会保険労務士など）にご確認ください。本サイトは特定の個人に向けた税務・法律の助言を行うものではありません。
          </p>
        )
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
