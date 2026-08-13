import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';

const title = '在職老齢年金 計算機｜令和8年4月から基準額は65万円（62万円ではありません）';
const description =
  '働きながら老齢厚生年金をもらうと、いくら支給停止されるかを計算。令和8年4月から支給停止調整額が月51万円→65万円に引き上げられました。改正前との差額、あといくら稼げば止まり始めるか、止まらない老齢基礎年金を含めた受取総額まで出ます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/zaishoku-rorei-nenkin/` },
};

const faq = [
  {
    q: '在職老齢年金の基準額は62万円ですか？ 65万円ですか？',
    a: '令和8年度に実際に適用される額は65万円です。「62万円」は令和7年年金制度改正法（令和7年法律第74号）に書かれた令和6年度水準の額で、そのまま使われる額ではありません。支給停止調整額は毎年度、賃金の変動に応じて改定されるため、名目賃金変動率を織り込んだ結果、令和8年度は65万円になっています。62万円で計算すると、賃金と年金の合計が62万〜65万円の方について「年金が減る」と誤った結果が出ます（実際には全額支給です）。',
  },
  {
    q: 'いくら稼ぐと年金が止まりますか？',
    a: '基本月額（老齢厚生年金の報酬比例部分の月額）と総報酬月額相当額（毎月の標準報酬月額＋直近1年間の標準賞与額の合計÷12）の合計が65万円を超えると、超えた額の半分が止まります。たとえば基本月額10万円の方なら、総報酬月額相当額が55万円までは1円も止まりません。超えたあとも「超えた分の半分」しか止まらないため、働いた分の手取りが逆転することはありません。',
  },
  {
    q: '老齢基礎年金も止まりますか？',
    a: '止まりません。在職による支給停止の対象は老齢厚生年金の報酬比例部分だけです。老齢基礎年金と経過的加算額は、働いていても全額支給されます。ニュースなどで「年金が止まる」と聞いて全部が止まると思われがちですが、実際に止まるのは厚生年金の一部です。',
  },
  {
    q: '加給年金はどうなりますか？',
    a: '加給年金額は基本月額に含めずに計算します。ただし、計算の結果として老齢厚生年金が全部支給停止になった場合は、加給年金額も支給停止になります。一部支給停止で済んでいる間は加給年金は全額受け取れます。',
  },
  {
    q: '70歳を過ぎても年金は止まりますか？',
    a: '止まります。70歳以上は厚生年金保険の被保険者ではなくなるため保険料の負担はありませんが、在職による支給停止の仕組みは同じように適用されます。標準報酬月額の代わりに「標準報酬月額に相当する額」で総報酬月額相当額を計算します。',
  },
  {
    q: '厚生年金基金に加入していた期間があります',
    a: '厚生年金基金の加入期間がある場合は、基金が代行している部分を「国が支払うべき年金額」とみなして基本月額を算出します。そのため本ツールの結果とは金額が変わります。代行部分の額はねんきん定期便には分けて書かれていないことが多いので、正確な金額は年金事務所にご確認ください。',
  },
  {
    q: '共済組合からも年金をもらっています',
    a: '共済組合等からも老齢厚生年金を受け取っている場合は、すべての老齢厚生年金を合わせた額で支給停止の判定を行い、支給停止の総額をそれぞれの年金額に応じて割り振ります。本ツールは単一の年金を前提にしているため、複数から受け取っている方は年金事務所にご確認ください。',
  },
  {
    q: '働き続けると年金額は増えますか？',
    a: '増えます。65歳以上で厚生年金に加入しながら働いている方は、毎年9月1日を基準日として年金額が見直され、翌10月分から反映されます（在職定時改定）。退職したときにも、それまでの加入期間を反映して年金額が計算し直されます（退職改定）。増える額は加入期間と報酬によるため、本ツールでは計算していません。',
  },
];

const trail = breadcrumbFor('zaishoku-rorei-nenkin');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '在職老齢年金 計算機',
      url: `${SITE_URL}/zaishoku-rorei-nenkin/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('zaishoku-rorei-nenkin'),
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>在職老齢年金 計算機</h1>
      <p className="lead">
        働きながら老齢厚生年金を受け取ると、賃金と年金の合計によっては年金の一部が止まります。
        <strong>令和8年4月から、その基準額は月51万円から65万円に引き上げられました。</strong>
        いくら止まるのか、改正前と比べていくら増えるのか、あといくら稼げるのかを計算します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>「62万円」ではなく「65万円」です</h2>
      <p>
        令和7年年金制度改正法（<strong>令和7年法律第74号</strong>
        ）による引き上げについて、「62万円に引き上げ」と書いている解説記事が数多くあります。
        しかし<strong>62万円は法律に書かれた令和6年度水準の額で、実際に適用される額ではありません。</strong>
      </p>
      <p>
        支給停止調整額は毎年度、賃金の変動に応じて改定されます。名目賃金変動率を織り込んだ結果、
        <strong>令和8年度に実際に使われる額は65万円</strong>です。日本年金機構の案内にも
        「令和8年4月から、年金が減額になる基準額（賃金と老齢厚生年金の合計）が月51万円から
        <strong>65万円</strong>に引き上げられました」「※令和8年度の基準額で、毎年度、賃金の変動に応じて改定されます」
        と明記されています。
      </p>
      <p>
        この3万円の差は実害になります。賃金と年金の合計が
        <strong>62万円〜65万円の帯にいる方</strong>は、62万円で計算すると「年金が減る」と出ますが、
        実際には<strong>全額支給</strong>です。結論が逆になるため、本ツールは65万円で計算しています。
      </p>

      <h2>在職老齢年金の計算方法</h2>
      <p>使う数字は2つだけです。</p>
      <ul>
        <li>
          <strong>基本月額</strong>：加給年金額を除いた老齢厚生年金（報酬比例部分）の月額。
          年金の年額を12で割った額です
        </li>
        <li>
          <strong>総報酬月額相当額</strong>：その月の標準報酬月額 ＋
          （その月以前1年間の標準賞与額の合計 ÷ 12）
        </li>
      </ul>
      <p>この2つを足して、支給停止調整額（令和8年度は65万円）と比べます。</p>
      <ul>
        <li>
          合計が<strong>65万円以下</strong> → 年金は<strong>全額支給</strong>
        </li>
        <li>
          合計が<strong>65万円超</strong> → 支給月額 ＝ 基本月額 −（合計 − 65万円）÷ 2
        </li>
      </ul>
      <p>
        止まるのは<strong>超えた分の「半分」</strong>です。たとえば基本月額10万円・総報酬月額相当額46万円の方は
        合計56万円なので全額支給されますが、改正前の基準額（51万円）なら
        （56万 − 51万）÷ 2 ＝ 2.5万円が止まっていました。改正で月2.5万円・年30万円ぶん受け取れる額が増えたことになります。
      </p>

      <h2>止まるのは厚生年金の一部だけ</h2>
      <p>
        「働くと年金が止まる」と聞くと年金全部が止まるように思えますが、
        在職による支給停止の対象は<strong>老齢厚生年金の報酬比例部分だけ</strong>です。
        <strong>老齢基礎年金と経過的加算額は対象外で、働いていても全額受け取れます。</strong>
        本ツールで老齢基礎年金の年額を入れると、止まらない分を含めた受取総額が出ます。
      </p>
      <p>
        なお、計算の結果として年金支給月額がマイナスになる場合は、老齢厚生年金は
        <strong>全部支給停止</strong>となり、このとき<strong>加給年金額も止まります</strong>。
        本ツールはマイナスの金額を表示せず、0円と全部支給停止である旨を出します。
      </p>

      <h2>70歳以上でも支給停止はあります</h2>
      <p>
        70歳以上は厚生年金保険の被保険者ではなくなるため保険料の負担はありませんが、
        在職による支給停止は同じように行われます。総報酬月額相当額は
        「標準報酬月額に相当する額」で計算します。
      </p>

      <div className="note">
        本ツールの計算は目安です。老齢厚生年金の額そのもの（報酬比例部分）は、全期間の標準報酬月額の履歴と加入月数から決まるため、本ツールでは推計せず、ねんきん定期便・ねんきんネットの数字を入れていただく設計にしています。厚生年金基金の加入期間がある場合や、共済組合等からも老齢厚生年金を受け取っている場合は、算定の方法が変わります。正確な金額は年金事務所・ねんきんダイヤルにご確認ください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="zaishoku-rorei-nenkin" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/hatarakizon/">社会保険 損得計算機</Link>／
        <Link href="/nenshu-kabe/">年収の壁 計算機</Link>
      </p>

      <ToolMeta slug="zaishoku-rorei-nenkin" ymyl>
        出典：
        <a
          href="https://www.nenkin.go.jp/tokusetsu/zairoukaisei.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          日本年金機構「在職老齢年金制度が改正されました」
        </a>
        ／
        <a
          href="https://www.nenkin.go.jp/service/jukyu/seido/roureinenkin/zaishoku/20150401-01.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          日本年金機構「在職老齢年金の計算方法」
        </a>
        にもとづき作成。支給停止調整額は令和8年度の額（65万円）で、毎年度、賃金の変動に応じて改定されます。
      </ToolMeta>
    </>
  );
}
