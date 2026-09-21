import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import {
  COPAY_OPTIONS,
  DATA_CHECKED_AT,
  ENFORCEMENT_LABEL,
  EXCLUSIONS,
  SOURCE_MHLW_213,
  SOURCE_MHLW_214,
  SOURCE_MHLW_LAW,
  SOURCE_MHLW_TORIMATOME,
  TRANSITION_LABEL,
  TRANSITION_NOTE,
  calculate,
  effectiveBurdenRate,
  effectiveBurdenRateWithTax,
  formatDate,
  formatPercent,
  formatYen,
} from '@/lib/otc-ruijiyaku';
import { ITEM_COUNT, ITEMS_CHECKED_AT, TOTAL_LABEL } from '@/lib/otc-ruijiyaku-items';
import Calculator from './Calculator';

/**
 * **「保険適用外」「全額自費」と書かない**（仕様書の必須項目）。
 *
 * 対象になるのは薬剤料の4分の1だけで、残りの4分の3には保険給付が残る。
 * ネット上の解説はここを雑に書いたものが多く、当サイトが同じ誤りを出す側に回らない。
 * `tests/otc-ruijiyaku.test.ts` がこのファイルの文言を検査して落とす。
 */
const title = 'OTC類似薬「特別の料金」自己負担 計算機｜2027年3月から窓口はいくら増えるか';

const description =
  '2027年3月から、市販薬と同じ成分の処方薬は薬剤料の4分の1が保険外の「特別の料金」になります。薬剤料の点数と窓口負担の割合を入れると、いままでといくら変わるかを出します。18歳の年度末まで・がんや難病・入院中の処方は対象外で、湿布と皮膚の保湿剤は2029年3月末まで対象外です。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/otc-ruijiyaku/` },
  robots: robotsFor('otc-ruijiyaku'),
};

/** 本文で使う代表例（静的HTMLに焼き込む。開いた日に依存しない） */
const example = calculate({ points: 100, copayPercent: 30, prescribedOn: '2027-03-01' })!;

/**
 * ビルドした日。`Calculator` の「処方を受ける日」の初期値に渡す。
 * **クライアント側で `new Date()` を初期値にするとハイドレーションが食い違う**
 * （静的書き出しなので、HTMLはビルド日・閲覧はその後の日になる）。
 */
const buildDate = new Date().toISOString().slice(0, 10);

const faq = [
  {
    q: '2027年3月から、処方薬は保険が効かなくなるのですか？',
    a: 'いいえ。対象になるのは市販薬と同じ成分の処方薬（OTC類似薬）の薬剤料のうち4分の1だけで、この部分が保険外の「特別の料金」になります。残りの4分の3にはこれまでどおり保険給付が残るので、全額自己負担になるわけではありません。3割負担の人なら、薬剤料に対する実質の負担は30%から47.5%になります。',
  },
  {
    q: '湿布も高くなりますか？',
    a: `湿布（外用鎮痛消炎剤）と皮膚の保湿剤は、一定の重症患者の長期使用の実態を踏まえた経過措置で、${TRANSITION_LABEL}までは「特別の料金」の対象外です。この期間は窓口で払う額は変わりません。経過措置が終わったあとの扱いは告示で確認が必要です。`,
  },
  {
    q: '子どもも対象になりますか？',
    a: '18歳の年度末まで（18歳に達した日以後の最初の3月31日まで）は対象外とされています。年齢で切るのではなく年度で切るので、高校3年生の3月までは対象になりません。',
  },
  {
    q: 'どんな人が対象外になりますか？',
    a: `中間とりまとめでは、①がん患者 ②難病患者 ③公費負担医療の対象となる慢性疾患の患者 ④入院中・退院時の処方 ⑤処置・手術等の一環としての処方（14日分まで） ⑥医師が長期の使用を医療上必要と認めた場合（内服は年におおむね50週、外用は通年）の類型が挙げられています。これに18歳の年度末までが加わります。`,
  },
  {
    q: '低所得者は対象外になりますか？',
    a: '「低所得者」として対象外とされているのは、いまのところ生活保護を受けている方（医療扶助）です。厚生労働省の資料では「低所得者」の欄に「生活保護受給者」と書かれています。ただし、2026年9月の医療保険部会では「生活保護受給者以外の低所得者についても負担能力に配慮すべき」という意見が出ており、範囲が広がる可能性は残っています。告示で類型が増えればチェック項目に追加します。',
  },
  {
    q: '「特別の料金」に消費税はかかりますか？',
    a: 'かかります。厚生労働省の資料（第213回 社会保障審議会医療保険部会 資料1）に「選定療養に係る『特別の料金』には別途消費税がかかっている」と明記されています。このツールは消費税を含めた額を「窓口で払う額」として出しています。薬剤料100点・3割負担なら、特別の料金250円に消費税25円が乗って、窓口は300円から500円になります。なお同じ資料の試算表は消費税を含めない基準で作られているので、突き合わせやすいように税抜の額も併記しています。',
  },
  {
    q: '高額療養費の計算に入りますか？',
    a: '「特別の料金」は保険外の負担なので、高額療養費の合算対象にはならないとみられます。ただしこれも告示で確認できていません。高額療養費そのものの計算は高額療養費 自己負担限度額 計算機でご確認ください。',
  },
  {
    q: '市販薬に切り替えたほうが安いですか？',
    a: 'このツールは薬を切り替えるべきかどうかを判断しません。どの薬を使うかは医師・薬剤師の判断で、同じ成分でも用量や剤形が違います。制度としていくら変わるかだけを出しています。',
  },
  {
    q: '領収証の金額と合いません',
    a: `このツールが出すのは薬剤料の分だけです。実際の窓口では調剤技術料・薬学管理料などが加わり、一部負担金は明細の合計に対して10円未満を四捨五入するため、領収証の額とは一致しません。また円未満の端数処理は告示で決まっていないため、四捨五入を暫定で使っています（データ最終更新日：${formatDate(DATA_CHECKED_AT)}）。`,
  },
  {
    q: '成分の一覧に載っていれば、必ず「特別の料金」がかかりますか？',
    a: 'いいえ。同じ成分でも、市販薬にない効能効果で処方された場合は対象外です。たとえばヘパリン類似物質は、皮脂欠乏症や肥厚性瘢痕・ケロイドの治療と予防では対象になりますが、血栓性静脈炎、血行障害に基づく疼痛と炎症性疾患、筋性斜頸（乳児期）では対象外です。処方の目的で決まるので、成分名だけでは判断できません。',
  },
  {
    q: '妊娠中・授乳中でも「特別の料金」がかかりますか？',
    a: '市販薬の添付文書で「服用しないこと」とされている成分（例：イトプリド塩酸塩）については、妊娠中の方・妊娠している可能性がある方・授乳中の方への処方は対象外とされています。医師が有益性を判断して例外的に処方するものだからです。すべての成分に当てはまるわけではありません。',
  },
];

const trail = breadcrumbFor('otc-ruijiyaku');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'OTC類似薬「特別の料金」自己負担 計算機',
      url: `${SITE_URL}/otc-ruijiyaku/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('otc-ruijiyaku'),
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

      <h1>OTC類似薬「特別の料金」自己負担 計算機</h1>
      <p className="lead">
        {ENFORCEMENT_LABEL}から、市販薬と同じ成分の処方薬は
        <strong>薬剤料の4分の1が保険外の「特別の料金」</strong>
        になります。薬剤料の点数と窓口負担の割合を入れると、いままでといくら変わるかが出ます。
        <strong>かからない場合は金額より先に判定</strong>します。
      </p>

      <div className="note">
        <strong>まだ告示・省令が出ていません。</strong>
        このページは2026年8月6日の中間とりまとめと、その後の社会保障審議会医療保険部会の資料にもとづく試算です。施行日の「日」・円未満の端数処理・経過措置がどの薬効分類まで及ぶかは、まだ確定していません。
      </div>

      <Calculator buildDate={buildDate} />

      <AdUnit position="below-tool" />

      <h2>「特別の料金」とは何か</h2>
      <p>
        2026年5月29日に成立した健康保険法等の一部を改正する法律（令和8年法律第31号）により、
        <strong>市販薬（OTC医薬品）と同じ成分の処方薬</strong>について、
        {ENFORCEMENT_LABEL}から<strong>薬剤料の4分の1を「特別の料金」として患者が全額負担</strong>
        する仕組みが始まります。残りの4分の3には、これまでどおり保険給付が残ります。
      </p>
      <p>
        <strong>「保険が効かなくなる」「全額自費になる」わけではありません。</strong>
        この制度は保険外併用療養の一種で、保険の効く部分と効かない部分を1回の処方のなかで組み合わせるものです。ネット上の解説にはここを取り違えたものがあるので、注意してください。
      </p>
      <p>
        薬剤料100点（{formatYen(example.drugCost)}）・3割負担で計算すると、窓口で払う薬剤料の分は
        <strong>
          {formatYen(example.before)}から{formatYen(example.afterWithTax)}（＋
          {formatYen(example.increaseWithTax)}）
        </strong>
        になります。内訳は特別の料金{formatYen(example.specialCharge)}、それにかかる消費税
        {formatYen(example.consumptionTax)}、保険がきく4分の3の分
        {formatYen(example.insuredCopay)}です。
      </p>
      <p>
        <strong>特別の料金には消費税がかかります。</strong>
        厚生労働省の資料に「選定療養に係る『特別の料金』には別途消費税がかかっている」と明記されています。同じ資料に載っている負担額の試算表は消費税を含めない基準で作られているため、このページでは税を含めない額（
        {formatYen(example.after)}・＋{formatYen(example.increase)}）も併記しています。
      </p>

      <h2>実質の負担率</h2>
      <p>
        特別の料金（薬剤料の25%）は全額負担で、残りの75%にだけ窓口負担の割合がかかります。薬剤料に対する実質の負担率は次のとおりです。
      </p>
      <table>
        <thead>
          <tr>
            <th>窓口負担の割合</th>
            <th>いままで</th>
            <th>{ENFORCEMENT_LABEL}から（消費税込み）</th>
            <th>同（消費税を除く）</th>
          </tr>
        </thead>
        <tbody>
          {COPAY_OPTIONS.map((option) => (
            <tr key={option.value}>
              <th scope="row">{option.label}</th>
              <td>{option.value}%</td>
              <td>
                <strong>{formatPercent(effectiveBurdenRateWithTax(option.value))}</strong>
              </td>
              <td>{formatPercent(effectiveBurdenRate(option.value))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        消費税がかかるのは特別の料金（薬剤料の25%）の部分だけで、保険がきく部分には乗りません。右端の列は、厚生労働省の資料の試算表と同じ「消費税を含めない」基準です。
      </p>

      <h2>かからない場合（ここを先に確かめてください）</h2>
      <p>
        <strong>
          湿布・塗り薬の鎮痛消炎剤と皮膚の保湿剤・保護剤は、経過措置で{TRANSITION_LABEL}
          までは「特別の料金」の対象外とされています。
        </strong>
        一定の重症患者の長期使用の実態を踏まえたものです。「湿布も1.5倍になる」と書く解説がありますが、経過措置に当たる処方であれば増えません。
      </p>
      <p className="note">
        <strong>ただし、経過措置がどこまで及ぶかは確定していません。</strong>
        {TRANSITION_NOTE}
      </p>
      <p>そのほか、次の場合も対象外とされています。</p>
      <ul>
        {EXCLUSIONS.map((def) => (
          <li key={def.id}>
            <strong>{def.label}</strong>
            {def.note && <>：{def.note}</>}
          </li>
        ))}
      </ul>
      <p>
        医療費が高額になったときの上限は
        <Link href="/kogaku-ryoyohi/">高額療養費 自己負担限度額 計算機</Link>、1年分の医療費から所得税を取り戻す計算は
        <Link href="/iryohi-kojo/">医療費控除・セルフメディケーション税制 計算機</Link>
        でご確認ください。「特別の料金」は保険外の負担なので、高額療養費の合算対象にはならないとみられますが、これも告示で確認が必要です。
      </p>

      <h2>対象になる薬</h2>
      <p>
        厚生労働省が公表した対象品目一覧は<strong>{TOTAL_LABEL}</strong>
        （2026年8月1日時点）です。上の早見表には
        <strong>この{ITEM_COUNT}成分すべて</strong>
        を載せています。成分名と用途は、第213回 社会保障審議会医療保険部会 資料1の成分表の表記をそのまま写したものです（{formatDate(ITEMS_CHECKED_AT)}に突き合わせ）。解熱鎮痛薬・湿布・抗アレルギー薬・皮膚の保湿剤・ステロイドの塗り薬・抗真菌薬・胃薬・便秘薬・去痰薬・消毒薬などが含まれます。
      </p>
      <p>
        <strong>ただし、成分が載っている＝必ず「特別の料金」がかかる、ではありません。</strong>
        同じ成分でも、市販薬にない効能効果で処方された場合は対象外です。厚生労働省は成分ごとに医療用医薬品と市販薬の効能効果の対応関係を整理していて、対応しない使い方は「特別の料金」の対象から外れます。たとえばヘパリン類似物質は、皮脂欠乏症や肥厚性瘢痕・ケロイドの治療と予防では対象ですが、血栓性静脈炎、血行障害に基づく疼痛と炎症性疾患、筋性斜頸（乳児期）では対象外です。
      </p>
      <p>
        品目名（商品名）は載せていません。対象は成分で決まり、品目単位の一覧は2027年4月の薬価改定で中身が動くためです。
      </p>

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

      <RelatedTools current="otc-ruijiyaku" />

      <ToolMeta slug="otc-ruijiyaku" ymyl>
        出典：
        <a href={SOURCE_MHLW_TORIMATOME.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_MHLW_TORIMATOME.label}
        </a>
        、
        <a href={SOURCE_MHLW_213.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_MHLW_213.label}
        </a>
        、
        <a href={SOURCE_MHLW_214.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_MHLW_214.label}
        </a>
        、
        <a href={SOURCE_MHLW_LAW.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_MHLW_LAW.label}
        </a>
        。データ最終更新日：{formatDate(DATA_CHECKED_AT)}
      </ToolMeta>
    </>
  );
}
