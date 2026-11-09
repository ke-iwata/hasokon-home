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
  DISPLACEMENT_CLASSES,
  ECO_PERIODS,
  JURYO_RATES,
  KEI_RATES,
  SOURCES,
  formatYen,
  honsokuThresholdAt,
  jukaStartFiscalYear,
  proratedOnAcquire,
  reiwaLabel,
} from '@/lib/jidosha-zei';
import Calculator from './Calculator';

const title = '自動車税・重量税 計算機【令和8年度改正対応】13年重課はいつから';
const description =
  '排気量・登録年月・重量から自動車税と車検の重量税、13年超の重課が始まる年度を計算。環境性能割の廃止とエコカー減税の見直し（2026年5月・2027年5月）、EV・PHEVの2028年5月からの新しい負担を反映。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/jidosha-zei/` },
  robots: robotsFor('jidosha-zei'),
};

/** 本文の例（額を手で書かないため lib で出す） */
function jukaExample(firstRegistered: string) {
  const r = jukaStartFiscalYear({ kind: 'futsu', power: 'gasoline', displacementClass: 2, firstRegistered });
  if (r.kind !== 'start') throw new Error('example');
  return r;
}
const EX_2012 = jukaExample('2012-04');
const EX_2013 = jukaExample('2013-04');
const EX_PRORATE = proratedOnAcquire(DISPLACEMENT_CLASSES[1].from2019, '2026-10');
const R = JURYO_RATES.futsu;
const pct = (n: number | null) => (n === null ? '—' : `${n}%以上`);

const faq = [
  {
    q: '13年経ったらすぐに自動車税が上がりますか？',
    a: `いいえ。自動車税（種別割）の重課は「初回新規登録の年度＋14」の年度（ディーゼル車は＋12）の5月の通知からです。たとえば2012年4月に登録した2.0Lのガソリン車は${reiwaLabel(EX_2012.fiscalYear)}から${formatYen(EX_2012.yen ?? 0)}、2013年4月に登録した車は${reiwaLabel(EX_2013.fiscalYear)}からです。重量税の13年は数え方が違い、登録から12年10か月の月以後に受ける車検から上がります（軽自動車は最初の検査の年から13年たった年の11月から）。`,
  },
  {
    q: '環境性能割がなくなったので、車を買うときの税金はゼロですか？',
    a: `いいえ。環境性能割は2026年3月31日で廃止されましたが、新車の重量税（3年分）と、登録の翌月から3月までの自動車税（種別割）の月割は残ります。1.5Lの車を10月に登録すると、月割は${EX_PRORATE.months}か月分で${formatYen(EX_PRORATE.yen)}です。`,
  },
  {
    q: 'EV（電気自動車）は重量税がかかりませんか？',
    a: 'いまは新車のときと初回の継続車検が免税で、その後は本則税率です。2028年5月1日以後に受ける車検から、EV・PHEVには重量税に上乗せする新しい負担がかかる予定で、額は2026年12月の令和9年度税制改正大綱で決まります。新車の新規検査と、すでに走っている車の施行後最初の継続車検は免除です。',
  },
  {
    q: '軽自動車を手放したら、残りの月の分は戻ってきますか？',
    a: '戻りません。軽自動車税には月割も還付もなく、4月1日の持ち主に1年分かかります。登録車（普通車）は、抹消登録（廃車・輸出）すると翌月から3月までの分が月割で還付されます。',
  },
  {
    q: '車を売ったら（名義変更したら）残りの月の分は戻ってきますか？',
    a: '県からは戻りません。月割の還付は抹消登録のときだけで、名義変更では年度の末日に変更があったものとみなされます（地方税法157条4項）。その年度の税は4月1日の持ち主に1年分かかります。売買の当事者どうしで精算するかどうかは契約の話です。',
  },
  {
    q: 'ハイブリッド車やEVも13年で重課されますか？',
    a: `自動車税（種別割）の重課は、電気自動車・天然ガス自動車・ガソリンのハイブリッド・プラグインハイブリッドを除いています。重量税は動力ではなく、その車検のときの燃費で決まります。EV・PHEVと、2030年度燃費基準の${honsokuThresholdAt('2027-05')}%以上（2027年4月までは${honsokuThresholdAt('2027-04')}%以上）の車は本則税率で、13年・18年の重課もかかりません。新車のときにエコカー減税を受けた車でも、基準に届かなければエコカー外の税率になります。`,
  },
  {
    q: '電気自動車の自動車税はいくらですか？',
    a: `排気量が無いので、道府県の条例で「総排気量1リットル以下」の区分になります。2019年10月以後の登録なら${formatYen(DISPLACEMENT_CLASSES[0].from2019)}、それより前なら${formatYen(DISPLACEMENT_CLASSES[0].before2019)}です。2025年4月〜2028年3月に新規登録したEVは、翌年度分だけグリーン化特例で${formatYen(DISPLACEMENT_CLASSES[0].green)}になります。`,
  },
];

const trail = breadcrumbFor('jidosha-zei');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '自動車の税金 計算機（令和8年度改正対応）',
      url: `${SITE_URL}/jidosha-zei/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('jidosha-zei'),
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>自動車の税金 計算機（令和8年度改正対応）</h1>
      <p className="lead">
        排気量・初度登録の年月・車両重量を入れると、毎年5月の自動車税（種別割）と車検ごとの重量税、
        13年超の重課が何年度から始まるかがわかります。令和8年度改正（環境性能割の廃止・エコカー減税の基準引上げ・
        EV/PHEVの新しい負担の予定）で何が変わったかも並べます。自家用の乗用車（登録車・軽自動車）が対象です。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>令和8年度改正で決まったこと</h2>
      <table>
        <thead>
          <tr>
            <th>項目</th>
            <th>結果</th>
            <th>時期</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>環境性能割</td>
            <td style={{ textAlign: 'left' }}>廃止（廃止前は自家用乗用で取得価額の0〜3%、軽は0〜2%）</td>
            <td>2026年3月31日で廃止</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>エコカー減税（重量税）</td>
            <td style={{ textAlign: 'left' }}>基準を引き上げて2028年4月末まで延長</td>
            <td>2026年5月と2027年5月の2段階</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>グリーン化特例（種別割）</td>
            <td style={{ textAlign: 'left' }}>現行のまま2028年3月末まで延長</td>
            <td>—</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>種別割のあり方</td>
            <td style={{ textAlign: 'left' }}>重量と環境性能に応じた仕組みを検討し、令和9年度改正で結論</td>
            <td>令和10年度以後</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>EV・PHEVの利用段階の負担</td>
            <td style={{ textAlign: 'left' }}>重量税の特例加算として車検時に徴収。税率は令和9年度改正で結論</td>
            <td>2028年5月1日以後の車検から</td>
          </tr>
        </tbody>
      </table>

      <h3>エコカー減税（重量税・乗用車）の区分</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>新車新規登録の期間</th>
              <th>免税</th>
              <th>▲75%</th>
              <th>▲50%</th>
              <th>▲25%</th>
              <th>本則税率</th>
            </tr>
          </thead>
          <tbody>
            {ECO_PERIODS.map((p) => (
              <tr key={p.id}>
                <td style={{ textAlign: 'left' }}>{p.label}</td>
                <td>電気自動車等・{pct(p.thresholds.exempt)}</td>
                <td>{pct(p.thresholds.cut75)}</td>
                <td>{pct(p.thresholds.cut50)}</td>
                <td>{pct(p.thresholds.cut25)}</td>
                <td>{pct(p.thresholds.honsoku)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        パーセントは2030年度燃費基準の達成率。「電気自動車等」は電気・燃料電池・プラグインハイブリッド・天然ガス自動車です。
        免税の車のうち電気自動車等と125%以上の車は、初回の継続車検も免税です。▲は本則税率からの軽減で、100円未満は切り捨てです。
        2027年5月からの「本則税率（80%以上）」は環境省の資料にありますが、成立した租税特別措置法90条の12と施行令には
        2030年度基準80%の区分が見当たらないため、この表と計算では「—」（エコカー外）にしています。
      </p>

      <h2>自動車税（種別割）の税額・自家用乗用車</h2>
      <table>
        <thead>
          <tr>
            <th>総排気量</th>
            <th>2019年9月以前に登録</th>
            <th>13年超の重課</th>
            <th>2019年10月以後に登録</th>
          </tr>
        </thead>
        <tbody>
          {DISPLACEMENT_CLASSES.map((c) => (
            <tr key={c.id}>
              <td style={{ textAlign: 'left' }}>{c.label}</td>
              <td>{formatYen(c.before2019)}</td>
              <td>{formatYen(c.jukaBefore2019)}</td>
              <td>{formatYen(c.from2019)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        軽自動車（四輪・乗用・自家用）は、2015年4月以後に最初の検査 {formatYen(KEI_RATES.standard)}、それより前{' '}
        {formatYen(KEI_RATES.old)}、13年超 {formatYen(KEI_RATES.juka)}。電気自動車は1L以下の区分です。
      </p>

      <h2>「13年」の数え方は税目で違う</h2>
      <ul>
        <li>
          <strong>自動車税（種別割）</strong>：初回新規登録の年度＋14の年度から（ディーゼル車は＋12）。
          年度（4月〜3月）で数えるので、2013年3月に登録した車は{reiwaLabel(2026)}から、2013年4月に登録した車は
          {reiwaLabel(EX_2013.fiscalYear)}からです。一度重課になると抹消するまで続きます
        </li>
        <li>
          <strong>軽自動車税（種別割）</strong>：最初の検査の月から14年を経過した月の年度から（数え方は登録車とほぼ同じ）
        </li>
        <li>
          <strong>重量税</strong>：登録から12年10か月の月以後に受ける車検から13年経過の税率、17年10か月の月以後から18年経過の税率。
          軽自動車は最初の検査の年から13年（18年）たった年の11月から。
          車検は満了の2か月前から受けられるので、前倒しで受けた月が境目を越えると13年経過の税率になります。
          その車検のときにエコカー減税の基準（2030年度燃費基準の85%以上。2027年4月までは80%以上）を満たす車は、
          本則税率で経年の重課もかかりません
        </li>
      </ul>

      <h2>自動車重量税（自家用乗用・0.5tごと）</h2>
      <table>
        <thead>
          <tr>
            <th>区分</th>
            <th>新車（3年）</th>
            <th>継続車検（2年）</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>エコカー（本則税率）</td>
            <td>{formatYen(R.honsoku3)}</td>
            <td>{formatYen(R.honsoku2)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>エコカー外</td>
            <td>{formatYen(R.normal3)}</td>
            <td>{formatYen(R.normal2)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>13年経過</td>
            <td>—</td>
            <td>{formatYen(R.over13)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>18年経過</td>
            <td>—</td>
            <td>{formatYen(R.over18)}</td>
          </tr>
        </tbody>
      </table>
      <p className="hint">
        軽自動車は1両あたり：新車 {formatYen(JURYO_RATES.kei.normal3)}（本則 {formatYen(JURYO_RATES.kei.honsoku3)}）、継続車検{' '}
        {formatYen(JURYO_RATES.kei.normal2)}（本則 {formatYen(JURYO_RATES.kei.honsoku2)}・13年 {formatYen(JURYO_RATES.kei.over13)}・18年{' '}
        {formatYen(JURYO_RATES.kei.over18)}）。
      </p>

      <div className="note">
        このツールは標準税率での目安です。営業用・トラック・バス・二輪・特種用途車は対象外です。
        過去の自動車取得税・環境性能割の額は計算しません（納め過ぎの還付はお住まいの道府県の自動車税事務所にお問い合わせください）。
        EVの新しい負担の額は、令和9年度税制改正で決まるまで出しません。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <p>
        車の利用で気になる反則金は<Link href="/sokudo-ihan-hansokukin/">速度違反の反則金・点数 早見表</Link>で調べられます。
      </p>

      <AdUnit position="below-faq" />

      <RelatedTools current="jidosha-zei" />

      <ToolMeta slug="jidosha-zei" ymyl>
        出典：
        {SOURCES.map((s, i) => (
          <span key={s.url}>
            {i > 0 && '／'}
            <a href={s.url} target="_blank" rel="nofollow noopener noreferrer">
              {s.label}
            </a>
          </span>
        ))}
        にもとづき作成（{DATA_CHECKED_AT.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日')}
        確認）。税率は地方税法・自動車重量税法・租税特別措置法の現行条文と突き合わせています。
      </ToolMeta>
    </>
  );
}
