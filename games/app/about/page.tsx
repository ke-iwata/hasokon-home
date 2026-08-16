import type { Metadata } from 'next';
import Link from 'next/link';
import { COPYRIGHT_HOLDER, SITE_NAME, SITE_UPDATED_AT, SITE_URL, games } from '@/lib/registry';
import { breadcrumbList, breadcrumbTrail } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';

const title = '運営者情報とゲームの作り方について';
const description = `${SITE_NAME}の運営者情報と、各ゲームをどういう方針で作っているかの説明です。記録の保存先や広告についても明記しています。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/about/` },
};

// registry に無い固定ページなので、現在地の名前だけここで持つ
const trail = breadcrumbTrail('運営者情報');

/** 発行者はトップページ（app/page.tsx）の Organization を @id で参照する */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'AboutPage',
      name: title,
      url: `${SITE_URL}/about/`,
      description,
      inLanguage: 'ja',
      dateModified: SITE_UPDATED_AT,
      publisher: { '@id': `${SITE_URL}/#publisher` },
    },
    breadcrumbList(trail),
  ],
};

export default function AboutPage() {
  const ready = games.filter((g) => g.ready).length;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>運営者情報とゲームの作り方について</h1>
      <p className="lead">
        誰がこのサイトを作っていて、各ゲームを<strong>どういう方針で作っているか</strong>
        を説明します。あわせて、スコアなどのデータの扱いと、広告について明記します。
      </p>

      <h2>運営者</h2>
      <table>
        <tbody>
          <tr>
            <th style={{ textAlign: 'left', width: '30%' }}>サイト名</th>
            <td style={{ textAlign: 'left' }}>
              {SITE_NAME}（{SITE_URL.replace('https://', '')}）
            </td>
          </tr>
          <tr>
            <th style={{ textAlign: 'left' }}>運営</th>
            <td style={{ textAlign: 'left' }}>{COPYRIGHT_HOLDER}（個人による運営）</td>
          </tr>
          <tr>
            <th style={{ textAlign: 'left' }}>運営者の背景</th>
            <td style={{ textAlign: 'left' }}>
              ソフトウェアエンジニア。同じ hasokon.com で
              {/* tools は basePath（/games）の外なので <a> で絶対パスへ飛ばす */}
              <a href="/tools/">無料計算ツール集</a>
              も公開しており、経歴と作り方の詳細は
              <a href="/tools/about/">計算ツール側の運営者情報</a>
              にまとめています
            </td>
          </tr>
          <tr>
            <th style={{ textAlign: 'left' }}>公開ゲーム数</th>
            <td style={{ textAlign: 'left' }}>{ready}本</td>
          </tr>
          <tr>
            <th style={{ textAlign: 'left' }}>お問い合わせ</th>
            <td style={{ textAlign: 'left' }}>
              <Link href="/contact/">お問い合わせフォーム</Link>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>ゲームをどう作っているか</h2>
      <ul>
        <li>
          <strong>ルールの根幹を自動テストで守る</strong> —
          カードの移動可否、勝敗の判定、盤面の生成といったゲームのロジックは、画面とは別のファイルに切り出して実装し、800件以上の自動テストで検証しています。これが全部通らないと公開できない仕組みです
        </li>
        <li>
          <strong>「解けない問題」を出さない</strong> —
          ナンプレとノノグラムは答えが必ず1通りになる問題だけを出し、麻雀ソリティアは必ず最後まで消せる並びだけを配ります。マインスイーパーの初手が地雷にならないのも同じ考え方です
        </li>
        <li>
          <strong>名称は商標に配慮する</strong> —
          一般に別名で知られるゲームでも、登録商標にあたる名称は使わず、一般名称（ナンプレ・リバーシなど）で呼んでいます
        </li>
        <li>
          <strong>素材は自作する</strong> —
          花札の絵柄48枚を含め、ゲームの画像はこのサイトのために描き起こしたものです
        </li>
      </ul>

      <h2>スコアなどのデータの扱い</h2>
      <p>
        ゲームはすべてお使いのブラウザ内で動作し、ベストスコアや勝敗などの記録はブラウザの保存領域（localStorage）にのみ保存されます。サーバーには何も送信されません。詳しくは
        <Link href="/privacy/">プライバシーポリシー</Link>
        をご覧ください。
      </p>

      <h2>無料で公開できる理由</h2>
      <p>
        本サイトのゲームはすべて無料で、アイテム課金や会員登録もありません。運営費は広告（Google
        AdSense）でまかなっています。広告の表示よりゲームの遊びやすさを優先する方針で、盤面の中に広告を挟むことはしません。
      </p>

      <h2>誤りを見つけたらご連絡ください</h2>
      <p>
        ルールの誤りや動作の不具合に気づかれた場合は、
        <Link href="/contact/">お問い合わせフォーム</Link>
        からお知らせいただけると助かります。確認のうえ修正します。
      </p>
    </>
  );
}
