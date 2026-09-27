import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 結果パネル周辺のリンク色のコントラスト（docs/features/mobile-lighthouse-third-party.md の D）。
 *
 * 出典リンクは `.panel` の中の `.hint`（--fs-xs の小さい字）に入るので、WCAG AA の 4.5 が要る。
 * `--accent`（#15803d）は `--surface-2`（#f3f1ed）に対して 4.44 で、Lighthouse の color-contrast で落ちていた。
 */
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

/** `:root` の最初のブロック（ライト）と、ダークモードの `:root` ブロックからトークンを読む */
function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2].toLowerCase()]),
  );
}
const light = tokens(/:root\s*\{([^}]*)\}/.exec(css)![1]);
const dark = tokens(/prefers-color-scheme:\s*dark[^{]*\{\s*:root\s*\{([^}]*)\}/.exec(css)![1]);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('結果パネル内のリンク色', () => {
  it('.panel a / .hint a は --accent-strong で描く', () => {
    const rule = /\.panel a,\s*\.hint a\s*\{([^}]*)\}/.exec(css);
    expect(rule, '.panel a, .hint a のルールが無い').not.toBeNull();
    expect(rule![1]).toMatch(/color:\s*var\(--accent-strong\)/);
  });

  it('回帰: --accent のままだと --surface-2 の地で AA（4.5）に届かない', () => {
    expect(contrast(light['--accent'], light['--surface-2'])).toBeLessThan(4.5);
  });

  it.each([
    ['ライト', light, '--surface-2'],
    ['ライト', light, '--accent-soft'],
    ['ダーク', dark, '--surface-2'],
    ['ダーク', dark, '--accent-soft'],
  ])('%s：--accent-strong は %s の地で 4.5 以上', (_mode, t, bg) => {
    expect(contrast(t['--accent-strong'], t[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
