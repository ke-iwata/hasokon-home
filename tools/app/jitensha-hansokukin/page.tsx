import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { SYSTEM, VIOLATION_COUNT } from '@/lib/jitensha-hansokukin';
import Calculator from './Calculator';

const title = '自転車の反則金（青切符）早見表・チェッカー｜2026年4月施行の改正道交法';
const description =
  '2026年4月から自転車も青切符の対象になりました。「イヤホン」「傘さし」「歩道を走る」など日常の行為を選ぶと、該当する違反名・反則金・青切符か赤切符かが分かります。警察庁の公式一覧にもとづく全65項目の反則金早見表つき。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/jitensha-hansokukin/` },
};

const faq = [
  {
    q: '自転車の青切符はいつから始まりましたか？',
    a: '2026年（令和8年）4月1日からです。道路交通法の一部を改正する法律（令和6年法律第34号）により、自転車をはじめとする軽車両にも交通反則通告制度（青切符）が適用されるようになりました。なお、酒気帯び運転とながらスマホの罰則を強化する改正は、これより先の2024年11月1日にすでに施行されています。2026年4月に変わったのは「罰則ができたこと」ではなく「反則金で処理される青切符の対象になったこと」です。',
  },
  {
    q: '何歳から青切符の対象になりますか？',
    a: '16歳以上です。16歳未満の場合は、これまでどおり現場での指導警告や、危険な違反を繰り返したときの自転車運転者講習の対象となり、反則金は科されません。中学生や小学生が違反しても青切符は交付されません。',
  },
  {
    q: 'イヤホンをして自転車に乗ると違反ですか？片耳ならよいのでしょうか。',
    a: '多くの都道府県で、公安委員会遵守事項違反（反則金5,000円）にあたります。ただし禁じ方は都道府県の道路交通規則で決まっていて、「安全な運転に必要な音や声が聞こえない状態での運転」を禁じる書き方が一般的です。音量や片耳かどうかで一律に線が引かれているわけではないため、片耳なら必ず適法とは言えません。骨伝導イヤホンでも、周囲の音が聞こえない状態であれば同じです。実際の判断は現場の状況によるので、お住まいの都道府県警が公表している道路交通規則をご確認ください。',
  },
  {
    q: '傘をさして自転車に乗るといくらですか？',
    a: '多くの都道府県の規則が傘差し運転を禁じており、その場合は公安委員会遵守事項違反で5,000円です。さらに、片手がふさがってハンドルやブレーキの操作が不確実になっている状態であれば、安全運転義務違反（6,000円）として扱われることもあります。ハンドルに傘を固定する器具についても都道府県で扱いが分かれるため、レインコートを使うのが確実です。',
  },
  {
    q: '歩道を走ったら違反になりますか？',
    a: '自転車は原則として車道の左側端を通行します。ただし、「普通自転車歩道通行可」の標識がある歩道、運転者が13歳未満・70歳以上または身体の障害がある場合、車道の交通状況からやむを得ない場合は歩道を通行できます。通行できる場合でも、車道寄りの部分を徐行し、歩行者の通行を妨げるときは一時停止しなければならず、これを守らないと歩道徐行等義務違反（3,000円）です。通行できないのに歩道を走れば通行区分違反（6,000円）になり得ます。',
  },
  {
    q: '子どもを乗せる二人乗りも違反ですか？',
    a: '大人同士の二人乗りは軽車両乗車積載制限違反（3,000円）ですが、幼児の同乗には例外があります。多くの都道府県の規則では、16歳以上の運転者が幼児用座席に幼児1人を乗せる場合、幼児2人同乗用自転車であれば幼児2人まで乗せる場合が認められています。細かな条件は都道府県ごとに定められているので、お住まいの都道府県の規則をご確認ください。',
  },
  {
    q: '青切符を受け取ったあとはどうなりますか？',
    a: '警察官から反則行為の内容が書かれた青切符と納付書が交付されます。取締りを受けた翌日から原則7日以内に、銀行や郵便局の窓口で反則金を仮納付してください。納めれば公訴されず、前科はつきません。仮納付しなかった場合は、指定された期日に交通反則通告センターへ出頭して通告書と納付書を受け取り、そこから10日以内に納付します。それでも納めないと刑事手続に移ります。',
  },
  {
    q: '青切符で点数はつきますか？免許に影響しますか？',
    a: '自転車の違反による反則金の納付そのもので、自動車運転免許の点数が引かれることはありません。交通反則通告制度の反則金と、運転免許の違反点数は別の仕組みです。ただし、赤切符となる悪質な違反で刑事手続に進み処分を受けた場合は、免許の欠格事由などを通じて影響することがあります。',
  },
  {
    q: '青切符ではなく赤切符になるのはどんなときですか？',
    a: '酒酔い運転・酒気帯び運転、妨害運転（あおり運転）、携帯電話を使用して実際に交通の危険を生じさせた場合、そして違反によって交通事故を起こした場合です。これらは反則金で終わらせる青切符の対象から外れており、これまでどおり刑事手続に進みます。',
  },
  {
    q: '自転車の反則行為は全部で何種類ありますか？',
    a: `警察庁が公表している「自転車をはじめとする軽車両の反則行為と反則金の額」の一覧には、${VIOLATION_COUNT}項目の反則行為が掲げられています。反則金は3,000円から12,000円までで、最も高いのは携帯電話使用等（保持）の12,000円です。本ページの早見表はこの一覧をそのまま収録しています。なお解説記事によっては「113種類」などと書かれていることがありますが、これは条文の項目を細かく数え直した二次的な数字で、警察庁の一覧の行数とは一致しません。`,
  },
];

const trail = breadcrumbFor('jitensha-hansokukin');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '自転車の反則金（青切符）早見表・チェッカー',
      url: `${SITE_URL}/jitensha-hansokukin/`,
      applicationCategory: 'ReferenceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('jitensha-hansokukin'),
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

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>自転車の反則金（青切符）早見表・チェッカー</h1>
      <p className="lead">
        2026年4月1日から、自転車にも青切符（交通反則通告制度）が適用されるようになりました。イヤホン・傘さし・歩道の通行など日常の行為を選ぶと、該当する違反名と反則金、青切符か赤切符かが分かります。警察庁の公式一覧にもとづく全
        {VIOLATION_COUNT}項目の早見表つきです。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>2026年4月に変わったこと</h2>
      <p>
        道路交通法の一部を改正する法律（<strong>{SYSTEM.law}</strong>）により、
        2026年4月1日から、自転車をはじめとする軽車両にも交通反則通告制度が適用されました。これまで自転車の違反は、指導警告で終わるか、赤切符を切られて刑事手続に進むかの両極端しかなく、実際にはほとんどが警告で処理されていました。青切符の導入で、その中間にあたる「反則金を納めて終わりにする」処理ができるようになったというのが今回の変更です。
      </p>
      <ul>
        <li>
          <strong>対象は{SYSTEM.minAge}歳以上</strong> —
          {SYSTEM.minAge}歳未満は、これまでどおり指導警告や自転車運転者講習の対象で、反則金は科されません
        </li>
        <li>
          <strong>反則行為は{VIOLATION_COUNT}項目</strong> —
          反則金は3,000円から12,000円。最も高いのは携帯電話使用等（保持）の12,000円です
        </li>
        <li>
          <strong>罰則が新設されたわけではない</strong> —
          自転車の信号無視や一時不停止は以前から罰則のある違反でした。変わったのは処理の仕方です
        </li>
      </ul>

      <div className="note">
        <strong>「2026年4月に罰則ができた」ではありません。</strong>
        酒気帯び運転とながらスマホの罰則を強化する改正は、これより先の2024年11月1日にすでに施行されています。2026年4月に始まったのは、反則金で処理する青切符の適用です。
      </div>

      <h2>青切符を受け取ったあとの流れ</h2>
      <p>
        交通反則通告制度は、
        <strong>一定期間内に反則金を納めることで刑事罰が科されない</strong>
        仕組みです。流れは次のとおりです。
      </p>
      <ol>
        <li>
          <strong>告知</strong> — 警察官から、反則行為の内容が書かれた青切符と納付書が交付されます
        </li>
        <li>
          <strong>仮納付</strong> — 取締りを受けた翌日から原則
          {SYSTEM.provisionalPaymentDays}
          日以内に、銀行や郵便局の窓口で反則金を納めます。納めればここで完結し、公訴されません（前科はつきません）
        </li>
        <li>
          <strong>通告</strong> — 仮納付しなかった場合、指定された期日に交通反則通告センターへ出頭し、通告書と納付書を受け取ります。そこから
          {SYSTEM.postNoticePaymentDays}日以内に納付します
        </li>
        <li>
          <strong>刑事手続</strong> — 通告後も納めないと、刑事手続に移ります
        </li>
      </ol>
      <p>
        なお、青切符を切られたからといって必ず反則金を納めなければならないわけではなく、違反の事実を争う場合は納付せずに刑事手続で主張することもできます。ただしその場合は正式な裁判の手続に進みます。
      </p>

      <h2>青切符にならず、赤切符のまま残る違反</h2>
      <p>
        悪質・危険な行為は反則金では処理されず、これまでどおり刑事手続に進みます。警察庁が挙げているのは次のものです。
      </p>
      <ul>
        <li>酒酔い運転・酒気帯び運転</li>
        <li>妨害運転（あおり運転）</li>
        <li>携帯電話使用等のうち、交通の危険を生じさせたとき</li>
        <li>違反により交通事故を発生させたとき</li>
      </ul>
      <p>
        スマホを手に持って画面を見ながら走った時点では青切符（12,000円）ですが、それによって実際に危険を生じさせれば赤切符になります。同じ行為でも結果によって扱いが変わる点に注意してください。
      </p>

      <h2>都道府県によって違うところ</h2>
      <p>
        早見表の<strong>公安委員会遵守事項違反</strong>（5,000円）は、道路交通法が「公安委員会の定める事項を守ること」とだけ定めていて、中身は各都道府県の道路交通規則で決められています。イヤホン・傘差し・スマホの取り付け方などがここに入るため、
        <strong>禁じられ方が都道府県ごとに違います。</strong>
      </p>
      <p>
        本ページでは代表的な例を示すにとどめ、47都道府県それぞれの細則は扱っていません。実際に禁じられている内容は、お住まいの都道府県警が公表している道路交通規則でご確認ください。幼児の同乗（二人乗りの例外）についても同じく都道府県の規則で定められています。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="jitensha-hansokukin" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/sleep-cycle/">睡眠サイクル計算機</Link>／
        <Link href="/interval-timer/">インターバルタイマー</Link>／
        <Link href="/aircon-denkidai/">エアコン電気代 計算機</Link>
      </p>

      <ToolMeta slug="jitensha-hansokukin">
        出典：警察庁「
        <a
          href="https://www.npa.go.jp/bureau/traffic/bicycle/pdf/jitensyahansokukoui.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          自転車をはじめとする軽車両の反則行為と反則金の額
        </a>
        」（反則行為{VIOLATION_COUNT}項目の名称・根拠条文・反則金の額）、「
        <a
          href="https://www.npa.go.jp/bureau/traffic/bicycle/portal/system.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          自転車の新しい制度
        </a>
        」（対象年齢と告知・仮納付・通告の流れ）、「
        <a
          href="https://www.npa.go.jp/bureau/traffic/bicycle/portal/control.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          取締りについて
        </a>
        」（赤切符のまま残る違反）にもとづき作成。金額は愛媛県警「
        <a
          href="https://www.police.pref.ehime.jp/kotsukikaku/080401ao1.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          自転車の交通反則通告制度 早見表
        </a>
        」とも突合しています。イヤホン・傘差し・幼児の同乗など公安委員会遵守事項の内容は都道府県の道路交通規則で定められており、本ページは代表的な例を示すものです。実際に違反にあたるかどうかの判断は、お住まいの都道府県警の一次情報でご確認ください。
      </ToolMeta>
    </>
  );
}
