import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_UPDATED_AT, SITE_URL } from '@/lib/registry';
import { breadcrumbList, breadcrumbTrail } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';

export const metadata: Metadata = {
  title: 'プライバシーポリシー',
  description: `${SITE_NAME}のプライバシーポリシー。広告配信、アクセス解析、データの取り扱いについてのご案内です。`,
  alternates: { canonical: `${SITE_URL}/privacy/` },
};

// registry に無い固定ページなので、現在地の名前だけここで持つ
const trail = breadcrumbTrail('プライバシーポリシー');

/**
 * 発行者はトップページ（app/page.tsx）の Organization を @id で参照する。
 * パンくずを足すために @graph にしてある（<script> は1枚のまま。tools と同じ構成）
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      name: 'プライバシーポリシー',
      url: `${SITE_URL}/privacy/`,
      inLanguage: 'ja',
      dateModified: SITE_UPDATED_AT,
      publisher: { '@id': `${SITE_URL}/#publisher` },
    },
    breadcrumbList(trail),
  ],
};

export default function PrivacyPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>プライバシーポリシー</h1>
      <p className="lead">本サイト（{SITE_NAME}）における情報の取り扱いについて定めます。</p>

      <h2>ゲームデータの取り扱い</h2>
      <p>
        各ゲームはすべてお使いのブラウザ内で動作します。スコアや進行状況がサーバーに送信・保存されることはありません。
      </p>
      <p>
        ベストスコア・勝敗などの記録は、お使いのブラウザの保存領域（localStorage）にのみ保存されます。これらの内容もサーバーには送信されず、ブラウザの閲覧データ（サイトデータ）を削除することで消去できます。
      </p>

      <h2>広告配信について</h2>
      <p>
        本サイトは、第三者配信の広告サービス「Google
        AdSense」を利用しています。Googleなどの第三者配信事業者は、Cookie（クッキー）を使用して、ユーザーが本サイトや他のサイトに過去にアクセスした際の情報にもとづく広告を配信します。このCookieには氏名・住所・メールアドレス・電話番号などの個人情報は含まれません。
      </p>
      <p>
        パーソナライズド広告は
        <a href="https://adssettings.google.com/" target="_blank" rel="nofollow noopener noreferrer">
          広告設定
        </a>
        で無効にできます。また
        <a href="https://www.aboutads.info/choices/" target="_blank" rel="nofollow noopener noreferrer">
          www.aboutads.info
        </a>
        では、第三者配信事業者のCookieを使用したパーソナライズド広告を一括で無効にできます。第三者配信事業者による広告配信を無効にしていない場合、本サイトでの広告配信時に第三者配信事業者や広告ネットワークのCookieが使用されることがあります。詳しくは
        <a
          href="https://policies.google.com/technologies/ads?hl=ja"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          Googleのポリシーと規約
        </a>
        をご覧ください。
      </p>

      <h2>アクセス解析について</h2>
      <p>
        本サイトは、サービス向上のためGoogleが提供するアクセス解析ツール「Googleアナリティクス」を利用しています。Googleアナリティクスはトラフィックデータの収集のためにCookieを使用します。収集されるのは、閲覧されたページ、滞在時間、参照元、大まかな地域、利用された端末やブラウザの種類、および各ゲームが遊ばれた回数などで、
        <strong>氏名・住所・メールアドレスなど個人を特定する情報は含まれません</strong>
        。また、ブラウザに保存された記録の内容が送信されることもありません。
      </p>
      <p>
        収集されたデータはGoogleのプライバシーポリシーにもとづいて管理されます。詳しくは
        <a
          href="https://marketingplatform.google.com/about/analytics/terms/jp/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          Googleアナリティクス利用規約
        </a>
        および
        <a
          href="https://policies.google.com/privacy?hl=ja"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          Googleのプライバシーポリシー
        </a>
        をご覧ください。データの収集を拒否したい場合は、
        <a
          href="https://tools.google.com/dlpage/gaoptout?hl=ja"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          Googleアナリティクス オプトアウト アドオン
        </a>
        をご利用ください。
      </p>

      <h2>免責事項</h2>
      <p>
        本サイトの利用によって生じたいかなる損害についても、運営者は一切の責任を負いかねます。
      </p>

      <h2>著作権について</h2>
      <p>
        本サイトに掲載されているプログラム・画像等のコンテンツの著作権は運営者に帰属します。本サイトはリンクフリーです。リンクの際の許可・連絡は不要です。
      </p>

      <h2>運営者・お問い合わせ</h2>
      <p>
        本サイトは、同じ運営者による hasokon.com の一部として公開しています。運営者については
        {/* about は tools 側の固定ページ。basePath（/games）の外なので <a> で絶対パスへ飛ばす */}
        <a href="/tools/about/">運営者情報</a>
        を、本ポリシーに関するご連絡は
        <Link href="/contact/">お問い合わせフォーム</Link>
        をご覧ください。
      </p>

      <h2>プライバシーポリシーの変更</h2>
      <p>
        本ポリシーの内容は、法令の変更やサービス内容の変更に応じて、予告なく改定することがあります。変更後のポリシーは、本ページに掲載した時点で効力を生じるものとします。
      </p>

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        制定日：2026年8月／最終更新：2026年8月16日（記録の保存先・広告配信・アクセス解析・運営者の項を追記）
      </p>
    </>
  );
}
