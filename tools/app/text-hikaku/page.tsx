import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, webApplication } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { INVISIBLE_CHARS } from '@/lib/invisible-chars';
import { MAX_LINES, MAX_CHARS } from '@/lib/text-hikaku';
import Calculator from './Calculator';

// 仕様: docs/features/text-hikaku.md

const title = 'テキスト比較｜2つの文章の差分を色分けチェック（日本語の文字単位・送信なし）';
const description =
  '2つの文章を貼るだけで追加・削除・変更を色分け。日本語は変わった文字まで示します。全角半角・空白の違いを無視、見えない文字の検出、次の違いへジャンプ。入力は送信しません。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/text-hikaku/` },
  robots: robotsFor('text-hikaku'),
};

const nf = new Intl.NumberFormat('ja-JP');

const faq = [
  {
    q: '見た目は同じなのに「違う」と出るのはなぜ？',
    a: '見えない文字が混ざっていることがほとんどです。全角スペース（U+3000）・ノーブレークスペース（U+00A0）・ゼロ幅スペース（U+200B）・タブは、画面では半角スペースや何もない所と見分けがつきません。このツールは違いの中にこれらがあると、その位置に ␣（全角スペース）・⍽（ノーブレークスペース）・[ZWSP]（ゼロ幅スペース）・⇥（タブ）などの印を出し、上に「違いに見えない文字が含まれています」と知らせます。改行コード（Windows の CRLF と Mac・Linux の LF）の違いは比較では同じとみなし、違うことだけを1行で知らせます。',
  },
  {
    q: 'Word や PDF の文書は比べられますか？',
    a: '本文をコピーして貼れば比べられます。比べるのは文字だけで、書式（太字・色・フォント）・表の罫線・図は比べません。PDF からコピーすると行の途中で改行が入ることがあるので、両方とも同じ方法でコピーすると余計な違いが出にくくなります。書式の変更まで追いたい場合や、変更履歴として相手に返したい場合は、Word の「比較」機能のほうが向いています。',
  },
  {
    q: 'Excel の 2 つの列を比べたいときは？',
    a: '列をコピーして左右に貼ると、1 セルが 1 行になります。名簿や品番の一覧の突き合わせに使えます。並び順が違うと順番の違いも「削除＋追加」として出るので、Excel で同じキーで並べ替えてから貼ってください。セルの前後の空白が気になるときは「空白の違いを無視」を入れます。',
  },
  {
    q: '順番が入れ替わっただけの行はどう出ますか？',
    a: '入れ替わった行は、元の位置で「削除」、新しい位置で「追加」として出ます。いまのところ行の移動を見分ける機能はありません。',
  },
  {
    q: '比べた内容はどこかに残りますか？',
    a: '残りません。比較はお使いのブラウザの中（JavaScript）だけで行い、貼った文章や読み込んだファイルをサーバーに送る処理はこのページにありません。保存もしないので、タブを閉じれば消えます。契約書・人事の文書・顧客名簿を貼っても外に出ません。',
  },
];

const trail = breadcrumbFor('text-hikaku');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    webApplication({ name: 'テキスト比較（差分チェック）', slug: 'text-hikaku', description }),
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

      <h1>テキスト比較（差分チェック）</h1>
      {/* 日本語の文中で改行すると半角スペースが入ってしまうため、1文を1行に収めている */}
      <p className="lead">
        <strong>貼った文章・読み込んだファイルはこのブラウザの中だけで比べ、どこにも送らず、保存もしません。</strong>
        2つの文章を左右に貼るだけで、追加・削除・変更を色分けします。日本語は単語の区切りが無いので、変わった行の中の「変わった文字」まで示します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>使い方</h2>
      <ol>
        <li>左に元の文章、右に新しい文章を貼ります（「ファイルを読む」でテキストファイルも読み込めます）。</li>
        <li>入力が止まるとすぐに比べます。上に「追加◯行・削除◯行・変更◯行」と文字数の増減が出ます。</li>
        <li>「次の違い」（キーボードの n）・「前の違い」（p）で違いの場所へ移れます。長い文章は「変わった行だけ表示」で同じ行を畳めます。</li>
        <li>「結果をコピー」で、行頭に − と ＋ の付いた形（unified 形式）のテキストをコピーできます。メールやチャットにそのまま貼れます。</li>
      </ol>
      <p>
        使いどころの例：契約書・規程の改訂前後の確認、原稿の修正前後の見比べ、名簿・品番の一覧の突き合わせ、設定ファイルの新旧の確認。
      </p>

      <h2>行と文字の2段階で比べる</h2>
      <p>
        まず行どうしの対応を取り（Myers の差分アルゴリズム。最も少ない追加・削除で説明できる対応）、削除と追加が隣り合う行で中身が4割以上同じものを「変更」として組にします。組にした行の中を、もう一度<strong>1文字ずつ</strong>比べて、変わった文字だけを濃く塗ります。英語向けの比較ツールは空白で単語に区切るため、日本語の文では「行全体が変わった」としか出ないことがあります。
      </p>
      <p>
        文字は「見た目の1文字」（書記素）で数えるので、絵文字や「か」＋濁点のような組み合わせの文字を途中で割りません。
      </p>

      <h2>無視できる違い</h2>
      <table>
        <thead>
          <tr>
            <th>スイッチ</th>
            <th>同じとみなすもの</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>空白の違いを無視</td>
            <td style={{ textAlign: 'left' }}>行頭・行末の空白。続いた空白（半角・全角・タブ・ノーブレークスペース）は1つとみなす</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>全角・半角を区別しない</td>
            <td style={{ textAlign: 'left' }}>
              ＡＢＣ と ABC、１ と 1、ガ と ｶﾞ、全角スペースと半角スペース（<Link href="/hankaku-zenkaku/">半角⇔全角 変換</Link>と同じ対応表。① と 1、㈱ と (株) は別の文字のまま）
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>大文字・小文字を区別しない</td>
            <td style={{ textAlign: 'left' }}>A〜Z と a〜z（全角の英字は「全角・半角」と一緒に入れたときだけ）</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>空行を無視</td>
            <td style={{ textAlign: 'left' }}>空白だけの行（比べずに薄い色で残す）</td>
          </tr>
        </tbody>
      </table>
      <p>
        無視して比べたときも、<strong>表示は貼ったときの文字のまま</strong>です。比べるために直した文字を見せることはありません。
      </p>

      <h2>見えない文字の印</h2>
      <p>違いの中に次の文字があると、その位置に印を出します。</p>
      <table>
        <thead>
          <tr>
            <th>印</th>
            <th>文字</th>
            <th>よく混ざる場面</th>
          </tr>
        </thead>
        <tbody>
          {INVISIBLE_CHARS.map((c) => (
            <tr key={c.char}>
              <td>{c.mark}</td>
              <td style={{ textAlign: 'left' }}>
                {c.name}（U+{c.char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}）
              </td>
              <td style={{ textAlign: 'left' }}>{SCENES[c.char] ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>扱える大きさ</h2>
      <p>
        片側 {nf.format(MAX_CHARS)} 字・{nf.format(MAX_LINES)} 行まで比べられます。両方を合わせて 2 万字までは入力が止まると自動で比べ、それより長いときは「比較する」ボタンで比べます。違う行が 5,000 行を超えるときは、ブラウザが固まらないよう比べずに「違いが多すぎます」と出します。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <p>
        比べたあと文字数を数えるときは<Link href="/mojisu-count/">文字数カウント</Link>、全角スペースや全角英数字をまとめて直すときは
        <Link href="/hankaku-zenkaku/">半角⇔全角 変換</Link>が使えます。
      </p>

      <AdUnit position="below-faq" />

      <RelatedTools current="text-hikaku" />

      <ToolMeta slug="text-hikaku">
        差分は E. W. Myers「An O(ND) Difference Algorithm and Its Variations」（Algorithmica, 1986）の方法で、当サイトが
        {' '}
        <a href="https://github.com/google/diff-match-patch" target="_blank" rel="nofollow noopener noreferrer">
          diff-match-patch
        </a>
        （© Google、Apache License 2.0）の中央の分割の手順を元に実装しました。比較はすべてお使いのブラウザの中で行い、外部のサービスとの通信はありません。
      </ToolMeta>
    </>
  );
}

/** 見えない文字がよく混ざる場面 */
const SCENES: Record<string, string> = {
  '　': '日本語入力のままスペースを打ったとき・Word や Excel から貼ったとき',
  ' ': 'Web ページや HTML メールからコピーしたとき',
  '​': 'Web ページ・チャット・SNS からコピーしたとき',
  '‌': '一部の言語の文字やWebページからコピーしたとき',
  '‍': '絵文字の組み合わせ（家族の絵文字など）の部品',
  '﻿': 'Windows のメモ帳などで保存したファイルの先頭',
  '\t': 'Excel のセルを横にコピーしたとき・コードの字下げ',
};
