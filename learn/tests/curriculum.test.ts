import { describe, expect, it } from 'vitest';
import {
  chapterBySlug,
  chapters,
  chaptersOfPart,
  neighborsOf,
  parts,
  publicChapters,
  robotsFor,
  writtenChapters,
  type PartId,
} from '@/lib/curriculum';

describe('カリキュラムの整合性', () => {
  it('slug が重複していない（URLがぶつかる）', () => {
    const slugs = chapters.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('slug はURLに使える形（英小文字・数字・ハイフンのみ）', () => {
    for (const c of chapters) {
      expect(c.slug, c.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('タイトル・説明が空でない', () => {
    for (const c of chapters) {
      expect(c.title.length, c.slug).toBeGreaterThan(0);
      expect(c.description.length, c.slug).toBeGreaterThan(0);
    }
  });

  it('すべての章が実在する部に属している', () => {
    const ids = new Set(parts.map((p) => p.id));
    for (const c of chapters) {
      expect(ids.has(c.part), `${c.slug} の part=${c.part}`).toBe(true);
    }
  });

  it('どの部にも章が1つ以上ある（空の見出しを目次に出さない）', () => {
    for (const p of parts) {
      expect(chaptersOfPart(p.id).length, p.id).toBeGreaterThan(0);
    }
  });

  it('章は部ごとにまとまって並んでいる（目次で部が2回出てこない）', () => {
    const seen: PartId[] = [];
    for (const c of chapters) {
      if (seen[seen.length - 1] !== c.part) seen.push(c.part);
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('本文のある章（wip以外）には updatedAt がある（sitemap の lastmod に要る）', () => {
    for (const c of writtenChapters) {
      expect(c.updatedAt, c.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('未執筆（wip）の章に updatedAt を書かない（書いた日と紛れる）', () => {
    for (const c of chapters.filter((c) => c.stage === 'wip')) {
      expect(c.updatedAt, c.slug).toBeUndefined();
    }
  });

  it('関連ツールの slug は tools のURLに使える形', () => {
    for (const c of chapters) {
      for (const t of c.tools ?? []) {
        expect(t, `${c.slug} の tools`).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });
});

describe('公開の段階（feature flags）', () => {
  it('publicChapters は stage が public のものだけ', () => {
    for (const c of publicChapters) expect(c.stage).toBe('public');
  });

  it('いまは全章が公開前（セクションごと preview の段階）', () => {
    // 公開するPRでこの前提は変わる。そのときはこのテストを書き換えること
    expect(publicChapters).toHaveLength(0);
  });

  it('robotsFor は public 以外に noindex を返す', () => {
    for (const c of chapters) {
      const robots = robotsFor(c.slug);
      if (c.stage === 'public') expect(robots).toBeUndefined();
      else expect(robots).toEqual({ index: false, follow: false });
    }
  });

  it('未登録の slug は投げる（黙って2段のパンくずにしない）', () => {
    expect(() => chapterBySlug('sonzai-shinai')).toThrow();
    expect(() => robotsFor('sonzai-shinai')).toThrow();
  });
});

describe('前後ナビ', () => {
  it('本文のある章だけをたどる（準備中の章へ入り込まない）', () => {
    const written = writtenChapters.map((c) => c.slug);
    for (const slug of written) {
      const { prev, next } = neighborsOf(slug);
      if (prev) expect(written).toContain(prev.slug);
      if (next) expect(written).toContain(next.slug);
    }
  });

  it('先頭に前は無く、末尾に次は無い', () => {
    const first = writtenChapters[0];
    const last = writtenChapters[writtenChapters.length - 1];
    expect(neighborsOf(first.slug).prev).toBeUndefined();
    expect(neighborsOf(last.slug).next).toBeUndefined();
  });

  it('前後がつながっている（AのnextがBなら、Bのprevは A）', () => {
    for (const c of writtenChapters) {
      const { next } = neighborsOf(c.slug);
      if (next) expect(neighborsOf(next.slug).prev?.slug).toBe(c.slug);
    }
  });

  it('未執筆の章から引くと空になる（ページが無いので当然）', () => {
    const todo = chapters.find((c) => c.stage === 'wip');
    expect(todo).toBeDefined();
    expect(neighborsOf(todo!.slug)).toEqual({});
  });
});

describe('運営者への要望が体系に入っているか', () => {
  // 「デイトレードや仮想通貨、実践的な話もいれて。
  //  できれば資格につながるくらいの内容も欲しいけど実践メインで」への対応。
  // 章を消したり別のものに置き換えたときに気づけるようにしておく
  it('デイトレード・暗号資産・資格の章がある', () => {
    for (const slug of ['day-trade', 'ango-shisan', 'ango-zeikin', 'shikaku']) {
      expect(() => chapterBySlug(slug)).not.toThrow();
    }
  });

  it('実践（第4部）がいちばん厚い', () => {
    const counts = parts.map((p) => chaptersOfPart(p.id).length);
    const practice = chaptersOfPart('practice').length;
    expect(practice).toBe(Math.max(...counts));
  });

  it('資格タグは決められた値だけを使う', () => {
    const allowed = new Set(['gaimuin2', 'fp3', 'fp2']);
    for (const c of chapters) {
      for (const s of c.shikaku ?? []) expect(allowed.has(s), `${c.slug}: ${s}`).toBe(true);
    }
  });

  it('資格タグの付いた章が複数の部にまたがっている（第5部の対応表が作れる）', () => {
    const tagged = chapters.filter((c) => (c.shikaku ?? []).length > 0);
    expect(tagged.length).toBeGreaterThan(5);
    expect(new Set(tagged.map((c) => c.part)).size).toBeGreaterThan(1);
  });
});

describe('保守のしかた（volatility）', () => {
  it('制度・税金の章はすべて annual（年1回の点検対象）', () => {
    for (const c of chaptersOfPart('system')) {
      expect(c.volatility, c.slug).toBe('annual');
    }
  });

  it('原理の章（第1部）に annual を混ぜない', () => {
    // 「古びない部分と古びる部分を分ける」のが学習セクションの前提
    // （docs/features/learn-toshi.md）。ここが崩れると毎年の更新対象が膨らむ
    for (const c of chaptersOfPart('basics')) {
      expect(c.volatility, c.slug).not.toBe('annual');
    }
  });
});
