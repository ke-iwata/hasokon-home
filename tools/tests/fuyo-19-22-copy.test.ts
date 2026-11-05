import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 「19〜22歳の150万円」を学生だけのものとして書く文面が戻ってこないかの見張り。
 *
 * 社会保険の150万円・特定親族特別控除（159万・197万円）は年齢だけが要件で、
 * 学生であることは求めない（日本年金機構 Q&A）。学生で決まるのは勤労学生控除（163万円）と
 * 昼間部の適用除外だけで、163万円のラベルは「（勤労学生）」にしてある。
 * docs/features/fuyo-19-22sai-nenrei-kijun.md
 */
const root = fileURLToPath(new URL('../', import.meta.url));
const FILES = [
  'app/nenshu-kabe/page.tsx',
  'app/hatarakizon/page.tsx',
  'lib/nenshu-kabe.ts',
  'lib/hatarakizon.ts',
  // 2026-11-04 点検で追加（10-12 にはまだ無かったツール。docs/features/kokai-tool-seikaku-2026-11-04.md A2）
  'app/taishokugo-kenko-hoken/page.tsx',
  'lib/taishokugo-kenko-hoken.ts',
];

const FORBIDDEN = ['19〜22歳の学生は150万円', '学生の扶養認定基準', '（学生）'];

describe('19〜22歳の基準を「学生だけ」と書かない', () => {
  for (const file of FILES) {
    const text = readFileSync(root + file, 'utf8');
    for (const phrase of FORBIDDEN) {
      it(`${file} に「${phrase}」が無い`, () => {
        expect(text).not.toContain(phrase);
      });
    }
  }

  it('「（学生）」の見張りは「（勤労学生）」を誤検知しない', () => {
    expect('163万円の壁（勤労学生）').not.toContain('（学生）');
    expect(readFileSync(root + 'lib/nenshu-kabe.ts', 'utf8')).toContain('163万円の壁（勤労学生）');
  });

  it('両ページの出典に日本年金機構の Q&A（学生要件なし）がある', () => {
    for (const file of ['app/nenshu-kabe/page.tsx', 'app/hatarakizon/page.tsx']) {
      expect(readFileSync(root + file, 'utf8')).toContain(
        'https://www.nenkin.go.jp/section/faq/kounen/dependents/aged19to22/student.html'
      );
    }
  });

  it('退職後の健康保険 比較の本文と FAQ に「19歳以上23歳未満（配偶者を除く）は150万円未満」がある', () => {
    const page = readFileSync(root + 'app/taishokugo-kenko-hoken/page.tsx', 'utf8');
    expect(page).toContain('19歳以上23歳未満（配偶者を除く）は150万円未満');
    const faq = page.slice(page.indexOf("q: '失業保険をもらうと扶養から外れる？'"));
    expect(faq.slice(0, 600)).toContain('19歳以上23歳未満（配偶者を除く）は150万円未満');
    expect(page).toContain('https://www.nenkin.go.jp/oshirase/taisetu/2025/202508/0819.html');
  });
});
