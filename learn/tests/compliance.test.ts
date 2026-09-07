import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writtenChapters } from '@/lib/curriculum';

/**
 * 編集方針を機械で見張るテスト。
 *
 * このサイトは**投資助言・代理業の登録をしていない**ので、
 * 個別銘柄の推奨も売買時期の助言もできない。断定的判断の提供も禁止されている
 * （金商法38条2号）。仕様は docs/features/learn-toshi.md の「守ること」。
 *
 * 章が増えるほど書き手（人でもAIでも）が線を越えやすくなるので、
 * **文章そのものを検査する**。文言の目視確認に頼らない。
 */

const appDir = fileURLToPath(new URL('../app/', import.meta.url));

const pages = [
  ...writtenChapters.map((c) => ({
    name: c.slug,
    src: readFileSync(`${appDir}${c.slug}/page.tsx`, 'utf8'),
  })),
  { name: '目次', src: readFileSync(`${appDir}page.tsx`, 'utf8') },
];

/**
 * JSXのタグと属性を落として、読者が読む地の文だけにする。
 *
 * **鉤括弧の中は落とす。** 詐欺の手口を説明する章では
 * 「必ず儲かる」「元本保証」といった**勧誘文句を引用する必要がある**。
 * 引用と主張を区別しないと、注意喚起の章が書けなくなる。
 * 自分の主張としてこれらを書くときは鉤括弧に入れないので、この線引きで足りる。
 */
function proseOf(src: string): string {
  const body = src.replace(/^[\s\S]*?export default function/, '');
  return body
    .replace(/className="[^"]*"/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/「[^」]*」/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('断定的判断を提供しない（金商法38条2号）', () => {
  // 「必ず儲かる」の類。将来の成果を約束する言い回しを置かない
  const banned = [
    '必ず儲か',
    '確実に儲か',
    '絶対に儲か',
    '損はしません',
    '元本は保証',
    '元本保証です',
    '必ず値上がり',
    '確実に増えます',
    '間違いなく上がり',
  ];

  it.each(pages)('$name に断定的な言い回しが無い', ({ src }) => {
    const prose = proseOf(src);
    for (const phrase of banned) {
      expect(prose.includes(phrase), `「${phrase}」が本文にある`).toBe(false);
    }
  });
});

describe('個別の推奨をしない', () => {
  // 買い時・売り時の助言に読める言い回し
  const banned = ['いま買うべき', '今が買い時', '買い時です', '売り時です', '狙い目です'];

  it.each(pages)('$name に売買時期の助言が無い', ({ src }) => {
    const prose = proseOf(src);
    for (const phrase of banned) {
      expect(prose.includes(phrase), `「${phrase}」が本文にある`).toBe(false);
    }
  });

  it.each(pages)('$name に民間の個別商品名・証券会社名が無い', ({ src }) => {
    // 運営者の判断で、公的なもの・指数は実名、民間の個別商品は出さない。
    // 実在の商品名・金融機関名が入り込んだら落とす
    const prose = proseOf(src);
    const banned = [
      'eMAXIS',
      'ニッセイ',
      'たわらノーロード',
      'SBI証券',
      'SBI・',
      '楽天証券',
      '楽天・',
      'マネックス',
      'auカブコム',
      '松井証券',
      'GMOクリック',
      'ひふみ',
      'セゾン投信',
    ];
    for (const phrase of banned) {
      expect(prose.includes(phrase), `「${phrase}」が本文にある`).toBe(false);
    }
  });
});

describe('制度の数字には確かめる導線を添える', () => {
  it('制度の章には一次資料を見るよう促す但し書きがある', () => {
    // 改正で古びる章は、書いてある数字をそのまま信じさせない
    for (const c of writtenChapters.filter((c) => c.volatility === 'annual')) {
      const prose = proseOf(readFileSync(`${appDir}${c.slug}/page.tsx`, 'utf8'));
      const hasCaveat =
        prose.includes('改正で変わ') || prose.includes('最新の数字') || prose.includes('確かめて');
      expect(hasCaveat, `${c.slug} に確認を促す記述が無い`).toBe(true);
    }
  });
});

describe('免責が全ページに出る', () => {
  it('Chapter は引数なしの Disclaimer を必ず描画する', () => {
    const src = readFileSync(`${appDir}_chapter/Chapter.tsx`, 'utf8');
    // 条件つきで出す形にすると、いつか false が渡って消える
    expect(src).toMatch(/<Disclaimer\s*\/>/);
    expect(src).not.toMatch(/\{[^}]*&&\s*<Disclaimer/);
  });

  it('Disclaimer は章ごとに文言を変えられない（引数を取らない）', () => {
    const src = readFileSync(`${appDir}_chapter/Chapter.tsx`, 'utf8');
    expect(src).toMatch(/export function Disclaimer\(\)/);
  });

  it('免責に、助言をしないことと成果を約束しないことが書いてある', () => {
    const src = readFileSync(`${appDir}_chapter/Chapter.tsx`, 'utf8');
    expect(src).toContain('助言は行いません');
    expect(src).toContain('約束するものでもありません');
  });

  it('目次ページにも免責が出る（章を開かずに離脱する人がいる）', () => {
    const src = readFileSync(`${appDir}page.tsx`, 'utf8');
    expect(src).toMatch(/<Disclaimer\s*\/>/);
  });
});

describe('本文の体裁', () => {
  it.each(pages)('$name にハングル・キリル文字が混ざっていない', ({ src }) => {
    // 生成時のタイプミスで別の文字体系が紛れ込むことがある
    expect(src).not.toMatch(/[가-힯ᄀ-ᇿЀ-ӿ]/);
  });

  it.each(pages)('$name に書きかけの目印が残っていない', ({ src }) => {
    for (const marker of ['TODO', 'FIXME', 'あとで書く', 'XXX']) {
      expect(src.includes(marker), `「${marker}」が残っている`).toBe(false);
    }
  });
});
