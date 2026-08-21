import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  CONDITIONS,
  DATA_CHECKED_AT,
  KANI_SALES_LIMIT,
  LAW_28_KAISEI,
  LAW_R8_KAISEI,
  PURCHASE_TRANSITION,
  PURCHASE_TRANSITION_CAP,
  PURCHASE_TRANSITION_CAP_BEFORE,
  SOURCE_NTA_INVOICE,
  SOURCE_NTA_QA_115_2,
  SOURCE_NTA_QA_117,
  SOURCE_NTA_QA_117_3,
  SOURCE_NTA_R8_KAISEI,
  SPECIAL_RATES,
  SPECIAL_SALES_LIMIT,
  YEARS,
  formatDate,
  formatManYen,
  formatPercent,
  hayamihyo,
  kaniDeadline,
} from '@/lib/invoice-nozeigaku';
import Calculator from './Calculator';

const title =
  'インボイス 納税額 比較計算機｜2割特例 終了後は3割特例・簡易課税・本則課税のどれが安い？';
const description =
  '2割特例は個人事業者だと2026年分が最後。2027年からは3割特例（個人限定・2年間）・簡易課税・本則課税のどれが安いかを、売上高と業種を入れて比較します。簡易課税の届出期限は「原則」だけでなく2割特例からの移行の特則（翌課税期間の確定申告期限まで）も表示。業種別みなし仕入率の早見表つき。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/invoice-nozeigaku/` },
  robots: robotsFor('invoice-nozeigaku'),
};

/** 静的HTMLに焼き込む早見表。入力にも開いた日にも依存しない */
const rows = hayamihyo();
const deadline2027 = kaniDeadline(2027);

const faq = [
  {
    q: '2割特例はいつまで使えますか？',
    a: '令和8年9月30日の属する課税期間までです。個人事業者の課税期間は暦年（1月1日〜12月31日）なので、2026年分（令和8年分）の申告が最後になります。法人は令和8年9月30日を含む事業年度までです。',
  },
  {
    q: '2割特例のあとは何も特例が無いのですか？',
    a: `個人事業者に限り「3割特例」があります。令和8年度税制改正（${LAW_R8_KAISEI}）で創設されたもので、令和9年分（2027年）・令和10年分（2028年）の2年間、納付税額を売上税額の${formatPercent(
      SPECIAL_RATES.sanwari,
    )}にできます。2割特例と同じく、免税事業者がインボイス発行事業者になったこと（または課税事業者選択届出書の提出）で課税事業者になった課税期間に限られ、基準期間の課税売上高が${formatManYen(
      SPECIAL_SALES_LIMIT,
    )}を超える年などは使えません。法人は対象外です。`,
  },
  {
    q: '3割特例と簡易課税は、どちらが安いですか？',
    a: `業種によって逆になります。簡易課税の納税額は「売上税額 ×（1 − みなし仕入率）」なので、みなし仕入率が70%以上の業種（第1種＝卸売業90%・第2種＝小売業80%・第3種＝建設業や製造業70%）では簡易課税のほうが安いか同じです。みなし仕入率が60%以下の業種（第4種＝飲食店業・第5種＝サービス業・第6種＝不動産業）では3割特例のほうが安くなります。国税庁のQ&A（問117-3）も、小売業なら簡易課税のほうが納付額が少なくなると説明しています。`,
  },
  {
    q: '簡易課税の届出はいつまでに出せばいいですか？',
    a: `原則は「適用を受けようとする課税期間の初日の前日まで」で、2027年分から適用したい個人事業者なら${formatDate(
      deadline2027.principle,
    )}までです。ただし2割特例・3割特例の適用を受けた人には特則があり、その適用を受けた課税期間の翌課税期間に係る確定申告期限まで（2027年分からなら${formatDate(
      deadline2027.special as string,
    )}まで）に届出書を提出すれば、その課税期間の初日の前日に提出したものとみなされます（${LAW_28_KAISEI}の附則51条の2第6項・51条の3第5項）。年が明けてからでも間に合うのは、この特則があるためです。`,
  },
  {
    q: '「もう2026年12月31日を過ぎたから本則課税しかない」と聞きました',
    a: `原則だけを見た誤解です。2026年分に2割特例で申告した個人事業者は、2027年分の確定申告期限（${formatDate(
      deadline2027.special as string,
    )}）までに「2027年分から簡易課税の適用を受ける旨」を記載した消費税簡易課税制度選択届出書を出せば、2027年分から簡易課税を使えます。国税庁のQ&A 問117がこの取扱いを示しています。ここを取り違えると1年ぶん余計に納めることになります。`,
  },
  {
    q: '簡易課税を選ぶと、すぐにやめられますか？',
    a: `やめられません。簡易課税制度は、事業を廃止した場合を除き、2年間継続して適用したあとでなければやめられません（適用を開始した課税期間の初日から2年を経過する日の属する課税期間の初日以後でなければ「消費税簡易課税制度選択不適用届出書」を提出できません）。翌年に大きな設備投資を予定しているなら、還付が受けられる本則課税と比べてから決めてください。基準期間の課税売上高が${formatManYen(
      KANI_SALES_LIMIT,
    )}を超えた年は、届出を出していても簡易課税を使えません。`,
  },
  {
    q: '取引先が免税事業者です。私の仕入税額控除はどうなりますか？',
    a: `2026年10月1日から、免税事業者などインボイス発行事業者以外の者からの課税仕入れについて控除できる割合が80%から70%に下がります。その後も段階的に下がり、2028年10月から50%、2030年10月から30%、2031年10月以降は0%です（令和8年度税制改正で適用期限が2年延長されました）。あわせて、一の相手からの課税仕入れの合計額が年${formatManYen(
      PURCHASE_TRANSITION_CAP,
    )}（改正前は${formatManYen(
      PURCHASE_TRANSITION_CAP_BEFORE,
    )}）を超える部分にはこの経過措置を使えなくなります。`,
  },
  {
    q: '軽減税率8%の売上がある場合も使えますか？',
    a: 'この計算機は売上がすべて標準税率10%であることを前提にしています。飲食料品など8%の売上がある場合は売上税額の時点でずれるため、結果は目安になりません。入力を増やさない代わりに、この前提を画面にも明記しています。',
  },
  {
    q: '法人でも使えますか？',
    a: 'この計算機は個人事業者（課税期間＝暦年）を前提にしています。法人は課税期間が事業年度なので、2割特例が終わる時期も届出期限も決算月によって変わります。また3割特例は個人事業者限定で、法人は使えません。法人の方は課税期間に読み替えてご確認ください。',
  },
  {
    q: 'この金額のまま申告して大丈夫ですか？',
    a: `いいえ、概算です。納税額は円未満を切り捨てて表示していますが、実際の申告では国税分（7.8%）と地方消費税分（2.2%）に分けた端数処理が入るため数百円ずれます。また、貸倒れ・棚卸資産の調整・売上返品なども考慮していません。正確な金額と適用の可否は、国税庁の資料または税理士にご確認ください（データ最終更新日：${formatDate(
      DATA_CHECKED_AT,
    )}）。`,
  },
];

const trail = breadcrumbFor('invoice-nozeigaku');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'インボイス 納税額 比較計算機',
      url: `${SITE_URL}/invoice-nozeigaku/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('invoice-nozeigaku'),
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

      <h1>インボイス 納税額 比較計算機（2割特例 終了後）</h1>
      <p className="lead">
        2割特例が使えるのは<strong>個人事業者だと2026年分（令和8年分）が最後</strong>
        です。2027年からは、個人事業者限定の<strong>3割特例</strong>・
        <strong>簡易課税</strong>・<strong>本則課税</strong>
        のどれかを選ぶことになります。売上高と業種を入れると、どれがいくらになるのかを並べて比べ、
        <strong>簡易課税の届出期限（原則と特則の両方）</strong>まで出します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>2026年10月に、インボイスの経過措置が2つ同時に切り替わる</h2>
      <p>
        令和8年度税制改正（{LAW_R8_KAISEI}）により、インボイス制度の経過措置が売手側・買手側の両方で変わります。
      </p>
      <ul>
        <li>
          <strong>売手側：2割特例が終わり、3割特例に変わる</strong> —
          2割特例は令和8年9月30日の属する課税期間まで（個人事業者は2026年分が最後）。
          代わりに<strong>個人事業者に限り</strong>、令和9年分・令和10年分の2年間、
          納付税額を売上税額の{formatPercent(SPECIAL_RATES.sanwari)}
          にできる3割特例が創設されました。法人に3割特例はありません
        </li>
        <li>
          <strong>買手側：控除できる割合が80%から70%へ</strong> —
          免税事業者などインボイス発行事業者以外の者からの課税仕入れについて、
          仕入税額相当額の一定割合を控除できる経過措置の割合が下がります（7・5・3割控除）
        </li>
      </ul>

      <h2>年ごとに、選べる方式が変わる（個人事業者）</h2>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>申告する年</th>
              <th>使える特例</th>
              <th>そのほかの選択肢</th>
            </tr>
          </thead>
          <tbody>
            {YEARS.map((y) => (
              <tr key={y.year}>
                <th scope="row">{y.label}</th>
                <td>
                  {y.special === 'niwari'
                    ? `2割特例（売上税額 × ${formatPercent(SPECIAL_RATES.niwari)}）`
                    : y.special === 'sanwari'
                      ? `3割特例（売上税額 × ${formatPercent(SPECIAL_RATES.sanwari)}）`
                      : 'なし'}
                </td>
                <td>簡易課税／本則課税</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul>
        {YEARS.map((y) => (
          <li key={y.year}>
            <strong>{y.label}</strong> — {y.note}
          </li>
        ))}
      </ul>

      <h2>4つの方式と、使える条件</h2>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>方式</th>
              <th>納税額の概算</th>
              <th>使える条件</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">2割特例（〜2026年分）</th>
              <td>売上税額 × {formatPercent(SPECIAL_RATES.niwari)}</td>
              <td>{CONDITIONS.niwari}</td>
            </tr>
            <tr>
              <th scope="row">3割特例（2027・2028年分）</th>
              <td>売上税額 × {formatPercent(SPECIAL_RATES.sanwari)}</td>
              <td>{CONDITIONS.sanwari}</td>
            </tr>
            <tr>
              <th scope="row">簡易課税</th>
              <td>売上税額 ×（1 − みなし仕入率）</td>
              <td>{CONDITIONS.kani}</td>
            </tr>
            <tr>
              <th scope="row">本則課税</th>
              <td>売上税額 − 仕入税額</td>
              <td>{CONDITIONS.honsoku}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="note">
        2割特例・3割特例は<strong>事前の届出が不要</strong>
        で、確定申告書にその旨を付記すれば使えます。簡易課税だけは事前の届出が必要です。
      </p>

      <h2>いちばん間違えやすいのは、簡易課税の届出期限</h2>
      <p>
        簡易課税は<strong>原則として事前の届出</strong>
        が必要で、期限は「適用を受けようとする課税期間の初日の前日」＝個人事業者なら
        <strong>前年の12月31日</strong>です。ここだけを読むと、2027年分から簡易課税にしたい人は
        {formatDate(deadline2027.principle)}が締切だ、と読めます。
      </p>
      <p>
        <strong>
          しかし2割特例・3割特例を使っていた人には特則があります。
        </strong>
        その適用を受けた課税期間の<strong>翌課税期間に係る確定申告期限</strong>
        までに「消費税簡易課税制度選択届出書」（その課税期間から適用を受ける旨を記載したもの）を提出すれば、
        その課税期間の初日の前日に提出したものとみなされます（{LAW_28_KAISEI}
        の附則51条の2第6項・51条の3第5項）。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>簡易課税を適用したい年</th>
              <th>原則の期限</th>
              <th>特則の期限（前年に2割・3割特例を使った人）</th>
            </tr>
          </thead>
          <tbody>
            {[2027, 2028, 2029].map((year) => {
              const d = kaniDeadline(year);
              return (
                <tr key={year}>
                  <th scope="row">{year}年分</th>
                  <td>{formatDate(d.principle)}</td>
                  <td>
                    {d.special ? <strong>{formatDate(d.special)}</strong> : '—（対象外）'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        2029年分の期限が3月31日でなく4月1日なのは、2030年3月31日が日曜日で、
        提出期限が休日等に当たるときはその翌日になるためです（国税庁 インボイスQ&A 問117の注）。
        出典：
        <a href={SOURCE_NTA_QA_117.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_QA_117.label}
        </a>
      </p>

      <h2>業種別みなし仕入率の早見表（簡易課税）</h2>
      <p>
        簡易課税の納税額は「売上税額 ×（1 − みなし仕入率）」で決まります。
        みなし仕入率が高い業種ほど納税額は少なくなり、
        <strong>第1種（90%）・第2種（80%）は3割特例より安く</strong>、
        第3種（70%）は3割特例とちょうど同じ、第4種以下は3割特例のほうが安くなります。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>事業区分</th>
              <th>みなし仕入率</th>
              <th>売上税額に対する納税額</th>
              <th>3割特例との比較</th>
              <th>該当する事業</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.type.id}>
                <th scope="row">{row.type.label}</th>
                <td>{formatPercent(row.type.deemedRate)}</td>
                <td>
                  <strong>{formatPercent(row.kaniRate)}</strong>
                </td>
                <td>
                  {row.kaniRate < SPECIAL_RATES.sanwari
                    ? '簡易課税のほうが安い'
                    : row.kaniRate === SPECIAL_RATES.sanwari
                      ? '同じ'
                      : '3割特例のほうが安い'}
                </td>
                <td>{row.type.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        出典：
        <a href={SOURCE_NTA_QA_117_3.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_QA_117_3.label}
        </a>
        。2つ以上の事業を営んでいる場合は、原則として事業区分ごとに分けて計算します
        （この計算機は1区分だけを前提にした概算です）。
      </p>

      <h2>買手側：免税事業者からの仕入れは何%控除できるのか</h2>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>期間</th>
              <th>控除できる割合</th>
            </tr>
          </thead>
          <tbody>
            {PURCHASE_TRANSITION.map((p) => (
              <tr key={p.from}>
                <th scope="row">
                  {formatDate(p.from)}〜{formatDate(p.until)}
                </th>
                <td>
                  <strong>{formatPercent(p.rate)}</strong>
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row">2031年10月1日〜</th>
              <td>
                <strong>0%（経過措置の終了）</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="note">
        令和8年度税制改正で適用期限が2年延長され、80% → 70% → 50% → 30% → 0% の段階になりました。
        一の相手からの課税仕入れの合計額が年{formatManYen(PURCHASE_TRANSITION_CAP)}
        （改正前は{formatManYen(PURCHASE_TRANSITION_CAP_BEFORE)}
        ）を超える部分には経過措置を使えません。出典：
        <a href={SOURCE_NTA_R8_KAISEI.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_R8_KAISEI.label}
        </a>
      </p>

      <h2>特例が使えない年もある</h2>
      <p>
        2割特例・3割特例は「インボイス登録によって免税事業者から課税事業者になった課税期間」に限って使えるものです。
        次のような課税期間では、年が合っていても使えません。
      </p>
      <ul>
        <li>基準期間（前々年）の課税売上高が{formatManYen(SPECIAL_SALES_LIMIT)}を超える年</li>
        <li>特定期間の課税売上高などにより事業者免税点制度の適用が制限される年</li>
        <li>相続があった場合の納税義務の免除の特例により制限される年</li>
        <li>
          課税事業者選択届出書を出して課税事業者になった後2年以内に、一般課税で調整対象固定資産
          （税抜100万円以上）を仕入れた場合など
        </li>
        <li>一般課税で高額特定資産（税抜1,000万円以上）を仕入れた場合</li>
        <li>課税期間の特例（1か月・3か月への短縮）の適用を受けている年</li>
        <li>3割特例では、その課税期間の初日に恒久的施設を有しない国外事業者である場合</li>
      </ul>
      <p className="note">
        出典：
        <a href={SOURCE_NTA_QA_115_2.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_QA_115_2.label}
        </a>
      </p>

      <h2>このツールが扱わないこと</h2>
      <ul>
        <li>
          <strong>消費税の確定申告書の作成</strong> —
          どれを選ぶかを決めるための計算機であって、申告ソフトではありません
        </li>
        <li>
          <strong>軽減税率8%の売上</strong> —
          初版は標準税率10%の売上だけを前提にしています。飲食料品を扱う事業者の方は、
          売上税額の時点でずれるためご注意ください
        </li>
        <li>
          <strong>法人の課税期間ごとの判定</strong> —
          個人事業者（暦年）を前提にしています。法人は決算月によって2割特例の終わる時期も届出期限も変わり、
          3割特例は使えません
        </li>
        <li>
          <strong>複数の事業区分がある場合の按分</strong> —
          簡易課税は原則として事業区分ごとに分けて計算します。この計算機は1区分だけの概算です
        </li>
        <li>
          <strong>貸倒れ・棚卸資産の調整・売上返品などの調整</strong>
        </li>
      </ul>

      <h2>お金まわりのほかの計算機</h2>
      <p>
        同じ2026年10月には
        <Link href="/nenshu-kabe/">106万円の壁の撤廃</Link>や
        <Link href="/shuzei-kaisei/">酒税の一本化</Link>
        もあります。個人で働く方には
        <Link href="/ideco/">iDeCoの拠出限度額</Link>や
        <Link href="/furusato-nozei/">ふるさと納税の上限額</Link>もどうぞ。
      </p>

      <h2>よくある質問</h2>
      <dl>
        {faq.map((f) => (
          <div key={f.q} style={{ marginBottom: 16 }}>
            <dt style={{ fontWeight: 700, marginBottom: 4 }}>{f.q}</dt>
            <dd style={{ margin: 0 }}>{f.a}</dd>
          </div>
        ))}
      </dl>

      <AdUnit position="below-faq" />

      <RelatedTools current="invoice-nozeigaku" />

      <ToolMeta slug="invoice-nozeigaku" ymyl>
        制度の内容・割合・期限は
        <a href={SOURCE_NTA_R8_KAISEI.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_R8_KAISEI.label}
        </a>
        、
        <a href={SOURCE_NTA_QA_117.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_QA_117.label}
        </a>
        、
        <a href={SOURCE_NTA_QA_115_2.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_QA_115_2.label}
        </a>
        、
        <a href={SOURCE_NTA_QA_117_3.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_QA_117_3.label}
        </a>
        および
        <a href={SOURCE_NTA_INVOICE.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_INVOICE.label}
        </a>
        にもとづきます（根拠法令：{LAW_28_KAISEI}の附則51条の2・51条の3、{LAW_R8_KAISEI}）。
        <strong>
          納税額は売上がすべて標準税率10%であることを前提にした概算で、円未満切捨てのみを行っています。
        </strong>
        実際の申告では国税分と地方消費税分に分けた端数処理が入り、数百円ずれます。適用の可否や届出の要否は、
        国税庁の資料または税理士にご確認ください。データ最終更新日：{formatDate(DATA_CHECKED_AT)}
      </ToolMeta>
    </>
  );
}
