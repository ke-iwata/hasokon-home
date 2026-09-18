import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 学ぶ（learn）の footer のテスト。
 *
 * 仕様: docs/features/google-index-recovery.md（提案 C）
 *
 * learn の footer にだけ「運営者情報」へのリンクが無かった。
 * learn は URL検査の unknown 39件で最大のかたまりなので、ここが抜けると
 * 運営者情報を1枚にまとめた効果が薄れる（内部リンクが集まらない）。
 *
 * footer は layout.tsx にベタ書きなので、消えても画面の一番下が
 * 1リンク減るだけで気づきにくい。機械で見張る。
 */

const LAYOUT = readFileSync(fileURLToPath(new URL('../app/layout.tsx', import.meta.url)), 'utf8');

describe('learn の footer', () => {
  it('運営者情報（/about.html）へのリンクがある', () => {
    expect(LAYOUT).toContain('<a href="/about.html">運営者情報</a>');
  });

  it('プライバシーポリシーとお問い合わせへのリンクが残っている', () => {
    expect(LAYOUT).toContain('href="/privacy.html"');
    expect(LAYOUT).toContain('href="/tools/contact/"');
  });

  it('noindex にした運営者情報（/tools/about/・/games/about/）へリンクしていない', () => {
    expect(LAYOUT).not.toContain('/tools/about/');
    expect(LAYOUT).not.toContain('/games/about/');
  });
});
