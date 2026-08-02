/**
 * 構造化データ（JSON-LD）の共通部品
 *
 * 「誰が作って、いつ更新したページなのか」を機械可読な形でも示すためのもの。
 * お金・健康に関わるページ（YMYL）は、検索エンジンが情報の出どころを
 * 重く見る領域なので、全ページで publisher と dateModified を出している。
 *
 * 発行者は @id で1つに束ねてある。各ページから同じ @id を参照することで、
 * 「同じ運営者による別ページ」として結び付けられる。
 */
import { SITE_NAME, SITE_URL, tools, SITE_UPDATED_AT } from './registry';

/** 発行者。全ページの publisher / author から参照する */
export const PUBLISHER = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#publisher`,
  name: SITE_NAME,
  url: SITE_URL,
  // 運営者情報のページ。検索エンジンにも利用者にも辿れるようにしておく
  mainEntityOfPage: `${SITE_URL}/about/`,
} as const;

/** publisher / author の参照（実体は上の PUBLISHER 側に持たせる） */
export const PUBLISHER_REF = { '@id': `${SITE_URL}/#publisher` } as const;

/** ツールの最終更新日を registry から引く。未登録なら固定ページの更新日 */
export function toolUpdatedAt(slug: string): string {
  return tools.find((t) => t.slug === slug)?.updatedAt ?? SITE_UPDATED_AT;
}

/**
 * ツールページ用の WebApplication。
 * 各ページで同じ形を書き写すと publisher の付け忘れが起きるので関数にしている。
 */
export function webApplication({
  name,
  slug,
  description,
  category = 'UtilitiesApplication',
}: {
  name: string;
  slug: string;
  description: string;
  /** FinanceApplication / HealthApplication / UtilitiesApplication など */
  category?: string;
}) {
  return {
    '@type': 'WebApplication',
    name,
    url: `${SITE_URL}/${slug}/`,
    applicationCategory: category,
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
    description,
    inLanguage: 'ja',
    isAccessibleForFree: true,
    dateModified: toolUpdatedAt(slug),
    publisher: PUBLISHER_REF,
  };
}
