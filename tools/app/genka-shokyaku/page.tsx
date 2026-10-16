import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import {
  IKKATSU_LIMIT,
  SHOGAKU_LIMIT,
  SOURCES,
  TOKUREI_ANNUAL_CAP,
  TOKUREI_LIMIT_AFTER,
  TOKUREI_LIMIT_BEFORE,
  straightLine,
  usedLife,
} from '@/lib/genka-shokyaku';
import Calculator from './Calculator';

const title = '減価償却 計算機 — 40万円未満の特例（2026年4月から）・一括償却・耐用年数・中古の簡便法';
const description =
  '買った物の値段と買った日、青色か白色かを入れると、全額経費・一括償却（3年）・中小事業者の少額減価償却資産の特例（2026年4月1日以後の取得は40万円未満、3月までは30万円未満）・通常の減価償却のどれが使えるかと、今年の経費・年ごとの償却表を出します。中古の耐用年数、事業割合、定率法にも対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/genka-shokyaku/` },
  robots: robotsFor('genka-shokyaku'),
};

const man = (v: number) => `${(v / 10_000).toLocaleString('ja-JP')}万円`;
const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;

/** 本文の例（額を手で書かないため lib で出す） */
const USED_CAR_LIFE = usedLife(6, 48);
const DEC_PC_FIRST = straightLine(380_000, 4, 2026, 12)[0].depreciation;

const faq = [
  {
    q: '30万円未満が40万円未満になったのはいつから？',
    a: `2026年4月1日以後に取得した物からです。2026年分（令和8年分）の申告でも、1〜3月に買った物は${man(TOKUREI_LIMIT_BEFORE)}未満のままです（所得税法等の一部を改正する法律〔令和8年法律第12号〕附則35条）。特例の期限は2029年3月31日までに取得した物です。`,
  },
  {
    q: '白色申告でも40万円未満の物を全額経費にできますか？',
    a: `できません。中小事業者の少額減価償却資産の特例は青色申告の人だけです。白色申告でも、${man(SHOGAKU_LIMIT)}未満の物は全額をその年の経費に、${man(IKKATSU_LIMIT)}未満の物は3年間の一括償却にできます。`,
  },
  {
    q: '副業（雑所得）でパソコンを買ったら？',
    a: `40万円未満の特例は事業所得・不動産所得・山林所得だけで、雑所得では使えません。${man(SHOGAKU_LIMIT)}未満の全額経費と、${man(IKKATSU_LIMIT)}未満の一括償却は雑所得でも使えます。それ以外は耐用年数で償却します。`,
  },
  {
    q: '税込40万7千円・税抜37万円のパソコンは特例の対象ですか？',
    a: '経理の方式で決まります。免税事業者と税込経理の人は税込の407,000円で判定するので対象外、税抜経理の人は税抜の370,000円で判定するので対象です。インボイスで課税事業者になった人は、どちらの経理をしているかを確かめてください。',
  },
  {
    q: '12月に買って12月に使い始めたら？',
    a: `通常の減価償却は月割なので1か月分だけです（38万円のパソコンを定額法で償却すると${yen(DEC_PC_FIRST)}）。10万円未満の全額・一括償却・40万円未満の特例は月割しないので、年内に使い始めれば、その年の経費になります。買っただけで使い始めていない物は、その年の経費になりません。`,
  },
  {
    q: '全額経費にしたのに償却資産税の申告が要るのはなぜ？',
    a: '10万円未満で全額経費にした物と一括償却にした物は償却資産（固定資産税）の対象から外れますが、40万円未満の特例で全額経費にした物は対象のままです（地方税法施行令49条）。償却資産の課税標準額の合計が150万円未満なら固定資産税はかかりませんが（免税点）、申告そのものは市町村の案内に従ってください。',
  },
  {
    q: '中古車の耐用年数は？',
    a: `法定耐用年数の一部を過ぎた中古資産は「法定耐用年数 − 経過年数 ＋ 経過年数 × 20%」（1年未満切捨て・2年未満は2年）、全部を過ぎた物は「法定耐用年数 × 20%」で出せます（簡便法）。4年落ちの普通自動車（法定6年）なら${USED_CAR_LIFE}年です。残りの使用期間を見積もれるなら、見積もった年数でもかまいません。`,
  },
];

const trail = breadcrumbFor('genka-shokyaku');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '減価償却 計算機（40万円未満の特例・一括償却）',
      url: `${SITE_URL}/genka-shokyaku/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('genka-shokyaku'),
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

      <h1>減価償却 計算機（40万円未満の特例・一括償却・中古の耐用年数）</h1>
      <p className="lead">
        買った物の値段・買った日・青色か白色かを入れると、<strong>全額その年の経費</strong>・
        <strong>一括償却（3年）</strong>・<strong>40万円未満の特例</strong>・<strong>耐用年数での償却</strong>
        のどれが使えるかと、今年の経費・年ごとの償却表を出します。 2026年分は、
        <strong>3月までに買った物は30万円未満・4月からは40万円未満</strong>で判定します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>10万・20万・40万円で何が変わるか</h2>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>取得価額</th>
              <th>使える方法</th>
              <th>対象になる申告</th>
              <th>償却資産税</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{man(SHOGAKU_LIMIT)}未満</td>
              <td style={{ textAlign: 'left' }}>全額を使い始めた年の経費（所得税法施行令138条）</td>
              <td>青色・白色・雑所得</td>
              <td>対象外</td>
            </tr>
            <tr>
              <td>{man(IKKATSU_LIMIT)}未満</td>
              <td style={{ textAlign: 'left' }}>一括償却：3年間で3分の1ずつ。月割しない（同139条）</td>
              <td>青色・白色・雑所得</td>
              <td>対象外</td>
            </tr>
            <tr>
              <td>
                {man(TOKUREI_LIMIT_AFTER)}未満
                <br />
                （2026年3月31日以前の取得は{man(TOKUREI_LIMIT_BEFORE)}未満）
              </td>
              <td style={{ textAlign: 'left' }}>
                全額を使い始めた年の経費。年の合計{man(TOKUREI_ANNUAL_CAP)}まで（租税特別措置法28条の2）
              </td>
              <td>青色申告の事業所得など（雑所得は不可）</td>
              <td>対象</td>
            </tr>
            <tr>
              <td>それ以上</td>
              <td style={{ textAlign: 'left' }}>耐用年数で償却。1年目は使い始めた月からの月割</td>
              <td>すべて</td>
              <td>対象</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        たとえば青色申告で15万円のパソコンを買うと、全額経費（特例）・3年の一括償却・4年の定額法の3つから選べます。
        どれを選ぶかで、今年の経費と、償却資産（固定資産税）の申告に載るかが変わります。
      </p>

      <h2>令和8年分は 3月までと 4月からで上限が違う</h2>
      <p>
        令和8年度税制改正（所得税法等の一部を改正する法律・<strong>令和8年法律第12号</strong>
        ）で、中小事業者の少額減価償却資産の特例の上限が 30万円未満から<strong>40万円未満</strong>
        に上がり、期限が2029年3月31日まで延びました。新しい上限は<strong>2026年4月1日以後に取得した物</strong>から使い、
        それより前に取得した物は従前の30万円未満のままです（附則35条）。年で切り替わるのではなく<strong>取得日</strong>
        で決まるので、
        2026年分の確定申告では1〜3月の物と4〜12月の物で上限が違います。年の合計300万円の枠は変わっていません。
      </p>

      <h2>青色申告でないと全額経費にできない（雑所得も不可）</h2>
      <p>
        40万円未満の特例は、<strong>青色申告</strong>の中小事業者（常時使用する従業員400人以下）だけが使えます。
        白色申告の人と、副業を雑所得で申告する人は使えません。どちらも、10万円未満の全額経費と20万円未満の一括償却は使えます。
      </p>
      <PublicToolLink slug="aoiro-shinkoku-kojo">
        <p>
          青色申告にすると控除がいくらになるかは
          <ToolLink slug="aoiro-shinkoku-kojo">青色申告特別控除 判定</ToolLink>で確かめられます。
        </p>
      </PublicToolLink>

      <h2>税込か税抜か</h2>
      <p>
        取得価額に消費税を含めるかは<strong>経理の方式</strong>
        で決まります。免税事業者と税込経理の人は税込、税抜経理の人は税抜で判定します。
        税抜37万円（税込40万7千円）のパソコンは、税抜経理なら40万円未満の特例の対象、税込経理なら対象外です。
      </p>
      <PublicToolLink slug="invoice-nozeigaku">
        <p>
          インボイスで課税事業者になった人の消費税の納税額は
          <ToolLink slug="invoice-nozeigaku">インボイス 納税額 計算機</ToolLink>で出せます。
        </p>
      </PublicToolLink>

      <h2>中古で買った物の耐用年数</h2>
      <p>
        中古の物は、残りの使用期間を見積もるか、<strong>簡便法</strong>で耐用年数を出せます（耐用年数省令3条）。
        法定耐用年数の一部を過ぎた物は「法定耐用年数 − 経過年数 ＋ 経過年数 × 20%」、全部を過ぎた物は「法定耐用年数 ×
        20%」で、 1年未満は切り捨て、2年に満たないときは2年です。4年落ちの普通自動車（法定6年）は{USED_CAR_LIFE}
        年になります。
      </p>

      <h2>家事と兼用の物は事業割合で按分</h2>
      <p>
        仕事と私用の両方に使うパソコンや車は、償却費のうち<strong>事業で使う割合</strong>だけが経費です。
        どの方法が使えるか（10万・20万・40万円）の判定は、割合をかける前の<strong>取得価額の全額</strong>で行います。
        また、未償却残高は経費にした部分だけでなく、償却費の全額で減らします。
      </p>

      <h2>全額経費でも償却資産税の申告は要る</h2>
      <p>
        10万円未満で全額経費にした物と、一括償却にした物は、償却資産（固定資産税）の対象から外れます。 一方、
        <strong>40万円未満の特例で全額経費にした物は対象のまま</strong>です（地方税法施行令49条）。
        1月1日に持っている償却資産は、市町村に申告します（課税標準額の合計が150万円未満なら固定資産税はかかりません）。
      </p>

      <PublicToolLink slug="kakutei-shinkoku-hantei">
        <p>
          そもそも確定申告が必要かは
          <ToolLink slug="kakutei-shinkoku-hantei">確定申告が必要かの判定</ToolLink>で確かめられます。
        </p>
      </PublicToolLink>

      <div className="note">
        この計算機は、2007年4月1日以後に取得した物の定額法と、2012年4月1日以後に取得した物の200%定率法を扱います。
        建物・建物附属設備・構築物、不動産所得、法人、特別償却・税額控除、資本的支出・売却・除却は対象外です。
        耐用年数は、よく買う物だけを選択肢にしています。ほかの物は e-Gov の耐用年数省令の別表で調べてください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="genka-shokyaku" />

      <ToolMeta slug="genka-shokyaku" ymyl>
        出典：
        {SOURCES.map((s, i) => (
          <span key={s.url}>
            {i > 0 && '／'}
            <a href={s.url} target="_blank" rel="nofollow noopener noreferrer">
              {s.label}
            </a>
          </span>
        ))}
        にもとづき作成。償却費・経費の1円未満の扱いと決算書の欄は、令和8年分の国税庁の手引き・様式が出たら確かめ直します。
      </ToolMeta>
    </>
  );
}
