import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 公開中ツールの正確さの点検（2026-10-19）の B・C。
 *
 * 仕様: docs/features/kokai-tool-seikaku-2026-10-19.md
 * （A の消費税計算機は tests/shohizei.test.ts が見ている）
 *
 * ネットワークには出ない（外部の都合で CI が落ちるため。仕様の「やらないこと」）。
 * 404 を確かめた URL がソースに戻ってこないことと、言い方だけを見る。
 */

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');
}

describe('B. 出典リンク切れ（2026-10-19 に 404 を確認した URL）', () => {
  const dead: [string, string][] = [
    ['lib/saitei-chingin.ts', 'oita-roudoukyoku/content/contents/002798644.pdf'],
    ['app/hatarakizon/page.tsx', 'hokenryo/hoshu/20120817.html'],
    ['lib/shaho-grades.ts', 'https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20120817.html'],
    ['lib/shukuhakuzei.ts', 'daijindoui_houdouhappyou.pdf'],
    ['app/shukuhakuzei/page.tsx', 'daijindoui_houdouhappyou.pdf'],
    ['lib/kogaku-ryoyohi.ts', 'sb3030/sbb3037/'],
  ];

  it.each(dead)('%s が 404 の URL（%s）を指していない', (file, url) => {
    expect(read(file)).not.toContain(url);
  });

  it('大分の最低賃金の出典は PDF 直リンクではなく報道発表の HTML', () => {
    // tools/CLAUDE.md：労働局は PDF を差し替えると URL が変わる
    expect(read('lib/saitei-chingin.ts')).toContain(
      'https://jsite.mhlw.go.jp/oita-roudoukyoku/news_topics/topics/saichin_toushin_r8.html',
    );
  });

  it('年金機構の標準報酬月額は転送先の URL で書く', () => {
    const url = 'https://www.nenkin.go.jp/section/faq/kounen/hyoujunhoushu/20140602-02.html';
    expect(read('app/hatarakizon/page.tsx')).toContain(url);
    expect(read('lib/shaho-grades.ts')).toContain(url);
  });
});

describe('C. 「復興特別所得税2.1%」の言い方', () => {
  /**
   * 2027年分からは復興特別所得税1.1%＋防衛特別所得税1.0%（合計2.1%）。
   * iDeCo の改正後の枠も退職金も2027年分以後にかかるので、
   * 「復興特別所得税2.1%」と呼ぶと税目の名前が合わない（額は同じ）。
   */
  it.each(['app/ideco/page.tsx', 'app/taishokukin-tedori/Calculator.tsx'])(
    '%s が「復興特別所得税2.1%」と書いていない',
    (file) => {
      const source = read(file);
      expect(source).not.toContain('復興特別所得税2.1%');
      expect(source).toContain('防衛特別所得税');
    },
  );

  it('退職金のコメントの復興特別所得税の終わりは2047年分', () => {
    const source = read('lib/taishokukin.ts');
    expect(source).not.toContain('2037年分');
    expect(source).toContain('2047年分');
  });
});
