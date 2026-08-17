import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';

const title = 'iDeCo 拠出限度額・節税額 計算機｜2026年12月改正で会社員は月6.2万円へ';
const description =
  '2026年12月1日の改正で、iDeCoの拠出限度額は会社員が月2.3万円→6.2万円に。ただし6.2万円は企業年金との合算枠で、あなたの上限は「6.2万円 − 事業主掛金」です。事業主掛金を入れて上限と年間の節税額、70歳までの累計を計算します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/ideco/` },
  robots: robotsFor('ideco'),
};

const faq = [
  {
    q: '2026年12月から、会社員は誰でも月6.2万円をiDeCoに出せますか？',
    a: 'いいえ。6.2万円は「iDeCo単体の上限」ではなく、企業年金と合わせた枠です。企業年金がない方は6.2万円まで出せますが、企業型DCやDB等がある方の上限は「6.2万円 −（企業型DCの事業主掛金 ＋ DB等の他制度掛金相当額）」になります。たとえば事業主掛金が月4万円なら、iDeCoに出せるのは月2.2万円です。事業主掛金が6.2万円以上の方はiDeCoに拠出できません。',
  },
  {
    q: 'いつから新しい限度額で拠出できますか？',
    a: '施行は2026年12月1日で、新しい限度額が適用されるのは2026年12月拠出分（2027年1月引落分）からです。それより前は改正前の限度額（会社員・企業年金なしなら月2.3万円）のままです。掛金額の変更を先に申し込んでも、増えた枠が実際の引き落としに反映されるのは2027年1月になります。',
  },
  {
    q: '事業主掛金の額はどこで分かりますか？',
    a: '勤め先から通知されます。企業型DCの事業主掛金は加入者向けのWebサイトや年1回の通知書で確認でき、DB等の他制度掛金相当額は勤め先の総務・人事に問い合わせると分かります。2024年12月の改正で事業主証明書が廃止され、制度の情報は企業年金プラットフォームで確認される仕組みになりましたが、自分の上限を知るには事業主掛金の額が必要です。',
  },
  {
    q: '改正前と何が変わるのですか。単に上限が上がるだけではないのですか？',
    a: '変わるのはルールの形です。改正前の企業年金加入者は「55,000円 − 事業主掛金」と「20,000円」の小さいほうが上限で、多くの方が20,000円の内枠で頭打ちになっていました。改正後はこの内枠が撤廃され、枠が62,000円に広がったうえで「62,000円 − 事業主掛金」がそのまま上限になります。つまり暗記できる一つの額ではなく、一人ひとり違う額を引き算で求めることになります。',
  },
  {
    q: '節税額はどう計算されますか？',
    a: 'iDeCoの掛金は全額が小規模企業共済等掛金控除として所得控除になります。本ツールは、掛金を引く前と引いた後の税額の差で節税額を出しています。所得税（復興特別所得税2.1%を含む）と住民税の所得割10%の合計です。「税率×掛金」で計算すると、掛金によって税率の区分をまたぐ方に実際より大きな額が出るため、税額の差で計算しています。',
  },
  {
    q: '自営業（第1号被保険者）はいくらになりますか？',
    a: '月6.8万円から7.5万円になります。この枠は国民年金基金の掛金・付加保険料と合算なので、それらを払っている方は、その額だけiDeCoの上限が下がります。第3号被保険者（扶養されている配偶者）は月2.3万円のままで、今回の改正の対象外です。',
  },
  {
    q: '何歳まで加入できますか？',
    a: '加入可能年齢が65歳未満から70歳未満に引き上げられます。老齢基礎年金・iDeCoの老齢給付金を受給していないことが条件です。積み立てられる期間が最大5年延びるため、その分だけ累計の節税額が増えます。本ツールでは65歳までと70歳までの累計を並べて表示します。',
  },
  {
    q: '受け取るときの税金は考えなくていいですか？',
    a: '考える必要があります。iDeCoは受け取るときにも課税があり、一時金なら退職所得控除、年金形式なら公的年金等控除の対象になります。勤続年数・受取方法・他の退職金との通算で税額が変わるため、本ツールでは扱っていません。掛金を出すときの節税額だけを見て判断せず、受取時まで含めて検討してください。',
  },
];

const trail = breadcrumbFor('ideco');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'iDeCo 拠出限度額・節税額 計算機',
      url: `${SITE_URL}/ideco/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('ideco'),
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

      <h1>iDeCo 拠出限度額・節税額 計算機</h1>
      <p className="lead">
        2026年12月1日の改正で、iDeCoの拠出限度額は会社員（企業年金なし）で月2.3万円から6.2万円になります。
        ただし<strong>6.2万円は企業年金と合わせた枠</strong>で、あなたの上限は
        <strong>「6.2万円 − 事業主掛金」</strong>です。勤め先の事業主掛金を入れて、
        自分の上限と年間の節税額を計算します。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>この改正は「引き上げ」ではなく「合算ルールへの切り替え」です</h2>
      <p>
        2026年12月1日施行の確定拠出年金法等の改正で、第2号被保険者（会社員・公務員）の
        iDeCoの拠出限度額は<strong>月6.2万円</strong>になります。企業年金がない会社員では
        月2.3万円からの2.7倍で、金額だけを見れば大きな引き上げです。
      </p>
      <p>
        しかし、変わったのは額よりも<strong>ルールの形</strong>です。改正前は
        「iDeCo単体の上限」が区分ごとに決まっていました。改正後は
        <strong>iDeCo単体の上限が撤廃され、企業年金と合算した枠の残りがiDeCoの上限</strong>になります。
      </p>
      <p style={{ fontWeight: 700 }}>
        iDeCoの拠出限度額 ＝ 62,000円 −（企業型DCの事業主掛金 ＋ DB等の他制度掛金相当額）
      </p>
      <p>
        つまり<strong>会社員のiDeCo上限は、勤め先の制度と事業主掛金の額で一人ひとり違う額になります。</strong>
      </p>
      <table>
        <thead>
          <tr>
            <th>勤め先の状況</th>
            <th>iDeCoに出せる額（月）</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>企業年金なし</td>
            <td>6.2万円</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>企業型DCの事業主掛金 1.0万円</td>
            <td>5.2万円</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>企業型DCの事業主掛金 4.0万円</td>
            <td>2.2万円</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>企業型DCの事業主掛金 6.2万円以上</td>
            <td>0円（拠出できない）</td>
          </tr>
        </tbody>
      </table>
      <p>
        改正前は「会社員は2.3万円」と暗記で済んでいたものが、改正後は
        <strong>引き算をしないと自分の上限が分からない</strong>——それがこの計算機を作った理由です。
      </p>

      <h2>いま出せる額と、2026年12月から出せる額は違います</h2>
      <p>
        施行日は2026年12月1日で、新しい限度額が適用されるのは
        <strong>2026年12月拠出分（2027年1月引落分）</strong>からです。
        それより前の掛金は改正前の限度額のままなので、
        <strong>いますぐ月6.2万円を拠出できるわけではありません。</strong>
      </p>
      <p>
        本ツールは「いま出せる額」と「2026年12月から出せる額」を必ず並べて表示します。
        掛金額の変更を先に申し込んでも、増えた枠が実際の引き落としに反映されるのは2027年1月です。
      </p>

      <h2>区分ごとの拠出限度額（改正前後）</h2>
      <table>
        <thead>
          <tr>
            <th>区分</th>
            <th>改正前（月額）</th>
            <th>改正後（月額）</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>第1号（自営業など）</td>
            <td>6.8万円</td>
            <td>7.5万円</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>第2号・企業年金なし</td>
            <td>2.3万円</td>
            <td>6.2万円</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>第2号・企業年金あり</td>
            <td>2.0万円（内枠）</td>
            <td>6.2万円 − 事業主掛金</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>第3号（扶養されている配偶者）</td>
            <td>2.3万円</td>
            <td>2.3万円（変更なし）</td>
          </tr>
        </tbody>
      </table>
      <p>
        第1号の枠は<strong>国民年金基金の掛金・付加保険料と合算</strong>なので、
        それらを払っている方はその額だけiDeCoの上限が下がります。
        第2号・企業年金ありの改正前の上限は
        「55,000円 −（事業主掛金 ＋ 他制度掛金相当額）」と「20,000円」の小さいほうで、
        多くの方が<strong>20,000円の内枠で頭打ち</strong>になっていました。
        改正ではこの内枠が撤廃され、枠が62,000円に広がります。
      </p>

      <h2>加入できる年齢も70歳未満まで延びます</h2>
      <p>
        加入可能年齢が<strong>65歳未満から70歳未満</strong>に引き上げられます
        （老齢基礎年金・iDeCoの老齢給付金を受給していないことが条件）。
        積み立てられる期間が最大5年延びるので、
        同じ掛金でも累計の拠出額と節税額がその分だけ増えます。
      </p>

      <h2>節税になる仕組み</h2>
      <p>
        iDeCoの掛金は<strong>全額が小規模企業共済等掛金控除</strong>として所得控除になります。
        課税所得がその分だけ下がるので、所得税（復興特別所得税2.1%を含む）と
        住民税の所得割10%が軽くなります。
      </p>
      <p>
        よく「掛金 ×（所得税率 ＋ 10%）」と説明されますが、
        <strong>掛金によって税率の区分をまたぐ方は、その式では多く出すぎます。</strong>
        本ツールは掛金を引く前と引いた後の税額の差で計算しているので、
        区分をまたぐ場合も正しい額になります。
      </p>
      <p>
        なお、iDeCoは<strong>受け取るときにも課税があります</strong>
        （一時金なら退職所得控除、年金形式なら公的年金等控除の対象）。
        掛金を出すときの節税額だけで判断しないでください。
      </p>

      <div className="note">
        本ツールは掛金の上限と所得控除による節税額という、制度から一意に決まる額だけを計算します。運用商品の選択・利回りのシミュレーションは行いません。受取時の税金（退職所得控除・公的年金等控除）、マッチング拠出との選択も扱っていません。加入や掛金額の判断は、運営管理機関（金融機関）・勤め先・国民年金基金連合会の案内をご確認ください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="ideco" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link>／
        <Link href="/furusato-nozei/">ふるさと納税 控除額計算機</Link>
      </p>

      <ToolMeta slug="ideco" ymyl>
        出典：
        <a
          href="https://www.mhlw.go.jp/content/10600000/001365075.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省 社会保障審議会 企業年金・個人年金部会 資料
        </a>
        ／
        <a
          href="https://dc.rakuten-sec.co.jp/about/revised/202505/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          楽天証券「【2026年12月制度改正】iDeCoの加入可能年齢・拠出限度額が引き上げ」
        </a>
        ／
        <a
          href="https://info.monex.co.jp/news/2026/20260514_01.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          マネックス証券「iDeCo拠出限度額および加入可能年齢の引き上げ（2026年12月制度改正）」
        </a>
        にもとづき作成。新しい限度額は2026年12月拠出分（2027年1月引落分）から適用されます。
      </ToolMeta>
    </>
  );
}
