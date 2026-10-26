import { publicTools, SITE_NAME, tools } from './registry';

/**
 * 一覧ページ（/tools/）の title・description。
 *
 * 仕様: docs/features/ichiran-page-title-refresh.md
 *
 * - **名前を挙げるツールは slug で持つ。** 表示は短い名前（registry の `name` は
 *   「ふるさと納税 控除額計算機」のように長く、title の30字に入らない）。
 *   挙げたツールが `wip` / `preview` に戻ったら `tests/hub-metadata.test.ts` が落とす
 * - **本数は `publicTools` から出す**
 * - たばこ税・酒税は着地の上位だが、「値上げ」は時期で古びる語なので title に入れず description に回す
 */

/** title に名前を挙げるツール（直近の着地の上位から、時期で古びないもの） */
export const HUB_TITLE_TOOLS: { slugs: string[]; label: string }[] = [
  { slugs: ['nenrei-keisan'], label: '年齢' },
  { slugs: ['furusato-nozei'], label: 'ふるさと納税' },
  { slugs: ['yoikuhi-keisan'], label: '養育費' },
  { slugs: ['saitei-chingin'], label: '最低賃金' },
];

/** description の例示 */
export const HUB_DESCRIPTION_TOOLS: { slugs: string[]; label: string }[] = [
  { slugs: ['nenrei-keisan'], label: '年齢計算' },
  { slugs: ['furusato-nozei'], label: 'ふるさと納税' },
  { slugs: ['yoikuhi-keisan'], label: '養育費' },
  { slugs: ['saitei-chingin'], label: '最低賃金' },
  { slugs: ['tabako-zei-neage', 'shuzei-kaisei'], label: 'たばこ税と酒税の改正' },
];

/** 名前を挙げたツールの slug をすべて（テスト用） */
export const HUB_NAMED_TOOLS: string[] = [...HUB_TITLE_TOOLS, ...HUB_DESCRIPTION_TOOLS].flatMap((t) => t.slugs);

// registry に無い slug はビルドで落とす（綴り違いを黙って通さない）
for (const slug of HUB_NAMED_TOOLS) {
  if (!tools.some((t) => t.slug === slug)) throw new Error(`hub-metadata: registry に無い slug: ${slug}`);
}

export const HUB_TITLE = `${SITE_NAME}｜${HUB_TITLE_TOOLS.map((t) => t.label).join('・')}を計算`;

export const HUB_DESCRIPTION = `${HUB_DESCRIPTION_TOOLS.map((t) => t.label).join('・')}など、暮らしと仕事のお金を計算する無料ツール${publicTools.length}本。すべてブラウザ内で完結し、入力データは送信されません。`;
