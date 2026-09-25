/**
 * `/tools/llms.txt`（AIアシスタント向けのツールの一覧）を組み立てる。
 *
 * 仕様: [docs/features/ai-assistant-channel.md](../../docs/features/ai-assistant-channel.md) の B。
 *
 * **`home/llms.txt` は入口だけの案内板**で、個々のツールの行と最終更新日はこちらが持つ。
 * `home/` にはビルド工程が無く、手書きの日付は必ず腐るため（同仕様書 B-3）。
 *
 * **一覧は `publicTools` を通す**（CLAUDE.md の約束）。`tools` を直に filter しないこと。
 * llms.txt は `robots` と別経路なので `noindex` では止まらず、
 * 公開前のツールがそのままAIアシスタントに配られる（同仕様書 B-2）。
 */
import { categories, publicTools, SITE_URL, type ToolDef } from './registry';

/** ルートドメイン。他セクションの llms.txt を指すのに使う */
export const HOME_URL = 'https://hasokon.com';

/**
 * 箇条書き1行。説明のうしろに最終更新日を添える。
 * 制度の計算機は「いつ時点の法令か」が引用できるかどうかを分ける（仕様書の背景 4）。
 */
export function entryLine(
  name: string,
  url: string,
  description: string,
  updatedAt?: string,
): string {
  return `- [${name}](${url}): ${description}${updatedAt ? `（最終更新 ${updatedAt}）` : ''}`;
}

function toolLine(t: ToolDef): string {
  return entryLine(t.name, `${SITE_URL}/${t.slug}/`, t.description, t.updatedAt);
}

/**
 * `/tools/llms.txt` の中身。[llmstxt.org](https://llmstxt.org/) の形
 * （H1 → 要約の引用 → H2セクションごとのリンク集）で、セクションは registry の分類に合わせる。
 */
export function buildLlmsTxt(): string {
  const lines: string[] = [
    '# 無料計算ツール集（hasokon.com/tools/）',
    '',
    '> hasokon.com のツールセクション。税金・社会保険など法改正に追随した計算機を、' +
      '登録不要・無料で公開している。計算はすべてブラウザの中で完結し、' +
      '入力した内容をサーバーに送信しない。制度に関わる計算機は法令・官公庁の一次資料にもとづき、' +
      '各ページに出典と最終更新日を載せている。各行の「最終更新」は、' +
      'その計算機の中身を最後に直した日。',
    '',
  ];

  for (const category of categories) {
    const tools = publicTools.filter((t) => t.category === category);
    if (tools.length === 0) continue;
    lines.push(`## ${category}`, '', ...tools.map(toolLine), '');
  }

  lines.push(
    '## サイト情報',
    '',
    entryLine('無料計算ツール集 トップ', `${SITE_URL}/`, 'ツールの一覧（分類別）'),
    entryLine('お問い合わせ', `${SITE_URL}/contact/`, '誤りの指摘・要望の連絡先'),
    entryLine(
      'サイト全体の案内（llms.txt）',
      `${HOME_URL}/llms.txt`,
      'hasokon.com 全体の入口。ツール・ゲーム・学ぶの3セクションを指す',
    ),
    entryLine(
      'ゲームの一覧（llms.txt）',
      `${HOME_URL}/games/llms.txt`,
      '公開中のミニゲームを1行説明と最終更新日つきで並べたもの',
    ),
    entryLine(
      '学ぶの一覧（llms.txt）',
      `${HOME_URL}/learn/llms.txt`,
      '公開中の分野と章を1行説明と最終更新日つきで並べたもの',
    ),
    '',
  );

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
