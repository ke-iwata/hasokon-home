import type { Metadata } from 'next';
import Chapter from '../../_chapter/Chapter';
import Figure from '../../_chapter/Figure';
import { Flow, Timeline } from '../../_chapter/Diagram';
import { chapterBySlug, chapterUrl, robotsFor } from '@/lib/curriculum';

const chapter = chapterBySlug('ideco');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="ideco" sources={['ideco-official', 'fsa-basic', 'nta-1463']}>
      <p>
        iDeCoは<strong>自分で作る年金</strong>です。NISAと同じく器ですが、
        効きどころが違います。NISAが出口（運用益）で効くのに対して、
        <strong>iDeCoは入口（掛金）で効きます</strong>。
        そのかわり、60歳まで引き出せません。
      </p>

      <p className="note">
        <strong>制度の数字は改正で変わります。</strong>
        この章は2026年9月時点の内容です。
        実際に使う前に、iDeCo公式サイト（末尾の参考文献）で最新の数字を確かめてください。
        <strong>2026年12月に拠出限度額の算定方法が変わります</strong>（後述）。
      </p>

      <h2>税制優遇が3か所にある</h2>

      <Figure
        title="iDeCoは掛金を出すとき・運用している間・受け取るときの3か所で税制上の扱いがある。掛金は全額所得控除、運用益は非課税、受取時は退職所得控除や公的年金等控除の対象になる"
        caption="NISAは真ん中だけですが、iDeCoは入口と出口にも効きます。ただし出口は非課税ではなく「控除の対象」です。"
      >
        <Flow
          steps={[
            { label: '掛けるとき', sub: '全額が所得控除' },
            { label: '運用中', sub: '運用益は非課税' },
            { label: '受け取るとき', sub: '控除の対象になる' },
          ]}
        />
      </Figure>

      <h2>入口の効き方——所得控除</h2>

      <p>
        掛金は<strong>全額が小規模企業共済等掛金控除</strong>になります。
        課税所得が減るので、所得税と住民税が軽くなります。
      </p>

      <div className="example">
        <strong>効果は所得によって変わる</strong>
        掛金が同じでも、<strong>税率が高い人ほど軽くなる額が大きくなります</strong>。
        所得税は累進なので、課税所得が多い人ほど1円の控除の価値が高いからです。
        住民税は一律10%なので、そこは誰でも同じです。
        <br />
        自分の場合いくらになるかは、
        当サイトの<a href="/tools/ideco/">iDeCo 拠出限度額・節税額 計算機</a>で試せます。
      </div>

      <p>
        <strong>ここがNISAとの決定的な違いです。</strong>
        NISAには掛金の控除がありません。
        運用がうまくいかなくても、iDeCoは掛けた時点で税が軽くなります。
      </p>

      <h2>2026年12月からの改正——「引き上げ」ではない</h2>

      <p>
        よく「上限が6.2万円に引き上げ」と説明されますが、
        <strong>正確には合算ルールへの切り替え</strong>です。
        会社員の場合、こうなります。
      </p>

      <div className="example">
        <strong>会社員（第2号被保険者）の上限</strong>
        <strong>月62,000円 −（企業型DCの事業主掛金 ＋ DB等の他制度掛金相当額）</strong>
        <br />
        企業年金がない人は62,000円まで出せますが、
        <strong>企業型DCや確定給付企業年金がある人は、その分だけ枠が減ります</strong>。
        6.2万円を固定の上限として計算すると、企業年金がある人に過大な額が出ます。
      </div>

      <p className="note">
        <strong>新しい額が実際に効くのは2026年12月拠出分から</strong>で、
        引落しは2027年1月からです。
        いま出せる額と、改正後に出せる額は別なので、混同しないでください。
      </p>

      <h2>60歳まで引き出せない</h2>

      <p>
        iDeCoの最大の制約です。<strong>原則として途中でやめて現金化できません</strong>。
        掛金の停止（運用指図者になる）はできますが、引き出しはできません。
      </p>

      <ul>
        <li>
          <strong>欠点として：</strong>失業・病気・住宅購入など、
          お金が必要になっても使えません。
          だから第1部1章の「使うお金」「備えるお金」を分けたあとの、
          さらに余裕がある分でしか掛けられません
        </li>
        <li>
          <strong>利点として：</strong>相場が下がったときに慌てて売る、
          ということが構造的に起きません。
          長期投資でいちばん多い失敗を、制度が防いでくれる面があります
        </li>
      </ul>

      <p>
        <strong>受給開始年齢は加入期間で決まります。</strong>
        通算加入者等期間が10年に満たない場合、
        60歳では受け取れず、期間に応じて開始が後ろにずれます。
        50代で始める場合はここを確認する必要があります。
      </p>

      <h2>出口——ここが見落とされやすい</h2>

      <p>
        <strong>受取時は非課税ではありません。</strong>
        NISAと違い、受け取る段階で課税対象になります。
        ただし大きな控除が使えるので、結果として税がかからないことも多い、という関係です。
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>受け取り方</th>
              <th>扱い</th>
              <th>注意</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>一時金（一括）</td>
              <td>退職所得</td>
              <td>
                <strong>会社の退職金と合算</strong>される。
                退職所得控除の枠を分け合う形になる
              </td>
            </tr>
            <tr>
              <td>年金（分割）</td>
              <td>雑所得</td>
              <td>公的年金等控除の対象。公的年金と合算される</td>
            </tr>
            <tr>
              <td>併用</td>
              <td>両方</td>
              <td>金融機関によって選べる形が違う</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>会社の退職金が多い人は、出口で課税されることがあります。</strong>
        退職所得控除は勤続年数などで決まる枠で、
        iDeCoの一時金と会社の退職金が同じ枠を使います。
        <strong>入口で軽くなった分を、出口で払い戻す形になる場合がある</strong>
        ということです。
        受け取る年をずらすと扱いが変わることもあるので、
        受け取りが近づいたら必ず個別に確認してください。
      </p>

      <h2>手数料がかかる</h2>

      <p>
        NISAと違い、<strong>iDeCoには口座を持つだけで手数料がかかります</strong>。
      </p>

      <ul>
        <li>加入時に一度かかる手数料</li>
        <li>掛金を出すたびにかかる手数料（国民年金基金連合会・信託銀行）</li>
        <li>運営管理機関（金融機関）の手数料——ここは金融機関によって差があります</li>
      </ul>

      <p>
        少額の掛金だと、<strong>手数料の比率が無視できなくなります</strong>。
        掛金を止めて運用指図者になっても、口座管理手数料はかかり続けます。
      </p>

      <h2>NISAとの使い分け</h2>

      <Figure
        title="iDeCoは掛けた年に税が軽くなり60歳まで引き出せない。NISAは掛けた年の控除はないがいつでも引き出せる。使う時期が決まっていないお金はNISA、老後まで動かさないお金はiDeCoが合いやすい"
        caption="どちらか一方ではなく、お金の性質で分けるのが素直です。引き出せるかどうかが最大の分岐点になります。"
      >
        <Timeline
          items={[
            { date: 'いま', label: 'iDeCo', sub: '掛けた年に税が軽い', mark: 'ok' },
            { date: '途中', label: '引き出し', sub: 'iDeCoは不可', mark: 'ng' },
            { date: '60歳〜', label: '受け取り', sub: '控除の対象', mark: 'plain' },
          ]}
        />
      </Figure>

      <ul>
        <li>
          <strong>老後まで動かさないと決められるお金</strong>——iDeCoの入口の控除が効きます
        </li>
        <li>
          <strong>使う時期が決まっていないお金</strong>——NISAのほうが素直です
        </li>
        <li>
          <strong>所得税を払っていない人</strong>（専業主婦・低所得）——
          入口の控除が効かないので、iDeCoの利点が1つ減ります。
          手数料を考えるとNISAが先になることが多い
        </li>
      </ul>

      <h2>まとめ</h2>

      <ul>
        <li>iDeCoは入口（掛金の全額所得控除）で効く。NISAにはこれがない</li>
        <li>控除の効果は所得税率が高い人ほど大きい</li>
        <li>2026年12月の改正は「引き上げ」ではなく合算ルールへの切り替え</li>
        <li>60歳まで引き出せない。欠点でもあり、狼狽売りを防ぐ利点でもある</li>
        <li>受取時は非課税ではなく控除の対象。退職金と枠を分け合う</li>
        <li>口座を持つだけで手数料がかかる。少額だと比率が効く</li>
      </ul>
    </Chapter>
  );
}
