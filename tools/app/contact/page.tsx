import type { Metadata } from 'next';
import { SITE_NAME, SITE_UPDATED_AT, SITE_URL } from '@/lib/registry';
import { PUBLISHER_REF } from '@/lib/jsonld';

export const metadata: Metadata = {
  title: 'お問い合わせ',
  description: `${SITE_NAME}へのお問い合わせ方法のご案内です。`,
  alternates: { canonical: `${SITE_URL}/contact/` },
};

/** 【データ更新箇所】お問い合わせ用のGoogleフォーム */
const CONTACT_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScNoh6HZoekO-nlb_BHSvk755ZAVXWEtsmF3ttZP-hRDTCOhw/viewform';

/** 運営主体を機械可読にも示す。発行者の実体はトップページ側にある */
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  name: 'お問い合わせ',
  url: `${SITE_URL}/contact/`,
  inLanguage: 'ja',
  dateModified: SITE_UPDATED_AT,
  publisher: PUBLISHER_REF,
};

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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
