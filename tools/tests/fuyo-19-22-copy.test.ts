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
});
