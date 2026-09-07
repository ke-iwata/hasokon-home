import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure, { Bars, Legend } from '../_chapter/Figure';
import { NestedBox, Timeline } from '../_chapter/Diagram';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('nisa');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="nisa" sources={['fsa-nisa', 'fsa-basic', 'nta-1463']}>
      <p>
        NISAは<strong>商品ではなく器</strong>です。同じ投資信託を買っても、
        課税口座で持てば利益に20.315%かかり、NISA口座で持てばかかりません。
        何を買うかとは独立した話なので、まずこの器の形を覚えます。
      </p>

      <p className="note">
        <strong>制度の数字は改正で変わります。</strong>
        この章は2026年9月時点の内容です。
        実際に使う前に、金融庁のNISA特設ウェブサイト（末尾の参考文献）で
        最新の数字を確かめてください。
      </p>

      <h2>2つの枠</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>つみたて投資枠</th>
              <th>成長投資枠</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>年間の投資枠</th>
              <td className="num">120万円</td>
              <td className="num">240万円</td>
            </tr>
            <tr>
              <th>買えるもの</th>
              <td>長期・積立・分散に適すると金融庁に届出された投資信託・ETF</td>
              <td>上場株式・投資信託など（一部除外あり）</td>
            </tr>
            <tr>
              <th>買い方</th>
              <td>積立（定期的・継続的な買付）のみ</td>
              <td>一括でも積立でも可</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Figure
        title="年間の投資枠は、つみたて投資枠120万円と成長投資枠240万円を合わせて360万円。以前のつみたてNISA40万円・一般NISA120万円はどちらか一方しか選べなかった"
        caption="いまの制度は2つの枠を併用できます。以前はどちらか一方しか選べませんでした。"
      >
        <Bars
          max={360}
          rows={[
            {
              label: '現行NISA',
              parts: [
                { name: 'つみたて投資枠', value: 120, tone: 'accent' },
                { name: '成長投資枠', value: 240, tone: 'soft' },
              ],
            },
            {
              label: '旧つみたて',
              parts: [{ name: 'つみたてNISA（旧）', value: 40, tone: 'muted' }],
            },
            {
              label: '旧一般',
              parts: [{ name: '一般NISA（旧）', value: 120, tone: 'muted' }],
            },
          ]}
        />
        <Legend
          variant="swatch"
          items={[
            { name: 'つみたて投資枠', tone: 'accent' },
            { name: '成長投資枠', tone: 'soft' },
            { name: '旧制度（どちらか一方のみ）', tone: 'muted' },
          ]}
        />
      </Figure>

      <p>
        <strong>2つの枠は併用できます。</strong>両方を使い切れば年間360万円です。
        以前の制度（つみたてNISA・一般NISA）はどちらか一方しか選べなかったので、
        ここは変わった点です。
      </p>

      <h2>生涯で1,800万円</h2>

      <p>
        年間枠とは別に、<span className="term">非課税保有限度額</span>が
        <strong>生涯で1,800万円</strong>あります。
        このうち<strong>成長投資枠として使えるのは1,200万円まで</strong>です。
      </p>

      <ul>
        <li>1,800万円すべてをつみたて投資枠で埋めることはできる</li>
        <li>1,800万円すべてを成長投資枠で埋めることはできない（上限1,200万円）</li>
      </ul>

      <Figure
        title="生涯の非課税保有限度額1,800万円のうち、成長投資枠として使えるのは1,200万円まで。残りの600万円はつみたて投資枠でしか埋められない"
        caption="全部をつみたて投資枠で埋めることはできますが、全部を成長投資枠で埋めることはできません。"
      >
        <NestedBox
          outer={{ label: '生涯の非課税保有限度額 1,800万円', value: 1800 }}
          inner={{ label: '成長投資枠 1,200万円まで', value: 1200 }}
          innerNote="成長投資枠で使える上限"
          outerNote="残り600万円はつみたて投資枠のみ"
        />
      </Figure>

      <p>
        この限度額は<strong>買ったときの値段（簿価）で数えます</strong>。
        100万円で買ったものが150万円に値上がりしても、使った枠は100万円のままです。
        値上がりによって枠が減ることはありません。
      </p>

      <h2>売れば枠は復活する（ただし翌年）</h2>

      <p>これが以前の制度から最も大きく変わった点です。</p>

      <div className="example">
        <strong>枠の復活のしかた</strong>
        100万円で買った投資信託が150万円になったところで全部売ったとします。
        このとき復活するのは<strong>買ったときの100万円ぶん</strong>で、150万円ではありません。
        そして<strong>復活するのは翌年</strong>です。売った年のうちに同じ枠を使い直すことはできません。
      </div>

      <Figure
        title="100万円で買ったものが150万円になって売った場合、復活する枠は買ったときの100万円ぶんで、復活するのは翌年。売った年のうちには使い直せない"
        caption="復活するのは値上がり後の150万円ではなく、買ったときの100万円です。そして翌年まで待ちます。"
      >
        <Timeline
          items={[
            { date: '1年目', label: '100万円で買う', sub: '枠を100万円使う', mark: 'plain' },
            { date: '2年目', label: '150万円で売る', sub: 'この年は復活しない', mark: 'ng' },
            { date: '3年目', label: '100万円ぶん復活', sub: '簿価ぶんだけ戻る', mark: 'ok' },
          ]}
        />
      </Figure>

      <p>
        したがって「年内に売って年内に買い直す」ことはできません。
        年間の投資枠（120万・240万）は、売却とは無関係にその年の上限として効いています。
      </p>

      <h2>非課税期間と口座</h2>

      <ul>
        <li>
          <strong>非課税で持てる期間に期限はありません</strong>。
          以前のつみたてNISA（20年）・一般NISA（5年）のような期限は無くなりました
        </li>
        <li>
          <strong>口座は1人1口座</strong>。複数の金融機関に同時には持てません。
          金融機関の変更は年単位で可能ですが、その年にすでに買付があると翌年からになります
        </li>
        <li>対象年齢は18歳以上です</li>
      </ul>

      <h2>NISAで注意すること</h2>

      <p>
        非課税は良いことしかないように見えますが、
        <strong>裏返しの制約が2つ</strong>あります。
      </p>

      <ul>
        <li>
          <strong>損失が税務上「無かったこと」になります。</strong>
          課税口座なら、損を出したときに他の利益と相殺できます（損益通算）し、
          相殺しきれない分は3年間繰り越せます。
          NISA口座の損失はこのどちらもできません。
          利益に税がかからない代わりに、損も使えないということです
        </li>
        <li>
          <strong>枠は復活しても、年間の上限は変わりません。</strong>
          頻繁に売り買いすると、枠を使い切ったあと、その年は何も買えなくなります。
          回転売買には向かない器です
        </li>
      </ul>

      <p className="note">
        <strong>「NISAで買えば儲かる」ではありません。</strong>
        NISAがしてくれるのは、利益が出たときにその税を非課税にすることだけです。
        値下がりを防ぐ機能はありません。
        何を買うかの判断は、この章の外にあります。
      </p>

      <h2>iDeCoとの違い</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>NISA</th>
              <th>iDeCo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>掛金の所得控除</th>
              <td>なし</td>
              <td>あり（全額が小規模企業共済等掛金控除）</td>
            </tr>
            <tr>
              <th>運用益</th>
              <td>非課税</td>
              <td>非課税</td>
            </tr>
            <tr>
              <th>引き出し</th>
              <td>いつでも可能</td>
              <td>
                <strong>原則60歳まで不可</strong>
              </td>
            </tr>
            <tr>
              <th>受け取り時の課税</th>
              <td>なし</td>
              <td>あり（退職所得控除・公的年金等控除の対象）</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        入口で税が軽くなるのがiDeCo、出口で税がかからないのがNISA、
        という整理がいちばん近いです。
        引き出せないことは欠点にも利点にもなります（第3部19章で扱います）。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>NISAは商品ではなく器。利益にかかる20.315%が非課税になる</li>
        <li>つみたて投資枠120万円 + 成長投資枠240万円 = 年間360万円まで併用可</li>
        <li>生涯の限度額は1,800万円（うち成長投資枠は1,200万円まで）、簿価で数える</li>
        <li>売れば枠は復活するが、復活するのは簿価ぶん・翌年から</li>
        <li>非課税期間は無期限、口座は1人1口座</li>
        <li>損益通算も繰越控除もできない。損は税務上使えない</li>
      </ul>
    </Chapter>
  );
}
