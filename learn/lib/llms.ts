/**
 * `/learn/llms.txt`（AIアシスタント向けの章の一覧）を組み立てる。
 *
 * 仕様: [docs/features/ai-assistant-channel.md](../../docs/features/ai-assistant-channel.md) の B。
 *
 * **`home/llms.txt` は入口だけの案内板**で、個々の章の行と最終更新日はこちらが持つ。
 * `home/` にはビルド工程が無く、手書きの日付は必ず腐るため（同仕様書 B-3）。
 *
 * **一覧は `publicSubjects` / `publicChapters` を通す**（CLAUDE.md の約束）。
 * `subjects` / `chapters` を直に filter しないこと。llms.txt は `robots` と別経路なので、
 * `noindex` では止まらず、公開前の章がそのままAIアシスタントに配られる。
 */
import {
  chapterUrl,
  parts,
  publicChapters,
  publicSubjects,
  SITE_URL,
  subjectUrl,
  type ChapterDef,
  type SubjectDef,
} from './curriculum';

/** ルートドメイン。他セクションの llms.txt を指すのに使う */
export const HOME_URL = 'https://hasokon.com';

/**
 * 箇条書き1行。説明のうしろに最終更新日を添える。
 * 制度の章は「いつ時点の法令か」が引用できるかどうかを分ける（仕様書の背景 4）。
 */
export function entryLine(name: string, url: string, description: string, updatedAt?: string): string {
  const stamp = updatedAt ? `（最終更新 ${updatedAt}）` : '';
  return `- [${name}](${url}): ${description}${stamp}`;
}

function chapterLine(c: ChapterDef): string {
  return entryLine(c.title, chapterUrl(c), c.description, c.updatedAt);
}

function subjectLine(s: SubjectDef): string {
  return entryLine(s.name, subjectUrl(s.slug), s.description, s.updatedAt);
}

/** 分野1つぶん。部（第1部〜）ごとにセクションを分ける */
function subjectSections(subject: SubjectDef): string[] {
  const out: string[] = [];
  for (const part of parts.filter((p) => p.subject === subject.slug)) {
    const chapters = publicChapters.filter(
      (c) => c.subject === subject.slug && c.part === part.id,
    );
    if (chapters.length === 0) continue;
    out.push(
      `## ${subject.name}｜${part.label} ${part.title}`,
      '',
      part.lead,
      '',
      ...chapters.map(chapterLine),
      '',
    );
  }
  return out;
}

/**
 * `/learn/llms.txt` の中身。[llmstxt.org](https://llmstxt.org/) の形
 * （H1 → 要約の引用 → H2セクションごとのリンク集）。
 */
export function buildLlmsTxt(): string {
  const lines: string[] = [
    '# 学ぶ（hasokon.com/learn/）',
    '',
    '> hasokon.com の読み物セクション。分野ごとに章立てで、登録不要・無料で読める。' +
      '記述の根拠は各章の末尾に一次資料へのリンクつきで並べている。' +
      '投資助言・代理業の登録はしていないため、個別銘柄の推奨や売買時期の助言は含まない。' +
      '各行の「最終更新」は、その章の中身を最後に直した日。',
    '',
    '## 分野',
    '',
    ...publicSubjects.map(subjectLine),
    '',
  ];

  for (const subject of publicSubjects) lines.push(...subjectSections(subject));

  lines.push(
    '## サイト情報',
    '',
    entryLine('学ぶ トップ', `${SITE_URL}/`, '分野の一覧。ここが学習セクションの入口'),
    entryLine(
      'サイト全体の案内（llms.txt）',
      `${HOME_URL}/llms.txt`,
      'hasokon.com 全体の入口。ツール・ゲーム・学ぶの3セクションを指す',
    ),
    entryLine(
      'ツールの一覧（llms.txt）',
      `${HOME_URL}/tools/llms.txt`,
      '公開中の計算ツールを1行説明と最終更新日つきで並べたもの',
    ),
    entryLine(
      'ゲームの一覧（llms.txt）',
      `${HOME_URL}/games/llms.txt`,
      '公開中のミニゲームを1行説明と最終更新日つきで並べたもの',
    ),
    '',
  );

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
