import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import GameIcon from '@/app/GameIcon';
import Game from './Game';
import { MAX_HINTS } from '@/lib/jukugo/generate';
import { WORDS } from '@/lib/jukugo/words';
import { KANJI } from '@/lib/jukugo/kanji';

/**
 * 熟語パズル（漢字の穴埋め）。仕様: docs/features/game-jukugo-anaume.md
 *
 * きょうの1問と解説はマウント後にクライアントで決まる（静的書き出しで今日の問題を先に描くと
 * ハイドレーションがずれる）。**検索の受け皿は、このページに静的に書く遊び方・ルールの説明と例題1問**。
 * 語の数・字の数は表から引く（ページの文言に数字を書き写さない）。
 * 「和同開珎」の呼び名は名前・本文に使わない（仕様書の「名前（商標）の確認」）。
 */

const wordCount = WORDS.length.toLocaleString('ja-JP');
const kanjiCount = KANJI.size.toLocaleString('ja-JP');

const title = '熟語パズル（漢字パズル）— 真ん中に1字入れて二字熟語を作る。きょうの1問は小学生・中学生・おとなの3段';
const description =
  '無料の漢字パズル「熟語パズル」。真ん中の空きマスに漢字を1字入れて、上下左右の字とそれぞれ二字熟語を作ります。毎日変わるきょうの1問（小学生・中学生・おとな）と、続けて解けるれんしゅう。4択か読みで答え、解くと4つの熟語の読みと意味が出ます。インストール不要でスマホからもすぐ遊べます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/jukugo-puzzle/` },
  robots: robotsFor('jukugo-puzzle'),
};

const faq = [
  {
    q: 'どんなルールですか？',
    a: '十字に並んだ5マスの真ん中が空いています。上と左の字は「その字＋□」、下と右の字は「□＋その字」で二字熟語になるように、真ん中に漢字を1字入れます。4つとも熟語になれば正解です。',
  },
  {
    q: '答えが2つ以上あることはありますか？',
    a: '熟語の表の中で4つとも熟語になる字がほかにもあるときは、どれを選んでも正解にして「別解」と表示します。問題はできるだけ別解の無い組み合わせから選んでいます。',
  },
  {
    q: '「きょうの1問」とは何ですか？',
    a: '日付から決まる、その日だけの問題です。小学生・中学生・おとなの段ごとに1問あり、同じ日に開いた人には全員同じ問題が出ます。お使いの端末の日付で切り替わり、途中で再読み込みしても、それまでに選んだ字は残ります。',
  },
  {
    q: '小学生・中学生・おとなの違いは？',
    a: '小学生の段は、盤の字・答え・4択の字のすべてが小学校で習う漢字（教育漢字）だけです。中学生の段は常用漢字の中から中学で習う字を含む問題、おとなの段はやや難しい熟語も出ます。',
  },
  {
    q: '読みで答えるにはどうしますか？',
    a: '「読み」に切り替えて、真ん中の字の読みをひらがなで打つと、その読みを持つ漢字が候補に出ます。4つの熟語のどれかでの読みなら、どれでも正解の字が候補に出ます。スマホの変換で漢字になってしまったときは、その漢字のままでも選べます。',
  },
  {
    q: 'ヒントはありますか？',
    a: `${MAX_HINTS}回まで出せます。1回目は熟語を1つ添えて、その熟語での□の読みの最初の1字（例：「□気 の □ は『び』から」）。2回目は別の熟語の意味の1行です。それでもわからなければ「答えを見る」で答えと解説が出ます。`,
  },
  {
    q: '記録や連続日数はどこに保存されますか？',
    a: 'お使いの端末のブラウザに保存しています。サーバーには送信していないので、別の端末やブラウザでは引き継げません。きょうの1問は正解した日数と連続日数、れんしゅうは1回目で正解した数と最高何問連続かを残します。',
  },
];

const trail = breadcrumbFor('jukugo-puzzle');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '熟語パズル',
      url: `${SITE_URL}/jukugo-puzzle/`,
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>熟語パズル</h1>
      <p className="lead">
        真ん中の空きマスに<strong>漢字を1字</strong>入れて、上下左右の字とそれぞれ<strong>二字熟語</strong>を作る漢字パズルです。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>
          盤の上と左の字は<strong>「その字＋□」</strong>、下と右の字は<strong>「□＋その字」</strong>で熟語になります（矢印の向きに読みます）
        </li>
        <li>
          <strong>4択</strong>から選ぶか、「<strong>読み</strong>」に切り替えて真ん中の字の読みをひらがなで打ち、出てきた候補から選びます
        </li>
        <li>4つとも熟語になれば正解。4つの熟語の読みと意味が出ます</li>
      </ol>

      <h2>例題</h2>
      <p>
        上「看」・左「重」・下「気」・右「院」のとき、真ん中に入る字は何でしょう。
      </p>
      <div className="jk-example" aria-label="例題の盤">
        <span className="jk-ex-top">看</span>
        <span className="jk-ex-left">重</span>
        <span className="jk-ex-center">病</span>
        <span className="jk-ex-right">院</span>
        <span className="jk-ex-bottom">気</span>
      </div>
      <p>
        答えは<strong>「病」</strong>です。看病（かんびょう）・重病（じゅうびょう）・病気（びょうき）・病院（びょういん）の4つの熟語ができます。
        同じ字でも熟語によって読みが変わることがあるので（「生」は せい・しょう、「人」は じん・にん）、
        読みで答えるときは4つの熟語のどれかでの読みを打てば候補に出ます。
      </p>

      <h2>2つのモードと3つの段</h2>
      <ul>
        <li>
          <strong>きょうの1問</strong>：日付から決まる問題で、同じ日は全員同じ。正解すると「結果をコピー」で共有できます
        </li>
        <li>
          <strong>れんしゅう</strong>：続けて何問でも。1回目で正解した数と、最高何問連続で正解したかが残ります
        </li>
        <li>
          <strong>小学生</strong>は小学校で習う漢字（教育漢字）だけ、<strong>中学生</strong>は中学で習う常用漢字を含む問題、
          <strong>おとな</strong>はやや難しい熟語も出ます
        </li>
      </ul>

      <h2>熟語の表について</h2>
      <p>
        問題は、二字熟語 {wordCount} 語の表から機械的に組み立てています。表と意味の1行は自前で編んだもので、
        ほかの本やサイトの問題・辞書の語釈は写していません。字の学年と読みは、常用漢字表（平成22年内閣告示第2号。{kanjiCount}字）と
        学年別漢字配当表（小学校学習指導要領の別表）によります。読みが2通りある熟語（人気：にんき／ひとけ など）は、
        ヒントの読みが決められないので問題に使っていません。4つとも熟語になる字が答えのほかにもあれば、それも正解の<strong>別解</strong>です。
      </p>

      <h2>きょうの1問の共有</h2>
      <p>
        きょうの1問を解き終えると「結果をコピー」で共有できます。何回目で正解したか・使ったヒントの数・連続日数と、
        試した回数ぶんの ❌…⭕ が入った文面で、<strong>答えの字や盤の字は入りません</strong>。
      </p>

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
          .filter((g) => g.slug !== 'jukugo-puzzle')
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
