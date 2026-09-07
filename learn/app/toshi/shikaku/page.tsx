import type { Metadata } from 'next';
import Link from 'next/link';
import Chapter from '../../_chapter/Chapter';
import {
  chapterBySlug,
  chapterPath,
  chapterUrl,
  chaptersOfSubject,
  partsOfSubject,
  robotsFor,
} from '@/lib/curriculum';

const chapter = chapterBySlug('shikaku');

export const metadata: Metadata = {
  title: `${chapter.title}｜投資の教科書`,
  description: chapter.description,
  alternates: { canonical: chapterUrl(chapter) },
  robots: robotsFor(chapter.slug),
};

/**
 * 資格タグの表示名。
 * **対応表は curriculum.ts の `shikaku` から自動で作る。**
 * 手書きの表を置くと、章を足したときに更新を忘れる。
 */
const LABEL = {
  gaimuin2: '証券外務員二種',
  fp3: 'FP3級',
  fp2: 'FP2級',
} as const;

type Tag = keyof typeof LABEL;

export default function Page() {
  const all = chaptersOfSubject(chapter.subject);
  const chaptersFor = (tag: Tag) => all.filter((c) => (c.shikaku ?? []).includes(tag));

  return (
    <Chapter slug="shikaku" sources={['jsda-gaimuin', 'fsa-guide', 'jsda-study']}>
      <p>
        ここまでの34章は、資格試験の範囲とかなり重なっています。
        <strong>資格を取ることが目的ではありません</strong>が、
        <strong>体系の抜けを確かめる物差し</strong>としては使えます。
        自分がどこを知らないかは、自分では気づきにくいからです。
      </p>

      <p className="note">
        <strong>試験の範囲・出題形式・実施要領は改定されます。</strong>
        この章は2026年9月時点の整理です。受験を考える場合は、
        日本証券業協会や日本FP協会・きんざいの案内で最新の内容を確かめてください。
      </p>

      <h2>3つの資格の性格</h2>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>証券外務員二種</th>
              <th>FP3級</th>
              <th>FP2級</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>誰のための資格か</th>
              <td>証券会社などで金融商品を扱う人</td>
              <td>個人の生活設計全般</td>
              <td>同左。より実務的</td>
            </tr>
            <tr>
              <th>投資の扱い</th>
              <td>
                <strong>商品と制度を深く</strong>
              </td>
              <td>6分野のうちの1つ</td>
              <td>同左。踏み込む</td>
            </tr>
            <tr>
              <th>この教科書との重なり</th>
              <td>第2部・第4部</td>
              <td>第1部・第3部</td>
              <td>第1部・第3部＋不動産</td>
            </tr>
            <tr>
              <th>投資以外の範囲</th>
              <td>法令・倫理・株式業務</td>
              <td>年金・保険・税・不動産・相続</td>
              <td>同左</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note">
        <strong>どちらも「投資がうまくなる資格」ではありません。</strong>
        外務員は金融商品を<strong>売る側</strong>に必要な知識、
        FPは<strong>生活設計全体</strong>のなかで金融を扱う知識です。
        運用の腕とは別のものだと理解したうえで使ってください。
      </p>

      <h2>この教科書の章との対応</h2>

      <p>
        各章に付けた印から、資格ごとの対応表を作っています
        （<strong>章を足すと自動で反映されます</strong>）。
        未執筆の章は準備中と表示されます。
      </p>

      {(Object.keys(LABEL) as Tag[]).map((tag) => {
        const list = chaptersFor(tag);
        return (
          <section key={tag}>
            <h3>
              {LABEL[tag]}（{list.length}章）
            </h3>
            <ul>
              {list.map((c) => {
                const part = partsOfSubject(c.subject).find((p) => p.id === c.part);
                return (
                  <li key={c.slug}>
                    <span className="chart-tick">{part?.label}</span>{' '}
                    {c.stage === 'wip' ? (
                      <>
                        {c.title}
                        <span className="chapter-todo">準備中</span>
                      </>
                    ) : (
                      <Link href={chapterPath(c)}>{c.title}</Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <h2>この教科書で足りないところ</h2>

      <p>
        <strong>資格の範囲には、この教科書が扱っていない分野があります。</strong>
        投資に絞っているので当然ですが、抜けを自覚しておくのは有用です。
      </p>

      <ul>
        <li>
          <strong>証券外務員</strong>——協会規則・法令遵守・倫理、
          株式業務の実務、財務諸表の読み方、経済指標
        </li>
        <li>
          <strong>FP</strong>——公的年金、健康保険、生命保険・損害保険の実務、
          住宅ローン、相続・贈与、不動産の法令
        </li>
      </ul>

      <p>
        このうち<strong>公的年金・健康保険・税</strong>は、
        投資の判断にも直接効きます。
        当サイトの<a href="/tools/">計算ツール</a>には、
        年金・社会保険・税金の計算機が揃っているので、
        数字を動かしながら確かめられます。
      </p>

      <h2>順番の提案</h2>

      <ol>
        <li>
          <strong>先にこの教科書を通す。</strong>
          原理から入っているので、試験範囲を暗記ではなく理解で覚えられます
        </li>
        <li>
          <strong>FP3級で全体像を確かめる。</strong>
          投資以外（年金・保険・税・相続）を含めた地図が手に入ります
        </li>
        <li>
          <strong>必要に応じて先へ。</strong>
          商品と制度を深く知りたいなら外務員二種、
          生活設計を仕事にするならFP2級
        </li>
      </ol>

      <p className="note">
        <strong>資格を取っても、投資助言はできません。</strong>
        他人に個別の投資助言を業として行うには
        <strong>投資助言・代理業の登録</strong>が必要です。
        外務員資格は、登録を受けた金融商品取引業者に所属して業務を行うためのものです。
        この区別は、勧誘を受ける側としても知っておく価値があります（第4部34章）。
      </p>

      <h2>まとめ</h2>

      <ul>
        <li>資格は「投資がうまくなる」ものではなく、体系の抜けを確かめる物差し</li>
        <li>外務員二種は商品と制度、FPは生活設計全体のなかの金融</li>
        <li>各章の印から対応表を自動生成している</li>
        <li>公的年金・健康保険・税はこの教科書の範囲外だが、投資の判断に効く</li>
        <li>資格を取っても、登録なしに投資助言はできない</li>
      </ul>
    </Chapter>
  );
}
