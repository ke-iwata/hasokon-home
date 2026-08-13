import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { toYm } from '@/lib/kogaku-ryoyohi';
import Calculator from './Calculator';

const title = '高額療養費 自己負担限度額 計算機｜2026年8月改正・年間上限に対応';
const description =
  '入院や手術で医療費が高額になったとき、1か月の自己負担がいくらまでで済むかを計算。2026年8月の改正後の限度額と、新設された年間上限（8月〜翌年7月）に対応。改正前の額と並べて表示し、多数回該当（4か月目以降）の額とあとで戻る金額もわかります。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/kogaku-ryoyohi/` },
};

const faq = [
  {
    q: '2026年8月から高額療養費はどう変わりましたか？',
    a: '令和8年8月1日の診療分から、月単位の自己負担限度額が引き上げられ、あわせて「年間上限（年単位の上限額）」が新設されました。たとえば70歳未満・年収約370万〜約770万円の区分（区分ウ）では、限度額が「80,100円＋（医療費−267,000円）×1%」から「85,800円＋（医療費−286,000円）×1%」に変わり、年間上限53万円が設けられています。一方で多数回該当（4か月目以降）の金額は据え置かれました。なお令和9年8月からは、70歳未満の所得区分が13区分に細分化される第2段階の見直しが予定されています。',
  },
  {
    q: '新しくできた「年間上限」とは何ですか？',
    a: '8月から翌年7月までの1年間に支払った自己負担の累計に上限を設ける仕組みです。月ごとの限度額に届かない支払いが続く長期療養の方でも、累計が年間上限に達すればそれ以降の負担が不要になります。70歳未満の区分ウ・区分エなら53万円、区分オ（住民税非課税）なら29万円、区分アなら168万円です。月単位の限度額に届かない月が積み重なる方への配慮として新設されました。',
  },
  {
    q: '2026年7月に入院した分はどちらの限度額になりますか？',
    a: '限度額は「診療を受けた月」で決まるため、2026年7月以前の診療分には改正前の限度額（区分ウなら80,100円＋1%）が適用されます。7月末から8月初めにまたがる入院では、7月分と8月分がそれぞれ別の月として計算されます。本ツールでは診療月を選べるようにしてあり、改正前後どちらの額も並べて表示します。',
  },
  {
    q: '多数回該当とは何ですか？',
    a: '直近12か月のあいだに高額療養費の支給を3回以上受けると、4回目からは限度額がさらに下がる仕組みです。70歳未満の区分ウなら44,400円、区分ア（年収約1,160万円〜）なら140,100円になります。今回の改正では、長期に治療を続ける方の負担を増やさないよう多数回該当の金額は据え置かれました。',
  },
  {
    q: '70歳以上は計算が違いますか？',
    a: '違います。70歳以上には「外来（個人ごと）」の限度額（外来特例）があり、一般区分では入院を含む世帯単位の61,500円に対して、外来だけなら22,000円（年間上限216,000円）で済みます。窓口負担割合も原則2割（75歳以上で一定所得未満は1割、現役並み所得者は3割）です。本ツールでは年齢区分を70歳以上にすると、外来のみか入院を含むかを選べます。',
  },
  {
    q: '差額ベッド代や食事代も限度額に含まれますか？',
    a: '含まれません。高額療養費の対象は保険適用の診療に対する自己負担のみで、入院時の食事代、差額ベッド代（特別療養環境室料）、先進医療にかかる費用、保険外の自由診療は対象外です。これらは限度額を超えて支払う必要があるため、入院費用の見積もりでは別途見込んでおいてください。',
  },
  {
    q: '限度額を超える分は必ずあとから戻ってくるのですか？',
    a: '申請すれば払い戻されますが、「限度額適用認定証」またはマイナ保険証を医療機関の窓口に提示すれば、はじめから限度額までの支払いで済みます（現物給付）。あとから請求する場合は、加入している健康保険（協会けんぽ・健保組合・国民健康保険・後期高齢者医療広域連合）への申請が必要で、受診月から払い戻しまで3か月以上かかるのが一般的です。',
  },
];

const trail = breadcrumbFor('kogaku-ryoyohi');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '高額療養費 自己負担限度額 計算機',
      url: `${SITE_URL}/kogaku-ryoyohi/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('kogaku-ryoyohi'),
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

      <h1>高額療養費 自己負担限度額 計算機</h1>
      <p className="lead">
        1か月の医療費が高額になったとき、自己負担がいくらまでで済むかを計算します。2026年8月の改正後の限度額と、新設された年間上限（8月〜翌年7月）に対応。改正前の額と並べて表示します。
      </p>

      <Calculator buildMonth={toYm(new Date())} />

      <AdUnit position="below-tool" />

      <h2>高額療養費制度とは</h2>
      <p>
        高額療養費は、<strong>同じ月（1日から末日まで）の医療費の自己負担が一定額を超えたとき、超えた分が払い戻される</strong>
        制度です。上限（自己負担限度額）は年齢と所得によって決まり、収入が高いほど高く設定されています。健康保険（協会けんぽ・健保組合）でも国民健康保険でも、公的医療保険に加入していれば誰でも対象です。
      </p>
      <p>
        窓口で3割を払ったあとに申請して払い戻す方法のほか、<strong>限度額適用認定証やマイナ保険証を提示すれば、はじめから限度額までの支払いで済みます</strong>
        。高額な入院や手術が決まっている場合は、先に手続きをしておくと一時的な立て替えが要りません。
      </p>

      <h2>2026年8月の改正で変わったこと</h2>
      <p>
        令和8年8月1日の診療分から、次の2つが変わりました。制度改正は2段階になっていて、所得区分の13区分への細分化は令和9年8月からの第2段階として続きます。
      </p>
      <ol>
        <li>
          <strong>月単位の限度額の引上げ</strong>
          — 一人当たり医療費の増加を踏まえた見直し。区分ウ（年収約370万〜約770万円）では 80,100円＋1% が 85,800円＋1% に
        </li>
        <li>
          <strong>年間上限（年単位の上限額）の新設</strong>
          — 8月から翌年7月までの自己負担の累計に上限を設ける仕組み。月単位の限度額に届かない支払いが続く長期療養者への配慮
        </li>
      </ol>
      <p>
        あわせて、<strong>多数回該当（直近12か月に3回以上該当した場合の4か月目以降の額）は据え置き</strong>
        になりました。長期に治療を続けている方の負担を増やさないためです。
      </p>

      <h3>70歳未満の自己負担限度額（令和8年8月〜令和9年7月の診療分）</h3>
      <table>
        <thead>
          <tr>
            <th>所得区分（標準報酬月額）</th>
            <th>月単位の上限</th>
            <th>多数回該当</th>
            <th>年間上限</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>区分ア（83万円以上）</td>
            <td>270,300円＋（医療費−901,000円）×1%</td>
            <td>140,100円</td>
            <td>1,680,000円</td>
          </tr>
          <tr>
            <td>区分イ（53万〜79万円）</td>
            <td>179,100円＋（医療費−597,000円）×1%</td>
            <td>93,000円</td>
            <td>1,110,000円</td>
          </tr>
          <tr>
            <td>区分ウ（28万〜50万円）</td>
            <td>85,800円＋（医療費−286,000円）×1%</td>
            <td>44,400円</td>
            <td>530,000円</td>
          </tr>
          <tr>
            <td>区分エ（26万円以下）</td>
            <td>61,500円</td>
            <td>44,400円</td>
            <td>530,000円</td>
          </tr>
          <tr>
            <td>区分オ（住民税非課税）</td>
            <td>36,900円</td>
            <td>24,600円</td>
            <td>290,000円</td>
          </tr>
        </tbody>
      </table>
      <p className="hint">
        年収換算の目安は、区分ア 約1,160万円〜／区分イ 約770万〜約1,160万円／区分ウ
        約370万〜約770万円／区分エ 〜約370万円。年収約200万円以下（標準報酬月額15万円以下）と確認された方は年間上限が41万円になり、令和9年8月以降に償還払いで精算されます。
      </p>

      <h2>限度額は「診療を受けた月」で決まる</h2>
      <p>
        改正の適用は<strong>診療月が基準</strong>です。2026年7月以前に受けた診療には改正前の限度額が適用され、2026年8月以降の診療分から新しい限度額になります。月をまたぐ入院では、7月分と8月分がそれぞれ別の月として計算されます。本ツールでは診療月を選べるようにしてあり、改正前後の両方の額を並べて表示します。
      </p>

      <div className="note">
        高額療養費の対象は<strong>保険適用の診療分だけ</strong>です。入院時の食事代・差額ベッド代（特別療養環境室料）・先進医療の費用・自由診療は対象外で、限度額とは別に支払う必要があります。また本ツールは本人1人・1か月・1つの医療機関分の目安で、世帯合算（同じ世帯の21,000円以上の自己負担の合算）や健康保険組合の付加給付は含みません。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="kogaku-ryoyohi" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/shobyo-teate/">傷病手当金 計算機</Link>
        （病気やケガで働けない間の収入）／
        <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link>
      </p>

      <ToolMeta slug="kogaku-ryoyohi" ymyl>
        出典：
        <a
          href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/juuyou/kougakuiryou/index.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省「高額療養費制度を利用される皆さまへ」
        </a>
        および同ページの
        <a
          href="https://www.mhlw.go.jp/content/001726232.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          「高額療養費制度の見直しについて（令和8年8月診療分から）」
        </a>
        にもとづき作成。
      </ToolMeta>
    </>
  );
}
