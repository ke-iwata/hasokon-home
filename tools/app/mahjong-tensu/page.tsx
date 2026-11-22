import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, webApplication } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { DEFAULT_RULES, calcScore, fmt } from '@/lib/mahjong-tensu';
import Calculator from './Calculator';

// 仕様: docs/features/mahjong-tensu-keisan.md
// 点数を円に換算する・精算する機能は作らない（賭けを助長しない）。本文で競合のアプリ・サイト名を出さない

const title = '麻雀 点数計算（符計算・点数早見表）｜符と翻を選ぶだけ・符の内訳つき（無料・登録不要）';
const description =
  '麻雀の点数を符と翻を選ぶだけで計算。面子・雀頭・待ちを選ぶと符を内訳つきで数え、本場・供託も込みで出します。子・親×ロン・ツモの点数早見表はA4 1枚で印刷できます。切り上げ満貫・数え役満などのルール切り替えつき。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/mahjong-tensu/` },
  robots: robotsFor('mahjong-tensu'),
};

/** 本文に点数を手で書かないため、lib から出す */
function ron(dealer: boolean, fu: number, han: number, rules = DEFAULT_RULES): string {
  const r = calcScore({ dealer, win: 'ron', fu, han }, rules);
  return r.ok ? fmt(r.ron!) : '—';
}
const KIRIAGE = { ...DEFAULT_RULES, kiriageMangan: true };

const faq = [
  {
    q: '30符4翻は7,700点？8,000点？',
    a: `計算どおりなら子のロンで${ron(false, 30, 4)}点（親は${ron(true, 30, 4)}点）です。ただ、満貫（8,000点）まであと少しなので、4翻30符と3翻60符を満貫に切り上げる「切り上げ満貫」を採るルールも多く、その場合は子${ron(false, 30, 4, KIRIAGE)}点・親${ron(true, 30, 4, KIRIAGE)}点です。卓のルールに合わせて、ページ下の「ルールの切り替え」で選んでください。`,
  },
  {
    q: '双碰待ちでロンしたとき、完成した刻子は明刻？暗刻？',
    a: '明刻として数えます。手の中で揃えた刻子でも、最後の1枚を他家の捨て牌（ロン）で取った刻子は「鳴いた」のと同じ扱いになるためです。中張牌なら暗刻4符ではなく明刻2符、么九牌なら8符ではなく4符になります。ツモで完成したときは暗刻のままです。',
  },
  {
    q: '数え役満と三倍満止めの違いは？',
    a: `役を重ねて13翻以上になったときの扱いの違いです。「数え役満」なら役満と同じ子${ron(false, 30, 13)}点・親${ron(true, 30, 13)}点、「三倍満止め」なら11〜12翻と同じ三倍満（子${ron(false, 30, 13, { ...DEFAULT_RULES, kazoeYakuman: false })}点）で止めます。どちらにするかは卓によって違います。`,
  },
];

const trail = breadcrumbFor('mahjong-tensu');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    webApplication({ name: '麻雀 点数計算（符計算・早見表）', slug: 'mahjong-tensu', description }),
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

      <h1>麻雀 点数計算（符計算・早見表）</h1>
      <p className="lead">
        符と翻を選ぶだけで、ロン・ツモの点数を本場・供託込みで出します。符が分からないときは、面子・雀頭・待ちを選ぶと「どこで何符か」を1行ずつ見せながら数えます。子・親×ロン・ツモの早見表は A4 1枚で印刷できます。登録・インストール不要で、入れた内容はどこにも送りません。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>符の数え方</h2>
      <p>
        符は「副底20符」から始めて、あがり方・面子・雀頭・待ちの符を足し、最後に10符単位に切り上げます（32符なら40符）。門前でロンすると10符、ツモは2符（平和のツモを除く）が付きます。
      </p>
      <table>
        <thead>
          <tr>
            <th>面子</th>
            <th>中張牌（2〜8）</th>
            <th>么九牌（1・9・字）</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>明刻（鳴いた刻子）</td>
            <td>2符</td>
            <td>4符</td>
          </tr>
          <tr>
            <td>暗刻</td>
            <td>4符</td>
            <td>8符</td>
          </tr>
          <tr>
            <td>明槓</td>
            <td>8符</td>
            <td>16符</td>
          </tr>
          <tr>
            <td>暗槓</td>
            <td>16符</td>
            <td>32符</td>
          </tr>
        </tbody>
      </table>
      <p>
        順子は0符です。雀頭が役牌（三元牌・場風・自風）なら2符、場風と自風が重なる連風牌は2符か4符（ルールによる）。待ちは嵌張・辺張・単騎が2符で、両面・双碰は0符です。
      </p>
      <p>
        例外が3つあります。<strong>七対子は25符で固定</strong>（切り上げません）。<strong>平和のツモは20符で固定</strong>（ツモの2符を付けません。平和のロンは20＋10で30符）。鳴いていて符が20符のままのロン（喰い平和の形）は30符として扱います。
      </p>

      <h2>満貫・跳満の区切り</h2>
      <p>
        点数の元になる「基本点」は 符 × 2の（翻＋2）乗 です。子のロンは基本点の4倍、親のロンは6倍で、100点未満を切り上げます。基本点が2,000を超えると満貫で止まり、5翻からは符に関係なく決まります。
      </p>
      <table>
        <thead>
          <tr>
            <th>翻</th>
            <th>名前</th>
            <th>子のロン</th>
            <th>親のロン</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ['5翻（4翻40符・3翻70符以上も）', '満貫', 5],
              ['6・7翻', '跳満', 6],
              ['8〜10翻', '倍満', 8],
              ['11・12翻', '三倍満', 11],
              ['13翻以上', '数え役満', 13],
            ] as const
          ).map(([label, name, han]) => (
            <tr key={name}>
              <td>{label}</td>
              <td>{name}</td>
              <td>{ron(false, 30, han)}</td>
              <td>{ron(true, 30, han)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>ツモの払いの分け方</h2>
      <p>
        子がツモであがったときは、子の2人が基本点の1倍、親が2倍をそれぞれ100点未満切り上げで払います。30符1翻なら「300・500」で、子が300点ずつ、親が500点です。親がツモであがったときは、子3人が基本点の2倍ずつ払い、「500オール」のように言います。切り上げを3人それぞれでするので、ツモの合計はロンより少し多くなることがあります。
      </p>

      <h2>本場と供託</h2>
      <p>
        親が連荘するか流局すると積み棒（本場）が増え、1本場につきロンなら300点、ツモなら払う人それぞれが100点ずつ多く払います。リーチ棒（供託）は1本1,000点で、次にあがった人が全部受け取ります。この計算機の「かんたん」タブで本場と供託の本数を入れると、内訳つきで合計を出します。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="mahjong-tensu" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連：<a href="/games/mahjong-solitaire/">麻雀ソリティア（牌を2枚ずつ取るパズル）</a>／<Link href="/dice/">サイコロ</Link>／
        <Link href="/roulette/">ルーレット</Link>（親決め・席決めに）
      </p>

      <ToolMeta slug="mahjong-tensu">
        点数の数え方は一般的なルール（符・翻・満貫の区切り）に沿っています。切り上げ満貫・連風牌の符・数え役満・ダブル役満は卓によって違うので、「ルールの切り替え」で合わせてください。点数を金額に換算する機能はありません。
      </ToolMeta>
    </>
  );
}
