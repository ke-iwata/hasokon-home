import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import Calculator from './Calculator';
import {
  DISCOUNT_EXCLUSIVE,
  DISCOUNT_INCLUSIVE,
  DISCOUNT_PERCENT_FIRST,
  PACK_TOTAL,
  PER_100G,
  PER_1KG,
  POINT_EXAMPLE,
  RAISE,
  SHRINK,
  TAX_EXAMPLE,
} from './tables';

// 仕様: docs/features/tanka-hikaku.md
const title = '単価比較 計算機（100gあたり・どっちが安い）— g/kg・ml/Lの混在、まとめ買い、割引・ポイント込みで何品でも';
const description =
  '値段と内容量から100g・100ml・1個あたりの単価を計算して、何品でも安い順に並べます。gとkg、mlとLの混在、「350ml×6缶×2」のようなまとめ買い、税込・税抜、◯%引き・◯円引き・ポイントもそろえて比較。前の内容量と比べる実質値上げ率も。単価計算の入力は送信しません。';

export const metadata: Metadata = {
  title,
  description,
  keywords: ['単価 計算', '単価比較', '100g あたり 計算', 'どっちが安い 計算', 'グラム単価 比較', '実質値上げ 計算'],
  alternates: { canonical: `${SITE_URL}/tanka-hikaku/` },
  robots: robotsFor('tanka-hikaku'),
};

const faq = [
  {
    q: '「100gあたり」と「1kgあたり」はどう違いますか？',
    a: `同じ比べ方で、数字の大きさが違うだけです。1kg 498円なら100gあたり${PER_100G}円、1kgあたり${PER_1KG}円で、どちらで比べても順位は変わりません。見慣れたほうに切り替えてください（量は100ml／1L、数は1個／10個あたり）。`,
  },
  {
    q: '税込と税抜が混ざった値札はどう比べますか？',
    a: `消費者向けの値札は税込の総額表示が原則（消費税法63条）ですが、「本体価格298円（税込321円）」のように税抜を大きく書く売り場もあります。税抜の行は税率を選ぶと税込に直してから比べます（税抜8% 298円 → ${TAX_EXAMPLE}円。1円未満は切り捨て）。食品は軽減税率の8%、日用品は10%です。税込への直し方の端数は店により異なります。`,
  },
  {
    q: 'ポイント還元は単価に入れていいですか？',
    a: `比べるための「実質の値段」としてなら入れられます。支払う額は変わらないので、このツールは支払額と実質を分けて出し、順位は実質で付けます。ポイントは税込の支払額（割引後）に掛けて1ポイント未満を切り捨てています（232円の5%なら${POINT_EXAMPLE.points}ポイント、実質${POINT_EXAMPLE.effective}円）。税抜の額に掛ける店や、端数の扱いが違う店もあります。`,
  },
  {
    q: '「実質値上げ」はどう計算しますか？',
    a: `単価の変化率＝（今の値段÷今の内容量）÷（前の値段÷前の内容量）−1 です。値段が同じ198円でも、200gが180gに減れば単価は${SHRINK}。量が同じ200gで198円が218円になったとき（${RAISE}）より大きな値上げになります。`,
  },
  {
    q: '量の多いほうがいつも得ですか？',
    a: '単価が安くても、使い切れずに捨てる分・保存の場所や手間・賞味期限は計算に入っていません。たくさん入った袋の単価が安くても、半分を捨てるなら実際の単価は倍です。使い切れる量かどうかは別に考えてください。',
  },
];

const trail = breadcrumbFor('tanka-hikaku');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '単価比較 計算機（100gあたり・どっちが安い）',
      url: `${SITE_URL}/tanka-hikaku/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('tanka-hikaku'),
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

      <h1>単価比較 計算機（100g あたり・どっちが安い）</h1>
      <p className="lead">
        値段と内容量を入れると、100g・100ml・1個あたりの単価を出して安い順に並べます（単価計算）。g と kg、ml と L が混ざっていても、
        「350ml×6缶×2パック」のようなまとめ買いでも、税込・税抜、◯%引き・◯円引き・ポイントがあってもそろえてから比べます。
        品は何品でも足せます。前の値段・内容量と比べる「実質値上げ率」も出せます。入力はどこにも送りません。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>単位がそろっていなくても比べられる</h2>
      <p>
        重さは g、量は ml に直してから比べます（1.5kg は 1,500g、0.5L は 500ml）。入り数を入れると掛けた合計で比べ、
        350ml×6缶×2パックなら {PACK_TOTAL.toLocaleString('ja-JP')}ml です。個・枚・本・回分は換算できないので、同じ単位どうしだけを比べます。
        g と ml は食品ごとに比重が違うので換算しません。単位の違う品は「単位が違います」と出して順位から外します。
      </p>

      <h2>割引とポイントを掛ける順序</h2>
      <p>
        割引は入れた値段に掛けます。税込の値札なら税込の値段に、税抜の値札なら税抜の値段に掛けて、そのあとで税込に直します（消費税は値引き後の対価に掛かるため）。
        順序は<strong>円引き → %引き</strong>です。商品に貼る値引きシール（◯円引き）が先にあって、レジの会員割引・クーポン（◯%引き）があとから掛かる売り場が多いためで、
        結果の欄にも「30円引きのあと20%引きで計算」と順序を書きます。端数は途中で丸めず、最後に1回だけ1円未満を切り捨てます。
      </p>
      <ul>
        <li>税込 321円 → 30円引き 291円 → 20%引き 232.8円 → <strong>{DISCOUNT_INCLUSIVE}円</strong>（%引きを先に掛けると {DISCOUNT_PERCENT_FIRST}円になります）</li>
        <li>税抜 8% 298円 → 30円引き 268円 → 20%引き 214.4円 → 税込 231.552円 → <strong>{DISCOUNT_EXCLUSIVE}円</strong></li>
      </ul>
      <p>
        ポイントは支払う額には入れず、比べるための実質の値段として別に出します（支払額 232円・ポイント5% → {POINT_EXAMPLE.points}ポイント → 実質 {POINT_EXAMPLE.effective}円）。
      </p>

      <h2>同じ値段で買える量に言い換える</h2>
      <p>
        単価の差は「◯円（◯%）高い」と出すほか、高いほうの値段でいちばん安い品ならどれだけ買えるかも出します。単価は小数第2位までの表示ですが、
        順位は丸める前の値で付けます。差が 0.1% 未満のときは「ほぼ同じ」と出します。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="tanka-hikaku" />

      <PublicToolLink slug="waribiki-percent">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          割引後の値段だけを出すなら：<ToolLink slug="waribiki-percent">割引・パーセント計算</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="shohizei-keisan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          税込・税抜の換算：<ToolLink slug="shohizei-keisan">消費税計算</ToolLink>
        </p>
      </PublicToolLink>
      <PublicToolLink slug="warikan">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          まとめ買いを分けるなら：<ToolLink slug="warikan">割り勘計算</ToolLink>
        </p>
      </PublicToolLink>

      <ToolMeta slug="tanka-hikaku">
        出典：
        <a href="https://laws.e-gov.go.jp/law/363AC0000000108" target="_blank" rel="nofollow noopener noreferrer">
          消費税法（昭和63年法律第108号）第63条（価格の表示）
        </a>
        （e-Gov 法令検索。2026年11月19日に本文を確認）／
        <a href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6902.htm" target="_blank" rel="nofollow noopener noreferrer">
          国税庁 タックスアンサー No.6902「総額表示」の義務付け
        </a>
        。税込への直し方・ポイントの掛け方の端数は店により異なります。特定の商品・店の価格は扱いません。
      </ToolMeta>
    </>
  );
}
