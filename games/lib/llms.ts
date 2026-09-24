/**
 * `/games/llms.txt`（AIアシスタント向けのゲームの一覧）を組み立てる。
 *
 * 仕様: [docs/features/ai-assistant-channel.md](../../docs/features/ai-assistant-channel.md) の B。
 *
 * **`home/llms.txt` は入口だけの案内板**で、個々のゲームの行と最終更新日はこちらが持つ。
 * `home/` にはビルド工程が無く、手書きの日付は必ず腐るため（同仕様書 B-3）。
 *
 * **一覧は `publicGames` を通す**（CLAUDE.md の約束）。`games` を直に filter しないこと。
 * llms.txt は `robots` と別経路なので `noindex` では止まらず、
 * 公開前のゲームがそのままAIアシスタントに配られる（同仕様書 B-2）。
 */
import { publicGames, SITE_URL, type GameDef } from './registry';

/** ルートドメイン。他セクションの llms.txt を指すのに使う */
export const HOME_URL = 'https://hasokon.com';

/** 箇条書き1行。説明のうしろに、ルール・設定の手がかりと最終更新日を添える */
export function entryLine(
  name: string,
  url: string,
  description: string,
  extras: string[] = [],
): string {
  const tail = extras.length > 0 ? `（${extras.join('／')}）` : '';
  return `- [${name}](${url}): ${description}${tail}`;
}

/**
 * ゲーム1行。**AI経由の流入1位が大富豪**（仕様書 B-1）なのに、
 * 対応しているルールが本文にしか無かったので、registry の `keywords` を並べる。
 */
function gameLine(g: GameDef): string {
  const extras: string[] = [];
  if (g.keywords && g.keywords.length > 0) extras.push(`ルール・設定: ${g.keywords.join('・')}`);
  extras.push(`最終更新 ${g.updatedAt}`);
  return entryLine(g.name, `${SITE_URL}/${g.slug}/`, g.description, extras);
}

/**
 * `/games/llms.txt` の中身。[llmstxt.org](https://llmstxt.org/) の形
 * （H1 → 要約の引用 → H2セクションごとのリンク集）。
 */
export function buildLlmsTxt(): string {
  const lines: string[] = [
    '# 無料ミニゲーム集（hasokon.com/games/）',
    '',
    '> hasokon.com のゲームセクション。トランプ・パズル・ボードゲームなどの定番を、' +
      '登録不要・インストール不要・無料でブラウザから遊べる。すべてブラウザの中だけで動き、' +
      '記録も端末に保存される。各行の「ルール・設定」は、そのゲームが対応している' +
      'ローカルルールや難易度の切り替え。「最終更新」は中身を最後に直した日。',
    '',
    '## ゲーム',
    '',
    ...publicGames.map(gameLine),
    '',
    '## サイト情報',
    '',
    entryLine('無料ミニゲーム集 トップ', `${SITE_URL}/`, 'ゲームの一覧'),
    entryLine('お問い合わせ', 'https://hasokon.com/tools/contact/', '誤りの指摘・要望の連絡先'),
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
      '学ぶの一覧（llms.txt）',
      `${HOME_URL}/learn/llms.txt`,
      '公開中の分野と章を1行説明と最終更新日つきで並べたもの',
    ),
    '',
  ];

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
