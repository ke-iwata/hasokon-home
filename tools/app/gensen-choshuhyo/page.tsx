import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import { TAX_YEAR } from '@/lib/gensen-choshuhyo';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';

// 年分は lib/gensen-choshuhyo.ts の TAX_YEAR から組み立てる（2027-11 に令和9年分へ切り替える）
const title = `源泉徴収票の見方と検算【${TAX_YEAR.label}】｜4つの数字を入れて合っているか確かめる`;
const description = `支払金額・給与所得控除後の金額・所得控除の額の合計額・源泉徴収税額を入れると、各欄の意味と計算が合っているかを表示。${TAX_YEAR.label}の基礎控除104万円・給与所得控除74万円に対応。登録不要・入力は送信しません。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/gensen-choshuhyo/` },
  robots: robotsFor('gensen-choshuhyo'),
};

const faq = [
  {
    q: '源泉徴収税額が0円なのはなぜですか？',
    a: '1年分の所得税がかからなかったからです。給与所得控除後の金額から所得控除の額の合計額を引いた「課税給与所得金額」が0円以下なら、所得税は0円です。令和8年分は基礎控除が最大104万円・給与所得控除の最低保障額が74万円になったので、給与収入178万円までは所得税がかかりません。また住宅ローン控除で所得税を引ききった場合も0円になります。毎月の給与から引かれていた分は、年末調整で全額戻っています。',
  },
  {
    q: '令和8年分の源泉徴収税額は、なぜ去年より少ないのですか？',
    a: '令和8年度税制改正で、所得税の基礎控除が最大104万円（改正前は本則58万円＋特例加算）、給与所得控除の最低保障額が74万円（改正前65万円）に引き上げられたためです。この改正は令和8年12月1日施行で、11月までの毎月の源泉徴収には反映されず、12月の年末調整で1年分がまとめて精算されました。源泉徴収票の源泉徴収税額は精算したあとの額なので、去年より少なくなります。このページでは、あなたの数字で「去年の制度ならいくら多かったか」の概算を出しています。',
  },
  {
    q: '源泉徴収票はいつもらえますか？',
    a: '給与の支払者は、その年の給与について翌年1月31日までに源泉徴収票を交付することになっています（所得税法226条1項）。年末調整のある会社では、12月下旬の給与明細と一緒に、または1月中に配られることが多いです。年の途中で退職した場合は、退職の日以後1か月以内に交付されます。',
  },
  {
    q: '源泉徴収票をなくしたらどうすればいいですか？',
    a: '勤務先（退職した場合は前の勤務先）の給与の担当に再発行を依頼してください。税務署では再発行できません。確定申告や住宅ローンの審査で必要なときは、早めに依頼しておくと安心です。',
  },
  {
    q: '「年調未済」とは何ですか？',
    a: '年末調整をしていない源泉徴収票という意味で、摘要欄に書かれます。年の途中で退職して再就職しなかった人などが該当します。この場合の源泉徴収税額は毎月引かれた額の合計で、1年分の正しい税額とは一致しないのがふつうです。翌年に確定申告をすれば、払いすぎた分が戻ることが多いです。このページでは年調未済の票は検算せず、確定申告の判定へご案内します。',
  },
];

const trail = breadcrumbFor('gensen-choshuhyo');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '源泉徴収票の見方と検算',
      url: `${SITE_URL}/gensen-choshuhyo/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('gensen-choshuhyo'),
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

/**
 * 源泉徴収票の上の段を模した図。実物の様式の画像は貼らない。
 * 幅 360px の画面でも文字がつぶれないよう、4欄を2×2に並べ直している
 */
function SlipDiagram() {
  const cells = [
    { x: 0, y: 0, n: '①', name: '支払金額', note: '額面の合計' },
    { x: 1, y: 0, n: '②', name: '給与所得控除後の金額', note: '① − 給与所得控除' },
    { x: 0, y: 1, n: '③', name: '所得控除の額の合計額', note: '社会保険料・基礎控除など' },
    { x: 1, y: 1, n: '④', name: '源泉徴収税額', note: '1年分の所得税' },
  ];
  const w = 158;
  const h = 70;
  return (
    <svg
      viewBox="0 0 324 152"
      role="img"
      aria-label="源泉徴収票の上の段の4つの欄：①支払金額、②給与所得控除後の金額、③所得控除の額の合計額、④源泉徴収税額"
      style={{ width: '100%', maxWidth: 480, height: 'auto', display: 'block', margin: '12px auto' }}
    >
      {cells.map((c) => {
        const x = 2 + c.x * (w + 4);
        const y = 2 + c.y * (h + 6);
        return (
          <g key={c.n}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={6}
              fill="var(--accent-soft)"
              stroke="var(--border)"
            />
            <text x={x + 8} y={y + 22} fontSize={13} fontWeight={700} fill="currentColor">
              {c.n}
            </text>
            <text x={x + 26} y={y + 22} fontSize={c.name.length > 8 ? 11 : 13} fontWeight={700} fill="currentColor">
              {c.name}
            </text>
            <text x={x + 8} y={y + 50} fontSize={11} fill="currentColor" opacity={0.75}>
              {c.note}
            </text>
          </g>
        );
      })}
    </svg>
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

      <h1>源泉徴収票の見方と検算【{TAX_YEAR.label}】</h1>
      <p className="lead">
        手元の源泉徴収票の<strong>4つの数字</strong>
        を写すと、各欄の意味と<strong>計算が合っているか</strong>
        を1行ずつ示します。{TAX_YEAR.label}の基礎控除104万円・給与所得控除74万円に対応。入力はどこにも送りません。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>上の段の4つの欄はこう並んでいる</h2>
      <SlipDiagram />
      <p>
        源泉徴収票の上の段は、左から<strong>支払金額 → 給与所得控除後の金額 → 所得控除の額の合計額 → 源泉徴収税額</strong>
        の順に並んでいて、年末調整の計算の順番そのものです。①から給与所得控除を引いたのが②、②から③を引いて1,000円未満を切り捨てたのが「課税給与所得金額」（票には書かれていません）、それに税率を当てて
        102.1% を掛けたのが④です。
      </p>

      <h2>検算の式（国税庁「年末調整のしかた」の順序）</h2>
      <ol>
        <li>
          ① 支払金額 →「年末調整等のための給与所得控除後の給与等の金額の表」→ ②（660万円未満は4,000円刻みの表、以上は式。所得金額調整控除があればその額を引く）
        </li>
        <li>② − ③ ＝ 課税給与所得金額（1,000円未満切捨て）</li>
        <li>速算表で算出所得税額を出す</li>
        <li>− 住宅借入金等特別控除（票の中段の額をそのまま）＝ 年調所得税額（0円未満にはなりません）</li>
        <li>× 102.1%（復興特別所得税を含む）→ 100円未満切捨て ＝ ④ 源泉徴収税額</li>
      </ol>
      <p>
        住宅ローン控除は、票の「住宅借入金等特別控除の額」を<strong>そのまま</strong>
        引きます。この欄は年末調整で所得税から実際に引いた額で、引ききれずに住民税へ回る分はすでに除かれています。摘要欄の「住宅借入金等特別控除可能額」とは別の数字なので、取り違えないでください。
      </p>

      <h2>一致しないときに考えられること</h2>
      <ul>
        <li>
          <strong>所得金額調整控除</strong>
          ：23歳未満の扶養親族がいる・本人や家族が特別障害者・給与と年金の両方がある人は、②が表より小さくなります。中段の「所得金額調整控除額」を入れると、その分を差し引いて比べます
        </li>
        <li>
          <strong>前職分の合算</strong>
          ：年の途中で転職した人は、前の勤務先の給与と源泉徴収税額を合算して年末調整します。前職の源泉徴収票を出していないと合算されず、確定申告が必要になります
        </li>
        <li>
          <strong>年末調整をしていない</strong>
          ：摘要欄に「年調未済」とある票・乙欄の票は、毎月引かれた額の合計なので一致しないのがふつうです
        </li>
      </ul>
      <p>
        このページは計算の筋道を確かめる道具で、勤務先の処理の正否を判定するものではありません。合わない理由が分からないときは、勤務先の給与の担当に確かめてください。
      </p>

      <h2>この検算の前提</h2>
      <ul>
        <li>給与所得だけの人の、年末調整済みの源泉徴収票（{TAX_YEAR.label}）を対象にしています</li>
        <li>
          「去年の制度なら」の比較は、基礎控除と給与所得控除の2つだけを令和7年分の額に差し替えた概算です。配偶者・扶養親族の所得要件の変化（58万円→62万円）は含めていません
        </li>
        <li>住民税（特別徴収税額の決定通知書）の検算はしません。届くのは5〜6月です</li>
      </ul>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="gensen-choshuhyo" />

      <ToolMeta slug="gensen-choshuhyo" ymyl>
        出典：
        <a
          href="https://www.nta.go.jp/publication/pamph/gensen/nencho.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁「年末調整のしかた」
        </a>
        、
        <a
          href="https://www.nta.go.jp/users/gensen/2026kiso/index.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁「令和8年度税制改正による所得税の基礎控除の引上げ等について」
        </a>
        、
        <a
          href="https://www.nta.go.jp/publication/pamph/gensen/2026kaisei.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁「令和8年4月 源泉所得税の改正のあらまし」（PDF）
        </a>
        、
        <a
          href="https://laws.e-gov.go.jp/law/340AC0000000033"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          所得税法（e-Gov法令検索。226条1項：源泉徴収票の交付）
        </a>
        にもとづき作成。給与所得控除後の金額の表・基礎控除・速算表は、年末調整 還付金 計算機と同じ関数で計算しています。
      </ToolMeta>
    </>
  );
}
