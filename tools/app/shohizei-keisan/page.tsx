import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import {
  DATA_CHECKED_AT,
  FOOD_RATE_2027,
  FOOD_RELIEF_RATIO,
  KAKEI_CHOSA,
  KAKEI_TWO_OR_MORE_AT_HOME,
  SOURCE_KAKEI_CHOSA,
  SOURCE_KANTEI,
  SOURCE_NTA_KEIGEN,
  SOURCE_NTA_QA,
  TAX_UPDATED_AT,
  foodRateBadge,
  foodRelief,
  formatDate,
  formatPercent,
  formatYen,
  isFoodRatePending,
  isFoodRateShown,
} from '@/lib/shohizei';
import { ITEM_COUNT, QA_REVISION } from '@/lib/shohizei-items';
import Calculator from './Calculator';

/**
 * **法案が成立するまで `title` / `description` に「（予定）」を必ず入れる。**
 *
 * 画面には「成立前です」の印を出しているが、検索結果のスニペットには印が見えない。
 * 「2027年4月〜 食料品1%」とだけ出ると成立済みの事実として読まれるため。
 * `FOOD_RATE_2027.status` を `'enacted'` にしたら、この2行から「（予定）」を外す
 * （`tests/shohizei.test.ts` が status と文字列の食い違いを落とす）。
 */
const PENDING = isFoodRatePending();
const SHOW_FOOD_RATE = isFoodRateShown();

const title = PENDING
  ? '消費税 計算機・軽減税率チェッカー｜税込税抜の計算と、2027年4月からの食料品1%（法案審議中・予定）'
  : '消費税 計算機・軽減税率チェッカー｜税込税抜の計算と、2027年4月からの食料品1%';

const description = PENDING
  ? `税込・税抜をどちらの向きにも計算し、10%／8%／1%を横並びで比べられます。「これは8%か10%か」を国税庁Q&Aの${ITEM_COUNT}項目から引ける軽減税率チェッカーつき。2027年4月から飲食料品が1%になる予定（2026年8月5日に閣議決定、法案は臨時国会で審議中）で、1か月の食費からいくら安くなるかも計算します。`
  : `税込・税抜をどちらの向きにも計算し、10%／8%／1%を横並びで比べられます。「これは8%か10%か」を国税庁Q&Aの${ITEM_COUNT}項目から引ける軽減税率チェッカーと、2027年4月からの食料品1%で1か月の食費からいくら安くなるかの計算つき。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/shohizei-keisan/` },
  robots: robotsFor('shohizei-keisan'),
};

/** 本文で使う代表例（静的HTMLに焼き込む。開いた日に依存しない） */
const exampleRelief = foodRelief(KAKEI_TWO_OR_MORE_AT_HOME)!;
const badge = foodRateBadge();

const faq = [
  {
    q: '税込価格から税抜価格を出すにはどう計算しますか？',
    a: '税込価格を「1 + 税率」で割ります。10%なら税込 ÷ 1.10、8%なら税込 ÷ 1.08です。税抜から税込にするときは逆に掛けます（税抜 × 1.10）。1円未満の端数をどう処理するかは事業者の任意なので、レシートと1円ずれることがあります。',
  },
  {
    q: 'なぜ0%ではなく1%なのですか？',
    a: '政府は、レジなどの改修に必要な期間を理由として挙げています。0%にすると改修に10〜12か月かかるのに対し、1%なら5〜6か月で済むという説明です。1%相当の負担については、中低所得の勤労者への給付（給付付き税額控除）で実質的に軽くする設計とされています。このツールは政策の是非を判断するものではありません。',
  },
  {
    q: '外食も1%になりますか？',
    a: '方針では対象外です。1%になるのは「飲食料品」で、いまの軽減税率（8%）と同じく外食・酒類は含まれないとされています。レストランで食べる場合は10%のまま、同じ店で持ち帰る場合は対象になる見込みです。ただし1%の対象範囲がいまの軽減税率の範囲とずれるかどうかは、法案の条文が出るまで確定しません。',
  },
  {
    q: '新聞はどうなりますか？',
    a: `定期購読の新聞はいま8%ですが、2027年4月以降の扱いは法案の条文で確認できていないため、このツールでは税率を載せていません。報道では8%のままとする見方が出ていますが、条文で確かめられるまで書かない方針です。${QA_REVISION}のQ&Aで確認できるのは現行（8%）の要件までです。`,
  },
  {
    q: '1%のあいだに買いだめしたほうが得ですか？',
    a: 'このツールは買うタイミングを判断しません。1%になるのは2027年4月からの2年間の予定なので、それまでに買うより待ったほうが税の分は安くなりますが、食料品には賞味期限があります。また、税率が下がっても店頭価格がすぐ下がるとは限らず、値下げの遅れや原材料費の改定と重なった据え置きが起こりえます。',
  },
  {
    q: 'インボイスの2割特例が終わるのと関係がありますか？',
    a: '別の制度です。2割特例はインボイス制度に登録した免税事業者向けの納税額の特例で、2026年9月30日を含む課税期間で終わります。飲食料品の1%は消費者が払う税率の話です。事業者としての納税額は、インボイス 納税額 比較計算機のほうでご確認ください。',
  },
  {
    q: '地方消費税との内訳はどうなっていますか？',
    a: '10%の内訳は消費税7.8%と地方消費税2.2%、8%（軽減税率）の内訳は消費税6.24%と地方消費税1.76%です。買う側が払う額は合計で決まるので、このツールでは合計だけを扱っています。',
  },
  {
    q: 'この計算をそのまま信じて大丈夫ですか？',
    a: `税率と軽減税率の判定は国税庁の公表資料にもとづいていますが、1円未満の端数処理は事業者の任意なのでレシートと一致しないことがあります。また2027年4月からの1%は${PENDING ? '法案が成立していない段階の方針で、内容が変わることがあります' : '法案にもとづくものです'}。軽減税率の個別の判定は、最終的に税務署の判断になります（データ最終更新日：${formatDate(DATA_CHECKED_AT)}）。`,
  },
];

const trail = breadcrumbFor('shohizei-keisan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '消費税 計算機・軽減税率チェッカー',
      url: `${SITE_URL}/shohizei-keisan/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('shohizei-keisan'),
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

      <h1>消費税 計算機・軽減税率チェッカー</h1>
      <p className="lead">
        税込と税抜をどちらの向きにも計算し、<strong>10%・8%・1%を横並び</strong>
        で比べられます。「これは8%か10%か」は国税庁のQ&Aに載っている{ITEM_COUNT}
        項目から引けます。
        {SHOW_FOOD_RATE && (
          <>
            {' '}
            2027年4月から飲食料品が<strong>1%になる予定</strong>
            なので、1か月の食費からいくら安くなるかも出します。
          </>
        )}
      </p>

      {SHOW_FOOD_RATE && badge && <div className="note">{badge}</div>}

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>消費税の計算のしかた</h2>
      <p>
        消費税は本体価格に税率を掛けて求めます。税抜価格から税込価格を出すなら
        <strong>税抜 × 1.10</strong>（軽減税率なら × 1.08）、税込価格から税抜価格に戻すなら
        <strong>税込 ÷ 1.10</strong>（同じく ÷ 1.08）です。
      </p>
      <p>
        つまずきやすいのは<strong>1円未満の端数</strong>
        です。消費税額の1円未満をどう処理するか（切り捨て・四捨五入・切り上げ）は
        <strong>事業者の任意</strong>
        で、法律で1つに決められているわけではありません。そのため同じ商品でも店によって1円違うことがあり、レジの表示とこの計算機の答えが合わないことがあります。実務では切り捨てがもっとも多いので、このツールは切り捨てを既定にしています。
      </p>
      <p>
        現行の税率（10%・8%）は{formatDate(TAX_UPDATED_AT)}から変わっていません。
        <Link href="/waribiki-percent/">割引・パーセント計算</Link>
        では、割引と税込・税抜をまとめて計算できます。お酒にかかる税は
        <Link href="/shuzei-kaisei/">酒税改正 早見表・負担額計算</Link>
        、事業者として納める額は
        <Link href="/invoice-nozeigaku/">インボイス 納税額 比較計算機</Link>
        でご確認ください。
      </p>

      <h2>軽減税率（8%）の対象になるもの・ならないもの</h2>
      <p>
        8%になるのは<strong>飲食料品</strong>（酒税法の酒類と外食を除く）と、
        <strong>週2回以上発行される定期購読の新聞</strong>
        です。判定でよく問題になるのは次の3点です。
      </p>
      <ul>
        <li>
          <strong>酒類かどうか</strong>
          ：アルコール分1度以上の飲料は酒類なので10%です。本みりんは酒類（10%）ですが、みりん風調味料や料理酒は酒類に当たらないので8%になります。ノンアルコールビール・甘酒（1度未満）も8%です。
        </li>
        <li>
          <strong>外食かどうか</strong>
          ：飲食設備のある場所で飲食させる「食事の提供」は10%、持ち帰りは8%です。設備は店の持ち物でなくてもよく、フードコートのように合意に基づいて客に使わせているなら飲食設備にあたります。そばの出前や宅配ピザは「単に届けるだけ」なので8%ですが、届けた先で盛り付け・配膳をするケータリングは10%です。
        </li>
        <li>
          <strong>食品と食品以外がセットになっているか</strong>
          ：おもちゃ付きのお菓子のような一体資産は、
          <strong>税抜1万円以下</strong>かつ<strong>食品の割合が3分の2以上</strong>
          のときだけ全体が8%になります。どちらかを外れると全体が10%です。
        </li>
      </ul>
      <p>
        医薬品・医薬部外品は「食品」に含まれないので、医薬部外品の栄養ドリンクは10%です。水道水は飲用以外の生活用水と混ざって供給されるため10%ですが、ミネラルウォーターは8%です。入院時食事療養費にかかる病院食は
        <strong>非課税</strong>で、10%とはそもそも別の扱いになります。
      </p>

      {SHOW_FOOD_RATE && (
        <>
          <h2>2027年4月から食料品は1%に{PENDING && '（成立前です）'}</h2>
          <p>
            {formatDate(FOOD_RATE_2027.decidedOn)}
            、政府は給付付き税額控除の導入に関する基本方針を閣議決定し、
            <strong>
              飲食料品の消費税率を{formatDate(FOOD_RATE_2027.from)}から
              {formatDate(FOOD_RATE_2027.to)}までの2年間、8%から1%に引き下げる
            </strong>
            方針と、関連法案を臨時国会に提出することを定めました。
          </p>
          {PENDING && (
            <p>
              <strong>
                これは閣議決定であって、条文ではありません。法案は臨時国会で審議中で、まだ成立していません。
              </strong>
              成立の過程で対象の範囲や期間が変わることがあります。このページでは、成立前であることが分かるように1%の箇所に「予定」の印を付けています。
            </p>
          )}
          <p>
            1%が実現した場合に下がる幅は、税込価格に対して
            <strong>{formatPercent(FOOD_RELIEF_RATIO)}</strong>（1 − 1.01 ÷ 1.08）が上限の目安です。
            {KAKEI_CHOSA.year}年の家計調査で2人以上の世帯の平均
            {formatYen(KAKEI_TWO_OR_MORE_AT_HOME)}
            （食料{formatYen(KAKEI_CHOSA.twoOrMore.food)}から外食
            {formatYen(KAKEI_CHOSA.twoOrMore.eatingOut)}・酒類
            {formatYen(KAKEI_CHOSA.twoOrMore.alcohol)}を引いた額）で計算すると、1か月で最大
            {formatYen(exampleRelief.monthly)}、2年間で最大
            {formatYen(exampleRelief.total)}になります。
          </p>
          <p>
            ただしこれは<strong>「最大で」の額</strong>
            です。いまの税込8%の価格がそのまま税込1%の価格に置き換わるという前提なので、値下げが遅れたり価格が据え置かれたりすれば、実際に下がる額は小さくなります。また、
            <strong>この額に給付付き税額控除の給付は含みません</strong>
            。給付の額や条件は公表されていないため、このツールでは計算していません。
          </p>
        </>
      )}

      <h2>よくある質問</h2>
      <dl>
        {faq.map((f) => (
          <div key={f.q} style={{ marginBottom: 16 }}>
            <dt style={{ fontWeight: 700 }}>{f.q}</dt>
            <dd style={{ margin: '4px 0 0' }}>{f.a}</dd>
          </div>
        ))}
      </dl>

      <AdUnit position="below-faq" />

      <RelatedTools current="shohizei-keisan" />

      <ToolMeta slug="shohizei-keisan" ymyl>
        出典：
        <a href={SOURCE_NTA_KEIGEN.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_KEIGEN.label}
        </a>
        、
        <a href={SOURCE_NTA_QA.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_QA.label}
        </a>
        、
        <a href={SOURCE_KANTEI.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_KANTEI.label}
        </a>
        、
        <a href={SOURCE_KAKEI_CHOSA.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_KAKEI_CHOSA.label}
        </a>
        （{KAKEI_CHOSA.table}）。データ最終更新日：{formatDate(DATA_CHECKED_AT)}
      </ToolMeta>
    </>
  );
}
