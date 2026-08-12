import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

// 「オセロ」「Othello」は株式会社オセロの登録商標（メガハウスが専用使用権）。
// タイトル・見出し・meta title / description には入れない。
// ノノグラムで「ピクロス」を避けたのと同じ判断
// （docs/features/game-reversi.md の「商標の確認」）
const title = 'リバーシ 無料｜CPU対戦（かんたん・ふつう・つよい）';
const description =
  '無料のリバーシ。8×8の盤で挟んだ石を裏返し、多いほうが勝ちの2人用ボードゲームをCPU相手に遊べます。強さは かんたん・ふつう・つよい の3段階、先手（黒）・後手（白）も選べます。打てる場所を表示、もどす機能つき。インストール不要・登録不要でスマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/reversi/` },
};

const faq = [
  {
    q: 'リバーシのルールは？',
    a: '自分の石で相手の石を縦・横・斜めのいずれかで挟むように打つと、挟んだ石がすべて自分の色に裏返ります。1つも裏返せない場所には打てません。打てる場所が1つも無いときは自動でパスになり、両者が続けてパスになると対局終了です。盤が埋まったときも終了で、石の多いほうが勝ちです。',
  },
  {
    q: '強くなるコツは？',
    a: '4つの角は絶対に裏返らないので、取れるときは取り、渡さないようにするのが基本です。角の斜め隣（X打ち）は相手に角を取られる原因になりやすいので、序盤・中盤は避けます。序盤は石を増やしすぎないことも大切で、石が少ないほうが打てる場所を確保しやすく、相手が打てる場所を減らせます。',
  },
  {
    q: '序盤に石を多く取るのは損ですか？',
    a: '多くの場合は損です。石を取りすぎると自分の石が盤の外側に触れて相手に打つ場所を与え、逆に自分の打てる場所が減ります。勝敗が決まるのは最後の石数なので、中盤までは「打てる場所の多さ」を優先し、終盤で一気に返すのが定石です。',
  },
  {
    q: '先手と後手はどちらが有利ですか？',
    a: 'リバーシで先手が有利ということはありません。強い相手どうしでは後手（白）がわずかに有利ともいわれます。黒が先に打つのは慣習で、このページでも黒（先手）・白（後手）のどちらでも選べます。',
  },
  {
    q: 'CPUの強さはどのくらいですか？',
    a: '「かんたん」は打てる場所からランダムに選ぶので、ルールを覚えるのに向いています。「ふつう」は1手先だけを見て良さそうな場所を選びます。「つよい」は数手先まで読み、終盤の残り10マスからは最後まで読み切って最善を打ちます。',
  },
  {
    q: '打ち直しはできますか？',
    a: 'できます。「もどす」を押すと、自分が打つ直前の局面まで戻ります。あいだにCPUの手やパスが入っていても、必ず「自分が打てる状態」まで戻るので、手数がずれることはありません。',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'リバーシ',
      url: `${SITE_URL}/reversi/`,
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
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1>リバーシ</h1>
      <p className="lead">
        挟んだ石を裏返して、<strong>最後に石が多いほうが勝ち</strong>の定番ボードゲーム。CPUの強さは3段階、先手・後手も選べます。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>自分の石で相手の石を挟むように打つと、挟んだ石が自分の色に裏返ります</li>
        <li>縦・横・斜めのどの向きでも挟めます。1つも裏返せない場所には打てません</li>
        <li>打てる場所は盤の上に薄い丸で表示されます</li>
        <li>打てる場所が無いときは自動でパスになります（両者が続けてパスなら終了）</li>
        <li>盤が埋まるか、どちらも打てなくなったら終了。石の多いほうが勝ちです</li>
      </ol>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>角（四隅）は絶対に裏返りません。</strong>
          取れるときは取り、相手には渡さない。ここが勝敗を一番大きく分けます
        </li>
        <li>
          <strong>角の斜め隣には序盤・中盤は打たない。</strong>
          相手に角を取られる直接の原因になります（打つ場所が他に無いときだけ）
        </li>
        <li>
          <strong>序盤に石を取りすぎない。</strong>
          石が増えるほど相手に打つ場所を与えてしまいます。中盤までは「自分の打てる場所を多く、相手の打てる場所を少なく」を優先します
        </li>
        <li>辺に沿って伸ばした石は裏返りにくくなります。角から続く石は最後まで自分のものです</li>
        <li>石数の差は最後にひっくり返ります。途中で少なくても焦らないほうが勝てます</li>
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
          .filter((g) => g.ready && g.slug !== 'reversi')
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
