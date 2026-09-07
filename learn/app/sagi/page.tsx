import type { Metadata } from 'next';
import Chapter from '../_chapter/Chapter';
import Figure from '../_chapter/Figure';
import { Flow, Ladder } from '../_chapter/Diagram';
import { chapterBySlug, robotsFor, SITE_URL } from '@/lib/curriculum';

const chapter = chapterBySlug('sagi');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: `${SITE_URL}/${chapter.slug}/` },
  robots: robotsFor(chapter.slug),
};

export default function Page() {
  return (
    <Chapter slug="sagi" sources={['fsa-warning', 'nca-toshi', 'fsa-crypto', 'fsa-basic']}>
      <p>
        投資で失うお金のうち、
        <strong>相場の変動ではなく詐欺で失う分</strong>があります。
        こちらは分散でもリスク管理でも防げません。
        <strong>入り口で見分けるしかない</strong>ので、章を立てて扱います。
      </p>

      <h2>まず確認する2つのリスト</h2>

      <Figure
        title="勧誘を受けたら、金融庁が公表している登録業者の一覧に載っているかと、無登録業者の名称リストに載っていないかの両方を確認する"
        caption="この2つを見るだけで、多くの被害は避けられます。名前が似ているだけの偽サイトもあるので、金融庁のページから確認します。"
      >
        <Flow
          steps={[
            { label: '登録業者か', sub: '金融庁の一覧で確認' },
            { label: '警告リストか', sub: '無登録業者の名称' },
            { label: '該当なし', sub: 'それでも慎重に' },
          ]}
        />
      </Figure>

      <p>
        <strong>金融商品取引業の登録なしに、
        投資の勧誘や助言を業として行うことはできません。</strong>
        登録されていない相手からの勧誘は、その時点で法律違反です。
      </p>

      <h2>共通する型</h2>

      <p>
        手口は次々に変わりますが、<strong>言っていることの構造は変わりません</strong>。
        次のどれかが出てきたら、いったん止まってください。
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>出てくる言葉</th>
              <th>なぜおかしいか</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>「元本保証」「必ず儲かる」</td>
              <td>
                <strong>断定的判断の提供は金商法で禁止</strong>。
                登録業者なら言えません
              </td>
            </tr>
            <tr>
              <td>「月利◯%」「年利30%」</td>
              <td>安定して高い利回りを出せるなら、他人に配る理由がありません</td>
            </tr>
            <tr>
              <td>「今日だけ」「あと3名」</td>
              <td>考える時間を与えないための言い方です</td>
            </tr>
            <tr>
              <td>「紹介すると報酬」</td>
              <td>
                資金が運用ではなく<strong>新規の出資者から出ている</strong>形
              </td>
            </tr>
            <tr>
              <td>「未公開株」「上場が決まっている」</td>
              <td>上場前の株を一般に勧誘することは通常ありません</td>
            </tr>
            <tr>
              <td>「AIが自動で運用」</td>
              <td>仕組みの説明がなく、成果だけが示されることが多い</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>「元本保証で高利回り」は定義上ありえません。</strong>
        リスクとリターンの関係（第1部2章）から、
        リスクを取らずに高いリターンだけを得ることはできません。
        できるなら、その人が借金をしてでも自分でやります。
        <strong>他人を誘う必要がある時点で、話が成り立っていません。</strong>
      </p>

      <h2>ポンジ・スキーム</h2>

      <p>
        新しい出資者から集めたお金を、
        <strong>先の出資者への「配当」として配る</strong>仕組みです。
        運用実態がないのに、初期は本当にお金が戻ってくるため、信じてしまいます。
      </p>

      <Figure
        title="ポンジ・スキームでは、新しい出資者のお金が古い出資者への配当に回る。運用実態がないため、新規の出資が止まった時点で破綻する"
        caption="最初に少額で試すと本当に戻ってくるので、安心して大金を入れてしまいます。これが設計の一部です。"
      >
        <Ladder
          steps={[
            { label: '新しい出資者が入る', sub: 'お金が集まる' },
            { label: '古い出資者へ配当', sub: '運用ではなく出資金から' },
            { label: '実績として宣伝', sub: '「本当に配当が出た」' },
            { label: '新規が止まると破綻', sub: '残った人は戻らない', strong: true },
          ]}
        />
      </Figure>

      <h2>SNS・マッチングアプリ経由の型</h2>

      <p>
        近年の被害で目立つ形です。国民生活センターにも相談が寄せられています。
      </p>

      <ul>
        <li>
          <strong>時間をかけて信頼関係を作る。</strong>
          恋愛感情や友人関係を先に作り、投資の話はあとから出します。
          「投資詐欺」だと気づきにくくなります
        </li>
        <li>
          <strong>偽の取引画面を見せる。</strong>
          入金すると画面上では利益が増えていきます。
          <strong>数字はいくらでも表示できます</strong>
        </li>
        <li>
          <strong>出金しようとすると条件が出る。</strong>
          「税金を先に払え」「手数料が必要」。
          <strong>出金のために追加の入金を求められたら、確実に詐欺です</strong>
        </li>
        <li>
          <strong>著名人の名前や写真を使う。</strong>
          本人とは無関係な広告が大量に出回っています
        </li>
      </ul>

      <h2>詐欺ではないが注意が要るもの</h2>

      <p>
        違法ではなくても、<strong>説明の不足で損をしやすい</strong>ものがあります。
      </p>

      <ul>
        <li>
          <strong>仕組みが説明できない商品。</strong>
          自分の言葉で他人に説明できないものは、リスクの所在も分かっていません（第2部17章）
        </li>
        <li>
          <strong>手数料が示されない提案。</strong>
          コストを聞いて明確に答えられない相手とは進めない（第1部5章）
        </li>
        <li>
          <strong>「節税になる」が主な理由の勧誘。</strong>
          節税額より損失が大きければ意味がありません（第2部15章）
        </li>
      </ul>

      <h2>おかしいと思ったら</h2>

      <ul>
        <li>
          <strong>その場で契約しない。</strong>持ち帰って調べる。
          断る理由を用意する必要はありません
        </li>
        <li>
          <strong>家族や第三者に話す。</strong>
          詐欺は「誰にも言わないで」とセットで来ます。
          口外を止められた時点で疑ってよい
        </li>
        <li>
          <strong>追加の入金は絶対にしない。</strong>
          被害回復をうたう二次被害もあります
        </li>
        <li>
          <strong>相談する。</strong>
          消費者ホットライン<strong>188</strong>、
          金融サービス利用者相談室、警察（#9110）
        </li>
      </ul>

      <h2>まとめ</h2>

      <ul>
        <li>詐欺による損失は分散でもリスク管理でも防げない。入り口で見分ける</li>
        <li>金融庁の登録業者一覧と、無登録業者の警告リストを両方確認する</li>
        <li>「元本保証で高利回り」は定義上ありえない</li>
        <li>出金のために追加入金を求められたら確実に詐欺</li>
        <li>口外を止められたら疑う。第三者に話す</li>
        <li>相談先は消費者ホットライン188、金融庁の相談室、警察#9110</li>
      </ul>
    </Chapter>
  );
}
