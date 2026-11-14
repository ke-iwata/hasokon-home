import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import { HATSUHINODE_YEAR } from '@/lib/hinode';
import Calculator from './Calculator';
import HatsuhinodeList from './HatsuhinodeList';
import { description, faq, title } from './copy';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hinode-hinoiri/` },
  robots: robotsFor('hinode-hinoiri'),
};

const trail = breadcrumbFor('hinode-hinoiri');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '日の出・日の入り 計算機',
      url: `${SITE_URL}/hinode-hinoiri/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('hinode-hinoiri'),
      publisher: PUBLISHER_REF,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
      description,
    },
    {
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    breadcrumbList(trail),
  ],
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>日の出・日の入り 計算機</h1>
      <p className="lead">
        地点と日付を選ぶと、日の出・日の入り・昼の長さを分単位で出します。初日の出の時刻を47都道府県で並べることもできます。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>{HATSUHINODE_YEAR}年の初日の出の時刻（47都道府県・早い順）</h2>
      <p>
        {HATSUHINODE_YEAR}年1月1日の日の出を、都道府県庁の位置・海抜0mで計算して早い順に並べました。
        はじめは早い5地点・遅い5地点と東京都だけを出しています。
      </p>
      <HatsuhinodeList year={HATSUHINODE_YEAR} selected="東京都" />

      <h2>計算のしかた</h2>
      <ul>
        <li>
          太陽の位置は、ユリウス日から平均近点角・黄経・均時差・赤緯を出す一般的な近似式で求めています（Jean
          Meeus『Astronomical Algorithms』の低精度式。米国 NOAA の太陽計算と同じ系統）。誤差は日本の緯度でおおむね1分以内です。
        </li>
        <li>
          日の出・日の入りは<strong>太陽の上辺が地平線に接する時刻</strong>です（国立天文台と同じ定義）。
          地平線での大気差 約35′と太陽の視半径 約16′を合わせて、太陽の中心の高度が −0.8333° になる時刻を、
          時刻を入れ直しながら3回反復して求めています。
        </li>
        <li>南中は太陽が真南に来る（最も高くなる）時刻、昼の長さは日の出から日の入りまでの長さです。</li>
        <li>
          時刻は日本標準時（UTC+9）です。日本には夏時間がありません。緯度・経度に日本の外の値を入れても、時刻は日本時間で表示します。
        </li>
        <li>冬至・夏至の日付は、太陽の視黄経が270°・90°になる日（日本時間）を計算で求めています。</li>
      </ul>
      <PublicToolLink slug="sleep-cycle">
        <p>
          朝日に合わせて起きる時刻を決めるなら、<ToolLink slug="sleep-cycle">睡眠サイクル計算機</ToolLink>
          で就寝時刻を逆算できます。
        </p>
      </PublicToolLink>
      <PublicToolLink slug="renkyu-keisan">
        <p>
          年末年始の休みの日数は<ToolLink slug="renkyu-keisan">連休計算</ToolLink>で数えられます。
        </p>
      </PublicToolLink>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="hinode-hinoiri" />

      <ToolMeta slug="hinode-hinoiri">
        出典：
        <a href="https://eco.mtk.nao.ac.jp/koyomi/dni/" target="_blank" rel="nofollow noopener noreferrer">
          国立天文台 暦計算室「各地のこよみ」
        </a>
        （日の出・日の入りの定義と検算）／
        <a href="https://eco.mtk.nao.ac.jp/koyomi/yoko/" target="_blank" rel="nofollow noopener noreferrer">
          国立天文台 暦計算室「暦要項」
        </a>
        （冬至・夏至の日付）／
        <a href="https://maps.gsi.go.jp/" target="_blank" rel="nofollow noopener noreferrer">
          国土地理院「地理院地図」
        </a>
        （都道府県庁の緯度・経度。庁舎の所在地から取得）／Jean Meeus, <i>Astronomical Algorithms</i>（2nd ed.,
        1998）第15章・第25章。時刻は海抜0m・地平線が見通せる場所での計算値で、実際に見える時刻とは地形・建物・天候で異なります。
      </ToolMeta>
    </>
  );
}
