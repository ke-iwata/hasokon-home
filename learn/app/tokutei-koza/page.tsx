import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure from '../_chapter/Figure';
import { Flow } from '../_chapter/Diagram';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('tokutei-koza');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="tokutei-koza" sources={['nta-1476', 'nta-1463', 'nta-1474']}>
      <p>
        証券口座を開くときに必ず聞かれるのが口座の種類です。
        <strong>選択によって、確定申告が要るかどうかが変わります</strong>。
        あとから変えられる部分もありますが、年単位の制約があるので、
        最初に意味を知っておくほうが楽です。
      </p>

      <p className="note">
        <strong>制度は改正で変わります。</strong>
        この章は2026年9月時点の内容です。実際の申告の前に、
        国税庁のタックスアンサー（末尾の参考文献）で最新の内容を確かめてください。
      </p>

      <h2>3つの選択肢</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>特定口座（源泉徴収あり）</th>
              <th>特定口座（源泉徴収なし）</th>
              <th>一般口座</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>損益の計算</th>
              <td>証券会社がやる</td>
              <td>証券会社がやる</td>
              <td>
                <strong>自分でやる</strong>
              </td>
            </tr>
            <tr>
              <th>年間取引報告書</th>
              <td>もらえる</td>
              <td>もらえる</td>
              <td>もらえない</td>
            </tr>
            <tr>
              <th>納税</th>
              <td>
                <strong>売るたびに天引き</strong>
              </td>
              <td>自分で申告</td>
              <td>自分で申告</td>
            </tr>
            <tr>
              <th>確定申告</th>
              <td>
                <strong>原則不要</strong>
              </td>
              <td>必要</td>
              <td>必要</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        <strong>迷ったら「特定口座（源泉徴収あり）」で始めるのが無難です。</strong>
        手間がいちばん少なく、確定申告が要りません。
        あとから申告することも選べます（後述）。
      </p>

      <h2>源泉徴収ありの仕組み</h2>

      <Figure
        title="特定口座（源泉徴収あり）では、売却して利益が出るたびに証券会社が20.315%を天引きして納付する。損が出た場合はすでに天引きした分を還付する"
        caption="年間を通じて損益が通算されるので、あとから損が出れば、先に払った税が口座に戻ってきます。"
      >
        <Flow
          steps={[
            { label: '利益が出た', sub: '20.315%を天引き' },
            { label: '証券会社が納付', sub: '自分は何もしない' },
            { label: '後で損が出た', sub: '天引き分を還付' },
          ]}
        />
      </Figure>

      <p>
        <strong>同じ口座の中では、自動で損益が通算されます。</strong>
        1月に利益が出て天引きされ、11月に損が出た場合、
        年末までに払いすぎた分が口座に戻ります。
        自分で申告しなくても、口座内で完結します。
      </p>

      <h2>それでも確定申告したほうがよい場合</h2>

      <p>
        源泉徴収ありでも、<strong>申告すると得になる場面</strong>があります。
        申告するかどうかは自分で選べます。
      </p>

      <ul>
        <li>
          <strong>損失を翌年以降に繰り越したいとき。</strong>
          その年の損を使い切れなかった場合、
          申告すれば<strong>3年間繰り越して</strong>翌年以降の利益と相殺できます。
          <strong>申告しないと繰り越せません</strong>（第3部21章）
        </li>
        <li>
          <strong>複数の証券会社の損益を通算したいとき。</strong>
          A社で利益、B社で損失という場合、
          源泉徴収ありのままだとA社の税は取られっぱなしです。
          申告すれば通算できます
        </li>
        <li>
          <strong>配当を配当控除で申告したほうが有利なとき。</strong>
          所得が低い場合、総合課税を選ぶと税率が下がることがあります
        </li>
      </ul>

      <p className="note">
        <strong>申告することで別の負担が増えることがあります。</strong>
        申告すると合計所得金額が増えるため、
        国民健康保険料や、配偶者控除・扶養の判定、
        各種給付の所得制限に影響することがあります。
        <strong>税だけが安くなっても、保険料で逆転する場合があります。</strong>
        判断が難しいところなので、金額が大きいときは税理士や税務署に確認してください。
      </p>

      <h2>源泉徴収なしを選ぶ場合</h2>

      <p>
        <strong>給与所得者で、年間の利益が20万円以下の場合</strong>、
        所得税の確定申告が不要になる仕組みがあります。
        源泉徴収なしを選べば、その範囲では所得税が引かれません。
      </p>

      <p>
        ただし注意点が2つあります。
      </p>

      <ul>
        <li>
          <strong>これは所得税の話で、住民税は別です。</strong>
          20万円以下でも住民税の申告は必要です
        </li>
        <li>
          <strong>他に確定申告をする場合は使えません。</strong>
          医療費控除やふるさと納税（ワンストップ特例を使わない場合）で
          申告するなら、株の利益も申告に含める必要があります
        </li>
      </ul>

      <h2>一般口座が必要になる場合</h2>

      <p>
        いまは特定口座が使えるので、あえて選ぶ理由はほとんどありません。
        ただし<strong>特定口座に入れられない商品</strong>があり、
        その場合は一般口座になります。
        取得価額を自分で管理し、損益を自分で計算する必要があります。
      </p>

      <h2>NISA口座との関係</h2>

      <p>
        NISA口座は、特定口座・一般口座とは<strong>別枠</strong>です。
      </p>

      <ul>
        <li>
          NISA口座の利益は非課税なので、そもそも源泉徴収されません
        </li>
        <li>
          <strong>NISA口座の損失は、特定口座の利益と通算できません</strong>（第3部18章）。
          税務上「無かったこと」になります
        </li>
        <li>
          同じ証券会社で、NISA口座と特定口座を並行して持てます
        </li>
      </ul>

      <h2>まとめ</h2>

      <ul>
        <li>迷ったら特定口座（源泉徴収あり）。確定申告が要らない</li>
        <li>源泉徴収ありでも、同じ口座内では年間の損益が自動で通算される</li>
        <li>損を繰り越すには申告が必要。しないと繰り越せない</li>
        <li>複数の証券会社をまたぐ通算にも申告が要る</li>
        <li>申告すると保険料や扶養判定に影響することがある。税だけで判断しない</li>
        <li>NISA口座は別枠。その損失は特定口座の利益と通算できない</li>
      </ul>
    </Chapter>
  );
}
