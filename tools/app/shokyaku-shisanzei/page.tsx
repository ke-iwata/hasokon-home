import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import { IKKATSU_LIMIT, SHOGAKU_LIMIT, TOKUREI_LIMIT_AFTER } from '@/lib/genka-shokyaku';
import {
  KAISEI_AFTER_NENDO,
  KAISEI_BEFORE_NENDO,
  SOURCES,
  STANDARD_RATE_PERMIL,
  TITLE_NENDO,
  filingDeadline,
  menzeiten,
  reiwa,
} from '@/lib/shokyaku-shisanzei';
import { weekdayLabel } from '@/lib/date-parts';
import Calculator from './Calculator';
import { HAYAMI_LIVES, HAYAMI_ROWS, HAYAMI_YEARS, TOKYO_EXAMPLE } from './tables';

const man = (v: number) => `${(v / 10_000).toLocaleString('ja-JP')}万円`;
const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;

const BEFORE = man(menzeiten(KAISEI_BEFORE_NENDO));
const AFTER = man(menzeiten(KAISEI_AFTER_NENDO));
const TITLE_MENZEITEN = man(menzeiten(TITLE_NENDO));
const RATE = `${STANDARD_RATE_PERMIL / 10}%`;
const deadline = filingDeadline(TITLE_NENDO);
const DEADLINE_SHORT = `${deadline.year}年${deadline.month}月${deadline.day}日`;
const R_AFTER = `令和${reiwa(KAISEI_AFTER_NENDO)}年度`;
const R_BEFORE = `令和${reiwa(KAISEI_BEFORE_NENDO)}年度`;
/** 令和9年度の申告期限（FAQ 用。TITLE_NENDO を上げても改正の年度のまま） */
const kaiseiDeadline = filingDeadline(KAISEI_AFTER_NENDO);
const KAISEI_JAN31 = { year: KAISEI_AFTER_NENDO, month: 1, day: 31 };
const KAISEI_DEADLINE = `${kaiseiDeadline.year}年${kaiseiDeadline.month}月${kaiseiDeadline.day}日（${weekdayLabel(kaiseiDeadline)}）`;
const KAISEI_DEADLINE_ROLLED = kaiseiDeadline.month !== 1 || kaiseiDeadline.day !== 31;

const title = `償却資産税 計算機【令和${reiwa(TITLE_NENDO)}年度・免税点${TITLE_MENZEITEN}】評価額と税額・申告の要否`;
const description = `取得価額・取得年月・耐用年数から、1月1日時点の評価額と償却資産税（${RATE}）を計算。${R_AFTER}から免税点が${BEFORE}→${AFTER}に上がる改正の前後を並べ、${man(TOKUREI_LIMIT_AFTER)}未満の特例で経費にした資産の申告、${DEADLINE_SHORT}の期限も確認できます。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/shokyaku-shisanzei/` },
  robots: robotsFor('shokyaku-shisanzei'),
};

const tokyo = TOKYO_EXAMPLE.result;

const faq = [
  {
    q: `免税点が${AFTER}になるのはいつから？`,
    a: `${R_AFTER}分からです（${KAISEI_AFTER_NENDO}年1月1日に持っている資産。地方税法等の一部を改正する法律〔令和8年法律第2号〕附則14条2項）。改正法の施行は${KAISEI_AFTER_NENDO}年4月1日ですが、${KAISEI_AFTER_NENDO}年1〜2月に出す申告がもう新しい免税点の対象です。${R_BEFORE}分までは${BEFORE}です。`,
  },
  {
    q: `${man(TOKUREI_LIMIT_AFTER)}未満の特例で全額経費にした物は申告しなくていい？`,
    a: `申告が要ります。償却資産から外れるのは、${man(SHOGAKU_LIMIT)}未満で全額経費にした物と、${man(IKKATSU_LIMIT)}未満で一括償却（3年）にした物だけです（地方税法施行令49条）。中小事業者の少額減価償却資産の特例（租税特別措置法28条の2）で経費にした物は含まれません。`,
  },
  {
    q: `${R_AFTER}の申告期限は1月31日？`,
    a: KAISEI_DEADLINE_ROLLED
      ? `${KAISEI_AFTER_NENDO}年1月31日は${weekdayLabel(KAISEI_JAN31)}曜日なので、期限は${KAISEI_DEADLINE}です（地方税法383条・20条の5第2項。期限が土日祝日なら翌日に延びます）。`
      : `期限は${KAISEI_DEADLINE}です（地方税法383条。期限が土日祝日なら翌日に延びます）。`,
  },
  {
    q: `課税標準がちょうど${AFTER}だと非課税？`,
    a: `課税されます。条文は免税点に「満たない場合」は課税できないという書き方なので、ちょうどの額は課税です（地方税法351条）。${R_AFTER}は課税標準${AFTER}ちょうどで税額${yen(Math.floor((menzeiten(KAISEI_AFTER_NENDO) * STANDARD_RATE_PERMIL) / 1000 / 100) * 100)}です。`,
  },
  {
    q: '免税点未満なら申告も要らない？',
    a: '免税点は税がかからないというだけで、申告そのものは別です。多くの市町村が、免税点未満でも1月1日に償却資産を持っている人に申告を求めています。届いた申告書と市町村の案内に従ってください。',
  },
  {
    q: '課税標準の特例（わがまち特例・先端設備）は？',
    a: '一定の設備は課税標準が2分の1・4分の1などに下がる特例がありますが、この計算機では扱っていません。特例を受ける資産は、市町村からの通知や申告の手引きを確認してください。',
  },
];

const trail = breadcrumbFor('shokyaku-shisanzei');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: `償却資産税 計算機（令和${reiwa(TITLE_NENDO)}年度・免税点${TITLE_MENZEITEN}）`,
      url: `${SITE_URL}/shokyaku-shisanzei/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('shokyaku-shisanzei'),
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

      <h1>償却資産税 計算機（令和{reiwa(TITLE_NENDO)}年度・免税点{TITLE_MENZEITEN}）</h1>
      <p className="lead">
        事業用の資産の<strong>取得価額・取得年月・耐用年数</strong>から、1月1日時点の評価額と償却資産税（固定資産税）を出します。
        {R_AFTER}から<strong>免税点が{BEFORE}→{AFTER}</strong>に上がるので、改正の前後で「かかる／かからない」が変わるかも並べます。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>{R_AFTER}から免税点が{AFTER}に</h2>
      <p>
        地方税法等の一部を改正する法律（<strong>令和8年法律第2号</strong>）で、償却資産の免税点が{BEFORE}から
        <strong>{AFTER}</strong>に上がりました（家屋の免税点も20万円から30万円に）。新しい免税点は
        <strong>{R_AFTER}分</strong>、つまり{KAISEI_AFTER_NENDO}年1月1日に持っている資産から使います（附則14条2項）。
        課税標準の合計が免税点に<strong>満たない</strong>ときは税がかかりません。ちょうどの額は課税です（351条）。
      </p>
      <p>
        {R_BEFORE}に課税標準が{BEFORE}〜{AFTER}の間だった人は、評価額が下がらなくても{R_AFTER}は税がかからなくなります。
        税額は課税標準（1,000円未満切捨て）× {RATE}（標準税率。350条）で、100円未満は切り捨てます。
      </p>

      <h2>評価額の出し方（減価残存率）</h2>
      <p>
        償却資産の評価額は、所得税の減価償却とは別の方法で出します（固定資産評価基準）。
        <strong>前年中に取得した物</strong>は「取得価額 ×（1 − r/2）」（取得月にかかわらず半年分）、
        <strong>それより前に取得した物</strong>は「前年度の評価額 ×（1 − r）」です。r は耐用年数に応じた減価率で、
        評価額は取得価額の<strong>5%</strong>より下がりません。
        掛ける率は別表第15の小数3桁の表の値を使います（耐用年数5年は0.8155ではなく0.815）。
      </p>
      <p>
        たとえば東京都主税局の例（{R_BEFORE}）では、舗装路面・応接セット・看板の評価額の合計が{yen(tokyo.totalValue)}、
        課税標準が{yen(tokyo.taxBase)}、税額が{yen(tokyo.tax)}になります。
      </p>

      <h3>取得価額・耐用年数ごとの評価額の早見表</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>取得価額</th>
              <th>耐用年数</th>
              {Array.from({ length: HAYAMI_YEARS }, (_, i) => (
                <th key={i}>{i + 1}年目</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HAYAMI_ROWS.map((r) => (
              <tr key={`${r.cost}-${r.life}`}>
                <td>{man(r.cost)}</td>
                <td>{r.life}年</td>
                {r.values.map((v, i) => (
                  <td key={i}>{yen(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        1年目は取得した翌年度（前年中取得）の評価額です。耐用年数{HAYAMI_LIVES.join('・')}年の例で、1円未満は切り捨てています。
      </p>

      <h2>申告が要る資産・要らない資産</h2>
      <ul>
        <li>
          <strong>要らない</strong>：{man(SHOGAKU_LIMIT)}未満で全額経費にした物、{man(IKKATSU_LIMIT)}
          未満で一括償却（3年）にした物（地方税法施行令49条）。自動車税・軽自動車税の対象の車、ソフトウエアなどの無形固定資産も対象外です（341条4号）
        </li>
        <li>
          <strong>要る</strong>：{man(TOKUREI_LIMIT_AFTER)}
          未満の特例（中小事業者の少額減価償却資産）で全額経費にした物。帳簿上は経費でも、償却資産として申告します
        </li>
        <li>
          <strong>要る</strong>：通常の減価償却をしている物（償却が終わって帳簿に1円だけ残っている物も含む）
        </li>
      </ul>
      <PublicToolLink slug="genka-shokyaku">
        <p>
          買った物をどの方法で経費にできるかは<ToolLink slug="genka-shokyaku">減価償却 計算機</ToolLink>で確かめられます。
        </p>
      </PublicToolLink>

      <h2>太陽光発電の設備</h2>
      <p>
        個人の住宅用で10kW未満の設備は対象外、10kW以上の設備や事業用・法人の設備は対象、という扱いの市町村が多いです。
        ただし扱いは市町村によって違うので、お住まいの市町村に確認してください。
      </p>

      <div className="note">
        この計算機は目安です。評価額は最終的に市町村が決め、納税通知書の額が正しい額です。
        市町村によっては条例で免税点未満にも課税する場合（351条ただし書）や、標準税率より高い税率の場合があります。
        1月1日に取得した物の扱い、課税標準の特例（わがまち特例・先端設備）は扱っていません。土地・家屋は対象外です。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="shokyaku-shisanzei" />

      <ToolMeta slug="shokyaku-shisanzei" ymyl>
        出典：
        {SOURCES.map((s, i) => (
          <span key={s.url}>
            {i > 0 && '／'}
            <a href={s.url} target="_blank" rel="nofollow noopener noreferrer">
              {s.label}
            </a>
          </span>
        ))}
        にもとづき作成。減価残存率は固定資産評価基準 別表第15の自治体の転載から写しています。
      </ToolMeta>
    </>
  );
}
