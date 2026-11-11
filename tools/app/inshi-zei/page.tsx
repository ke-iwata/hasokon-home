import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  DAI7GO_TAX,
  DATA_CHECKED_AT,
  DOC_LABEL,
  HONSOKU_DAI1GO,
  HONSOKU_DAI2GO,
  HONSOKU_RYOSHUSHO,
  KATAIZEI_MIN,
  KEIGEN_TABLES,
  KEIGEN_TO,
  QUICK_AFTER,
  QUICK_BEFORE,
  SOURCES,
  TAIKO_STATUS,
  formatAmount,
  formatDate,
  formatYen,
  quickTable,
  type Bracket,
} from '@/lib/inshi-zei';
import Calculator from './Calculator';

const title =
  '収入印紙（印紙税）計算機｜領収書・不動産売買・工事請負契約書の印紙はいくら？2027年3月末で切れる軽減措置に対応';
const description = `領収書・不動産の売買契約書・工事の請負契約書・請負契約書に貼る収入印紙の額を、金額・作成日・通数から計算。${formatDate(
  KEIGEN_TO,
)}で期限が切れる軽減措置を作成日で出し分けます。消費税を分けて書けば税抜で判定できること、電子契約や個人の私的な売買の領収書には印紙が要らないこと、貼り忘れたときの過怠税まで分かります。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/inshi-zei/` },
  robots: robotsFor('inshi-zei'),
};

const quick = quickTable();
const fudosanKeigen = KEIGEN_TABLES.find((t) => t.doc === 'fudosan')!;
const kensetsuKeigen = KEIGEN_TABLES.find((t) => t.doc === 'kensetsu')!;

/** 表の行の見出し（「100万円以下」「10億円を超えるもの」） */
function rangeLabel(brackets: readonly Bracket[], i: number, lower: number, lowerInclusive: boolean): string {
  const b = brackets[i];
  const from = i === 0 ? lower : brackets[i - 1].upTo!;
  const fromText = i === 0 && lowerInclusive ? `${formatYen(from)}以上` : `${formatYen(from)}を超え`;
  return b.upTo === null ? `${formatYen(from)}を超えるもの` : `${fromText}${formatYen(b.upTo)}以下`;
}

const taikoText =
  TAIKO_STATUS === 'pending'
    ? `軽減措置の期限は${formatDate(KEIGEN_TO)}です。国土交通省が令和9年度税制改正で延長を要望しており、結論は2026年12月中旬の税制改正大綱で示される見込みです。延長が決まらなければ、${formatDate(
        QUICK_AFTER,
      )}以降に作る契約書は本則の額になり、たとえば不動産の売買契約書（3,000万円）は1万円から2万円に上がります。`
    : TAIKO_STATUS === 'extended'
      ? `令和9年度税制改正大綱で、軽減措置を延長する予定が示されました（法律の成立は例年3月末）。`
      : TAIKO_STATUS === 'enacted'
        ? `軽減措置の延長が法律で決まりました。`
        : `軽減措置は延長されないことになりました。${formatDate(QUICK_AFTER)}以降に作る契約書は本則の額です。`;

const faq = [
  {
    q: '2027年4月から印紙税は上がりますか？',
    a: `不動産の売買契約書と建設工事の請負契約書の印紙税は、${formatDate(
      fudosanKeigen.from,
    )}から軽減されています（租税特別措置法91条）。${taikoText}領収書や工事以外の請負契約書は軽減措置の対象ではないので、変わりません。`,
  },
  {
    q: '領収書の印紙は税込・税抜どちらで判定しますか？',
    a: '領収書や契約書に「税抜金額と消費税額」または「税込金額と消費税額（税抜金額）」を分けて書けば、消費税を除いた額で判定します（国税庁 No.7124）。たとえば「商品代金48,000円、消費税4,800円、合計52,800円」と書いた領収書は、記載金額48,000円で5万円未満なので印紙は要りません。「52,800円（税込）」とだけ書くと52,800円で判定し、200円の印紙が要ります。消費税の免税事業者は、分けて書いても税込の額で判定します。',
  },
  {
    q: '電子契約やPDFの領収書に印紙はいりますか？',
    a: 'いりません。印紙税は紙の文書を「作成」したときにかかる税で、PDF・メール・電子契約サービスで交わす電子文書は課税文書の作成に当たりません。ただし、電子で作ったものを印刷して署名・押印し相手に渡す場合や、FAX・メールで送ったあとに原本を郵送する場合は、紙の契約書・領収書として印紙が要ります。',
  },
  {
    q: '個人がフリマで売ったときや、個人の医師・弁護士の領収書に印紙はいりますか？',
    a: '「営業に関しない受取書」は非課税なので、いりません。個人の私的な売買（不用品の売却など）、個人の医師・歯科医師・弁護士・税理士などの士業、店舗を持たない農業・林業・漁業の人が自分の生産物を売るときが当たります（国税庁 No.7125）。一方、会社（営利法人）の領収書は、本業以外の取引でも必ず「営業に関する」ものになり、5万円以上なら印紙が要ります。',
  },
  {
    q: '印紙を貼り忘れた・消印を忘れたらどうなりますか？',
    a: `貼り忘れた印紙税は、過怠税として納めなかった額の3倍（最低${formatYen(
      KATAIZEI_MIN,
    )}）を取られます。税務調査の前に自分から税務署に申し出れば1.1倍で済みます。印紙と文書にまたがって押す「消印」を忘れたときは、消していない印紙の額面と同じ額の過怠税がかかります（印紙税法20条）。契約書2通にまたがって押す「割印」は印紙税法上の義務ではなく、押さなくても過怠税はかかりません。過怠税は法人税の損金・所得税の必要経費になりません。`,
  },
];

const trail = breadcrumbFor('inshi-zei');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '収入印紙（印紙税）計算機',
      url: `${SITE_URL}/inshi-zei/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('inshi-zei'),
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

function ExtLink({ s }: { s: { label: string; url: string } }) {
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer">
      {s.label}
    </a>
  );
}

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>収入印紙（印紙税）計算機</h1>
      <p className="lead">
        領収書・不動産の売買契約書・工事の請負契約書・請負契約書に貼る印紙の額を、金額・作成日・通数から計算します。
        {formatDate(KEIGEN_TO)}で期限が切れる軽減措置は<strong>作成日</strong>
        で出し分け、そもそも印紙が要らない場合（5万円未満の領収書・電子契約・営業に関しない受取書）を先に答えます。
        入力した金額はどこにも送信しません。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>早見表（よく調べられる金額）</h2>
      <p>
        契約書は作成日で額が変わります。軽減措置の最終日（{formatDate(QUICK_BEFORE)}）と翌日（
        {formatDate(QUICK_AFTER)}）に作った場合を並べています（税込金額だけを書いた紙の文書・1通あたり）。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>文書</th>
              <th>記載金額</th>
              <th>{formatDate(QUICK_BEFORE)}に作成</th>
              <th>{formatDate(QUICK_AFTER)}に作成</th>
            </tr>
          </thead>
          <tbody>
            {quick.map((r) => (
              <tr key={`${r.doc}-${r.amount}`}>
                <th scope="row">{DOC_LABEL[r.doc]}</th>
                <td>{formatAmount(r.amount)}</td>
                <td>{r.before === 0 ? '不要' : formatYen(r.before)}</td>
                <td>{r.after === 0 ? '不要' : formatYen(r.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        {taikoText}
        出典：<ExtLink s={SOURCES.keigen} />、<ExtLink s={SOURCES.yobo} />
      </p>

      <h2>印紙が要らない書き方</h2>
      <ul>
        <li>
          <strong>消費税を分けて書く</strong> —
          税抜金額と消費税額を分けて書くと、税抜の額で判定します。税込 52,800円（税抜 48,000円＋消費税 4,800円）の領収書は、分けて書けば5万円未満で非課税、税込だけを書くと200円です
        </li>
        <li>
          <strong>電子で交わす</strong> —
          PDF・メール・電子契約サービスで交わす契約書・領収書は課税文書の作成に当たりません。ただし、印刷して署名・押印したものを渡す／送ったあとに原本を郵送すると、紙の文書として課税されます
        </li>
        <li>
          <strong>営業に関しない受取書</strong> —
          個人の私的な売買（フリマ・不用品）、個人の医師・士業、店舗を持たない農林漁業者が自分の生産物を売るときの領収書は非課税です。会社の領収書は必ず課税側です
        </li>
      </ul>
      <p className="note">
        出典：<ExtLink s={SOURCES.shohizei} />、<ExtLink s={SOURCES.eigyogai} />
      </p>

      <h2>貼り忘れたら（過怠税）</h2>
      <ul>
        <li>
          <strong>貼り忘れ</strong> — 納めなかった印紙税の<strong>3倍</strong>（最低{formatYen(KATAIZEI_MIN)}
          ）。税務調査の前に自分から申し出れば<strong>1.1倍</strong>
        </li>
        <li>
          <strong>消印を忘れた</strong> —
          消印は、印紙と文書にまたがって押す印や署名のことです。忘れると、消していない印紙の額面と同じ額の過怠税がかかります
        </li>
        <li>
          <strong>割印は別物</strong> —
          契約書2通にまたがって押す割印は、印紙税法上の義務ではありません。押さなくても過怠税はかかりません
        </li>
        <li>
          <strong>経費にならない</strong> — 過怠税は法人税の損金・所得税の必要経費になりません
        </li>
      </ul>
      <p className="note">根拠：印紙税法 第20条（過怠税）。</p>

      <h2>税額表</h2>
      <h3>領収書（第17号の1 売上代金の受取書）</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>記載金額</th>
              <th>税額</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{formatYen(HONSOKU_RYOSHUSHO.exemptBelow)}未満</th>
              <td>非課税</td>
            </tr>
            {HONSOKU_RYOSHUSHO.brackets.map((b, i) => (
              <tr key={i}>
                <th scope="row">{rangeLabel(HONSOKU_RYOSHUSHO.brackets, i, HONSOKU_RYOSHUSHO.exemptBelow, true)}</th>
                <td>{formatYen(b.tax)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">金額の記載なし</th>
              <td>200円</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint">
        借入金・保険金・損害賠償金など、売上代金以外の受取書は5万円以上で一律200円です（この計算機は売上代金の受取書だけを扱います）。
      </p>

      <h3>不動産の売買契約書（第1号の1）</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>記載金額</th>
              <th>本則</th>
              <th>軽減後（{formatDate(fudosanKeigen.to)}まで）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{formatYen(HONSOKU_DAI1GO.exemptBelow)}未満</th>
              <td>非課税</td>
              <td>非課税</td>
            </tr>
            {HONSOKU_DAI1GO.brackets.map((b, i) => {
              const lower = i === 0 ? HONSOKU_DAI1GO.exemptBelow : HONSOKU_DAI1GO.brackets[i - 1].upTo!;
              const k = lower >= fudosanKeigen.over ? fudosanKeigen.brackets.find((kb) => kb.upTo === null || (b.upTo !== null && b.upTo <= kb.upTo)) : null;
              return (
                <tr key={i}>
                  <th scope="row">{rangeLabel(HONSOKU_DAI1GO.brackets, i, HONSOKU_DAI1GO.exemptBelow, true)}</th>
                  <td>{formatYen(b.tax)}</td>
                  <td>{k ? formatYen(k.tax) : `${formatYen(b.tax)}（対象外）`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3>請負契約書（第2号）・工事の請負契約書</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>記載金額</th>
              <th>本則</th>
              <th>建設工事 軽減後（{formatDate(kensetsuKeigen.to)}まで）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{formatYen(HONSOKU_DAI2GO.exemptBelow)}未満</th>
              <td>非課税</td>
              <td>非課税</td>
            </tr>
            {HONSOKU_DAI2GO.brackets.map((b, i) => {
              const lower = i === 0 ? HONSOKU_DAI2GO.exemptBelow : HONSOKU_DAI2GO.brackets[i - 1].upTo!;
              const k = lower >= kensetsuKeigen.over ? kensetsuKeigen.brackets.find((kb) => kb.upTo === null || (b.upTo !== null && b.upTo <= kb.upTo)) : null;
              return (
                <tr key={i}>
                  <th scope="row">{rangeLabel(HONSOKU_DAI2GO.brackets, i, HONSOKU_DAI2GO.exemptBelow, true)}</th>
                  <td>{formatYen(b.tax)}</td>
                  <td>{k ? formatYen(k.tax) : `${formatYen(b.tax)}（対象外）`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        第1号と第2号は500万円以下の区切りが違います（たとえば300万円は、第1号の本則が2,000円、第2号の本則が1,000円）。
        金額の記載がない契約書はどちらも200円です。
      </p>
      <p className="note">
        出典：<ExtLink s={SOURCES.ichiran1} />、<ExtLink s={SOURCES.ichiran2} />、<ExtLink s={SOURCES.keigen} />、
        <ExtLink s={SOURCES.ukeoi} />、<ExtLink s={SOURCES.ryoshusho} />
      </p>

      <h2>このツールが扱わないこと</h2>
      <ul>
        <li>
          <strong>4種類以外の文書</strong> —
          金銭消費貸借契約書（第1号の3）・継続的取引の基本契約書（第7号。1通 {formatYen(DAI7GO_TAX)}
          ）・合併契約書（第5号）などの税額は計算しません。<ExtLink s={SOURCES.ichiran2} />を見てください
        </li>
        <li>
          <strong>準委任の業務委託</strong> —
          作業時間や期間に対して払う契約は第2号の請負に当たりません。基本契約は第7号に当たる場合があります
        </li>
        <li>
          <strong>文書の種類の自動判定</strong> —
          契約書の文面から種類を判定することはしません。種類は契約の中身で決まるので、迷うときは税務署に確かめてください
        </li>
        <li>
          <strong>収入印紙の買い方・納付の手続</strong> — <ExtLink s={SOURCES.tebiki} />を見てください
        </li>
      </ul>

      <h2>フリーランス・個人事業主の税をあわせて確かめる</h2>
      <p>
        請求書・領収書を発行するなら、<Link href="/invoice-nozeigaku/">インボイス 納税額 計算機</Link>
        で消費税の納税額を、<Link href="/aoiro-shinkoku-kojo/">青色申告特別控除 計算機</Link>
        で控除の額を確かめておくと、年度末の手続きが楽になります。
      </p>

      <h2>よくある質問</h2>
      <dl>
        {faq.map((f) => (
          <div key={f.q} style={{ marginBottom: 16 }}>
            <dt style={{ fontWeight: 700, marginBottom: 4 }}>{f.q}</dt>
            <dd style={{ margin: 0 }}>{f.a}</dd>
          </div>
        ))}
      </dl>

      <AdUnit position="below-faq" />

      <RelatedTools current="inshi-zei" />

      <ToolMeta slug="inshi-zei" ymyl>
        税額表は <ExtLink s={SOURCES.ichiran1} />・<ExtLink s={SOURCES.ichiran2} />、軽減措置は{' '}
        <ExtLink s={SOURCES.keigen} />、税抜の判定は <ExtLink s={SOURCES.shohizei} />
        、営業に関しない受取書は <ExtLink s={SOURCES.eigyogai} />
        にもとづきます。文書の種類は契約の中身で決まるため、判断に迷うときは税務署に確かめてください。データ最終確認日：
        {formatDate(DATA_CHECKED_AT)}
      </ToolMeta>
    </>
  );
}
