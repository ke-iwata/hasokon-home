import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { DAKUON_TABLE, SEION_TABLE, YOON_TABLE, type KanaTableRow } from '@/lib/hebon-romaji';
import Calculator from './Calculator';

const title = 'ヘボン式ローマ字変換｜パスポート表記の氏名を自動変換';
const description =
  '氏名（ひらがな・カタカナ）を入力するだけで、パスポート申請用のヘボン式ローマ字表記に変換。五十音のヘボン式ローマ字一覧表つきで、撥音（ん→M/N）・促音（っ）・長音（さいとう→SAITO）のルールに対応し、OH表記（長音氏名表記）の代替案も表示します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hebon-romaji/` },
  robots: robotsFor('hebon-romaji'),
};

const faq = [
  {
    q: 'ヘボン式と訓令式は何が違いますか？',
    a: 'ヘボン式は英語の発音に近い表記（し=SHI、ち=CHI、つ=TSU、ふ=FU）、訓令式は日本語の五十音の規則性を重視した表記（し=SI、ち=TI、つ=TU、ふ=HU）です。パスポートの氏名は原則ヘボン式で表記すると定められているため、小学校で習う訓令式のままでは申請できません。',
  },
  {
    q: '「さいとう」の「う」はなぜ書かないのですか？',
    a: 'パスポートのヘボン式では、「おう」「おお」などの長音（のばす音）のO・Uは表記しないルールになっているためです。さいとう→SAITO、おおの→ONO、こうた→KOTAとなります。同様に「ゆうき」の「うう」もYUKIとUを1つしか書きません。一方「にいがた」のII、「えいた」のEIはそのまま表記します。',
  },
  {
    q: 'OH表記（長音氏名表記）とは何ですか？',
    a: '氏名に「おう」「おお」の長音が含まれる場合に限り、Oの代わりにOHと表記できる特例です（おおの→OHNO、さいとう→SAITOH）。海外でONOが「オノ」と短く読まれるのを避けたい場合などに、パスポート申請時に選択できます。',
  },
  {
    q: '一度決めたローマ字表記は変えられますか？',
    a: '原則として変更できません。パスポートの氏名表記は航空券やビザ、海外の銀行口座など各種書類と一致している必要があるため、一度登録した表記（OH表記を含む）の変更は、婚姻などの特別な理由がない限り認められません。最初の申請時に慎重に選ぶ必要があります。',
  },
  {
    q: '戸籍のフリガナとパスポートのローマ字はどう関係しますか？',
    a: '2025年5月26日に施行された改正戸籍法で、戸籍に氏名のフリガナが記載されるようになりました。パスポートの氏名は旅券法施行規則第9条により戸籍の記載にもとづくヘボン式ローマ字で表記されるため、これからの申請では戸籍のフリガナがローマ字表記の出発点になります。ふだん名乗っている読み方と戸籍のフリガナが違う場合は、戸籍のフリガナのほうが優先されるので、申請前に本籍地の市区町村へ届け出た（または通知された）フリガナを確認しておくと安心です。',
  },
  {
    q: 'パスポートの自署（サイン）もヘボン式ローマ字で書く必要がありますか？',
    a: 'いいえ。自署は漢字・ひらがな・カタカナ・ローマ字のいずれでもよく、ヘボン式である必要はありません。所持人自身が署名したものであることが大切で、パスポート上のローマ字氏名と一致していなくても差し支えないとされています。ただし、海外ではクレジットカードや出入国書類のサインと見比べられることがあるため、日ごろ使っているサインと同じ書き方にそろえておくと手続きがスムーズです。',
  },
];

/** 一覧表を描画する（データは lib/hebon-romaji.ts の変換表から生成される） */
function KanaTable({ rows, heads }: { rows: KanaTableRow[]; heads: string[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>行</th>
          {heads.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            {row.cells.map((cell, i) => (
              <td key={`${row.label}-${i}`} style={{ textAlign: 'center' }}>
                {cell ? (
                  <>
                    {cell.kana}
                    <br />
                    <strong>{cell.romaji}</strong>
                  </>
                ) : (
                  ''
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const trail = breadcrumbFor('hebon-romaji');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'ヘボン式ローマ字変換',
      url: `${SITE_URL}/hebon-romaji/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('hebon-romaji'),
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

      <h1>ヘボン式ローマ字変換（パスポート表記）</h1>
      <p className="lead">
        姓・名をひらがなまたはカタカナで入力すると、パスポート申請で使うヘボン式ローマ字（大文字）に変換します。撥音「ん」・促音「っ」・長音の表記ルールに対応しています。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>パスポートのヘボン式ローマ字とは</h2>
      <p>
        パスポートの氏名は、戸籍のふりがなをヘボン式ローマ字で表記するのが原則です。ヘボン式は英語の発音に近づけた表記法で、「し=SHI」「ち=CHI」「つ=TSU」「ふ=FU」「じ=JI」のように書きます。学校で習う訓令式（し=SI、ち=TI）とは異なるため、注意が必要です。
      </p>

      <h2>ヘボン式ローマ字 一覧表（五十音）</h2>
      <p>
        パスポート申請で使う五十音のヘボン式表記です。上段がかな、下段がローマ字（大文字）です。訓令式と違う「し=SHI」「ち=CHI」「つ=TSU」「ふ=FU」「じ=JI」や、助詞と同じ「を=O」に注意してください。
      </p>

      <h3>清音</h3>
      <KanaTable rows={SEION_TABLE} heads={['a', 'i', 'u', 'e', 'o']} />
      <p>
        「ん」は原則 N ですが、B・M・P の前だけ M になります（なんば=NAMBA）。「っ」は次の子音を重ね（はっとり=HATTORI）、CH音の前だけ T になります（はっちょう=HATCHO）。
      </p>

      <h3>濁音・半濁音</h3>
      <KanaTable rows={DAKUON_TABLE} heads={['a', 'i', 'u', 'e', 'o']} />
      <p>
        「ぢ」は JI、「づ」は ZU と書きます（DI・DU ではありません）。「かんだ」のように「ん」の後に濁音が続く場合も、B・M・P 以外は N のままです。
      </p>

      <h3>拗音（ゃ・ゅ・ょ）</h3>
      <KanaTable rows={YOON_TABLE} heads={['ゃ', 'ゅ', 'ょ']} />
      <p>
        「じゃ・じゅ・じょ」と「ぢゃ・ぢゅ・ぢょ」はどちらも JA・JU・JO です。「しょう」「ちょう」のように「ょ+う」が続く場合は長音になるため、U は書きません（しょうた=SHOTA、ちょうすけ=CHOSUKE）。
      </p>

      <h2>間違えやすい表記ルール</h2>
      <table>
        <thead>
          <tr>
            <th>ルール</th>
            <th>例</th>
            <th style={{ textAlign: 'center' }}>表記</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>長音「おう」「おお」のU/Oは書かない</td>
            <td style={{ textAlign: 'left' }}>さいとう／おおの</td>
            <td style={{ textAlign: 'left' }}>SAITO／ONO</td>
          </tr>
          <tr>
            <td>長音「うう」のUは1つ</td>
            <td style={{ textAlign: 'left' }}>ゆうき</td>
            <td style={{ textAlign: 'left' }}>YUKI</td>
          </tr>
          <tr>
            <td>「いい」「えい」はそのまま</td>
            <td style={{ textAlign: 'left' }}>にいがた／えいた</td>
            <td style={{ textAlign: 'left' }}>NIIGATA／EITA</td>
          </tr>
          <tr>
            <td>B・M・Pの前の「ん」はM</td>
            <td style={{ textAlign: 'left' }}>なんば／ほんま</td>
            <td style={{ textAlign: 'left' }}>NAMBA／HOMMA</td>
          </tr>
          <tr>
            <td>促音「っ」は子音を重ねる</td>
            <td style={{ textAlign: 'left' }}>はっとり</td>
            <td style={{ textAlign: 'left' }}>HATTORI</td>
          </tr>
          <tr>
            <td>CH音の前の「っ」はT</td>
            <td style={{ textAlign: 'left' }}>はっちょう</td>
            <td style={{ textAlign: 'left' }}>HATCHO</td>
          </tr>
        </tbody>
      </table>

      <h2>戸籍のフリガナとパスポート（2025年5月26日施行の改正戸籍法）</h2>
      <p>
        改正戸籍法の施行により、2025年5月26日から戸籍に氏名のフリガナが記載されるようになりました。施行後1年以内に本籍地の市区町村から届いた通知のフリガナを確認し、違っていれば届出をする、という流れです（届出がなければ通知どおりのフリガナが戸籍に記載されます）。
      </p>
      <p>
        パスポートの氏名は旅券法施行規則第9条により戸籍の記載にもとづくヘボン式ローマ字で表記されるため、これからの申請では<strong>戸籍のフリガナがローマ字表記の出発点</strong>になります。読み方が複数ありうる名前（「はるか」と「はるな」、「こうた」と「ひろた」など）や、ふだん名乗っている読みが戸籍のフリガナと違う場合は、申請前に戸籍のフリガナを確かめておくと、窓口での修正ややり直しを避けられます。
      </p>
      <p>
        すでにパスポートを持っている人の表記が自動で変わるわけではありません。切替申請でも従来の表記が引き継がれるのが原則で、戸籍のフリガナと食い違う場合の扱いは申請窓口の判断になります。
      </p>

      <h2>OH表記（長音氏名表記）は慎重に</h2>
      <p>
        「おう」「おお」の長音を含む氏名は、申請時にO表記（ONO）かOH表記（OHNO）かを選べます。ただし、一度パスポートに記載した表記はその後の申請でも引き継がれ、原則として変更できません。クレジットカードや航空券のマイレージ登録など、他の名義表記との統一も考えて選びましょう。
      </p>

      <div className="note">
        本ツールは一般的なパスポート用ヘボン式ローマ字のルールにもとづく参考表示です。非ヘボン式表記（例: 外国式の綴り）を希望する場合や表記に迷う場合など、正式な確認は各都道府県のパスポート申請窓口へお問い合わせください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="hebon-romaji" />

      <p style={{ fontSize: '0.9rem' }}>
        関連ツール：
        <Link href="/mojisu-count/">文字数カウント</Link>
        （スペース・改行の有無や原稿用紙の枚数まで数えます）／
        <Link href="/hankaku-zenkaku/">半角⇔全角 変換</Link>
        （全角と半角を種類ごとにまとめて変換します）
      </p>

      <ToolMeta slug="hebon-romaji">
        パスポート用ヘボン式ローマ字の表記ルールにもとづく参考表示です。氏名表記と戸籍フリガナの関係は
        <a
          href="https://www.mofa.go.jp/mofaj/toko/todoke/pagew_000001_01529.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          外務省「旅券（パスポート）の氏名表記」
        </a>
        （旅券法施行規則第9条）によります。パスポートは各都道府県が発給しており、綴りの一覧は
        <a
          href="https://www.pref.osaka.lg.jp/o070140/passport/top/romaji.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          大阪府「ヘボン式ローマ字」
        </a>
        などで公開されています。非ヘボン式表記を希望する場合など、正式な確認は申請窓口へお問い合わせください。
      </ToolMeta>
    </>
  );
}
