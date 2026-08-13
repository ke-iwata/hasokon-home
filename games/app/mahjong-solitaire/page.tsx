import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

// このジャンルの日本での通称「上海」はサン電子（サンソフト）が国内で商標を保有している。
// タイトル・h1・registry の name には入れない。本文で「その名前で知られる」と
// 事実を説明するのは商品名として名乗るのとは別なので許容する
// （docs/features/game-mahjong-solitaire.md の「権利関係の確認」。
//  リバーシで「オセロ」を避けたのと同じ判断）
const title = '麻雀ソリティア 無料｜同じ牌を2つ選んで消す絵合わせパズル';
const description =
  '無料の麻雀ソリティア。亀の形に積んだ144枚の麻雀牌から、同じ絵柄の牌を2つずつ選んで全部消すパズルです。操作はタップ2回だけ。配られる盤面は必ず最後まで消せるように作ってあるので、運だけで詰むことがありません。もどす・ヒント・並べ替えつき。インストール不要・登録不要でスマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/mahjong-solitaire/` },
};

const faq = [
  {
    q: '麻雀ソリティアのルールは？',
    a: '積み上げられた麻雀牌の中から、同じ絵柄の牌を2つ選ぶと2枚とも消えます。これを繰り返して144枚すべてを消せばクリアです。ただしどの牌でも選べるわけではなく、上に牌が乗っておらず、左右のどちらかが空いている牌だけが選べます。麻雀の役や点数は関係がなく、絵柄を合わせるだけのパズルです。',
  },
  {
    q: '選べる牌と選べない牌の違いは？',
    a: '選べるのは「上に牌が乗っていない」かつ「左どなりか右どなりのどちらかが空いている」牌です。上に1枚でも重なっていれば取れず、左右の両方が牌でふさがれていても取れません。このページでは選べない牌を少し暗く表示しているので、見た目で区別できます。',
  },
  {
    q: '麻雀のルールを知らなくても遊べますか？',
    a: '遊べます。必要なのは「同じ絵柄かどうか」を見分けることだけで、役も点数も出てきません。萬子（漢数字と萬の字）・筒子（丸の数）・索子（竹の数）は数を数えれば見分けられ、東南西北・白發中の字牌は字を見るだけです。',
  },
  {
    q: '花牌と季節牌はどう合わせるのですか？',
    a: '花牌（梅・蘭・菊・竹）と季節牌（春・夏・秋・冬）だけは例外で、同じ組の中ならどの牌とでも合います。たとえば「梅」と「菊」は絵柄が違っても消せます。ただし組をまたぐことはできず、花牌と季節牌は合いません。伝統的な麻雀ソリティアのルールをそのまま採用しています。',
  },
  {
    q: '必ずクリアできる盤面になっていますか？',
    a: '配られた時点では、最後まで消せる順番が必ず1つ以上あります。牌を積むときに「2枚ずつ取り除ける順番」を先に決めて、その組に同じ絵柄を割り当てているためです。ただし途中で消す順番を間違えると詰むことはあります。そのために「もどす」と「ヒント」、それでも動けないときの「並べ替え」を用意しています。',
  },
  {
    q: '詰んでしまったときはどうすればいいですか？',
    a: '「もどす」を押すと消した組が1つずつ戻るので、別の消し方をやり直せます。手数がかさんで戻すのが大変なときは「並べ替え」を押してください。場に残っている牌だけを配り直します。並べ替えたあとの盤面も、最後まで消せる配置になるように作り直しています。',
  },
  {
    q: 'このゲームは「上海」と同じものですか？',
    a: '遊び方は同じ系統です。「上海」は1986年に発売されたゲームの名前で、日本ではサン電子（サンソフト）が商標を保有しているため、このページでは一般名称の「麻雀ソリティア」を使っています（英語圏では Mahjong Solitaire と呼ばれます）。牌の絵柄は伝統的な麻雀牌の意匠をもとに、このサイトで描き起こしたものです。',
  },
];

const trail = breadcrumbFor('mahjong-solitaire');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '麻雀ソリティア',
      url: `${SITE_URL}/mahjong-solitaire/`,
      gamePlatform: 'Web Browser',
      applicationCategory: 'Game',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
      publisher: { '@id': `${SITE_URL}/#publisher` },
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

      <h1>麻雀ソリティア</h1>
      <p className="lead">
        亀の形に積んだ144枚の牌から、<strong>同じ絵柄を2つずつ選んで全部消す</strong>絵合わせパズル。操作はタップ2回だけです。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>同じ絵柄の牌を2つタップすると、2枚とも消えます</li>
        <li>
          選べるのは<strong>上に牌が乗っておらず、左右のどちらかが空いている牌</strong>だけです
        </li>
        <li>選べない牌は少し暗く表示され、押しても反応しません</li>
        <li>花牌（梅・蘭・菊・竹）と季節牌（春・夏・秋・冬）は、同じ組の中ならどれとでも合います</li>
        <li>144枚すべてを消せばクリアです</li>
      </ol>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>上に積まれた牌から片づける。</strong>
          下の段を先に減らしても、上に乗っている牌は取れるようになりません。まず山を崩すのが基本です
        </li>
        <li>
          <strong>同じ絵柄が4枚とも見えているときは、まとめて消す。</strong>
          2枚だけ消して残り2枚が別々の山の下に埋まると、そこから動けなくなりがちです
        </li>
        <li>
          <strong>長い列は端から。</strong>
          真ん中の牌は左右がふさがっていて取れません。端の牌を消して、取れる牌を増やしながら進めます
        </li>
        <li>
          迷ったら<strong>「ヒント」</strong>を押すと、いま消せる組が1つ光ります。消せる組の数は盤面の上に出ています
        </li>
        <li>
          詰んでも<strong>「もどす」</strong>で何手でもやり直せます。積み方そのものは必ず消しきれる形なので、順番さえ変えれば最後まで行けます
        </li>
      </ul>

      <h2>牌の見分け方</h2>
      <ul>
        <li>
          <strong>萬子（マンズ）</strong>…上に漢数字、下に赤い「萬」。一萬から九萬まで
        </li>
        <li>
          <strong>筒子（ピンズ）</strong>…丸の数が数字。一筒は大きな丸1つ、九筒は丸9つ
        </li>
        <li>
          <strong>索子（ソーズ）</strong>…竹の本数が数字。五索は真ん中の1本が赤
        </li>
        <li>
          <strong>字牌</strong>…東・南・西・北の風牌と、白（枠だけ）・發・中の三元牌
        </li>
        <li>
          <strong>花牌・季節牌</strong>…緑の梅蘭菊竹と、青の春夏秋冬。組の中ならどれとでも合う特別な牌です
        </li>
      </ul>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <h2>他のゲーム</h2>
      <div className="game-grid">
        {games
          .filter((g) => g.ready && g.slug !== 'mahjong-solitaire')
          .map((g) => (
            <Link key={g.slug} className="game-card" href={`/${g.slug}/`}>
              <div className="icon" aria-hidden="true">
                <GameIcon name={g.icon} />
              </div>
              <div className="name">{g.name}</div>
              <div className="desc">{g.description}</div>
            </Link>
          ))}
      </div>
    </>
  );
}
