import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tools } from '@/lib/registry';

/**
 * 全ツールが `tool_use` を送っているかのテスト。
 *
 * 仕様: docs/features/tool-use-coverage.md の B
 *
 * ページビューだけでは「開かれたが使われなかった」が分からない。
 * 2026-10〜11 に公開中の23本が1件も送っておらず、tools の PV の半分近くが
 * 測れなくなっていた。`stage` を問わず全エントリを見る（wip のうちに書かせる）。
 *
 * 入力値を送っていないか（`${income}` など）は字面で見分けられないので、ここでは見ない。
 * action は文字列の直書きにして、レビューで見る。
 */

const appDir = fileURLToPath(new URL('../app/', import.meta.url));

/**
 * UI が `app/{slug}/` 以外にあるツール。3本だけ。
 * ここに無い slug は `app/{slug}/` を見る
 */
const UI_DIR: Record<string, string> = {
  roulette: '_roulette',
  group: '_roulette',
  dice: '_roulette',
};

function uiDir(slug: string): string {
  return join(appDir, UI_DIR[slug] ?? slug);
}

/** ディレクトリ配下の .tsx をすべて集める */
function tsxFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

/** 1ファイルの中で `trackToolUse` に渡している slug をすべて返す */
export function trackedSlugs(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/trackToolUse\(\s*(['"])([^'"]+)\1/g)) {
    found.push(m[2]);
  }
  if (/trackToolUse\(\s*SLUG\b/.test(source)) {
    const decl = source.match(/const\s+SLUG\s*=\s*(['"])([^'"]+)\1/);
    // SLUG を使っているのに宣言が見つからないときは、空文字で「不明」として返す
    found.push(decl ? decl[2] : '');
  }
  return found;
}

function slugsUsedIn(dir: string): string[] {
  return tsxFiles(dir).flatMap((path) => trackedSlugs(readFileSync(path, 'utf8')));
}

describe('trackedSlugs（検出の仕組み）', () => {
  it('直書きの slug を拾う', () => {
    expect(trackedSlugs(`trackToolUse('furusato-nozei', 'input-income')`)).toEqual(['furusato-nozei']);
  });

  it('const SLUG と trackToolUse(SLUG の組を拾う', () => {
    const src = `const SLUG = 'ideco';\n onBlur={() => trackToolUse(SLUG, 'input-monthly')}`;
    expect(trackedSlugs(src)).toEqual(['ideco']);
  });

  it('呼んでいなければ空', () => {
    expect(trackedSlugs(`import { trackToolUse } from '@/lib/analytics';`)).toEqual([]);
  });

  it('SLUG を使っているのに宣言が無ければ「不明」を返す', () => {
    expect(trackedSlugs(`trackToolUse(SLUG, 'copy')`)).toEqual(['']);
  });
});

describe('全ツールが trackToolUse を呼んでいる', () => {
  it('registry の全エントリ（stage を問わない）が、自分の slug で1回以上呼んでいる', () => {
    const missing = tools
      .map((t) => t.slug)
      .filter((slug) => !slugsUsedIn(uiDir(slug)).includes(slug));
    expect(
      missing,
      `trackToolUse を呼んでいないツール: ${missing.join(', ')}\n` +
        'ボタンが無いツールは主要な入力欄の onBlur で呼ぶ（docs/features/tool-use-coverage.md）',
    ).toEqual([]);
  });

  it('別のツールの slug を渡していない（コピペの打ち間違い）', () => {
    const wrong: string[] = [];
    const dirs = new Map<string, Set<string>>();
    for (const { slug } of tools) {
      const dir = uiDir(slug);
      if (!dirs.has(dir)) dirs.set(dir, new Set());
      dirs.get(dir)!.add(slug);
    }
    for (const [dir, allowed] of dirs) {
      for (const used of slugsUsedIn(dir)) {
        if (!allowed.has(used)) {
          wrong.push(`${dir.slice(appDir.length)} → '${used}'（期待: ${[...allowed].join(' / ')}）`);
        }
      }
    }
    expect(wrong, `slug が違う trackToolUse:\n${wrong.join('\n')}`).toEqual([]);
  });
});
