import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { breadcrumbFor, breadcrumbList, breadcrumbTrail, HOME_URL } from '@/lib/jsonld';
import { games, SITE_NAME, SITE_URL } from '@/lib/registry';

/**
 * lib/jsonld.ts のパンくず（docs/features/breadcrumbs.md）のテスト。
 * 見張っている内容は tools/tests/jsonld.test.ts と同じ。
 *
 * 1. 末尾の段（現在地）に item を付けないこと
 * 2. 名前を registry から引くこと（ページ側で手書きしない）
 * 3. ゲームを1本足したらパンくずも付いてくること
 */

const appDir = fileURLToPath(new URL('../app/', import.meta.url));

describe('breadcrumbTrail', () => {
  it('一覧ページ自身は2段で、末尾（一覧）はリンクにしない', () => {
    expect(breadcrumbTrail()).toEqual([
      { name: 'ホーム', url: HOME_URL },
      { name: SITE_NAME },
    ]);
  });

  it('個別ページは ホーム ＞ サイト名 ＞ 現在地 の3段になる', () => {
    expect(breadcrumbTrail('リバーシ')).toEqual([
      { name: 'ホーム', url: HOME_URL },
      { name: SITE_NAME, url: `${SITE_URL}/`, path: '/' },
      { name: 'リバーシ' },
    ]);
  });

  it('ホームは basePath の外なので path を持たない（<a> で飛ばすため）', () => {
    const [home, site] = breadcrumbTrail('ナンプレ');
    expect(home.path).toBeUndefined();
    expect(home.url).toBe('https://hasokon.com/');
    expect(site.path).toBe('/');
    expect(site.url).toBe('https://hasokon.com/games/');
  });
});

describe('breadcrumbFor', () => {
  it('名前を registry から引く（ページ側で手書きしない）', () => {
    for (const game of games) {
      const trail = breadcrumbFor(game.slug);
      expect(trail).toHaveLength(3);
      expect(trail[2]).toEqual({ name: game.name });
    }
  });

  it('registry に無い slug は投げる（ビルドで気づけるようにする）', () => {
    expect(() => breadcrumbFor('reversy')).toThrow(/registry/);
  });
});

describe('breadcrumbList', () => {
  const list = breadcrumbList(breadcrumbFor('reversi'));

  it('仕様書どおりの BreadcrumbList になる', () => {
    expect(list).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ホーム', item: 'https://hasokon.com/' },
        {
          '@type': 'ListItem',
          position: 2,
          name: '無料ミニゲーム集',
          item: 'https://hasokon.com/games/',
        },
        { '@type': 'ListItem', position: 3, name: 'リバーシ' },
      ],
    });
  });

  it('末尾の要素に item が無い', () => {
    const last = list.itemListElement[list.itemListElement.length - 1];
    expect(last).not.toHaveProperty('item');
  });

  it('position は1から連番で、item はすべて絶対URL', () => {
    for (const [i, el] of list.itemListElement.entries()) {
      expect(el.position).toBe(i + 1);
      if ('item' in el) expect(el.item).toMatch(/^https:\/\/hasokon\.com\//);
    }
  });

  it('一覧ページの2段でも末尾に item が付かない', () => {
    const top = breadcrumbList(breadcrumbTrail());
    expect(top.itemListElement).toHaveLength(2);
    expect(top.itemListElement[1]).toEqual({
      '@type': 'ListItem',
      position: 2,
      name: SITE_NAME,
    });
  });
});

describe('各ゲームページ', () => {
  it('registry のゲームはすべてパンくずを出している', () => {
    for (const game of games) {
      const src = readFileSync(`${appDir}${game.slug}/page.tsx`, 'utf8');
      expect(src, `${game.slug}: breadcrumbFor が無い`).toContain(`breadcrumbFor('${game.slug}')`);
      expect(src, `${game.slug}: <Breadcrumb> が無い`).toContain('<Breadcrumb trail={trail} />');
      expect(src, `${game.slug}: BreadcrumbList が @graph に無い`).toContain(
        'breadcrumbList(trail)'
      );
    }
  });

  it('JSON-LD の <script> は1ページに1枚のまま', () => {
    for (const game of games) {
      const src = readFileSync(`${appDir}${game.slug}/page.tsx`, 'utf8');
      expect(src.match(/type="application\/ld\+json"/g)).toHaveLength(1);
    }
  });
});
