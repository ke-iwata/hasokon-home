import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/registry';

export const metadata: Metadata = {
  title: 'お問い合わせ',
  description: `${SITE_NAME}へのお問い合わせ方法のご案内です。`,
};

// ★ 公開前にGoogleフォームを作成してURLを差し替えてください
const CONTACT_FORM_URL = 'https://forms.gle/XXXXXXXXXXXX';

export default function ContactPage() {
  return (
    <>
      <h1>お問い合わせ</h1>
      <p className="lead">
        本サイトに関するお問い合わせ（内容の誤りのご指摘・ご意見・ご要望など）は、以下のフォームよりお願いいたします。
      </p>
      <p>
        <a href={CONTACT_FORM_URL} target="_blank" rel="nofollow noopener noreferrer">
          お問い合わせフォーム（Googleフォーム）
        </a>
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        内容の確認までお時間をいただく場合があります。あらかじめご了承ください。
      </p>
    </>
  );
}
