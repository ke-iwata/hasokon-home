import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from '@/lib/registry';

export const metadata: Metadata = {
  title: 'お問い合わせ',
  description: `${SITE_NAME}へのお問い合わせ方法のご案内です。`,
  alternates: { canonical: `${SITE_URL}/contact/` },
};

/** 【データ更新箇所】お問い合わせ用のGoogleフォーム */
const CONTACT_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScNoh6HZoekO-nlb_BHSvk755ZAVXWEtsmF3ttZP-hRDTCOhw/viewform';

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
