import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import {
  CREDIT_RATE,
  DATA_CHECKED_AT,
  INCOME_LIMIT,
  INCOME_LIMIT_SMALL,
  RESIDENT_CAP_MAX,
  SOURCE_MLIT,
  SOURCE_MOF,
  SOURCE_NTA_EXISTING,
  SOURCE_NTA_NEW,
  SOURCE_NTA_RESALE,
  calculate,
  formatDate,
  formatRate,
  formatMan,
  formatYen,
} from '@/lib/jutaku-loan-kojo';
import Calculator from './Calculator';

const title = '住宅ローン控除 計算機｜2030年末入居まで5年延長（令和8年度税制改正対応）';

const description =
  '令和8年度税制改正で、住宅ローン控除の適用期限が5年延びて令和12年（2030年）12月31日入居までになりました。入居年・住宅の種類・省エネ区分・子育て世帯かどうかを選ぶと、借入限度額と控除期間、その年の控除額が出ます。「控除額」と「実際に戻る額（所得税＋住民税）」を分けて表示し、改正前との比較と早見表も載せています。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/jutaku-loan-kojo/` },
  robots: robotsFor('jutaku-loan-kojo'),
};

/**
 * 本文で使う代表例（静的HTMLに焼き込む）。
 * 令和8年入居・新築のZEH水準省エネ住宅・一般の世帯・年末残高4,000万円。
 * 借入限度額3,500万円で頭打ちになり、控除額は24.5万円になる。
 */
const example = calculate({
  year: 2026,
  kind: 'new',
  grade: 'zeh',
  tokurei: false,
  floorArea: 75,
  totalIncome: 6_000_000,
  balance: 40_000_000,
})!;

/**
 * 「控除額＝戻る額」ではないことを見せるための例。
 *
 * **控除額は `example` と同じ24.5万円のまま、納めている税金のほうを小さくしてある。**
 * 所得税額が控除額より多い人で例を作ると切り捨てが1円も出ず、
 * この節が言いたいこと（納めた税金より多くは戻らない）が例から読み取れなくなる。
 * 所得税額97,000円・課税総所得金額等190万円は、給与収入570万円ほどの人のおおよその額。
 */
const exampleRefund = calculate({
  year: 2026,
  kind: 'new',
  grade: 'zeh',
  tokurei: false,
  floorArea: 75,
  totalIncome: 4_000_000,
  balance: 40_000_000,
  incomeTax: 97_000,
  taxableIncomeTax: 1_900_000,
})!;

const faq = [
  {
    q: '住宅ローン控除は2025年末で終わったのではないですか？',
    a: '終わっていません。令和8年度税制改正で適用期限が5年延長され、令和12年（2030年）12月31日までに入居した人まで対象になりました。「2025年末まで」と書いてある解説記事は改正前の内容です。国土交通省の「住宅ローン減税」のページにも「適用期限を５年間延長（入居日が令和８年１月１日から令和12年12月31日まで）」と明記されています。',
  },
  {
    q: '令和8年度税制改正で何が変わりましたか？',
    a: '大きく4つです。(1) 適用期限が5年延長されて令和12年末入居までになりました。(2) 既存住宅（中古）のうち省エネ性能の高いもの（認定住宅・ZEH水準省エネ住宅）の借入限度額が3,000万円から3,500万円に上がりました。(3) 同じく既存住宅の認定住宅等の控除期間が10年から13年に拡充されました。(4) 子育て世帯・若者夫婦世帯への上乗せ措置の対象が拡充され、既存住宅にも及ぶようになりました。あわせて床面積要件も新築・既存とも40㎡以上に緩和されています。',
  },
  {
    q: '「控除額」がそのまま戻ってくるのですか？',
    a: `いいえ。住宅ローン控除は税額控除なので、もともと納めている税金より多くは戻りません。まず所得税から引き、引ききれなかった分だけを住民税から引けます。住民税側には「課税総所得金額等の5%・最大${formatYen(RESIDENT_CAP_MAX)}」という上限があり、それも超えた分は切り捨てになります。年末残高の0.7%がまるまる戻ると思っている人が多いのですが、所得税額が小さい人ほど使い切れません。この計算機は「控除額」と「実際に戻る額」を分けて出します。`,
  },
  {
    q: '子育て世帯・若者夫婦世帯とは誰のことですか？',
    a: '国税庁の言い方では「特例対象個人」で、入居した年の12月31日時点で、(1) 40歳未満で配偶者がいる人 (2) 40歳以上で配偶者が40歳未満の人 (3) 19歳未満の扶養親族がいる人、のいずれかに当たる人です。当てはまると借入限度額が上乗せされます。ただし令和8年1月1日以降に床面積40㎡以上50㎡未満の認定住宅等に入居した場合は、上乗せを使えません。',
  },
  {
    q: '省エネ基準を満たさない住宅でも控除を受けられますか？',
    a: '新築の場合、令和6年入居分から「その他の住宅」（認定住宅等に当たらない住宅）は原則として控除の対象外です。ただし令和5年12月31日までに建築確認を受けたもの、または令和6年6月30日までに建築されたものは、借入限度額2,000万円・控除期間10年で控除を受けられます。既存住宅（中古）と買取再販住宅は「その他の住宅」でも借入限度額2,000万円・控除期間10年で対象になります。',
  },
  {
    q: '省エネ基準適合住宅はいつまで対象ですか？',
    a: '新築の省エネ基準適合住宅は、令和10年（2028年）以降の入居では原則として対象外になります。ただし令和9年12月31日までに建築確認を受けたもの、または令和10年6月30日までに建築されたものは、借入限度額2,000万円・控除期間10年で控除を受けられます。買取再販住宅と既存住宅の省エネ基準適合住宅は、令和12年入居まで対象です。',
  },
  {
    q: '床面積が40㎡台でも受けられますか？',
    a: `受けられますが、その年の合計所得金額が${formatMan(INCOME_LIMIT_SMALL)}以下であることが条件です（50㎡以上なら${formatMan(INCOME_LIMIT)}以下）。床面積は登記事項証明書の表示で判断し、マンションは専有部分で見ます。また、令和8年1月1日以降に40㎡以上50㎡未満の認定住宅等に入居した場合は、子育て世帯・若者夫婦世帯への上乗せ措置を使えません。`,
  },
  {
    q: '所得が2,000万円を超えた年はどうなりますか？',
    a: `その年だけ控除を受けられません。控除そのものが打ち切られるわけではないので、翌年に合計所得金額が${formatMan(INCOME_LIMIT)}以下に戻れば、控除期間の範囲でまた受けられます。`,
  },
  {
    q: '手続きはどうすればいいですか？',
    a: '控除を受ける最初の年は確定申告が必要です。「住宅借入金等特別控除額の計算明細書」に、金融機関から届く「住宅取得資金に係る借入金の年末残高等証明書」、登記事項証明書、売買契約書または工事請負契約書の写しなどを添えて提出します。給与所得者は2年目以降、税務署から送られてくる「年末調整のための住宅借入金等特別控除証明書兼給与所得者の住宅借入金等特別控除申告書」と年末残高等証明書を勤務先に出せば、年末調整で受けられます。',
  },
  {
    q: 'ふるさと納税と併用できますか？',
    a: 'できますが、確定申告でふるさと納税をすると寄附金控除で課税所得が下がり、所得税額と住民税側の控除限度額の両方が小さくなるため、住宅ローン控除を使い切れなくなることがあります。ふるさと納税の上限額の計算はふるさと納税 上限額シミュレーターにあり、住宅ローン控除との併用にも対応しています。',
  },
  {
    q: '借入額と金利から年末残高を計算できますか？',
    a: 'この計算機では年末残高を直接入れてもらう形にしています。借入額・金利・返済期間から元利均等返済の残高を概算する機能は、検証すべき前提が増えるため初版では入れていません。年末残高は金融機関から届く年末残高等証明書に書かれています。',
  },
  {
    q: '災害レッドゾーンにある住宅も対象ですか？',
    a: '令和10年（2028年）以降に入居する新築住宅は、災害レッドゾーン（土砂災害特別警戒区域、地すべり防止区域、急傾斜地崩壊危険区域、浸水被害防止区域、災害危険区域）にあると対象外になります。既存住宅・買取再販住宅・リフォーム、および特定建替えは対象のままです。',
  },
];

const trail = breadcrumbFor('jutaku-loan-kojo');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '住宅ローン控除 計算機',
      url: `${SITE_URL}/jutaku-loan-kojo/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('jutaku-loan-kojo'),
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

      <h1>住宅ローン控除 計算機</h1>
      <p className="lead">
        令和8年度税制改正で、住宅ローン控除の適用期限が
        <strong>5年延長されて令和12年（2030年）12月31日入居まで</strong>
        になりました。入居年・住宅の種類・省エネの区分・世帯を選ぶと、借入限度額と控除期間、その年の控除額が出ます。
        <strong>「控除額」と「実際に戻る額」は別物</strong>なので、分けて表示します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>令和8年度税制改正で何が変わったか</h2>
      <p>
        財務省の「令和8年度税制改正の大綱の概要」には、住宅ローン控除について
        「既存住宅のうち省エネ性能の高い認定住宅・ＺＥＨ水準省エネ住宅に係る借入限度額の引上げ、子育て世帯への上乗せ措置の対象の拡充、床面積要件の緩和等の見直しを行った上で、
        <strong>適用期限を５年延長する</strong>」とあります。国土交通省のページでは、延長後の入居期限が
        <strong>令和8年1月1日から令和12年12月31日まで</strong>だと明示されています。
      </p>
      <ul>
        <li>
          <strong>適用期限が5年延長</strong>されて、令和12年（2030年）12月31日までの入居が対象になった
        </li>
        <li>
          <strong>既存住宅（中古）の認定住宅・ZEH水準省エネ住宅の借入限度額が引上げ</strong>
          （3,000万円 → 3,500万円）
        </li>
        <li>
          <strong>既存住宅の認定住宅等の控除期間が10年から13年に拡充</strong>
        </li>
        <li>
          <strong>子育て世帯・若者夫婦世帯への上乗せ措置の対象が拡充</strong>され、既存住宅にも及ぶようになった
        </li>
        <li>
          <strong>床面積要件が新築・既存とも40㎡以上に緩和</strong>
          （合計所得金額1,000万円超の人と、上乗せ措置を使う人は50㎡以上）
        </li>
      </ul>
      <p className="note">
        新築住宅については、借入限度額が上がったわけではありません。上がったのは
        <strong>既存住宅（中古）の省エネ性能が高いもの</strong>で、新築の省エネ基準適合住宅は令和8年入居分から3,000万円が2,000万円に下がります。
      </p>

      <h2>控除額の計算のしかた</h2>
      <p>
        各年の控除額は<strong>年末残高等 × {formatRate(CREDIT_RATE)}</strong>
        で、100円未満は切り捨てます。年末残高等が借入限度額を超えるときは、借入限度額で頭打ちになります。
      </p>
      <p>
        たとえば令和8年に新築のZEH水準省エネ住宅（一般の世帯）に入居し、年末残高が
        {formatYen(40_000_000)}あった場合、借入限度額は{formatMan(example.limit)}
        なので、控除額は<strong>{formatYen(example.annualCredit)}</strong>です。
        控除期間は{example.years}年なので、残高が借入限度額以上のまま続いたとしても、
        控除額の合計は最大で{formatYen(example.maxTotal)}になります。
      </p>

      <h2>「控除額」と「実際に戻る額」は別物</h2>
      <p>
        <strong>ここが誤解のいちばん多いところです。</strong>
        住宅ローン控除は税額控除なので、
        <strong>もともと納めている税金より多くは戻りません</strong>。
        まず所得税から引き、引ききれなかった分だけを住民税から引けます。住民税側には
        「課税総所得金額等の5%・最大{formatYen(RESIDENT_CAP_MAX)}」という上限があり、それも超えた分は切り捨てになります。
      </p>
      <p>
        控除額は同じ{formatYen(exampleRefund.annualCredit)}でも、その年の所得税額が
        {formatYen(97_000)}、課税総所得金額等が{formatYen(1_900_000)}
        の人だとこうなります。所得税から{formatYen(exampleRefund.refund!.fromIncomeTax)}、
        住民税から{formatYen(exampleRefund.refund!.fromResidentTax)}
        （課税総所得金額等の5%）で、実際に戻るのは
        <strong>{formatYen(exampleRefund.refund!.used)}</strong>。
        残りの<strong>{formatYen(exampleRefund.refund!.wasted)}</strong>
        は引ききれずに切り捨てになります。
        借入限度額いっぱいまで借りても、税金を納めていなければ使い切れません。
      </p>

      <h2>手続き — 1年目は確定申告、2年目以降は年末調整</h2>
      <p>
        <strong>控除を受ける最初の年は確定申告が必要です。</strong>
        「住宅借入金等特別控除額の計算明細書」に、金融機関から届く
        「住宅取得資金に係る借入金の年末残高等証明書」、家屋と土地の登記事項証明書、
        売買契約書または工事請負契約書の写しなどを添えて、住所地の税務署に提出します。
        認定住宅等として申告する場合は、その認定を受けたことを証する書類も要ります。
      </p>
      <p>
        <strong>給与所得者は2年目以降、年末調整で受けられます。</strong>
        税務署から送られてくる「年末調整のための住宅借入金等特別控除証明書兼給与所得者の住宅借入金等特別控除申告書」と、
        その年の年末残高等証明書を勤務先に提出します。年末調整で受けられるようになると確定申告は要りません。
        年末調整で還付される額の見当をつけるなら
        <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link>もどうぞ。
      </p>

      <h2>ふるさと納税・医療費控除との関係</h2>
      <p>
        住宅ローン控除とふるさと納税は併用できますが、確定申告でふるさと納税をすると寄附金控除で課税所得が下がり、
        <strong>所得税額と住民税側の控除限度額の両方が小さくなる</strong>
        ため、住宅ローン控除を使い切れなくなることがあります。ふるさと納税の上限額は
        <Link href="/furusato-nozei/">ふるさと納税 上限額シミュレーター</Link>
        で計算できます（住宅ローン控除との併用に対応しています）。
        医療費控除を使う年も所得控除が増えるので、同じことが起こります。1年分の医療費から取り戻せる額は
        <Link href="/iryohi-kojo/">医療費控除・セルフメディケーション税制 計算機</Link>
        でご確認ください。
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

      <RelatedTools current="jutaku-loan-kojo" />

      <ToolMeta slug="jutaku-loan-kojo" ymyl>
        出典：
        <a href={SOURCE_NTA_NEW.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_NEW.label}
        </a>
        、
        <a href={SOURCE_NTA_RESALE.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_RESALE.label}
        </a>
        、
        <a href={SOURCE_NTA_EXISTING.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_NTA_EXISTING.label}
        </a>
        、
        <a href={SOURCE_MLIT.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_MLIT.label}
        </a>
        、
        <a href={SOURCE_MOF.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_MOF.label}
        </a>
        。データ最終更新日：{formatDate(DATA_CHECKED_AT)}
      </ToolMeta>
    </>
  );
}
