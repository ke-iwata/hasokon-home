import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  DATA_CHECKED_AT,
  FUYO_DAILY_LIMIT,
  FUYO_DAILY_LIMIT_60,
  KOKUHO_NOTIFY_DAYS,
  KOKUHO_TABLES,
  NINKEI_APPLY_DAYS,
  NINKEI_CAP_BY_FY,
  ymJa,
} from '@/lib/taishokugo-kenko-hoken';
import Calculator from './Calculator';
import { EXAMPLE_COMPANY, EXAMPLE_ROWS, EXAMPLE_SELF } from './tables';

const SLUG = 'taishokugo-kenko-hoken';

const title = '任意継続と国保 どっちが安い？退職後の健康保険 比較｜令和8年度・扶養と切り替え時期も';
const description =
  '退職日と前年の所得から、任意継続・国民健康保険・家族の扶養の保険料を月ごとに比較。令和8年度の子ども・子育て支援金分、任意継続の上限32万円、会社都合の退職で国保が下がる軽減（給与所得30/100）に対応し、2年目の4月に国保へ乗り換えると得になるかまで出します。登録不要・無料。';

export const metadata: Metadata = {
  title,
  description,
  keywords: ['任意継続', '国民健康保険', '国保', '退職後', '健康保険', '扶養', '保険料', '比較'],
  alternates: { canonical: `${SITE_URL}/${SLUG}/` },
  robots: robotsFor('taishokugo-kenko-hoken'),
};

const r100 = (n: number) => `${(Math.round(n / 100) * 100).toLocaleString('ja-JP')}円`;
const man = (n: number) => `${(Math.round(n / 1_000) / 10).toLocaleString('ja-JP')}万円`;
const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};
const pct = (bp: number) => `${(bp / 100).toFixed(2)}%`;

const T = KOKUHO_TABLES[0];
const CAP = NINKEI_CAP_BY_FY[2026];
const selfSave = EXAMPLE_SELF.ninkeiOnly!.total - EXAMPLE_SELF.best.total;

const faq = [
  {
    q: '任意継続と国保はどっちが安い？',
    a: `人によって逆になります。任意継続は退職時の標準報酬月額（協会けんぽは上限${man(CAP)}）で決まり2年間ほぼ同じ額、国保は前年の所得で決まり4月に基準の年が替わります。月給が高かった人は1年目は任意継続が安く、退職した年の翌年の4月からは国保が安くなることが多いです。会社都合の退職なら国保の軽減で最初から国保が安いこともあります。`,
  },
  {
    q: '任意継続の保険料の上限はいくら？',
    a: `協会けんぽの令和8年度は標準報酬月額${man(CAP)}が上限です。これに健康保険料率（都道府県ごと）・子ども・子育て支援金率・40〜64歳は介護保険料率をかけた全額を自分で払います（東京・45歳なら月${r100(EXAMPLE_SELF.months[0].ninkei ?? 0)}）。健康保険組合は組合ごとに上限が違います。`,
  },
  {
    q: '国保は退職金で高くなる？',
    a: '高くなりません。退職金は退職所得として分離課税されるので、国保の保険料を決める総所得金額等に入りません。失業給付（基本手当）も非課税なので入りません。',
  },
  {
    q: '失業保険をもらうと扶養から外れる？',
    a: `日額が${FUYO_DAILY_LIMIT.toLocaleString('ja-JP')}円以上（60歳以上は${FUYO_DAILY_LIMIT_60.toLocaleString('ja-JP')}円以上）だと、受給している間は扶養に入れません（年収130万円・180万円の基準を360日で割った額）。待期7日・給付制限の間は受けていないので入れ、受給が終われば戻れます。扱いは健康保険によって違うことがあるので、扶養する家族の勤め先の健康保険に確かめてください。`,
  },
  {
    q: '任意継続はやめられる？',
    a: '令和4年1月から、本人が申し出ればいつでも脱退できます（健康保険法38条）。申出が受理された月の翌月1日に資格を失い、そこから国保や家族の扶養に入ります。一度脱退すると任意継続には戻れません。',
  },
  {
    q: '会社都合だと国保はいくら安くなる？',
    a: `前年の給与所得を30/100とみなして計算します。給与収入600万円（給与所得436万円）・45歳・単身・東京23区なら、国保の年額が約${man(EXAMPLE_SELF.months[0].kokuhoAnnual)}から約${man(EXAMPLE_COMPANY.months[0].kokuhoAnnual)}になります。期間は離職日の翌日の属する月から翌年度末まで。届出が要ります。`,
  },
  {
    q: '家族がいると任意継続が得？',
    a: '得になりやすいです。任意継続では家族は被扶養者として保険料がかかりませんが、国保は加入者1人ごとに均等割がかかります。このツールでは「一緒に国保に入る家族」を入れると差が出ます。',
  },
];

const trail = breadcrumbFor('taishokugo-kenko-hoken');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '退職後の健康保険 比較（任意継続・国保・扶養）',
      url: `${SITE_URL}/${SLUG}/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt(SLUG),
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

const src = (href: string, text: string) => (
  <a href={href} target="_blank" rel="nofollow noopener noreferrer">
    {text}
  </a>
);

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>退職後の健康保険 比較（任意継続・国保・家族の扶養）</h1>
      <p className="lead">
        退職日と前年の所得を入れると、<strong>任意継続・国民健康保険・家族の扶養</strong>
        の保険料を退職翌月から24か月の月ごとに並べ、途中で国保へ乗り換えると得になる時期まで出します。
        任意継続の申出は<strong>退職日の翌日から{NINKEI_APPLY_DAYS}日以内</strong>です。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>任意継続・国保・扶養の違い（早見表）</h2>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>入り方</th>
              <th>保険料の決まり方</th>
              <th>家族</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>任意継続（最長2年）</td>
              <td>退職時の標準報酬月額（上限{man(CAP)}）× 料率。会社負担が無くなり全額自己負担</td>
              <td>被扶養者は0円</td>
            </tr>
            <tr>
              <td>国民健康保険</td>
              <td>前年の所得で所得割＋加入者ごとの均等割。4月に基準の年が替わる</td>
              <td>1人ごとに均等割</td>
            </tr>
            <tr>
              <td>家族の扶養</td>
              <td>健康保険は0円。国民年金が0円（第3号）になるのは配偶者の扶養で20〜59歳のときだけ</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>任意継続の保険料の決まり方（上限{man(CAP)}）</h2>
      <p>
        任意継続は、退職時の標準報酬月額と保険者の上限（協会けんぽは令和8年度{man(CAP)}）の低いほうに料率をかけます。
        在職中は会社と半分ずつでしたが、任意継続では<strong>全額を自分で払う</strong>ので、在職中の天引き額のおよそ2倍になります。
        料率は都道府県ごとの健康保険料率＋子ども・子育て支援金率（令和8年4月分から）＋40〜64歳は介護保険料率です。
        退職日まで継続して2か月以上加入していたことが条件です（健康保険法3条4項）。
      </p>

      <h2>国保の保険料の決まり方（前年の所得・4区分・令和8年度の子ども分）</h2>
      <p>
        国保は、前年の総所得金額等から{man(T.baseDeduction)}を引いた額（旧ただし書き所得）に率をかける所得割と、加入者ごとの均等割の合計で、
        区分ごとに限度額があります。東京23区（特別区）の令和8年度は次のとおりです。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>区分</th>
              <th style={{ textAlign: 'right' }}>所得割</th>
              <th style={{ textAlign: 'right' }}>均等割</th>
              <th style={{ textAlign: 'right' }}>限度額</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['医療分', T.iryo],
                ['後期高齢者支援金分', T.shien],
                ['介護分（40〜64歳）', T.kaigo],
                ['子ども・子育て支援納付金分（新設）', T.kodomo],
              ] as const
            ).map(([name, p]) => (
              <tr key={name}>
                <td>{name}</td>
                <td style={{ textAlign: 'right' }}>{pct(p.rate)}</td>
                <td style={{ textAlign: 'right' }}>{p.perCapita.toLocaleString('ja-JP')}円</td>
                <td style={{ textAlign: 'right' }}>{man(p.cap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        子ども・子育て支援納付金分の均等割は18歳以上だけで、18歳未満は0円です。未就学児は医療分・後期高齢者支援金分の均等割が5割になります。
        所得が低い世帯は均等割が7割・5割・2割軽減されます。料率は市区町村ごとに違うので、
        <strong>お住まいの市区町村の料率で計算し直してください</strong>（計算機の「お住まいの市区町村の国保の料率を入れる」）。
      </p>

      <h2>会社都合で辞めたら国保が安くなる（30/100 の軽減）</h2>
      <p>
        倒産・解雇などの特定受給資格者（離職理由コード11・12・21・22・31・32）と、雇止めなどの特定理由離職者（23・33・34）で、
        離職日に65歳未満の人は、<strong>前年の給与所得を30/100とみなして</strong>国保の保険料を計算します。
        期間は離職日の翌日の属する月から、その月の属する年度の翌年度末まで。給与以外の所得は軽減されません。
        雇用保険受給資格者証を持って区市町村の窓口で届け出ます。
      </p>

      <h2>2年目の4月に乗り換えると得をする理由</h2>
      <p>
        国保は「その年度の前年の所得」で決まるので、12月末に辞めた人は、退職した年の給与が翌年4月からの年度にも効き、
        <strong>収入の無い年の所得が使われるのは2年目の4月から</strong>です。任意継続は2年間ほぼ同じ額なので、2年目の4月に逆転することがあります。
        45歳・東京・単身・月給50万円で2026年12月31日に退職した例（月額の目安）：
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>期間</th>
              <th style={{ textAlign: 'right' }}>任意継続</th>
              <th style={{ textAlign: 'right' }}>国保（自己都合）</th>
              <th style={{ textAlign: 'right' }}>国保（会社都合）</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLE_ROWS.map((row) => (
              <tr key={row.period}>
                <td>{row.period}</td>
                <td style={{ textAlign: 'right' }}>{r100(row.ninkei)}</td>
                <td style={{ textAlign: 'right' }}>{r100(row.kokuhoSelf)}</td>
                <td style={{ textAlign: 'right' }}>{r100(row.kokuhoCompany)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        自己都合なら、任意継続に入り{EXAMPLE_SELF.best.switchAt ? ymJa(EXAMPLE_SELF.best.switchAt) : ''}
        に脱退して国保へ移ると、任意継続を2年続けるより24か月で約{man(selfSave)}安くなります。会社都合なら最初から国保が安くなります。
        令和9年度以降の料率は未公表なので令和8年度の料率で代用し、支援金率は国の見込み・試算の値で計算しています。
      </p>

      <h2>扶養に入れる条件と失業給付の関係</h2>
      <p>
        家族の扶養（被扶養者）に入るには、年収130万円未満（60歳以上・障害者は180万円未満）で、扶養する人の年収の半分未満であることが要ります。
        <strong>失業給付は扶養の判定では収入に数えます</strong>（国保の所得には入らないのと食い違うので注意）。
        日額{FUYO_DAILY_LIMIT.toLocaleString('ja-JP')}円以上だと受給中は扶養に入れず、その間は国保（または任意継続）に入ります。
        国民年金が第3号で0円になるのは、会社員・公務員の配偶者の扶養に入る20〜59歳の人だけで、親や子の扶養では国民年金を払い続けます。
        失業給付の日額は<Link href="/shitsugyo-hoken/">失業保険の計算機</Link>で出せます。
      </p>

      <h2>手続きの期限（20日・14日）</h2>
      <ul>
        <li>任意継続：退職日の翌日から<strong>{NINKEI_APPLY_DAYS}日以内</strong>に申出（健康保険法37条）。過ぎると入れません</li>
        <li>国保：資格を得た日から<strong>{KOKUHO_NOTIFY_DAYS}日以内</strong>に区市町村へ届出。遅れても保険料は資格を得た月までさかのぼります</li>
        <li>扶養：家族の勤め先を通じて届出（期限は勤め先の健康保険の案内による）</li>
        <li>任意継続の脱退：申出の翌月1日に喪失。国保へ移るならその日から{KOKUHO_NOTIFY_DAYS}日以内に加入手続き</li>
      </ul>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current={SLUG} />

      <ToolMeta slug={SLUG} ymyl>
        出典：{src('https://laws.e-gov.go.jp/law/211AC0000000070', 'e-Gov「健康保険法」')}／
        {src('https://laws.e-gov.go.jp/law/333AC0000000192', 'e-Gov「国民健康保険法」')}／
        {src('https://www.kyoukaikenpo.or.jp/news/r07_dec/1259.html', '協会けんぽ「令和8年度の任意継続被保険者の標準報酬月額の上限について」')}／
        {src(
          'https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html',
          '協会けんぽ「令和8年度 都道府県単位保険料率」',
        )}
        ／{src('https://www.city.ota.tokyo.jp/seikatsu/kokunen/kokuho/hokenryou/keisan.html', '大田区「保険料の計算方法」（特別区の令和8年度）')}／
        {src('https://www.city.toshima.lg.jp/documents/55129/20260327165423.pdf', '豊島区 国保運営協議会資料（軽減の基準額）')}／
        {src('https://www.city.shinjuku.lg.jp/hoken/hoken02_000102.html', '新宿区「非自発的失業者の国民健康保険料の軽減」')}／
        {src('https://www.nenkin.go.jp/service/kokunen/hokenryo/hokenryo.html', '日本年金機構「国民年金保険料」')}
        。制度データの最終確認日は{ja(DATA_CHECKED_AT)}です。
      </ToolMeta>
    </>
  );
}
