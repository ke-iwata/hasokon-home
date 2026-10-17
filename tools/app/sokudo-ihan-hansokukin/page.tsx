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
  FINE_BANDS,
  SOURCES,
  SUSPENSION_POINTS,
  VEHICLES,
  formatYen,
  judge,
  seikatsuHayami,
  type Violation,
} from '@/lib/sokudo-ihan';
import Calculator from './Calculator';

const title = '速度違反の反則金・点数 計算（生活道路30km/h対応）｜何キロオーバーでいくら・何点';
const description =
  '2026年9月1日から中央線の無い一般道路の法定速度は30km/h。道路の種類と出した速度を入れると、制限速度・何km/h超過か・反則金（または赤切符）・違反点数がわかります。普通車・大型車・二輪・原付に対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/sokudo-ihan-hansokukin/` },
  robots: robotsFor('sokudo-ihan-hansokukin'),
};

/** 本文の例（額を手で書かないため lib で出す） */
function example(speedKmh: number): Violation {
  const r = judge({
    road: 'seikatsu',
    vehicle: 'ordinary',
    expresswayClass: 'standard',
    date: '2026-09-01',
    speedKmh,
    signArea: 'general',
  });
  if (r.kind !== 'ok' || r.violation === null) throw new Error('example');
  return r.violation;
}
const AT_50 = example(50);
const fineText = (v: Violation) => (v.yen === null ? '赤切符' : `反則金${formatYen(v.yen)}`);

const HAYAMI = seikatsuHayami();

const violationCell = (v: Violation | null) =>
  v === null ? '違反なし' : `${v.excess}km/h超過・${v.yen === null ? '赤切符' : formatYen(v.yen)}・${v.points}点`;

const faq = [
  {
    q: '「生活道路」はどうやって見分けますか？',
    a: '中央線（センターライン）も車線の境の白線も無く、速度の標識・路面の数字も無い一般道路です。住宅街の細い道の多くがこれにあたります。中央線や車線の白線がある道、中央分離帯で上下が分かれた道は60km/hのままです。一方通行の道も、中央線や車線の白線が無く速度の標識も無ければ30km/hになりえます。警察庁の案内は一方通行に触れていないので、標識・標示の無い道は30km/hと考えて走るのが安全です。',
  },
  {
    q: '法定速度30km/hはいつからですか？',
    a: '2026年（令和8年）9月1日からです。道路交通法施行令11条の改正で、中央線などが無い一般道路での自動車の法定速度が60km/hから30km/hに引き下げられました。8月31日までに走った分は60km/hで判定されます。原付（一般原動機付自転車）はもとから30km/hで、変わっていません。',
  },
  {
    q: '標識が新しく立ちますか？',
    a: '立ちません。法定速度そのものが変わったので、標識の無い道がそのまま30km/hになりました。速度の標識がある道は、引下げの前後で変わらずその速度です。',
  },
  {
    q: '生活道路を50km/hで走ったらどうなりますか？',
    a: `普通車なら${AT_50.excess}km/hの超過で、${fineText(AT_50)}・違反点数${AT_50.points}点です。引下げ前（60km/h）なら違反になりませんでした。60km/h以上（30km/h以上の超過）は反則金の対象外で、赤切符（刑事手続）になり、点数は6点です。`,
  },
  {
    q: '首都高・都市高速は何km/hですか？',
    a: '首都高や都市高速は自動車専用道路で、速度の標識があればその速度、標識が無ければ一般道路の法定速度60km/hです。2026年9月の引下げの対象ではありません。反則金・点数は、高速自動車国道と同じ「高速道路」の表で決まります（30km/h以上40km/h未満の超過でも反則金で済み、点数は3点）。',
  },
  {
    q: '何キロオーバーで免停になりますか？',
    a: `前歴が無い人は、累積${SUSPENSION_POINTS}点以上で免許停止（30日）の対象になります。速度超過だけで${SUSPENSION_POINTS}点になるのは、一般道路で30km/h以上、高速道路で40km/h以上の超過です。50km/h以上の超過は12点で、免許停止の期間が長くなります。前歴がある場合やほかの違反の点数との合計は、警視庁の「交通違反の点数一覧表」をご確認ください。`,
  },
  {
    q: '自転車は対象ですか？',
    a: '自転車には法定速度がありません（標識で指定された最高速度は自転車にも及びます）。このツールは自動車と原付が対象です。自転車の反則金（2026年4月からの青切符）は、自転車の反則金チェッカーで調べられます。',
  },
  {
    q: '反則金を払わないとどうなりますか？',
    a: '反則金は、期限内に納めれば刑事手続に進まない仕組みです。仮納付の期限を過ぎると、通告を受けて改めて納付する手続になり、それでも納めないと刑事手続に移ります。期限や流れは、交付された書面と警察の案内をご確認ください。',
  },
];

const trail = breadcrumbFor('sokudo-ihan-hansokukin');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '速度違反の反則金・点数 早見表（生活道路30km/h対応）',
      url: `${SITE_URL}/sokudo-ihan-hansokukin/`,
      applicationCategory: 'ReferenceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('sokudo-ihan-hansokukin'),
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

      <h1>速度違反の反則金・点数 早見表（生活道路30km/h対応）</h1>
      <p className="lead">
        2026年9月1日から、中央線の無い一般道路（生活道路）の法定速度は60km/hから30km/hになりました。
        道路の種類・出した速度・車の種類を選ぶと、その道の制限速度・何km/h超過か・反則金（または赤切符）・違反点数がわかります。
        政令の表にもとづく参考情報で、実際の処分は個別の事情で決まります。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>2026年9月1日に変わったこと</h2>
      <p>
        道路交通法施行令11条の改正で、<strong>中央線や車線の白線が無い一般道路</strong>
        の自動車の法定速度が60km/hから30km/hに引き下げられました。速度の標識が新しく立つわけではないので、
        「標識の無い住宅街の道が、いつのまにか30km/hになっている」形です。
      </p>
      <ul>
        <li>
          <strong>30km/hになった道</strong> — 中央線・車線の白線・中央分離帯が無く、速度の標識も無い一般道路
        </li>
        <li>
          <strong>60km/hのままの道</strong> — 中央線や車線の白線がある一般道路、中央分離帯などで上下が分かれた一般道路、標識の無い自動車専用道路
        </li>
        <li>
          <strong>変わらない道</strong> — 標識・標示で最高速度が指定されている道路と、高速自動車国道の本線
        </li>
      </ul>

      <h2>生活道路で◯km/hを出したら（普通車）</h2>
      <p>
        生活道路（30km/h）で出した速度ごとの、普通車の反則金と違反点数です。右の列は、同じ速度で引下げ前（60km/h）だったときです。
      </p>
      <table>
        <thead>
          <tr>
            <th>出した速度</th>
            <th>いま（30km/h）</th>
            <th>引下げ前（60km/h）</th>
          </tr>
        </thead>
        <tbody>
          {HAYAMI.map((row) => (
            <tr key={row.label}>
              <td style={{ textAlign: 'left' }}>{row.label}</td>
              <td>
                {row.now.yen === null ? '赤切符' : formatYen(row.now.yen)}・{row.now.points}点
              </td>
              <td>
                {violationCell(row.before)}
                {row.beforeAtTop !== undefined && `〜${violationCell(row.beforeAtTop)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        引下げ前の列は、幅の中で変わるときは遅い速度〜速い速度の順に出しています（80km/h以上の行は80km/hのとき）。
      </p>

      <h2>速度超過の反則金（車の種類別）</h2>
      <p>
        反則金は超過速度と車の種類で決まります（道路交通法施行令 別表第六）。
        <strong>一般道路で30km/h以上・高速道路で40km/h以上の超過は反則金の対象外</strong>
        （赤切符）で、刑事手続になり、罰金の額は裁判で決まります。
      </p>
      <table>
        <thead>
          <tr>
            <th>超過速度</th>
            {VEHICLES.map((v) => (
              <th key={v.id}>{v.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FINE_BANDS.map((b) => (
            <tr key={b.label}>
              <td style={{ textAlign: 'left' }}>{b.label}</td>
              {VEHICLES.map((v) => (
                <td key={v.id}>{formatYen(b.yen[v.id])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        {VEHICLES.map((v) => `${v.label}＝${v.includes}`).join('／')}。
        ここでの「高速道路」は高速自動車国道と自動車専用道路（首都高・都市高速など）の両方です。
      </p>

      <h2>速度超過の違反点数</h2>
      <table>
        <thead>
          <tr>
            <th>超過速度</th>
            <th>一般道路</th>
            <th>高速道路</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>20km/h未満</td>
            <td>1点</td>
            <td>1点</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>20以上25未満</td>
            <td>2点</td>
            <td>2点</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>25以上30未満</td>
            <td>3点</td>
            <td>3点</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>30以上40未満</td>
            <td>6点（赤切符）</td>
            <td>3点</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>40以上50未満</td>
            <td>6点（赤切符）</td>
            <td>6点（赤切符）</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>50以上</td>
            <td>12点（赤切符）</td>
            <td>12点（赤切符）</td>
          </tr>
        </tbody>
      </table>
      <p className="hint">
        基礎点数です（道路交通法施行令 別表第二）。前歴が無い人は、累積{SUSPENSION_POINTS}
        点以上で免許停止（30日）の対象になります。
      </p>

      <h2>高速道路の法定速度は車で違う</h2>
      <p>
        高速自動車国道の本線で標識が無いときの法定速度は、乗用車など100km/h、大型貨物・特定中型貨物90km/h（2024年4月1日から。それまでは80km/h）、
        三輪の自動車・大型特殊自動車・ほかの車をけん引している自動車80km/hです（道路交通法施行令27条）。原付・小型特殊自動車は高速道路・自動車専用道路を通行できません。
      </p>

      <div className="note">
        このツールは速度超過の反則金と基礎点数の表を写したもので、個別の事件の処分を判断するものではありません。
        罰金（赤切符）の額や、前歴ごとの免許停止・取消の期間は計算しません。けん引している車の一般道路での法定速度は、標識の速度を入れてください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <p>
        自転車の反則金は<Link href="/jitensha-hansokukin/">自転車の反則金（青切符）早見表・チェッカー</Link>で調べられます。
      </p>

      <AdUnit position="below-faq" />

      <RelatedTools current="sokudo-ihan-hansokukin" />

      <ToolMeta slug="sokudo-ihan-hansokukin" ymyl="legal">
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
        確認）。反則金・点数は施行令の別表第六・別表第二と突き合わせています。
      </ToolMeta>
    </>
  );
}
