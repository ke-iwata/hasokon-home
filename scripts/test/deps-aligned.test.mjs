import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * tools / games / learn の lockfile で、Next.js まわりの版が揃っているかを見張るテスト。
 *
 * 仕様: docs/features/dependency-vulnerability-audit.md の A-3
 *
 * 3 アプリの package.json は同じ範囲（^16.x）を書いているのに、npm install を回した時期の違いで
 * lockfile が 16.2.12／16.3.0／16.3.4 にばらけていた（2026-10-03）。「上げる」が誰の仕事でもないと
 * drift するので、lockfile の実際の版を比べて落とす。
 */

const repoRoot = new URL('../../', import.meta.url);
const APPS = ['tools', 'games', 'learn'];
const ALIGNED = ['next', 'react', 'react-dom', 'sharp'];

/** lockfile（lockfileVersion 3）から、トップレベルに入っているパッケージの版を読む */
export function lockedVersion(lock, name) {
  return lock.packages?.[`node_modules/${name}`]?.version;
}

/** アプリごとの版を見比べて、揃っていない依存の説明を返す（揃っていれば空配列） */
export function findMisaligned(locks, names) {
  const problems = [];
  for (const name of names) {
    const versions = Object.fromEntries(
      Object.entries(locks).map(([app, lock]) => [app, lockedVersion(lock, name)]),
    );
    if (new Set(Object.values(versions)).size > 1) {
      const detail = Object.entries(versions)
        .map(([app, v]) => `${app}=${v ?? '(無し)'}`)
        .join('／');
      problems.push(`${name}: ${detail}`);
    }
  }
  return problems;
}

const readLock = (app) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`${app}/package-lock.json`, repoRoot)), 'utf8'));

describe('findMisaligned', () => {
  const lock = (versions) => ({
    packages: Object.fromEntries(
      Object.entries(versions).map(([n, v]) => [`node_modules/${n}`, { version: v }]),
    ),
  });

  it('同じ版なら何も返さない', () => {
    assert.deepEqual(
      findMisaligned({ a: lock({ next: '16.3.8' }), b: lock({ next: '16.3.8' }) }, ['next']),
      [],
    );
  });

  it('版がずれていればアプリごとの版を並べて返す', () => {
    assert.deepEqual(
      findMisaligned({ a: lock({ next: '16.2.12' }), b: lock({ next: '16.3.8' }) }, ['next']),
      ['next: a=16.2.12／b=16.3.8'],
    );
  });

  it('片方にだけ入っているのもずれとして数える', () => {
    assert.deepEqual(
      findMisaligned({ a: lock({ sharp: '0.35.5' }), b: lock({}) }, ['sharp']),
      ['sharp: a=0.35.5／b=(無し)'],
    );
  });
});

describe('3 アプリの lockfile', () => {
  const locks = Object.fromEntries(APPS.map((app) => [app, readLock(app)]));

  it(`${ALIGNED.join('・')} の版が tools / games / learn で一致している`, () => {
    const problems = findMisaligned(locks, ALIGNED);
    const nextVersion = APPS.map((app) => lockedVersion(locks[app], 'next')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1);
    assert.deepEqual(
      problems,
      [],
      `lockfile の版が揃っていない:\n  ${problems.join('\n  ')}\n` +
        `tools・games・learn の 3 つで \`npm install next@^${nextVersion}\` と ` +
        '`npm update sharp` を回して揃える（docs/features/dependency-vulnerability-audit.md の A-1）',
    );
  });

  it('next は 3 アプリとも lockfile に入っている', () => {
    for (const app of APPS) assert.ok(lockedVersion(locks[app], 'next'), `${app} に next が無い`);
  });
});
