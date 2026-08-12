import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/registry';
import { breadcrumbTrail } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';

export const metadata: Metadata = {
  title: 'プライバシーポリシー',
  description: `${SITE_NAME}のプライバシーポリシー。広告配信、アクセス解析、データの取り扱いについてのご案内です。`,
};

export default function PrivacyPage() {
  return (
    <>
      <Breadcrumb trail={breadcrumbTrail('プライバシーポリシー')} />

      <h1>プライバシーポリシー</h1>
      <p className="lead">本サイト（{SITE_NAME}）における情報の取り扱いについて定めます。</p>

      <h2>ゲームデータの取り扱い</h2>
      <p>
        各ゲームはすべてお使いのブラウザ内で動作します。スコアや進行状況がサーバーに送信・保存されることはありません。
      </p>

      <h2>広告配信について</h2>
      <p>
        本サイトは、第三者配信の広告サービス（Google
        AdSense）を利用する場合があります。Googleなどの第三者配信事業者は、Cookie（クッキー）を使用して、ユーザーが本サイトや他のサイトに過去にアクセスした際の情報にもとづく広告を配信します。このCookieには氏名・住所・メールアドレス・電話番号などの個人情報は含まれません。パーソナライズド広告は
        <a href="https://adssettings.google.com/" target="_blank" rel="nofollow noopener noreferrer">
          広告設定
        </a>
        で無効にできます。詳しくは
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
        本サイトは、サービス向上のためGoogleが提供するアクセス解析ツール「Googleアナリティクス」を利用する場合があります。Googleアナリティクスはトラフィックデータの収集のためにCookieを使用します。収集されるのは閲覧されたページ・滞在時間・参照元・大まかな地域・端末の種類などで、個人を特定する情報は含まれません。データの収集を拒否したい場合は、
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
        本サイトに掲載されているプログラム・画像等のコンテンツの著作権は運営者に帰属します。本サイトはリンクフリーです。
      </p>

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>制定日：2026年8月</p>
    </>
  );
}
