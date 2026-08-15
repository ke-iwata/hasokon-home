import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { calcBosaiBichiku, STOCK_DAYS_OPTIONS } from '@/lib/bosai-bichiku';
import Calculator from './Calculator';

const title = '防災備蓄 計算ツール｜水・食料・簡易トイレの必要量';
const description =
  '家族の人数を入れるだけで、備蓄しておく水・主食・主菜・カセットボンベ・簡易トイレの必要量を計算します。3日分と7日分の切り替え、乳幼児のミルク・おむつ、ペットのフードにも対応。そのまま印刷できる買い物チェックリストつき。農林水産省・東京都の目安にもとづく無料ツールです。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/bosai-bichiku-keisan/` },
};

const faq = [
  {
    q: 'なぜ3日分と7日分なのですか？',
    a: '農林水産省「災害時に備えた食品ストックガイド」が「最低3日分～1週間分×人数分の食品の家庭備蓄が望ましい」としているためです。3日分は、被災直後に救援物資や支援が届き始めるまでを自力でしのぐための量です。7日分は、南海トラフ地震や首都直下地震のように被害が広い範囲に及び、道路の寸断で支援が遅れる大規模災害を想定した量で、国や自治体はこちらを推奨しています。まず3日分をそろえ、置き場所と予算に余裕ができたら7日分へ増やすのが現実的です。',
  },
  {
    q: '水は1人1日3リットルで足りますか？',
    a: '飲む水だけなら1人1日1リットルが目安で、調理に使う水を含めて3リットル程度あれば安心、というのが農林水産省の示している考え方です。このツールは大人1人1日3リットルで計算しています。加熱調理をしない前提（レトルトをそのまま食べる、缶詰で済ませる）なら1リットルまで減らせますが、そのぶん熱源が要らなくなる代わりに食べられるものが限られます。夏場や授乳中の方がいる家庭では多めに見てください。なお手洗い・洗い物・トイレを流すための生活用水は、この3リットルには含まれていません。風呂の水をためておくなど別に用意してください。',
  },
  {
    q: 'ローリングストックとは何ですか？',
    a: 'ふだん食べている食品を少し多めに買っておき、古いものから食べて、食べたぶんだけ買い足す備蓄のやり方です。専用の非常食を買い込んで押し入れにしまい込むと、賞味期限が切れていることに何年も気づかず、いざというときに使えません。ローリングストックなら在庫が自然に入れ替わり、期限切れが起きにくく、食べ慣れた味を災害時にも食べられます。このツールで出た必要量を「常に家にある最低ライン」と考え、その線を割ったら買い足す、という使い方が向いています。',
  },
  {
    q: 'カセットボンベは何本必要ですか？',
    a: '農林水産省のガイドは1人あたり1週間で約6本としています。このツールも同じ基準で、人数と日数から本数を出しています（3日分なら1人あたり約3本）。停電と都市ガスの停止が同時に起きると、湯を沸かす手段はカセットコンロだけになります。お湯があればアルファ米・カップ麺・レトルトが使えるほか、体を拭く・粉ミルクを調乳するといった用途にも効きます。ボンベの使用期限は約7年、コンロ本体は約10年が目安なので、古いものは点検して入れ替えてください。',
  },
  {
    q: '簡易トイレはなぜ必要ですか？',
    a: '断水したり下水道や浄化槽が壊れたりすると、水洗トイレは流せなくなります。マンションの上層階では、下の階の配管が壊れていることに気づかず流して汚水があふれる事故も起きています。食事は我慢できてもトイレは我慢できないため、備蓄の中でも優先度が高い品目です。このツールは東京都「東京備蓄ナビ」の提示例から1人1日5回として計算しています。避難生活のストレスで回数が増えることもあるので、多めに見ておくと安心です。',
  },
  {
    q: '乳幼児や高齢者がいる場合は何が変わりますか？',
    a: '乳幼児は主食を食べる代わりにミルクとおむつが要るので、このツールでは大人・子どもと分けて数えています。ミルクの量は月齢と授乳量で大きく変わるため、表示される本数はあくまで代表値です。実際の1日の授乳量に置き換えてください。高齢の家族がいる場合は、常備薬とお薬手帳の写しを人数ぶん数えています。薬は何日分まで備えられるか、切らしたときにどうするかが薬によって違うので、備蓄の可否と量は必ずかかりつけの医師・薬剤師にご相談ください。かたい食べ物が食べにくい方には、おかゆタイプややわらかいレトルトを混ぜておくと役に立ちます。',
  },
  {
    q: 'ペットの分はどう考えればよいですか？',
    a: '避難所にはペット用の物資がほとんど届きません。フードと水は飼い主が用意しておく前提で考えてください。このツールは犬を中型犬（体重10kg前後）、猫を成猫として1日量の代表値で計算していますが、必要量は体重で大きく変わるので、ふだんの給餌量に置き換えてください。銘柄はふだん食べているものにしてください。慣れないフードは食べないことがあり、災害時に体調を崩す原因になります。療法食を食べている場合は、獣医師に相談して多めに用意しておくことをおすすめします。',
  },
  {
    q: '計算した結果を紙に出せますか？',
    a: '「買い物チェックリストを印刷する」を押すと、チェックボックス付きの一覧だけが印刷されます。入力欄・解説・広告・サイトのヘッダーは紙に出ません。印刷ダイアログで出力先を「PDFに保存」にすればPDFとしても残せるので、買い出しのときにスマートフォンで開けます。冷蔵庫や備蓄の置き場所に貼っておくと、家族の誰でも何が足りないか分かる状態になります。',
  },
  {
    q: '備蓄品はどこに置けばよいですか？',
    a: '1か所にまとめず、分散して置くのが基本です。1か所に集めておくと、その部屋の扉が家具でふさがれたり、その棚だけ倒れたりしたときに全部使えなくなります。水は重いので階段を使わずに運べる場所へ、食品はふだん使う台所の棚に多めに入れておく（ローリングストック）、簡易トイレはトイレの近く、という具合に、使う場所の近くに置くと取り出しやすくなります。なお、このツールは在宅避難のための備蓄量を出すもので、持ち出し袋の中身は別に用意してください。',
  },
];

const trail = breadcrumbFor('bosai-bichiku-keisan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '防災備蓄 計算ツール',
      url: `${SITE_URL}/bosai-bichiku-keisan/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('bosai-bichiku-keisan'),
      publisher: PUBLISHER_REF,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
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

/** 早見表に出す世帯の大きさ（大人だけの人数で示す）。1〜5人まで */
const QUICK_TABLE_PEOPLE = [1, 2, 3, 4, 5];

/** 早見表に出す品目。計算機と同じ lib から引くので、係数を直せば表も変わる */
const QUICK_TABLE_ITEMS = [
  { id: 'water', label: '水', unit: 'L' },
  { id: 'staple', label: '主食', unit: '食' },
  { id: 'gas-cartridge', label: 'カセットボンベ', unit: '本' },
  { id: 'toilet', label: '簡易トイレ', unit: '回分' },
];

/** 大人だけの世帯の早見表。JSは動かさず、静的HTMLとして書き出す */
function QuickTable({ days }: { days: number }) {
  return (
    <table>
      <caption style={{ captionSide: 'top', textAlign: 'left', padding: '4px 0' }}>
        大人だけの世帯・{days}日分の目安
      </caption>
      <thead>
        <tr>
          <th scope="col">人数</th>
          {QUICK_TABLE_ITEMS.map((item) => (
            <th key={item.id} scope="col">
              {item.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {QUICK_TABLE_PEOPLE.map((adults) => {
          const { lines } = calcBosaiBichiku({ adults, days });
          return (
            <tr key={adults}>
              <th scope="row">{adults}人</th>
              {QUICK_TABLE_ITEMS.map((item) => (
                <td key={item.id}>
                  {(lines.find((l) => l.id === item.id)?.quantity ?? 0).toLocaleString('ja-JP')}
                  {item.unit}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>防災備蓄 計算ツール</h1>
      <p className="lead">
        家族の人数を入れるだけで、家に置いておく水・主食・主菜・カセットボンベ・簡易トイレの必要量が出ます。3日分と7日分を切り替えられ、乳幼児のミルク・おむつ、ペットのフードと水にも対応。そのまま買い物リストとして印刷できるチェックリストつきです。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>まず3日分、できれば7日分</h2>
      <p>
        農林水産省「災害時に備えた食品ストックガイド」は、
        <strong>最低3日分〜1週間分×人数分</strong>
        の家庭備蓄を勧めています。3日分は、被災直後に支援が届き始めるまでを自力でしのぐための量です。7日分は、被害が広範囲に及んで道路が寸断され、支援が遅れる大規模災害を想定した量になります。
      </p>
      <p>
        いきなり7日分をそろえようとすると、置き場所と費用の両方で行き詰まって結局何も買わずに終わりがちです。まず3日分を満たし、余裕ができたら7日分へ増やしてください。
      </p>

      <h2>大人だけの世帯の早見表</h2>
      <p>
        人数だけで決まる主要な4品目を、上の計算機と同じ基準で表にしました。子ども・乳幼児・高齢者・ペットがいる場合は、計算機のほうで人数を入れてください。
      </p>
      {STOCK_DAYS_OPTIONS.map((days) => (
        <QuickTable key={days} days={days} />
      ))}

      <h2>忘れやすいのは水より「熱源」と「トイレ」</h2>
      <p>
        食料と水は思いつきやすい一方で、
        <strong>カセットボンベと簡易トイレ</strong>
        は抜けやすい品目です。停電と都市ガスの停止が重なると、湯を沸かす手段はカセットコンロだけになります。お湯があればアルファ米・カップ麺・レトルトが使えるうえ、体を拭く・粉ミルクを調乳するといった用途にも効きます。目安は1人1週間あたり約6本です。
      </p>
      <p>
        トイレはさらに切実です。断水や配管の破損で水洗トイレが使えなくなると、食事は我慢できてもトイレは我慢できません。マンションでは、下の階の配管が壊れていることに気づかずに流し、汚水があふれる事故も起きています。1人1日5回を目安に、日数ぶんの携帯トイレを用意してください。
      </p>

      <h2>買い込むのではなく、多めに買って食べて買い足す</h2>
      <p>
        専用の非常食を買い込んで押し入れにしまうと、期限切れに何年も気づかないまま、いざというときに使えないことがよくあります。ふだん食べている食品を少し多めに買い、
        <strong>古いものから食べて、食べたぶんだけ買い足す</strong>
        「ローリングストック」なら、在庫が自然に入れ替わり、食べ慣れた味を災害時にも食べられます。
      </p>
      <p>
        このツールで出た量は「常に家にある最低ライン」と考えてください。その線を割ったら買い足す、という運用にすると、備蓄が特別な作業ではなくなります。
      </p>

      <div className="note">
        このツールが出すのは<strong>在宅避難のための備蓄量</strong>
        です。避難所へ持ち出す非常用持ち出し袋（貴重品・救急用品・衣類・情報を得る手段など）は別に用意してください。また、避難する場所や経路はお住まいの自治体のハザードマップでご確認ください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="bosai-bichiku-keisan" />

      <ToolMeta slug="bosai-bichiku-keisan">
        水・主食・カセットボンベの目安は
        <a
          href="https://www.maff.go.jp/j/zyukyu/foodstock/guidebook.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          農林水産省「災害時に備えた食品ストックガイド」
        </a>
        （水の量は
        <a
          href="https://www.maff.go.jp/j/pr/aff/1609/spe1_02.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          同省 aff 2016年9月号「特集1 非常食(2)」
        </a>
        ）、簡易トイレの回数は
        <a
          href="https://www.bousai.metro.tokyo.lg.jp/kyojyo/1001855/1013810.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          東京都「東京備蓄ナビ」
        </a>
        の提示例にもとづいています（2026年8月15日時点で確認）。子ども・乳幼児・ペットの必要量は一次資料に定めが無く、体格・月齢・体重で大きく変わるため、当サイトが代表値を置いた目安です（画面では「当サイトの目安」と表示しています）。常備薬の備蓄はかかりつけの医師・薬剤師にご相談ください。
      </ToolMeta>
    </>
  );
}
