import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/registry';

export const metadata: Metadata = {
  title: 'プライバシーポリシー',
  description: `${SITE_NAME}のプライバシーポリシー。入力データの取り扱い、広告配信、アクセス解析、著作権についてのご案内です。`,
};

export default function PrivacyPage() {
  return (
    <>
      <h1>プライバシーポリシー</h1>
      <p className="lead">本サイト（{SITE_NAME}）における情報の取り扱いについて定めます。</p>

      <h2>入力データの取り扱い</h2>
      <p>
        本サイトの各ツールに入力された数値・文字列などのデータは、すべてお使いのブラウザ内でのみ処理されます。入力内容がサーバーに送信・保存されることは一切ありません。
      </p>

      <h2>広告配信について</h2>
      <p>
        本サイトは、第三者配信の広告サービス（Google AdSense）を利用する場合があります。
        Googleなどの第三者配信事業者は、Cookie（クッキー）を使用して、
        <strong>ユーザーが本サイトや他のサイトに過去にアクセスした際の情報にもとづく広告</strong>
        を配信します。このCookieには氏名・住所・メールアドレス・電話番号などの個人情報は含まれません。
      </p>
      <p>
        Googleが広告Cookieを使用することにより、Googleおよびそのパートナーは、ユーザーが本サイトや他のサイトにアクセスした際の情報にもとづいて適切な広告を表示できます。パーソナライズド広告は
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
        本サイトは、サービス向上のためGoogleが提供するアクセス解析ツール「Googleアナリティクス」を利用する場合があります。Googleアナリティクスはトラフィックデータの収集のためにCookieを使用します。収集されるのは、閲覧されたページ、滞在時間、参照元、大まかな地域、利用された端末やブラウザの種類、および各ツールが操作された回数などで、
        <strong>氏名・住所・メールアドレスなど個人を特定する情報は含まれません</strong>
        。また、各ツールに入力された数値や文字列が送信されることもありません。
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
        本サイトの計算結果および掲載情報は目安であり、その正確性・完全性・最新性を保証するものではありません。本サイトの利用によって生じたいかなる損害についても、運営者は一切の責任を負いかねます。制度に関する正確な情報は、必ず公的機関等の一次情報をご確認ください。
      </p>

      <h2>著作権について</h2>
      <p>
        本サイトに掲載されている文章・画像・プログラム等のコンテンツの著作権は、運営者に帰属します。法律で認められた引用の範囲を超えて、無断で複製・転載・改変・再配布することを禁じます。引用の際は、出典として本サイト名とURLの明記をお願いします。
      </p>
      <p>
        本サイトはリンクフリーです。リンクの際の許可・連絡は不要です。
      </p>

      <h2>プライバシーポリシーの変更</h2>
      <p>
        本ポリシーの内容は、法令の変更やサービス内容の変更に応じて、予告なく改定することがあります。変更後のポリシーは、本ページに掲載した時点で効力を生じるものとします。
      </p>

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>制定日：2026年7月</p>
    </>
  );
}
