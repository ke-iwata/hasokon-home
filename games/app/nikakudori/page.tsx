import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

// このジャンルはかつて日本で「四川省」の名でアーケードから流通してきたが、その名前は
// 商用タイトル由来のため既定名から外し、ジャンルの一般名称の「二角取り」を採る。
// 本文で「このジャンルは『四川省』とも呼ばれます」と事実を述べるのは、その名前を
// 商品名として名乗るのとは別扱いとして許容する（麻雀ソリティアで「上海」に触れているのと同じ整理。
// docs/features/game-nikakudori.md の状態欄）
const title = '二角取り 無料｜同じ麻雀牌を線でつなぐパズル（四川省）';
const description =
  '無料の二角取り（四川省とも）。同じ絵柄の麻雀牌を、曲がり角2回以内の線でつなげたら消せます。線は盤の外を通ってもかまいません。配られる盤面は必ず最後まで消せるように作ってあります。小・中・標準の3段階、もどす・ヒント・並べ替えつき。インストール不要・登録不要でスマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/nikakudori/` },
  robots: robotsFor('nikakudori'),
};

const faq = [
  {
    q: '二角取りのルールは？',
    a: '格子状に並んだ麻雀牌から、同じ絵柄の2枚をタップして消していくパズルです。ただし2枚をつなぐ線が「直線3本以内（曲がり角2回以内）」で、途中に他の牌が無いときにだけ消せます。線は盤の外も通れます。すべての牌を消せばクリアです。',
  },
  {
    q: '「四川省」と何が違うのですか？',
    a: 'ルールは同じで、ジャンルの呼び名が違うだけです。「四川省」は1989年のアーケードゲームのタイトルとして商用に流通してきた名前なので、当サイトではジャンルの一般名称である「二角取り」を使っています。同じジャンルを指す言葉として本文中で両方に触れています。',
  },
  {
    q: '麻雀ソリティア（上海型）とは違いますか？',
    a: '違います。麻雀ソリティアは牌を立体的に積む1〜5段の亀レイアウトで、選べるのは「上に牌が乗っておらず左右のどちらかが空いた牌」だけです。二角取りは1層の格子で、選べるのは「同じ絵柄で経路がつながる2枚」です。同じ144枚を使う麻雀ソリティアと違い、二角取りは 60 枚・84 枚・112 枚の3段階です。',
  },
  {
    q: '選べる線と選べない線の違いは？',
    a: '線の曲がり角が2回以下（直線が3本まで）で、途中の各マスが空きマスなら選べます。曲がり角が3回以上になる線は選べません。線は盤の外周を通ってかまわない（＝2枚が盤の反対側同士でも、間の牌に邪魔されずに大回りできる）ので、遠くの2枚どうしでも見た目より合わせられます。',
  },
  {
    q: '花牌や季節牌は入っていますか？',
    a: '入っていません。使うのは数牌（萬子・筒子・索子 各9種）と字牌（東南西北・白發中）の34種の中から、盤の広さに合わせて選んだ 15 / 21 / 28 種を各 4 枚ずつです。花牌・季節牌は「組の中ならどれとでも合う」という麻雀ソリティア特有の特殊ルールで動くため、二角取りでは持ち込みません。',
  },
  {
    q: '必ずクリアできる盤面になっていますか？',
    a: '配られた時点では、最後まで消せる順番が必ず1つ以上あります。空の盤から「その2マスが今つながる」組を1つずつ埋めていき、その逆順が play で消せる順になるからです。ただし途中で順番を間違えると詰むことがあるので、「もどす」と「ヒント」、それでも動けないときの「並べ替え」を用意しています。',
  },
  {
    q: '詰んでしまったときはどうすればいいですか？',
    a: '「もどす」を押すと消した組が1つずつ戻るので、別の消し方をやり直せます。手数がかさんで戻すのが大変なときは「並べ替え」を押してください。場に残っている牌だけを、必ず最後まで消せるように配り直します。ヒントと並べ替えの使用回数は成績に記録されます。',
  },
  {
    q: 'スマホでも遊べますか？',
    a: '遊べます。操作はタップ2回だけで、狭い画面向けに「小 10×6」を既定にしています。落ち着いて遊びたいときは制限時間なし、大きめの盤で挑戦したいときは「中」や「標準」に切り替えてください。',
  },
];

const trail = breadcrumbFor('nikakudori');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '二角取り',
      alternateName: ['四川省', 'Shisen-sho'],
      url: `${SITE_URL}/nikakudori/`,
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

      <h1>二角取り</h1>
      <p className="lead">
        同じ絵柄の麻雀牌を<strong>曲がり角2回以内の線でつないで消していく</strong>パズル。
        操作はタップ2回だけです。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>同じ絵柄の牌を2つタップすると、その2枚をつなぐ線が引けるか判定されます</li>
        <li>
          線は<strong>曲がり角2回以内（直線3本以内）</strong>で、途中のマスがすべて空きなら通ります
        </li>
        <li>
          <strong>線は盤の外を通ってもかまいません</strong>。反対側の端どうしでも回り込めます
        </li>
        <li>線がつながれば2枚とも消えます。つながらないと、押したほうが新しく選択に移ります</li>
        <li>全部消せばクリア。詰んだら「もどす」「並べ替え」で立て直せます</li>
      </ol>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>盤の縁と外周は自由に通れる。</strong>
          縁の牌は残しておくと、遠い2枚を大回りでつなぐ道が広く残ります
        </li>
        <li>
          <strong>同じ絵柄が4枚見えているうちに、2枚だけでも減らす。</strong>
          後回しにするほど周囲が塞がって、線が引けなくなりがちです
        </li>
        <li>
          <strong>迷ったら「ヒント」。</strong>いま消せる組が1つ光ります。
          消せる組の数は盤面の上に出ています
        </li>
        <li>
          <strong>詰んでも「もどす」で何手でもやり直せます。</strong>
          配られた盤面は必ず消しきれる形なので、順番さえ変えれば最後まで行けます
        </li>
      </ul>

      <h2>広さ（難易度）</h2>
      <ul>
        <li><strong>小 10×6（60枚）</strong>…スマホの狭い画面向け。1ゲーム 2〜3 分</li>
        <li><strong>中 12×7（84枚）</strong>…遊び慣れた向け。5〜7 分</li>
        <li><strong>標準 14×8（112枚）</strong>…しっかり遊びたいときに。10 分前後</li>
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
        {publicGames
          .filter((g) => g.slug !== 'nikakudori')
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
