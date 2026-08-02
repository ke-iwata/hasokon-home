import type { Metadata } from 'next';
import Link from 'next/link';
import { COPYRIGHT_HOLDER, SITE_NAME, SITE_UPDATED_AT, SITE_URL, tools } from '@/lib/registry';
import { PUBLISHER } from '@/lib/jsonld';

const title = '運営者情報と計算の根拠について';
const description = `${SITE_NAME}の運営者情報と、各計算ツールがどの資料にもとづき、どう検証されているかの説明です。対応していない制度や、このサイトでできないことも明記しています。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/about/` },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    PUBLISHER,
    {
      '@type': 'AboutPage',
      name: title,
      url: `${SITE_URL}/about/`,
      description,
      inLanguage: 'ja',
      dateModified: SITE_UPDATED_AT,
      publisher: { '@id': `${SITE_URL}/#publisher` },
    },
  ],
};

export default function AboutPage() {
  const ready = tools.filter((t) => t.ready).length;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1>運営者情報と計算の根拠について</h1>
      <p className="lead">
        お金や健康に関わる計算は、数字が合っているかどうかで判断が変わります。このページでは、誰がこのサイトを作っていて、各ツールが<strong>どの資料にもとづき、どうやって検証されているか</strong>を説明します。あわせて、このサイトでは<strong>できないこと</strong>も明記します。
      </p>

      <h2>運営者</h2>
      <table>
        <tbody>
          <tr>
            <th style={{ textAlign: 'left', width: '30%' }}>サイト名</th>
            <td style={{ textAlign: 'left' }}>{SITE_NAME}（{SITE_URL.replace('https://', '')}）</td>
          </tr>
          <tr>
            <th style={{ textAlign: 'left' }}>運営</th>
            <td style={{ textAlign: 'left' }}>{COPYRIGHT_HOLDER}（個人による運営）</td>
          </tr>
          <tr>
            <th style={{ textAlign: 'left' }}>運営者の背景</th>
            <td style={{ textAlign: 'left' }}>ソフトウェアエンジニア。税理士・社会保険労務士などの資格は保有していません。</td>
          </tr>
          <tr>
            <th style={{ textAlign: 'left' }}>公開ツール数</th>
            <td style={{ textAlign: 'left' }}>{ready}本（このほかに用途別ルーレットと使い方の記事があります）</td>
          </tr>
          <tr>
            <th style={{ textAlign: 'left' }}>お問い合わせ</th>
            <td style={{ textAlign: 'left' }}>
              <Link href="/contact/">お問い合わせフォーム</Link>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>計算の根拠をどう作っているか</h2>
      <p>
        制度に関わるツールは、次の手順で作っています。解説記事やまとめサイトを根拠にすることはしません。
      </p>
      <ol>
        <li>
          <strong>一次情報にあたる</strong> —
          法令の条文、官公庁（国税庁・厚生労働省・総務省・こども家庭庁など）が公開している資料を確認し、金額・料率・区分をそこから取ります。各ツールのページ下部に、実際に参照した資料へのリンクを載せています
        </li>
        <li>
          <strong>計算部分を画面から切り離して実装する</strong> —
          計算式は入力欄や表示とは別のファイルに、外部に依存しない関数として書いています。画面を触らずに計算式だけを直せるので、制度改正のときに間違いが入りにくくなります
        </li>
        <li>
          <strong>一次資料の計算例で検証する</strong> —
          公的資料に載っている計算例、制度の境界にあたる金額（「◯万円ちょうど」のような値）、ありえない入力（マイナスや0）を自動テストにしています。現在{' '}
          <strong>201件</strong>のテストがあり、これが全部通らないと公開できない仕組みにしています
        </li>
        <li>
          <strong>制度の数値は1か所にまとめる</strong> —
          料率や金額の表はファイルの先頭にまとめてあり、改正があったときはそこだけを直せば全体に反映されます
        </li>
      </ol>

      <h3>検証の具体例</h3>
      <ul>
        <li>
          <Link href="/nenshu-kabe/">年収の壁 計算機</Link> —
          178万円・136万円・119万円といった金額は、所得税法等の一部を改正する法律（令和8年法律第12号）による令和8年分の給与所得控除74万円・基礎控除104万円から導いています。国税庁のタックスアンサーは執筆時点で令和7年分の内容のままなので数字が食い違って見えますが、改正後の値を採用しています
        </li>
        <li>
          <Link href="/furusato-nozei/">ふるさと納税 控除額計算機</Link> —
          総務省が示す3階建ての控除の式どおりに実装したうえで、公表されている控除上限額の目安と突き合わせ、給与収入300万〜1,000万円の範囲で誤差が数百円〜2%台に収まることを確認しています
        </li>
        <li>
          <Link href="/shobyo-teate/">傷病手当金 計算機</Link> —
          被保険者期間が12か月に満たない場合の上限（標準報酬月額32万円との比較）を反映しています。これを入れないと、給与が高い方の支給額を実際より大きく表示してしまいます
        </li>
      </ul>

      <h2>このサイトでできないこと</h2>
      <div className="note">
        <p style={{ margin: '0 0 8px' }}>
          <strong>個別の税務相談・法律相談ではありません。</strong>
          本サイトの計算機は、公開されている制度の計算式を誰でも試せるようにしたものです。特定の方の状況に対する助言ではなく、税理士法・社会保険労務士法などで有資格者に限られている業務を行うものでもありません。
        </p>
        <p style={{ margin: '0 0 8px' }}>
          <strong>有資格者の監修は受けていません。</strong>
          根拠は一次情報にあたって確認していますが、税理士・社会保険労務士による監修は入っていません。申告や手続きなど実際の判断をされる際は、公的機関の窓口または専門家にご確認ください。
        </p>
        <p style={{ margin: 0 }}>
          <strong>対応していない条件があります。</strong>
          たとえばふるさと納税の計算機は住宅ローン控除に対応していません。こうした制限は各ツールのページに明記しています。「前提」や「このページについて」の欄をご確認ください。
        </p>
      </div>
      <p>
        <strong>誤りを見つけたらご連絡ください。</strong>
        制度の解釈や数値の誤りに気づかれた場合は、
        <Link href="/contact/">お問い合わせフォーム</Link>
        からお知らせいただけると助かります。確認のうえ修正し、ページの最終更新日を更新します。
      </p>

      <h2>更新の方針</h2>
      <ul>
        <li>
          制度改正があったときに更新します。各ページの下部に<strong>最終更新日</strong>を表示しており、sitemapに載せている更新日も同じ値です
        </li>
        <li>
          記事の定期的な書き足しはしません。計算式は年月で古くならないため、内容が変わっていないのに更新日だけを新しくすることはしません
        </li>
        <li>
          料率や金額に見込み値を使っている場合（子ども・子育て支援金の2027年度以降など）は、その旨をページに明記し、確定後に更新します
        </li>
      </ul>

      <h2>入力データの扱い</h2>
      <p>
        すべての計算はお使いのブラウザの中だけで行われます。年収や病名にあたる情報を入力しても、サーバーに送信・保存されることはありません。サイトの利用状況の集計にはGoogleアナリティクスを使っていますが、ツールに入力された数値や文字列は含まれません。詳しくは
        <Link href="/privacy/">プライバシーポリシー</Link>
        をご覧ください。
      </p>
    </>
  );
}
