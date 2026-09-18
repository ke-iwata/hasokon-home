import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_URL } from '@/lib/registry';
import { breadcrumbTrail } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';

/**
 * 運営者情報（旧）。
 *
 * 仕様: docs/features/google-index-recovery.md（提案 C）
 *
 * 本文はドメイン直下の `/about.html` に1枚へまとめた。このページは
 * 外部・旧URLからのリンクの受け皿として残すが、**`noindex` にして検索結果からは外す**。
 * 「近い作りの薄いページ」を自分で2枚抱えないための措置なので、本文は足さないこと。
 *
 * canonical は自己参照のまま（内容の違うページへ canonical を向けると
 * Google がそれを無視することが多く、結果が読めない）。301 も採らない
 * （home は素の静的HTMLで、CloudFront 関数の変更が要る）。
 */

const title = '運営者情報';
const description = `${SITE_NAME}の運営者情報は hasokon.com/about.html にまとめています。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/about/` },
  // registry に無い固定ページなので robotsFor() は通らない。ここで直接指定する
  robots: { index: false, follow: true },
};

// registry に無い固定ページなので、現在地の名前だけここで持つ
const trail = breadcrumbTrail('運営者情報');

export default function AboutPage() {
  return (
    <>
      <Breadcrumb trail={trail} />

      <h1>運営者情報</h1>
      <p className="lead">
        運営者情報は、サイト全体で1枚にまとめました。運営者の背景、制度に関わる計算機をどの資料にもとづいて作りどう検証しているか、このサイトでできないことは、下記のページをご覧ください。
      </p>
      <p>
        {/* home はこのアプリの basePath（/tools）の外なので <a> で絶対パスへ飛ばす */}
        <a href="/about.html">
          <strong>運営者情報（hasokon.com/about.html）</strong>
        </a>
      </p>
      <p>
        <a href="/privacy.html">プライバシーポリシー</a>
        ／<Link href="/contact/">お問い合わせ</Link>
      </p>
    </>
  );
}
