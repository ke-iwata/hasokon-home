import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure from '../_chapter/Figure';
import { Ladder } from '../_chapter/Diagram';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('index-active');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter
      slug="index-active"
      sources={['sharpe-1991', 'malkiel-random-walk', 'bogle-common-sense', 'fsa-basic']}
    >
      <p>
        「市場に勝つのは難しい」とよく言われます。
        これには<strong>性質の違う2つの根拠</strong>があり、
        混ぜて語られることが多いので分けて見ます。
        ひとつは仮説で、もうひとつは算数です。
      </p>

      <h2>1つ目：効率的市場仮説（これは仮説）</h2>

      <p>
        <span className="term">効率的市場仮説</span>は、
        「価格には手に入る情報がすでに織り込まれている」という考え方です。
        本当なら、公開情報を分析して割安な銘柄を見つけることはできません。
        誰かがそれに気づいた時点で、価格が動いてしまうからです。
      </p>

      <p>
        これが実務的に意味するのは、
        <strong>「みんなが知っている良い会社」と「良い投資先」は別だ</strong>ということです。
        業績が良いことが知られている会社の株は、
        その良さを織り込んだ値段になっています。
      </p>

      <p className="note">
        <strong>ただし、これは仮説です。</strong>
        市場が完全に効率的でないことを示す研究は多くあり、
        実際にバブルも暴落も起きています。
        「絶対に勝てない」とまでは言えません。
        言えるのは「勝つのは簡単ではない」までです。
      </p>

      <h2>2つ目：シャープの算術（これは算数）</h2>

      <p>
        こちらは仮説ではなく、<strong>定義から必ず成り立つ</strong>関係です。
        ウィリアム・シャープが1991年に示したもので、議論の余地がありません。
      </p>

      <div className="example">
        <strong>なぜ必ず成り立つのか</strong>
        市場にある株式は、誰かが必ず持っています。
        インデックスを買う人（市場全体を持つ人）と、
        それ以外の人（アクティブ）に分けると、
        <strong>アクティブ全体の保有は「市場全体 − インデックスの保有」</strong>になります。
        <br />
        つまり<strong>アクティブ全体の平均リターンは、コストを引く前は市場平均と一致します</strong>。
        全員が平均より上に行くことは、定義上ありえません。
        <br />
        そこから<strong>コストを引くと、アクティブ全体の平均は市場平均を必ず下回ります</strong>。
      </div>

      <Figure
        title="コストを引く前は、インデックスもアクティブ全体も平均は市場平均と同じ。コストを引くと、コストの大きいアクティブ全体の平均のほうが低くなる"
        caption="上の段は定義から必ず成り立ちます。下の段の差は、コストの差そのものです。"
      >
        <Ladder
          steps={[
            {
              label: 'コストを引く前',
              sub: 'インデックスの平均 ＝ アクティブ全体の平均 ＝ 市場平均',
            },
            {
              label: 'コストを引いたあと',
              sub: 'コストが小さいほうが残る。差はコストの差そのもの',
              strong: true,
            },
          ]}
        />
      </Figure>

      <p>
        <strong>ここで言えているのは「平均」の話だけ</strong>です。
        個々のアクティブファンドが市場に勝つことはありますし、実際に勝つものもあります。
        算術が示すのは、<strong>勝つ人がいるぶん負ける人がいる</strong>という関係と、
        コストの差だけ全体が押し下げられるという点です。
      </p>

      <h2>それでもアクティブを選ぶ理由になりうるもの</h2>

      <p>
        以上を踏まえてもアクティブに意味がある場面はあります。
      </p>

      <ul>
        <li>
          <strong>インデックスが存在しない、または使いにくい領域</strong>。
          情報が行き渡っていない市場では、調べることに価値が残る余地があります
        </li>
        <li>
          <strong>指数の作りが目的と合わない場合</strong>。
          時価総額で重みづけした指数は、値上がりした銘柄の比重が自動的に大きくなります。
          これを避けたい人はいます
        </li>
        <li>
          <strong>下落局面での振れ方を変えたい場合</strong>。
          指数をそのまま持つのとは違う振る舞いを求める考え方です
        </li>
      </ul>

      <p className="note">
        <strong>「過去に勝ったファンド」を選べばよい、とはなりません。</strong>
        過去の成績が将来も続くかどうかは別の問題です。
        目論見書に「過去の運用実績は将来の運用成果を保証するものではありません」と
        書かれているのは、形式的な但し書きではなく、実際にそのとおりだからです。
      </p>

      <h2>この教科書での扱い</h2>

      <p>
        <strong>どちらを選ぶべきかは書きません。</strong>
        個別商品の推奨にあたりますし、判断は目的とリスク許容度で変わります。
        代わりに、判断するときに使える形で整理しておきます。
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>インデックス</th>
              <th>アクティブ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>狙い</th>
              <td>指数と同じ動きをする</td>
              <td>指数を上回る</td>
            </tr>
            <tr>
              <th>コスト</th>
              <td>低いものが多い</td>
              <td>調査・運用の分だけ高くなりやすい</td>
            </tr>
            <tr>
              <th>結果のばらつき</th>
              <td>小さい（指数に連動する）</td>
              <td>大きい（上にも下にも外れる）</td>
            </tr>
            <tr>
              <th>確かめ方</th>
              <td>指数との乖離が小さいか</td>
              <td>
                コストを引いたあとで指数を上回っているか、
                <strong>長い期間で</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>まとめ</h2>

      <ul>
        <li>「市場に勝てない」には仮説（効率的市場仮説）と算数（シャープの算術）の2つがある</li>
        <li>効率的市場仮説は仮説であり、市場は完全に効率的ではない</li>
        <li>
          シャープの算術は定義から必ず成り立つ。アクティブ全体の平均は、
          コストを引くと市場平均を必ず下回る
        </li>
        <li>ただしこれは平均の話で、個々のファンドが勝つことはある</li>
        <li>過去に勝った実績は、将来も勝つことを意味しない</li>
      </ul>
    </Chapter>
  );
}
