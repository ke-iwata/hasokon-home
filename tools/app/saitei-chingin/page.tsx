import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  CURRENT_FY_LABEL,
  DATA_CHECKED_AT,
  MEYASU_ANSWERED_ON,
  MEYASU_BY_RANK,
  NATIONAL_AVERAGE,
  PREFECTURES,
  REVISED_FY_LABEL,
  SOURCE_MHLW_LIST,
  SOURCE_MHLW_MEYASU,
  formatDate,
  formatYen,
} from '@/lib/saitei-chingin';
import Calculator from './Calculator';

const title = '最低賃金 早見表・チェッカー｜2026年10月改定の都道府県別一覧';
const description =
  '都道府県を選ぶと、いまの最低賃金と2026年（令和8年度）10月改定後の額・引上げ幅・発効日が分かります。答申済みの県は答申額、まだの県は目安ベースの見込みとして区別して表示。自分の時給が下回っていないかの判定と、時給×労働時間からの月収・年収換算、年収の壁までの余裕も出せます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/saitei-chingin/` },
};

const faq = [
  {
    q: '2026年10月から最低賃金はいくら上がりますか？',
    a: `2026年7月28日に中央最低賃金審議会が令和8年度の改定の目安を答申しました。引上げ額の目安はAランク54円、B・Cランク56円で、目安どおりに改定されれば全国加重平均は${NATIONAL_AVERAGE.current}円から${NATIONAL_AVERAGE.meyasu}円（+55円、+4.9%）になります。ただし実際の金額は都道府県ごとの地方最低賃金審議会が決めるため、目安を上回る県もあります。このページでは、答申が出た県は答申額を、まだの県は目安ベースの見込みとして区別して表示しています。`,
  },
  {
    q: '発効日はいつですか？全国同じですか？',
    a: '同じではありません。地域別最低賃金は都道府県ごとに効力発生日が決まるため、10月1日から適用される県もあれば、11月・12月、さらに翌年にずれる県もあります。令和7年度の改定では東京都が10月3日、秋田県が令和8年3月31日と、およそ6か月の差がありました。自分の県の発効日は必ず個別に確認してください。',
  },
  {
    q: '自分の時給が最低賃金を下回っていたらどうなりますか？',
    a: '最低賃金法により、最低賃金額を下回る賃金の取り決めは無効となり、最低賃金額と同じ額を定めたものとみなされます。つまり差額を請求できます。まずは勤務先に確認し、応じてもらえない場合は都道府県労働局または労働基準監督署に相談してください。相談は無料で、労働者からの申告を理由とする不利益な取扱いは禁止されています。',
  },
  {
    q: '月給制でも最低賃金の対象になりますか？',
    a: '対象になります。パート・アルバイトだけでなく、正社員・契約社員を含むすべての労働者に適用されます。月給制の場合は、月給を1か月の平均所定労働時間で割って時間額に換算し、最低賃金額と比べます。このとき、通勤手当・家族手当・住宅手当、残業や休日・深夜の割増賃金、賞与など臨時に支払われる賃金は、比較の対象から除いて計算します。',
  },
  {
    q: '「目安」と「答申」と「発効」は何が違うのですか？',
    a: `毎年7月末に中央最低賃金審議会が示すのが「目安」で、この段階ではランクごとの引上げ額しか決まっていません。8〜9月に各都道府県の地方最低賃金審議会が金額を決めるのが「答申」です。その後、異議申出の手続と官報公示を経て、10月前後に「発効」して実際に効力が生じます。目安の段階の額は確定額ではないため、このページでは状態を必ず添えて表示しています（データ最終更新日：${formatDate(DATA_CHECKED_AT)}）。`,
  },
  {
    q: '産業によって別の最低賃金があると聞きました',
    a: '特定（産業別）最低賃金といって、鉄鋼業や自動車小売業など特定の産業には地域別最低賃金より高い最低賃金が定められている場合があります。両方が適用される場合は高いほうが適用されます。このツールは地域別最低賃金のみを扱っているので、産業別の額は厚生労働省・都道府県労働局の一覧でご確認ください。',
  },
  {
    q: '最低賃金が上がると「年収の壁」に早く到達しますか？',
    a: '同じ労働時間で働き続ければ、時給が上がった分だけ年収が増えるため、扶養の範囲で働いている方は壁に早く到達します。たとえば週20時間・年52週で働く場合、時給が55円上がると年収はおよそ5万7,000円増えます。このページの月収・年収換算で次の壁までの余裕を確認し、詳しい判定は年収の壁 計算機をお使いください。なお2026年10月1日には106万円の壁（賃金要件）が撤廃されます。',
  },
  {
    q: 'このページの金額をそのまま信じても大丈夫ですか？',
    a: '本ツールの数値は参考情報であり、法的助言ではありません。正式な金額・発効日は厚生労働省および都道府県労働局の発表でご確認ください。特に答申前の県について表示している額は目安にもとづく見込みであり、確定額ではありません。各都道府県の表示には出典へのリンクを添えているので、判断が必要な場面では必ず一次情報にあたってください。',
  },
];

const trail = breadcrumbFor('saitei-chingin');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '最低賃金 早見表・チェッカー',
      url: `${SITE_URL}/saitei-chingin/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('saitei-chingin'),
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

      <h1>最低賃金 早見表・チェッカー</h1>
      <p className="lead">
        2026年（令和8年度）10月の改定で、最低賃金は全国加重平均で
        {NATIONAL_AVERAGE.current}円 → {NATIONAL_AVERAGE.meyasu}
        円になる見込みです。都道府県を選ぶと、いまの額・改定後の額・引上げ幅・発効日が分かります。自分の時給が下回っていないかの判定と、月収・年収への換算もできます。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>2026年（令和8年度）改定の要点</h2>
      <p>
        {formatDate(MEYASU_ANSWERED_ON)}
        、中央最低賃金審議会が令和8年度の地域別最低賃金額改定の目安を答申しました。ポイントは3つです。
      </p>
      <ul>
        <li>
          <strong>引上げ額の目安はAランク{MEYASU_BY_RANK.A}円・Bランク{MEYASU_BY_RANK.B}円・Cランク
          {MEYASU_BY_RANK.C}円</strong> —
          Aランクは埼玉・千葉・東京・神奈川・愛知・大阪の6都府県、Bランクは28道府県、Cランクは13県です。地方が都市部を上回る目安になっています
        </li>
        <li>
          <strong>目安どおりなら全国加重平均は{NATIONAL_AVERAGE.meyasu}円</strong> — 現在の
          {NATIONAL_AVERAGE.current}円から55円（+4.9%）の引き上げ。前年度の66円（+6.3%）より伸びは小さくなります
        </li>
        <li>
          <strong>実際の金額は県ごとに決まる</strong> —
          目安はあくまで参考で、8〜9月に各都道府県の地方最低賃金審議会が金額を答申し、10月前後に発効します。<strong>目安を上回る額で答申する県もあります</strong>
        </li>
      </ul>

      <h2>都道府県別の早見表</h2>
      <p>
        現行額は{CURRENT_FY_LABEL}の地域別最低賃金（厚生労働省の全国一覧）です。
        {REVISED_FY_LABEL}
        の欄は、答申が出た県は<strong>答申額</strong>、まだの県は
        <strong>目安ベースの見込み</strong>として区別しています。見込みの額は確定額ではありません。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>都道府県</th>
              <th>ランク</th>
              <th>{CURRENT_FY_LABEL}（現行）</th>
              <th>{REVISED_FY_LABEL}</th>
              <th>引上げ額</th>
              <th>状態</th>
              <th>発効（予定）日</th>
            </tr>
          </thead>
          <tbody>
            {PREFECTURES.map((p) => {
              // 静的HTMLに焼き込む表なので、時刻に依存しない「答申の有無」だけで状態を出す。
              // 発効済みかどうかの判定は、開いた日で評価できるチェッカー側に任せる
              const answered = p.answered;
              const yen = answered ? answered.yen : p.currentYen + MEYASU_BY_RANK[p.rank];
              return (
                <tr key={p.code}>
                  <th scope="row">{p.name}</th>
                  <td>{p.rank}</td>
                  <td>{formatYen(p.currentYen)}</td>
                  <td>
                    {formatYen(yen)}
                    {!answered && <span className="chip">見込み</span>}
                  </td>
                  <td>+{yen - p.currentYen}円</td>
                  <td>{answered ? '答申済み' : '目安'}</td>
                  <td>
                    {answered?.effectiveOn ? formatDate(answered.effectiveOn) : '未公表'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        出典：
        <a href={SOURCE_MHLW_LIST.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_MHLW_LIST.label}
        </a>
        （現行額・発効日）、
        <a href={SOURCE_MHLW_MEYASU.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_MHLW_MEYASU.label}
        </a>
        （ランクと目安額）、および各都道府県労働局の答申の発表。データ最終更新日：
        {formatDate(DATA_CHECKED_AT)}
      </p>

      <h2>最低賃金の仕組み</h2>
      <p>
        最低賃金は、使用者が労働者に支払わなければならない賃金の下限額です。パート・アルバイト・契約社員・正社員を問わず、その都道府県内で働くすべての労働者に適用されます。最低賃金額を下回る賃金の取り決めは無効となり、最低賃金額と同じ額を定めたものとみなされます（最低賃金法第4条）。
      </p>
      <p>
        金額は都道府県ごとに定められ、毎年見直されます。7月末に国の審議会が引上げ額の
        <strong>目安</strong>を示し、8〜9月に各都道府県の審議会が金額を<strong>答申</strong>
        して、10月前後に<strong>発効</strong>するのが例年の流れです。<strong>発効日は県ごとに違う</strong>
        ため、10月1日から一斉に上がるわけではありません。
      </p>

      <h2>時給が最低賃金を下回っていたら</h2>
      <ul>
        <li>
          <strong>差額を請求できます</strong> —
          最低賃金額との差額は未払い賃金にあたります。まずは勤務先に確認してください
        </li>
        <li>
          <strong>相談先は労働基準監督署・都道府県労働局</strong> —
          相談は無料です。労働者が申告したことを理由とする解雇その他の不利益な取扱いは禁止されています
        </li>
        <li>
          <strong>月給制でも時間額に直して比べます</strong> — 月給 ÷
          1か月の平均所定労働時間で時間額を出し、通勤手当・家族手当・住宅手当・割増賃金・賞与を除いて比較します
        </li>
      </ul>

      <h2>時給が上がると「年収の壁」はどうなるか</h2>
      <p>
        同じ時間だけ働き続ければ、時給が上がった分そのまま年収が増えます。扶養の範囲で働いている方は、
        <strong>働く時間を変えていないのに壁を超えてしまう</strong>
        ことが起こります。たとえば週20時間・年52週で働く場合、時給が55円上がると年収はおよそ5万7,000円増える計算です。
      </p>
      <p>
        なお<strong>2026年10月1日には、社会保険の加入要件のうち賃金要件（月8.8万円＝年収106万円相当）が撤廃されます</strong>
        。撤廃後は、従業員51人以上の勤務先で週20時間以上働く方は年収に関係なく加入対象になるため、「106万円の壁」という金額の壁自体が無くなります。
      </p>
      <p>
        <Link href="/nenshu-kabe/">年収の壁 計算機</Link>で自分に関係する壁を判定し、
        <Link href="/hatarakizon/">社会保険 損得計算機</Link>
        で加入した場合の手取りの変化まで確認できます。
      </p>

      <h2>このツールが扱わないこと</h2>
      <ul>
        <li>
          <strong>特定（産業別）最低賃金</strong> —
          鉄鋼業・自動車小売業など、産業ごとにより高い最低賃金が定められている場合があります。地域別と両方が適用されるときは高いほうが適用されます。産業別の額は
          <a
            href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/"
            target="_blank"
            rel="noopener noreferrer"
          >
            厚生労働省の一覧
          </a>
          をご確認ください
        </li>
        <li>
          <strong>過去年度の履歴</strong> — 現行（{CURRENT_FY_LABEL}）と改定（{REVISED_FY_LABEL}
          ）の比較だけを扱います
        </li>
        <li>
          <strong>事業主向けの支援策</strong> —
          賃上げのための助成金（業務改善助成金など）は事業主向けの制度です。詳細は厚生労働省のページをご確認ください
        </li>
      </ul>

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

      <RelatedTools current="saitei-chingin" />

      <ToolMeta slug="saitei-chingin" ymyl>
        本ツールの数値は参考情報であり、法的助言ではありません。正式な金額・発効日は
        <a
          href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/"
          target="_blank"
          rel="noopener noreferrer"
        >
          厚生労働省「地域別最低賃金の全国一覧」
        </a>
        および各都道府県労働局の発表でご確認ください。答申前の県について表示している額は、
        <a href={SOURCE_MHLW_MEYASU.url} target="_blank" rel="noopener noreferrer">
          令和8年度の目安
        </a>
        にもとづく見込みであり確定額ではありません。データ最終更新日：{formatDate(DATA_CHECKED_AT)}
      </ToolMeta>
    </>
  );
}
