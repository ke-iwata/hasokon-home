import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure from '../_chapter/Figure';
import { Timeline } from '../_chapter/Diagram';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('zeikin');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

/** 税率の内訳。合計が20.315%になることを計算で示す（手打ちしない） */
const INCOME = 15;
const RECOVERY_NOW = 0.021;
const RECOVERY_2027 = 0.011;
const DEFENSE_2027 = 0.01;
const RESIDENT = 5;
const totalNow = INCOME + INCOME * RECOVERY_NOW + RESIDENT;
const total2027 = INCOME + INCOME * RECOVERY_2027 + INCOME * DEFENSE_2027 + RESIDENT;
const pct = (n: number) => `${Math.round(n * 1000) / 1000}%`;

export default function Page() {
  return (
    <Chapter slug="zeikin" sources={['nta-1463', 'nta-1474', 'nta-1330', 'mof-boei']}>
      <p>
        上場株式や投資信託の利益にかかる税は<strong>20.315%</strong>です。
        率そのものより、<strong>損が出た年にやっておくこと</strong>のほうが
        金額の効き方は大きくなります。この章はそこを中心に扱います。
      </p>

      <p className="note">
        <strong>制度は改正で変わります。</strong>
        この章は2026年9月時点の内容です。実際の申告の前に、
        国税庁のタックスアンサー（末尾の参考文献）で最新の内容を確かめてください。
      </p>

      <h2>20.315%の内訳</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>いま（2026年）</th>
              <th>2027年以降</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>所得税</th>
              <td className="num">{pct(INCOME)}</td>
              <td className="num">{pct(INCOME)}</td>
            </tr>
            <tr>
              <th>復興特別所得税</th>
              <td className="num">{pct(INCOME * RECOVERY_NOW)}</td>
              <td className="num">{pct(INCOME * RECOVERY_2027)}</td>
            </tr>
            <tr>
              <th>防衛特別所得税</th>
              <td className="num">—</td>
              <td className="num">{pct(INCOME * DEFENSE_2027)}</td>
            </tr>
            <tr>
              <th>住民税</th>
              <td className="num">{pct(RESIDENT)}</td>
              <td className="num">{pct(RESIDENT)}</td>
            </tr>
            <tr>
              <th>
                <strong>合計</strong>
              </th>
              <td className="num">
                <strong>{pct(totalNow)}</strong>
              </td>
              <td className="num">
                <strong>{pct(total2027)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        令和9年（2027年）分から<strong>防衛特別所得税</strong>が加わりますが、
        同時に復興特別所得税が2.1%から1.1%へ下がるため、
        <strong>合計は{pct(total2027)}のままで変わりません</strong>。
        「増税で株の税率が上がる」という説明を見かけたら、
        内訳の話と合計の話を取り違えている可能性があります。
      </p>

      <h2>損益通算——損は利益と相殺できる</h2>

      <p>
        同じ年の中で、<strong>利益と損失を差し引きできます</strong>。
        1つの証券口座の中なら自動ですが（第3部20章）、
        <strong>複数の口座にまたがる場合は確定申告が必要</strong>です。
      </p>

      <div className="example">
        <strong>口座をまたぐと申告が要る</strong>
        A証券で+50万円の利益、B証券で−30万円の損失。
        <br />
        源泉徴収ありのままだと、A証券の50万円に対して税が引かれ、
        B証券の損は使われません。
        <br />
        <strong>確定申告すれば</strong>差し引き20万円に対する課税になり、
        払いすぎた分が戻ります。
      </div>

      <p>
        <strong>通算できる相手には範囲があります。</strong>
        上場株式・株式投資信託・ETF・REITなどは同じグループで通算できますが、
        <strong>FXや先物（先物取引に係る雑所得等）とは通算できません</strong>
        （第2部13章・17章）。暗号資産とも通算できません（第3部22章）。
      </p>

      <h2>繰越控除——3年間持ち越せる</h2>

      <p>
        その年の利益で使い切れなかった損失は、
        <strong>翌年以降3年間、繰り越して使えます</strong>。
        これは金額の効きがいちばん大きい制度です。
      </p>

      <Figure
        title="1年目に100万円の損失を出して申告すると、2年目の40万円の利益と3年目の60万円の利益に対して、繰り越した損失を充てて課税をゼロにできる"
        caption="申告して初めて繰り越せます。損が出た年に何もしないと、この権利は消えます。"
      >
        <Timeline
          items={[
            { date: '1年目', label: '100万円の損', sub: '申告して繰越', mark: 'ok' },
            { date: '2年目', label: '40万円の利益', sub: '繰越分で相殺', mark: 'plain' },
            { date: '3年目', label: '60万円の利益', sub: '残りで相殺', mark: 'plain' },
          ]}
        />
      </Figure>

      <p className="note">
        <strong>繰り越すには、損が出た年に確定申告が必要です。</strong>
        しかも<strong>損失を使い切るまで、毎年続けて申告し続ける</strong>必要があります。
        途中で1年でも申告しないと、そこで繰越が途切れます。
        「損した年は申告しなくていい」は、いちばん高くつく誤解です。
      </p>

      <h2>配当の扱いは3通りから選べる</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>選び方</th>
              <th>税率</th>
              <th>特徴</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>申告不要</td>
              <td className="num">{pct(totalNow)}</td>
              <td>何もしない。いちばん簡単</td>
            </tr>
            <tr>
              <td>申告分離課税</td>
              <td className="num">{pct(totalNow)}</td>
              <td>
                <strong>譲渡損失と通算できる</strong>
              </td>
            </tr>
            <tr>
              <td>総合課税</td>
              <td>累進</td>
              <td>
                <strong>配当控除</strong>が使える。所得が低いと有利になることがある
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul>
        <li>
          <strong>株の損失と相殺したいなら申告分離課税</strong>。
          総合課税を選ぶと譲渡損失と通算できません
        </li>
        <li>
          <strong>配当控除はJ-REITには使えません</strong>（第2部11章）。
          外国株の配当にも使えません
        </li>
        <li>
          <strong>申告すると保険料や扶養判定に影響します</strong>（第3部20章）。
          税だけで判断しないこと
        </li>
      </ul>

      <h2>NISAの損失は使えない</h2>

      <p>
        繰り返しになりますが、重要なので再掲します。
        <strong>NISA口座の損失は、損益通算も繰越控除もできません</strong>。
        利益に税がかからない代わりに、損も税務上は存在しないものとして扱われます。
      </p>

      <h2>外国株の二重課税</h2>

      <p>
        外国株の配当は、<strong>現地で源泉徴収されたうえで日本でも課税される</strong>
        ことがあります。確定申告で<strong>外国税額控除</strong>を使えば
        一部を取り戻せますが、手間がかかり、控除額にも上限があります。
      </p>

      <p>
        <strong>NISA口座では外国税額控除が使えません</strong>。
        日本で非課税なので、控除する対象の日本の税がないためです。
        外国株の配当をNISAで受け取る場合、現地の税は取られたままになります。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>税率は{pct(totalNow)}。2027年に内訳が変わるが合計は変わらない</li>
        <li>損益通算は同じ年の利益と損失の相殺。口座をまたぐなら申告が要る</li>
        <li>FX・先物・暗号資産とは通算できない</li>
        <li>繰越控除は3年。損が出た年に申告し、使い切るまで毎年申告し続ける</li>
        <li>配当は3通りから選べる。株の損失と相殺するなら申告分離課税</li>
        <li>NISAの損失は通算も繰越もできない。外国税額控除も使えない</li>
      </ul>
    </Chapter>
  );
}
