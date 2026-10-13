import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { ToolLink } from '@/app/PublicToolLink';
import {
  JUMIN_NEW,
  JUMIN_OLD,
  SHOTOKU_NEW,
  SHOTOKU_NEW_TOKUREI,
  SHOTOKU_OLD,
  type Table,
} from '@/lib/seimei-hokenryo-kojo';
import Calculator from './Calculator';

const title = '生命保険料控除 計算機【令和8年分】23歳未満の扶養6万円の特例に対応';
const description =
  '控除証明書の支払額を新・旧契約×3区分（一般・介護医療・個人年金）で入れると、年末調整の保険料控除申告書に書く生命保険料控除の額を所得税・住民税で計算。令和8年分から、23歳未満の扶養親族がいる人は一般の生命保険料控除の上限が4万円→6万円に。新旧の有利な採り方も自動で選びます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/seimei-hokenryo-kojo/` },
  robots: robotsFor('seimei-hokenryo-kojo'),
};

const faq = [
  {
    q: '新契約と旧契約はどう見分けますか？',
    a: '2012年（平成24年）1月1日以後に結んだ契約が新契約、2011年12月31日以前に結んだ契約が旧契約です。控除証明書に「新」「旧」と書かれているので、それに従ってください。旧契約でも、2012年以後に更新・特約の中途付加などをすると、その月以後の保険料は新契約の扱いになります。',
  },
  {
    q: '旧契約の医療保険はどの欄に入れますか？',
    a: '「一般の生命保険料・旧契約」の欄です。介護医療保険料の区分は2012年以後の新契約にしかありません。旧契約の医療保険・がん保険などは、一般の生命保険料（旧）としてまとめて計算します。',
  },
  {
    q: '「23歳未満の扶養親族」は誰が入りますか？',
    a: '2026年12月31日時点で23歳未満（平成16年1月2日以後に生まれた人）の、生計を一にする親族（配偶者を除く）で、合計所得金額が62万円以下（給与だけなら年収136万円以下）の人です。16歳未満の子も含みます（扶養控除の対象外でも「扶養親族」には当たります）。12月31日に生まれた子でも当てはまります。19〜22歳で所得が62万円を超える子（特定親族）は含みません。共働きの夫婦は、子が1人でも夫婦の両方がこの特例を使えます（扶養控除のようにどちらか1人に振り分けません）。',
  },
  {
    q: '特例はいつまでですか？',
    a: '令和8年分（2026年）と令和9年分（2027年）の2年分です（租税特別措置法41条の15の5）。令和7年度の税制改正で令和8年分として作られ、令和8年度の改正で令和9年分まで延長されました。令和10年分以後は、延長の改正があるまで上限4万円に戻ります。',
  },
  {
    q: '控除証明書がまだ届いていない保険料（12月に払う分）はどうしますか？',
    a: '控除証明書の「申告額」は、その年の12月まで払い続けたと見込んだ額で書かれていることが多いので、通常はその額をそのまま入れます。年の途中で解約・払込が終わったものは、実際に払う額を入れてください。年末調整に間に合わなかった分は、確定申告で控除を受けられます。',
  },
  {
    q: '住民税の上限が7万円なのはなぜですか？',
    a: '住民税の生命保険料控除は地方税法で別の表が決められていて、1区分の上限が2.8万円（旧契約だけなら3.5万円）、3区分の合計の上限が7万円です。所得税（1区分4万円・合計12万円）とは別に計算します。23歳未満の扶養親族の特例は所得税だけの改正で、住民税の表は変わっていません。',
  },
];

const trail = breadcrumbFor('seimei-hokenryo-kojo');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '生命保険料控除 計算機',
      url: `${SITE_URL}/seimei-hokenryo-kojo/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('seimei-hokenryo-kojo'),
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

const man = (v: number) => `${(v / 10_000).toLocaleString('ja-JP')}万円`;

/** 控除額の表の行。額は lib の定数から作る（本文に手で書かない） */
function tableRows(t: Table): { range: string; formula: string }[] {
  let from = 0;
  const rows = t.brackets.map((b) => {
    const range = from === 0 ? `${man(b.upTo)}以下` : `${man(from)}超 ${man(b.upTo)}以下`;
    const formula =
      b.rate === 1 ? '支払額の全額' : `支払額 × ${b.rate === 0.5 ? '1/2' : '1/4'} ＋ ${man(b.add)}`;
    from = b.upTo;
    return { range, formula };
  });
  rows.push({ range: `${man(from)}超`, formula: `一律 ${man(t.max)}` });
  return rows;
}

const TABLES: { caption: string; t: Table }[] = [
  { caption: '所得税・新契約（一般・介護医療・個人年金）', t: SHOTOKU_NEW },
  { caption: '所得税・新契約の一般で、23歳未満の扶養親族がいる場合（令和8・9年分）', t: SHOTOKU_NEW_TOKUREI },
  { caption: '所得税・旧契約（一般・個人年金）', t: SHOTOKU_OLD },
  { caption: '住民税・新契約', t: JUMIN_NEW },
  { caption: '住民税・旧契約', t: JUMIN_OLD },
];

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>生命保険料控除 計算機（令和8年分）</h1>
      <p className="lead">
        控除証明書の支払額から、保険料控除申告書に書く控除額を出します。
        <strong>23歳未満の扶養親族がいると上限6万円</strong>の特例（令和8年分〜）に対応。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>令和8年分から変わったこと（23歳未満の扶養親族の特例）</h2>
      <p>
        令和7年度の税制改正で、<strong>23歳未満の扶養親族がいる人</strong>
        の「一般の生命保険料控除」（新契約）の上限が<strong>4万円から6万円</strong>
        に上がりました。令和8年分（2026年の年末調整）が最初で、令和8年度の改正で令和9年分まで延長されています。
        介護医療保険料・個人年金保険料の上限（各4万円）と、3区分の合計の上限（12万円）は変わりません。
      </p>
      <p>
        <strong>16歳未満の子も「扶養親族」に入ります。</strong>
        扶養控除の人数（16歳以上だけを数える）とは数え方が違うので注意してください。共働きの夫婦は、子が1人でも
        2人とも特例を使えます。住民税にはこの特例はありません。
      </p>

      <h2>新契約と旧契約が両方あるときの採り方</h2>
      <p>
        同じ区分に新契約と旧契約の両方があるときは、次の3つのうち<strong>いちばん大きい額</strong>
        が控除額になります（保険料控除申告書の「いずれか大きい金額 又は ⑤の金額」）。
      </p>
      <ul>
        <li>新契約だけで計算した額（最高4万円。特例ありの一般は6万円）</li>
        <li>旧契約だけで計算した額（最高5万円）</li>
        <li>新＋旧を合計した額（最高4万円。特例ありの一般は6万円）</li>
      </ul>
      <p>
        特例が無いときは、旧契約の支払額が6万円を超えると「旧だけ」のほうが大きくなります。
        <strong>特例があると、旧契約が6万円を超えていても、新契約を払っていれば「新＋旧」（最高6万円）のほうが大きくなります</strong>
        。たとえば一般・旧7万円＋新5万円なら、特例なしは旧だけの4.25万円、特例ありは新＋旧で6万円です。
        計算機は3つとも計算して、いちばん有利な額を自動で選びます。
      </p>

      <h2>控除額の表</h2>
      {TABLES.map(({ caption, t }) => (
        <div key={caption}>
          <h3>{caption}</h3>
          <table>
            <thead>
              <tr>
                <th>年間の支払保険料</th>
                <th>控除額</th>
              </tr>
            </thead>
            <tbody>
              {tableRows(t).map((row) => (
                <tr key={row.range}>
                  <td style={{ textAlign: 'left' }}>{row.range}</td>
                  <td style={{ textAlign: 'left' }}>{row.formula}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p>
        1円未満の端数は切り上げます。住民税は新＋旧の合算の上限が2.8万円、3区分の合計の上限が7万円です。
      </p>

      <h2>年末調整の計算機と合わせて使う</h2>
      <p>
        出てきた所得税の控除額は、
        <ToolLink slug="nenmatsu-chosei">年末調整 還付金 計算機</ToolLink>
        の「生命保険料控除」の欄にそのまま入れられます。計算機の下のボタンから、額を入れた状態で開けます。
      </p>

      <div className="note">
        本ツールは税額の一般的な計算の目安で、個別の税務相談ではありません。保険料控除申告書の最終的な書き方は勤務先・税務署の案内に従ってください。
        地震保険料控除は表が別なので、このページでは扱いません。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="seimei-hokenryo-kojo" />

      <ToolMeta slug="seimei-hokenryo-kojo" ymyl>
        出典：
        <a
          href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1140.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁 No.1140 生命保険料控除
        </a>
        ／
        <a
          href="https://www.nta.go.jp/publication/pamph/gensen/nencho2026/01.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁「令和8年分 年末調整のしかた」
        </a>
        （4・24ページ、扶養親族の説明）／
        <a
          href="https://www.nta.go.jp/publication/pamph/gensen/nencho2026/qa.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁「令和8年分 年末調整Q&amp;A」
        </a>
        （問7・問11）／
        <a
          href="https://www.nta.go.jp/publication/pamph/gensen/2026kaisei.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁「源泉所得税の改正のあらまし（令和8年4月）」
        </a>
        ／租税特別措置法41条の15の5／住民税は地方税法314条の2と
        <a
          href="https://www.city.tokyo-nakano.lg.jp/kurashi/zeikin/kakusyushiryo/minnanokuzei-r7.files/keisan1_r8.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          東京都中野区「令和8年度 住民税の計算」
        </a>
        にもとづき作成。
      </ToolMeta>
    </>
  );
}
