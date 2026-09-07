import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveSources, sourceById, sources, SOURCE_KIND_LABEL } from '@/lib/sources';
import { writtenChapters } from '@/lib/curriculum';

const appDir = fileURLToPath(new URL('../app/', import.meta.url));

/** 章ページ（app/{slug}/page.tsx）の中身を読む */
function pageSource(slug: string): string {
  return readFileSync(`${appDir}${slug}/page.tsx`, 'utf8');
}

/** ページが Chapter に渡している sources の配列からIDを取り出す */
function referencedIds(slug: string): string[] {
  const src = pageSource(slug);
  const m = src.match(/sources=\{\[([^\]]*)\]\}/s);
  if (!m) throw new Error(`${slug}: Chapter に sources を渡していない`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('参考文献のマスター', () => {
  it('IDが重複していない', () => {
    const ids = sources.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('タイトルと発行元が空でない', () => {
    for (const s of sources) {
      expect(s.title.length, s.id).toBeGreaterThan(0);
      expect(s.publisher.length, s.id).toBeGreaterThan(0);
    }
  });

  it('確認日が YYYY-MM-DD で、未来の日付でない', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const s of sources) {
      expect(s.checkedAt, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.checkedAt <= today, `${s.id} の確認日が未来`).toBe(true);
    }
  });

  it('URLは https（リンク先で混在コンテンツにしない）', () => {
    for (const s of sources) {
      if (s.url) expect(s.url, s.id).toMatch(/^https:\/\//);
    }
  });

  it('同じURLを2つのIDで持たない（重複した文献ができる）', () => {
    const urls = sources.filter((s) => s.url).map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('種別のラベルがすべて定義されている', () => {
    for (const s of sources) {
      expect(SOURCE_KIND_LABEL[s.kind], s.id).toBeTruthy();
    }
  });

  it('一次資料（官公庁・業界団体）にはURLがある', () => {
    // 論文・書籍はURLが無くてよいが、公開されている一次資料はリンクできるはず
    for (const s of sources.filter((s) => s.kind === 'gov' || s.kind === 'org')) {
      expect(s.url, `${s.id} にURLが無い`).toBeTruthy();
    }
  });

  it('論文・書籍には著者がある', () => {
    for (const s of sources.filter((s) => s.kind === 'paper' || s.kind === 'book')) {
      expect(s.author, `${s.id} に著者が無い`).toBeTruthy();
    }
  });

  it('未登録のIDを引くと投げる（黙って空の脚注にしない）', () => {
    expect(() => sourceById('sonzai-shinai')).toThrow(/sonzai-shinai/);
  });

  it('resolveSources は重複を取り除き、一次資料を先に並べる', () => {
    const list = resolveSources(['malkiel-random-walk', 'fsa-nisa', 'fsa-nisa', 'jsda-study']);
    expect(list.map((s) => s.id)).toEqual(['fsa-nisa', 'jsda-study', 'malkiel-random-walk']);
  });
});

describe('章と参考文献のつながり', () => {
  it('本文のある章はすべて参考文献を挙げている（出典なしの章を作らない）', () => {
    for (const c of writtenChapters) {
      expect(referencedIds(c.slug).length, `${c.slug} に参考文献が無い`).toBeGreaterThan(0);
    }
  });

  it('章が参照しているIDはすべてマスターに登録されている', () => {
    for (const c of writtenChapters) {
      for (const id of referencedIds(c.slug)) {
        expect(() => sourceById(id), `${c.slug} → ${id}`).not.toThrow();
      }
    }
  });

  it('制度に触れる章は官公庁の資料を挙げている', () => {
    // NISA・税金のように改正で変わる話は、解説ではなく一次資料を根拠にする
    for (const c of writtenChapters.filter((c) => c.volatility === 'annual')) {
      const kinds = resolveSources(referencedIds(c.slug)).map((s) => s.kind);
      expect(kinds, `${c.slug} に官公庁の出典が無い`).toContain('gov');
    }
  });

  it('マスターに登録した文献は、どこかの章から参照されている（死蔵しない）', () => {
    // 参照されていない文献は、書きかけの章のために先に足したものか、
    // 章から参照を消したときの取り残し。前者なら章を書くまで足さない
    const used = new Set(writtenChapters.flatMap((c) => referencedIds(c.slug)));
    const unused = sources.filter((s) => !used.has(s.id)).map((s) => s.id);
    // 【許容リスト】これから書く章のために置いてある文献はここに書く。
    // 章を書いたらこのリストから外すこと
    const plannedFor: string[] = [
      'fsa-warning', // 34章 詐欺の見分け方
      'nta-1476', // 20章 特定口座
      'mof-jgb', // 8章 債券
      'jsda-gaimuin', // 35章 資格
      'toushin-basic', // 9章 投資信託
      'gpif-portfolio', // 4章 分散投資
      'markowitz-1952', // 4章 分散投資
      'barber-odean-2000', // 29章 短期売買
      'barber-2014-daytrade', // 29章 短期売買
      'bengen-1994', // 33章 出口戦略
    ];
    expect(unused.sort()).toEqual(plannedFor.sort());
  });
});
