import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import {
  dashidokiFaqAnswer,
  KIBIKI_SOURCE_URL,
  KIBIKI_TABLE,
  EXTRA_LABELS,
  pageDescription,
  pageTitle,
  todayInTokyo,
} from '@/lib/mochu-kibiki';
import Calculator from './Calculator';

/**
 * title・description・FAQ の年賀の日付は**ビルド日（Asia/Tokyo）**と郵便料金 計算機の `NENGA_SCHEDULES` から組み立てる。
 * 日付を文字列に手で書かない（仕様: docs/features/mochu-kibiki-hayami.md の「ページ」）。
 * 年賀の表示期間（前年 11-01〜販売終了）の外でビルドすると、日付の無い文面になる
 */
const buildDay = todayInTokyo();
const title = pageTitle(buildDay);
const description = pageDescription(buildDay);

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/mochu-kibiki/` },
  robots: robotsFor('mochu-kibiki'),
};

const faq = [
  {
    q: '喪中はがきはいつまでに出す？',
    a: dashidokiFaqAnswer(buildDay),
  },
  {
    q: '喪中の期間は法律で決まっていますか？',
    a: '決まっていません。喪中は一般に一周忌（亡くなってから約1年）までとされ、命日から1年以内に迎える正月を喪中の正月として年賀状を控えます。かつては服忌令（明治7年の太政官布告）が忌引きや喪の日数を定めていましたが、昭和22年に廃止されており、いまは法律上の期間はありません。',
  },
  {
    q: '三回忌は亡くなって何年後ですか？',
    a: '2年後です。亡くなった日を一回忌の数え始めとするため、満1年が一周忌、満2年が三回忌、満6年が七回忌になります（n回忌は n − 1 年後）。四十九日は命日を1日目として数えた49日目で、命日の48日後です。',
  },
  {
    q: '会社の忌引き休暇は法律で決まっていますか？',
    a: '民間企業の忌引き休暇は法律上の義務ではなく、労働基準法にも定めはありません。日数や有給か無給かは、お勤め先の就業規則で決まります。国家公務員は人事院規則15-14の別表第二で親族ごとの日数が決まっていて、多くの会社や自治体の規程がこれを下敷きにしています。このツールが出すのはこの国家公務員の基準です。地方公務員は各自治体の条例・規則によります。',
  },
  {
    q: '義理の親（配偶者の父母）は親族ですか？喪中はがきは出しますか？',
    a: '民法上の親族です。民法725条は、6親等内の血族・配偶者・3親等内の姻族を親族としていて、配偶者の父母は一親等の姻族にあたります。喪中はがきも、自分の父母と同じように出すのが一般的です。',
  },
  {
    q: 'いとこは何親等ですか？',
    a: '四親等の血族です。民法726条では、傍系の親族は共通の祖先までさかのぼり、そこから下る世代の数で親等を数えます。いとことの共通の祖先は祖父母なので、2世代さかのぼって2世代下り、合わせて4親等になります。おじ・おばは3親等、甥・姪も3親等です。',
  },
  {
    q: '喪中はがきは何親等まで出しますか？',
    a: '自分または配偶者から見て二親等以内（父母・子・祖父母・兄弟姉妹・孫。配偶者側も同じ）が亡くなったときに出すのが一般的です。法令の決まりではなく慣習なので、三親等以上の親族や親族でない方でも、同居していた・親しくしていた場合には出してかまわないとされます。',
  },
  {
    q: '喪中はがきにはどんなことを書けばよいですか？',
    a: '定型の書き方は「喪中につき年末年始のご挨拶を失礼させていただきます」の一文に、誰が（続柄と名前）いつ何歳で亡くなったか、生前のお付き合いへのお礼、相手の健康を願う一文、差出年月を添える形です。例：「喪中につき年末年始のご挨拶を失礼させていただきます　本年十月に父 ◯◯が八十五歳で永眠いたしました　生前に賜りましたご厚情に深く感謝申し上げます　皆様には良き年をお迎えくださいますようお祈り申し上げます」。句読点を使わないのが慣例とされます。',
  },
];

const trail = breadcrumbFor('mochu-kibiki');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '喪中・忌引き・法要 早見',
      url: `${SITE_URL}/mochu-kibiki/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('mochu-kibiki'),
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

const ext = { target: '_blank', rel: 'nofollow noopener noreferrer' } as const;

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>喪中・忌引き・法要 早見</h1>
      <p className="lead">
        身内を亡くされた方へ。亡くなった方の続柄と命日を選ぶと、<strong>何親等か・喪中はがきを出すのが一般的な範囲か・出す時期・忌引きの日数（国家公務員の基準）・四十九日や一周忌の日付</strong>
        を一度に表示します。法令で決まっている値と、慣習の目安を分けて示します。
      </p>

      <Calculator buildDay={buildDay} />

      <AdUnit position="below-tool" />

      <h2>親等の数え方（民法726条）</h2>
      <p>
        親等は世代の数で数えます。父母や子は1世代なので一親等、祖父母や孫は二親等です。兄弟姉妹やおじ・おばのような傍系の親族は、共通の祖先まで上ってから下る世代の数を足します。兄弟姉妹は父母まで1世代上って1世代下るので二親等、おじ・おばは3親等、いとこは4親等です。
      </p>
      <p>
        配偶者の親族（姻族）は、配偶者から見た親等をそのまま使います。配偶者の父母は一親等の姻族、配偶者の兄弟姉妹は二親等の姻族です。民法725条により、<strong>6親等内の血族・配偶者・3親等内の姻族</strong>が法律上の親族です。離婚すると姻族の関係は終わります（728条）。養子は養親の血族と同じ親族関係になります（727条）。
      </p>

      <h2>忌引きの日数（人事院規則15-14 別表第二）</h2>
      <p>
        国家公務員は、親族が亡くなって葬儀や服喪のために勤務しないことが相当なとき、下の日数の範囲で連続して休めます（第22条第1項第13号）。日数は土日・祝日を含む暦日で数え、葬儀のために遠くへ行くときは往復にかかる日数を足せます。<strong>民間企業の忌引きは法律上の義務ではなく、お勤め先の就業規則が優先します。</strong>
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">亡くなった方</th>
            <th scope="col">日数</th>
          </tr>
        </thead>
        <tbody>
          {KIBIKI_TABLE.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.label}</th>
              <td>
                {row.days}日
                {row.extra && (
                  <span className="hint">
                    （{EXTRA_LABELS[row.extra.when]}場合は{row.extra.days}日）
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>喪中はがきと寒中見舞い</h2>
      <p>
        喪中はがき（年賀欠礼状）は、喪中のため新年のあいさつを控えることを知らせるはがきです。相手が年賀状を準備する前、11月中旬から12月上旬に届くように出すのが一般的です。年賀状の受付が始まってから亡くなった場合や、知らせが間に合わなかった相手には、松の内が明けてから立春の前日（節分）までに寒中見舞いを出して、喪中だったことを伝えます。松の内は1月7日までとする地域が多く、関西の一部では1月15日までとします。
      </p>

      <h2>法要の日付の数え方</h2>
      <p>
        四十九日までの法要は命日を1日目として数えます。初七日は命日の6日後、四十九日（満中陰）は48日後、百か日は99日後です。関西の一部には命日の前日から数える地域があり、その場合は1日早まります。一周忌は1年後の同じ日、三回忌は2年後、七回忌は6年後で、以後は十三回忌・十七回忌・二十三回忌・二十七回忌・三十三回忌と続きます。法要は当日より前の土日に行うことが多いので、計算機ではその日以前の直近の土日も並べています。
      </p>

      <PublicToolLink slug="sozoku-toki-kigen">
        <p>
          相続放棄（3か月）・準確定申告（4か月）・相続税の申告（10か月）・相続登記の期限は
          <ToolLink slug="sozoku-toki-kigen">相続登記の期限チェッカー</ToolLink>で日付を出せます。
        </p>
      </PublicToolLink>
      <PublicToolLink slug="sozokuzei-keisan">
        <p>
          相続税がかかるかどうかは<ToolLink slug="sozokuzei-keisan">相続税 計算機</ToolLink>で確かめられます。
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

      <RelatedTools current="mochu-kibiki" />

      <ToolMeta slug="mochu-kibiki">
        親等と親族の範囲は
        <a href="https://laws.e-gov.go.jp/law/129AC0000000089" {...ext}>
          民法（725条〜728条）
        </a>
        を、忌引きの日数は
        <a href={KIBIKI_SOURCE_URL} {...ext}>
          人事院規則15-14（職員の勤務時間、休日及び休暇）第22条・別表第二
        </a>
        を、年賀状の受付開始日は
        <a
          href="https://files.japanpost.jp/assets/34d9d11432734cfaa759e78fe395b688/159168aef19d465baf3350d358e46fa9/20260831_02_06.pdf"
          {...ext}
        >
          日本郵便「2027（令和9）年用年賀はがきの発行・販売等」
        </a>
        を、立春の日は
        <a href="https://eco.mtk.nao.ac.jp/koyomi/yoko/2027/rekiyou272.html" {...ext}>
          国立天文台「令和9年暦要項」
        </a>
        を参照しています。喪中はがきを出す範囲・時期と法要の日取りは法令ではなく慣習で、地域・宗派・家庭によって異なります。忌引きの日数は国家公務員の基準で、お勤め先の就業規則が優先します。
      </ToolMeta>
    </>
  );
}
