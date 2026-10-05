import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  CURRENT,
  DATA_CHECKED_AT,
  FULL_INSURED_MONTHS,
  PREVIOUS_INCOME_LIMIT,
  thresholds,
} from '@/lib/nenkin-shien-kyufukin';
import Calculator from './Calculator';

const title =
  '年金生活者支援給付金 対象判定・月額 計算機（2026年10月分〜）｜所得基準 826,500 円・月額 5,620 円';
const description =
  '年金生活者支援給付金の対象か・月いくらかを計算。2026年10月分から所得基準額が826,500円に上がりました。生年月日・前年の年金収入・保険料の納付済／免除の月数を入れると、老齢・補足的老齢・障害・遺族の判定と月額を日本年金機構の式どおりに出します。基準を超えても10万円の幅で減額して出る補足的給付も判定。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/nenkin-shien-kyufukin/` },
  robots: robotsFor('nenkin-shien-kyufukin'),
};

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

/** '2026-10-05' → '2026年10月5日' */
const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};

const AFTER = thresholds(false);
const BEFORE = thresholds(true);
const BASE = CURRENT.baseAmount;

const faq = [
  {
    q: '遺族年金や障害年金は「年金収入」に数えますか？',
    a: `数えません。遺族年金・障害年金は非課税なので、老齢の所得基準（${yen(AFTER.base)}）と比べる「公的年金等の収入金額」に入れるのは、老齢基礎年金・老齢厚生年金など課税される年金だけです。`,
  },
  {
    q: '老齢基礎年金を繰上げて受け取っています。対象になりますか？',
    a: '繰上げ受給中でも、65歳になるまでは老齢年金生活者支援給付金は受けられません。65歳に達した月の翌月分から対象になり、そのときに要件（世帯全員の非課税・所得基準）を満たしていれば請求できます。',
  },
  {
    q: '夫婦で片方だけ対象になることはありますか？',
    a: 'あります。世帯全員が市町村民税非課税であることは夫婦共通ですが、所得基準は一人ひとりの年金収入とその他の所得で判定し、月額も一人ひとりの納付済・免除の月数で決まります。夫の年金収入が基準を超えて妻だけ対象、ということがあります。',
  },
  {
    q: '請求書（はがき）が届きません。',
    a: '請求書は、日本年金機構が市区町村の所得情報で「新たに対象になりそう」と判断した人に、9月ごろから順次送られます。届かなくても要件を満たしていれば、年金事務所に請求書を出すと受けられます。65歳になる人には、老齢基礎年金の請求書と一緒に案内が届きます。',
  },
  {
    q: '毎年請求が必要ですか？',
    a: '一度請求して受け始めた人は、翌年度以降も要件を満たしていれば請求し直す必要はありません。所得が基準を超えた年度は支給が止まり、その後に再び要件を満たしたときは改めて請求が必要です（対象になりそうな人には請求書が届きます）。',
  },
];

const trail = breadcrumbFor('nenkin-shien-kyufukin');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '年金生活者支援給付金 対象判定・月額 計算機',
      url: `${SITE_URL}/nenkin-shien-kyufukin/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('nenkin-shien-kyufukin'),
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

const src = (href: string, label: string) => (
  <a href={href} target="_blank" rel="nofollow noopener noreferrer">
    {label}
  </a>
);

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>年金生活者支援給付金 対象判定・月額 計算機</h1>
      <p className="lead">
        年金生活者支援給付金は、所得の少ない年金受給者の年金に上乗せされる給付金です。
        <strong>2026年10月分から所得基準額が{yen(AFTER.base)}に上がり</strong>
        、9月からは新たに対象になりそうな人に緑色の封筒で請求書（はがき）が届いています。
        生年月日と前年の年金収入、保険料を納めた月数を入れると、対象か・月いくらかがわかります。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>3つの要件（老齢の場合）</h2>
      <ul>
        <li>
          <strong>65歳以上</strong>で、老齢基礎年金を受けている
        </li>
        <li>
          <strong>同じ世帯の全員が市町村民税非課税</strong>（本人だけでなく、同居の家族全員）
        </li>
        <li>
          前年の公的年金等の収入金額とその他の所得の合計が<strong>所得基準額以下</strong>（昭和31年4月2日以後生まれは
          {yen(AFTER.base)}、それより前に生まれた人は{yen(BEFORE.base)}。9月分までは{yen(PREVIOUS_INCOME_LIMIT)}）
        </li>
      </ul>
      <p>
        障害基礎年金・遺族基礎年金を受けている人の給付金は要件が違い、前年の所得が
        {yen(CURRENT.shogaiIzokuLimit)}（扶養親族の数に応じて加算）以下であれば対象です。
        <strong>世帯全員の非課税は要件ではありません。</strong>
        日本国内に住んでいない、年金が全額支給停止になっている、刑事施設に拘禁されている、のいずれかにあたる場合は支給されません。
      </p>

      <h2>月額の計算式（令和8年度）</h2>
      <p>
        老齢年金生活者支援給付金の月額は、保険料を納めた月数と免除された月数で決まります。
        40年（{FULL_INSURED_MONTHS}月）すべて納めた人が<strong>月{yen(BASE)}</strong>（年{yen(BASE * 12)}）です。
      </p>
      <ul>
        <li>
          納付済期間の分 ＝ {yen(BASE)} × 納付済月数 ÷ {FULL_INSURED_MONTHS}月
        </li>
        <li>
          免除期間の分 ＝ {yen(AFTER.exemptFull)} × 免除月数 ÷ {FULL_INSURED_MONTHS}月（1/4免除の月は{yen(AFTER.exemptQuarter)}）
        </li>
      </ul>
      <p>
        たとえば納付済240月・全額免除60月なら、2,810円 ＋ 1,471円 ＝ <strong>月4,281円</strong>
        です（年金機構の計算例）。円未満は50銭以上を切り上げ、50銭未満を切り捨てます。
        納付猶予・学生納付特例の月（追納していないもの）は免除期間に入りません。
        昭和16年4月1日以前に生まれた人は、{FULL_INSURED_MONTHS}月の代わりに生年月日に応じた加入可能月数（300〜468月）で割ります。
      </p>

      <h2>生年月日で変わる基準額</h2>
      <table>
        <thead>
          <tr>
            <th>生年月日</th>
            <th>所得基準額</th>
            <th>補足的給付の上限</th>
            <th>免除単価（全額・3/4・半額）</th>
            <th>免除単価（1/4）</th>
          </tr>
        </thead>
        <tbody>
          {[
            { label: '昭和31年4月2日以後', t: AFTER },
            { label: '昭和31年4月1日以前', t: BEFORE },
          ].map((row) => (
            <tr key={row.label}>
              <td style={{ textAlign: 'left' }}>{row.label}</td>
              <td>{yen(row.t.base)}</td>
              <td>{yen(row.t.supplementCap)}</td>
              <td>{yen(row.t.exemptFull)}</td>
              <td>{yen(row.t.exemptQuarter)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        2026年10月分〜2027年9月分に使う額です。所得基準額は毎年10月分から、給付の額は毎年4月分から改定されます。
      </p>

      <h2>基準を1円超えても0円ではない（補足的老齢年金生活者支援給付金）</h2>
      <p>
        所得が基準額を超えると「対象外」と思われがちですが、<strong>基準額＋10万円（{yen(AFTER.supplementCap)}）まで</strong>
        は補足的老齢年金生活者支援給付金が出ます。所得が増えるほど年金と給付金の合計が逆転しないよう、10万円の幅で少しずつ減らす仕組みです。
      </p>
      <ul>
        <li>
          調整支給率 ＝（{AFTER.supplementCap.toLocaleString('ja-JP')}円 − 所得）÷ 100,000円
        </li>
        <li>
          月額 ＝ {yen(BASE)} × 納付済月数 ÷ {FULL_INSURED_MONTHS}月 × 調整支給率（免除期間の分はありません）
        </li>
      </ul>
      <p>
        たとえば納付済480月で所得が876,500円なら、調整支給率は0.5で<strong>月2,810円</strong>
        です。所得がちょうど{yen(AFTER.supplementCap)}だと率が0になり、月額は0円です。
      </p>

      <h2>請求のしかた（緑の封筒・はがき）</h2>
      <p>
        新たに対象になりそうな人には、2026年9月1日から日本年金機構の請求書（はがき型）が順次届いています。
        必要事項を書いて切手を貼って出すか、マイナンバーカードを使った電子申請で請求します。
      </p>
      <p>
        <strong>10月分から受けるには、年明けの1月上旬までに請求書が年金機構に届く必要があります</strong>
        （例年1月4〜5日ごろ。正確な日付ははがきに同封の案内で確認してください）。それを過ぎると請求した月の翌月分からになり、さかのぼって受けられません。
        年内に出しておくと確実です。支給は年金と同じ偶数月に2か月分ずつで、10月分からの初回は12月（10・11月分）です。
      </p>
      <p>
        世帯全員が市町村民税非課税かどうかは、市区町村の課税（非課税）証明書で確認できます。
        このツールは非課税かどうかの判定はしません（自治体ごとに非課税の限度額が違うため）。
      </p>

      <PublicToolLink slug="zaishoku-rorei-nenkin">
        <p>
          働きながら老齢厚生年金を受けている人は、
          <ToolLink slug="zaishoku-rorei-nenkin">在職老齢年金 計算機</ToolLink>
          で年金が止まる額を確かめられます。
        </p>
      </PublicToolLink>
      <PublicToolLink slug="kogaku-ryoyohi">
        <p>
          住民税非課税の世帯は医療費の自己負担限度額も低くなります。
          <ToolLink slug="kogaku-ryoyohi">高額療養費 計算機</ToolLink>で月の上限を出せます。
        </p>
      </PublicToolLink>
      <PublicToolLink slug="iryohi-kojo">
        <p>
          年金から所得税が引かれている人は、
          <ToolLink slug="iryohi-kojo">医療費控除 計算機</ToolLink>で還付の目安を確かめられます。
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

      <RelatedTools current="nenkin-shien-kyufukin" />

      <ToolMeta slug="nenkin-shien-kyufukin" ymyl>
        出典：
        {src(
          'https://www.nenkin.go.jp/section/faq/jukyu/seido/sonota-kyufu/shienkyufukin/shikyuyouken/shikyuyouken01.html',
          '日本年金機構「年金生活者支援給付金の支給要件」',
        )}
        ／
        {src(
          'https://www.nenkin.go.jp/section/faq/jukyu/seido/sonota-kyufu/shienkyufukin/shikyuyouken/shikyuyouken03.html',
          '同「年金生活者支援給付金の金額」',
        )}
        ／
        {src(
          'https://www.nenkin.go.jp/section/faq/jukyu/seido/sonota-kyufu/shienkyufukin/kaiteitsuchi/keisan.html',
          '同「令和8年度の年金生活者支援給付金の計算」',
        )}
        ／
        {src(
          'https://www.nenkin.go.jp/service/jukyu/seido/sonota-kyufu/shienkyufukin/rourei.html',
          '同「老齢（補足的老齢）年金生活者支援給付金の概要」',
        )}
        ／
        {src(
          'https://www.nenkin.go.jp/section/faq/jukyu/seido/sonota-kyufu/shienkyufukin/hagaki/kigen.html',
          '同「手続きが遅れると年金生活者支援給付金は受け取れなくなりますか」',
        )}
        、年金生活者支援給付金の支給に関する法律（平成24年法律第102号）にもとづき作成。
        判定は目安で、個別の支給の可否・金額は日本年金機構が決定します。制度データの最終確認日は{ja(DATA_CHECKED_AT)}です。
      </ToolMeta>
    </>
  );
}
