// IndexNow への通知スクリプトの振る舞い。
//
// 仕様: docs/features/indexnow.md
//
// 固定しているのは4つ。
//
// 1. **差分の抽出**（新規 / lastmod 変更 / 変更なし / 前のサイトマップが無ければ全件）。
//    「変わっていないURLを繰り返し送らない」がこのプロトコルの作法
// 2. **リクエスト本文**（host / key / keyLocation / urlList）
// 3. **鍵ファイルの中身＝ファイル名**の検査。ずれると全送信が403になり、
//    しかも終了コード0なので誰も気づかない
// 4. **送信に失敗しても ::warning:: を出して終了コードは 0**（デプロイを止めない）
//
// ネットワークは使わない（fetch も readFile も差し替えている）。

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { EXIT_FAILED, EXIT_OK, ENDPOINT, main, readBefore, selectChanged, verifyKey } from '../indexnow-submit.mjs';

const KEY = 'bd59c05dafed335478f48aefb1c0ec57';
const KEY_FILE = `home/${KEY}.txt`;

const INDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://hasokon.com/sitemap-home.xml</loc></sitemap>
  <sitemap><loc>https://hasokon.com/tools/sitemap.xml</loc></sitemap>
</sitemapindex>`;

/** `[url, lastmod]` の並びから urlset を作る */
const urlset = (...pairs) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pairs
  .map(([loc, lastmod]) => `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`)
  .join('\n')}
</urlset>`;

const AFTER = {
  'https://hasokon.com/sitemap.xml': INDEX_XML,
  'https://hasokon.com/sitemap-home.xml': urlset(['https://hasokon.com/', '2026-08-16']),
  'https://hasokon.com/tools/sitemap.xml': urlset(
    // 変わっていない
    ['https://hasokon.com/tools/nenshu-kabe/', '2026-08-01'],
    // lastmod が動いた
    ['https://hasokon.com/tools/saitei-chingin/', '2026-09-16'],
    // 新規（前のサイトマップに無い）
    ['https://hasokon.com/tools/ikuji-kyugyo-kyufu/', '2026-09-16'],
  ),
};

const BEFORE_FILES = {
  'sitemap-home.xml': urlset(['https://hasokon.com/', '2026-08-16']),
  'tools-sitemap.xml': urlset(
    ['https://hasokon.com/tools/nenshu-kabe/', '2026-08-01'],
    ['https://hasokon.com/tools/saitei-chingin/', '2026-09-09'],
  ),
};

/** 出力を溜め、fetch と fs を全部差し替えた deps を作る。 */
function harness(overrides = {}) {
  const stdout = [];
  const stderr = [];
  const posts = [];

  const deps = {
    fetch: async (url, init) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(init.body), headers: init.headers });
        return { ok: true, status: 200, text: async () => '' };
      }
      if (!(url in AFTER)) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: async () => AFTER[url] };
    },
    readFile: async (path) => {
      if (path === KEY_FILE) return `${KEY}\n`;
      const name = path.split('/').pop();
      if (name in BEFORE_FILES) return BEFORE_FILES[name];
      throw new Error(`ENOENT: ${path}`);
    },
    readdir: async (dir) => {
      if (dir === '/tmp/before') return Object.keys(BEFORE_FILES);
      throw new Error(`ENOENT: ${dir}`);
    },
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    ...overrides,
  };

  return { deps, stdout, stderr, posts, out: () => stdout.join('\n'), err: () => stderr.join('\n') };
}

const ARGV = ['--key-file', KEY_FILE, '--before', '/tmp/before'];

describe('verifyKey', () => {
  it('中身とファイル名（拡張子を除く）が一致すれば鍵を返す', () => {
    assert.equal(verifyKey(`home/${KEY}.txt`, `${KEY}\n`), KEY);
  });

  it('前後の空白は落とす', () => {
    assert.equal(verifyKey(`home/${KEY}.txt`, `  ${KEY}  \n`), KEY);
  });

  it('中身がファイル名と違えば落とす', () => {
    assert.throws(
      () => verifyKey(`home/${KEY}.txt`, '0123456789abcdef0123456789abcdef'),
      /ファイル名と違います/,
    );
  });

  it('鍵の形が不正なら落とす', () => {
    assert.throws(() => verifyKey('home/short.txt', 'short'), /形式が不正/);
    assert.throws(() => verifyKey('home/a b.txt', 'a b'), /形式が不正/);
  });

  it('空のファイルは落とす', () => {
    assert.throws(() => verifyKey(`home/${KEY}.txt`, ''), /形式が不正/);
  });
});

describe('selectChanged', () => {
  const after = [
    { loc: 'https://hasokon.com/a/', lastmod: '2026-09-16' },
    { loc: 'https://hasokon.com/b/', lastmod: '2026-08-01' },
    { loc: 'https://hasokon.com/c/', lastmod: '2026-09-16' },
  ];

  it('新規と lastmod が動いたURLだけを返す', () => {
    const before = new Map([
      ['https://hasokon.com/a/', '2026-09-09'], // 動いた
      ['https://hasokon.com/b/', '2026-08-01'], // 変わっていない
      // c は無い（新規）
    ]);
    assert.deepEqual(selectChanged(before, after), ['https://hasokon.com/a/', 'https://hasokon.com/c/']);
  });

  it('どれも変わっていなければ空', () => {
    const before = new Map(after.map((entry) => [entry.loc, entry.lastmod]));
    assert.deepEqual(selectChanged(before, after), []);
  });

  it('前のサイトマップが無ければ全件返す（送り漏れ側に倒さない）', () => {
    assert.deepEqual(
      selectChanged(null, after),
      after.map((entry) => entry.loc),
    );
  });

  it('lastmod が消えた・付いたも「動いた」として扱う', () => {
    const before = new Map([['https://hasokon.com/a/', null]]);
    assert.deepEqual(selectChanged(before, [{ loc: 'https://hasokon.com/a/', lastmod: '2026-09-16' }]), [
      'https://hasokon.com/a/',
    ]);
  });
});

describe('readBefore', () => {
  it('ディレクトリの *.xml を1つの対応表にまとめる', async () => {
    const h = harness();
    const before = await readBefore('/tmp/before', h.deps);
    assert.equal(before.get('https://hasokon.com/tools/saitei-chingin/'), '2026-09-09');
    assert.equal(before.get('https://hasokon.com/'), '2026-08-16');
    assert.equal(before.size, 3);
  });

  it('ディレクトリが無ければ null', async () => {
    const h = harness();
    assert.equal(await readBefore('/tmp/nope', h.deps), null);
  });

  it('XMLが1枚も無ければ null', async () => {
    const h = harness({ readdir: async () => ['README.md'] });
    assert.equal(await readBefore('/tmp/before', h.deps), null);
  });

  it('読めないファイルが混じっても、残りは読む', async () => {
    const h = harness({ readdir: async () => ['sitemap-home.xml', 'kowareta.xml'] });
    const before = await readBefore('/tmp/before', h.deps);
    assert.deepEqual([...before.keys()], ['https://hasokon.com/']);
  });
});

describe('main', () => {
  it('--help は説明を出して 0', async () => {
    const h = harness();
    assert.equal(await main(['--help'], h.deps), EXIT_OK);
    assert.match(h.out(), /使い方/);
  });

  it('--key-file が無ければ 2', async () => {
    const h = harness();
    assert.equal(await main([], h.deps), EXIT_FAILED);
    assert.match(h.err(), /--key-file は必須/);
  });

  it('知らないオプションは 2', async () => {
    const h = harness();
    assert.equal(await main(['--key-file', KEY_FILE, '--nope'], h.deps), EXIT_FAILED);
  });

  it('鍵ファイルを読めなければ ::error:: を出して 2', async () => {
    const h = harness({
      readFile: async () => {
        throw new Error('ENOENT');
      },
    });
    assert.equal(await main(ARGV, h.deps), EXIT_FAILED);
    assert.match(h.out(), /^::error::/m);
    assert.equal(h.posts.length, 0);
  });

  it('鍵の中身がファイル名と違えば送らずに 2', async () => {
    const h = harness({ readFile: async () => '0123456789abcdef0123456789abcdef' });
    assert.equal(await main(ARGV, h.deps), EXIT_FAILED);
    assert.match(h.out(), /::error::.*ファイル名と違います/);
    assert.equal(h.posts.length, 0);
  });

  it('新規と lastmod が動いたURLだけを、規定の本文でPOSTする', async () => {
    const h = harness();
    assert.equal(await main(ARGV, h.deps), EXIT_OK);

    assert.equal(h.posts.length, 1);
    assert.equal(h.posts[0].url, ENDPOINT);
    assert.deepEqual(h.posts[0].body, {
      host: 'hasokon.com',
      key: KEY,
      keyLocation: `https://hasokon.com/${KEY}.txt`,
      urlList: [
        'https://hasokon.com/tools/saitei-chingin/',
        'https://hasokon.com/tools/ikuji-kyugyo-kyufu/',
      ],
    });
    assert.match(h.posts[0].headers['content-type'], /application\/json/);
  });

  it('前のサイトマップが無ければ全件送る', async () => {
    const h = harness({ readdir: async () => [] });
    assert.equal(await main(ARGV, h.deps), EXIT_OK);
    assert.deepEqual(h.posts[0].body.urlList, [
      'https://hasokon.com/',
      'https://hasokon.com/tools/nenshu-kabe/',
      'https://hasokon.com/tools/saitei-chingin/',
      'https://hasokon.com/tools/ikuji-kyugyo-kyufu/',
    ]);
  });

  it('--before を渡さなければ全件送る', async () => {
    const h = harness();
    assert.equal(await main(['--key-file', KEY_FILE], h.deps), EXIT_OK);
    assert.equal(h.posts[0].body.urlList.length, 4);
  });

  it('変わっていなければ POST しない', async () => {
    const unchanged = {
      ...BEFORE_FILES,
      'tools-sitemap.xml': urlset(
        ['https://hasokon.com/tools/nenshu-kabe/', '2026-08-01'],
        ['https://hasokon.com/tools/saitei-chingin/', '2026-09-16'],
        ['https://hasokon.com/tools/ikuji-kyugyo-kyufu/', '2026-09-16'],
      ),
    };
    const h = harness({
      readFile: async (path) => {
        if (path === KEY_FILE) return KEY;
        const name = path.split('/').pop();
        if (name in unchanged) return unchanged[name];
        throw new Error('ENOENT');
      },
      readdir: async () => Object.keys(unchanged),
    });

    assert.equal(await main(ARGV, h.deps), EXIT_OK);
    assert.equal(h.posts.length, 0);
    assert.match(h.out(), /更新されたURLはありません/);
  });

  it('--dry-run は送らずに本文を出す', async () => {
    const h = harness();
    assert.equal(await main([...ARGV, '--dry-run'], h.deps), EXIT_OK);
    assert.equal(h.posts.length, 0);
    assert.equal(JSON.parse(h.out()).urlList.length, 2);
  });

  it('202 も成功として扱う', async () => {
    const h = harness();
    const base = h.deps.fetch;
    h.deps.fetch = async (url, init) => {
      const response = await base(url, init);
      return init?.method === 'POST' ? { ...response, status: 202 } : response;
    };
    assert.equal(await main(ARGV, h.deps), EXIT_OK);
    assert.doesNotMatch(h.out(), /::warning::/);
    assert.match(h.out(), /2 件を通知しました/);
  });

  it('403 が返っても ::warning:: を出すだけで 0（デプロイを止めない）', async () => {
    const h = harness();
    const base = h.deps.fetch;
    h.deps.fetch = async (url, init) => {
      const response = await base(url, init);
      return init?.method === 'POST' ? { ...response, ok: false, status: 403 } : response;
    };
    assert.equal(await main(ARGV, h.deps), EXIT_OK);
    assert.match(h.out(), /::warning::.*403/);
  });

  it('送信そのものが失敗しても ::warning:: を出すだけで 0', async () => {
    const h = harness();
    const base = h.deps.fetch;
    h.deps.fetch = async (url, init) => {
      if (init?.method === 'POST') throw new Error('ECONNRESET');
      return base(url, init);
    };
    assert.equal(await main(ARGV, h.deps), EXIT_OK);
    assert.match(h.out(), /::warning::.*ECONNRESET/);
  });

  it('サイトマップが1本も読めなければ ::warning:: を出して 0', async () => {
    const h = harness({ fetch: async () => ({ ok: false, status: 503, text: async () => '' }) });
    assert.equal(await main(ARGV, h.deps), EXIT_OK);
    assert.match(h.out(), /::warning::.*1件も取れませんでした/);
    assert.equal(h.posts.length, 0);
  });

  it('ホストが違うURLは送らない（鍵ファイルのホスト以外は受け付けられない）', async () => {
    const withForeign = {
      ...AFTER,
      'https://hasokon.com/sitemap-home.xml': urlset(
        ['https://hasokon.com/', '2026-09-16'],
        ['https://tool.hasokon.com/nenshu-kabe/', '2026-09-16'],
      ),
    };
    const h = harness({
      fetch: async (url, init) => {
        if (init?.method === 'POST') {
          h.posts.push({ url, body: JSON.parse(init.body) });
          return { ok: true, status: 200, text: async () => '' };
        }
        if (!(url in withForeign)) return { ok: false, status: 404, text: async () => '' };
        return { ok: true, status: 200, text: async () => withForeign[url] };
      },
    });

    assert.equal(await main(ARGV, h.deps), EXIT_OK);
    assert.ok(!h.posts[0].body.urlList.some((url) => url.startsWith('https://tool.')));
  });
});

// ここから下はスクリプトではなくリポジトリの中身を見ている。
// 鍵ファイルは「用途の分からない1枚」になりやすく、home/ を整理するときに
// 消されると全送信が403になる（しかも終了コード0なので気づけない）。
describe('home/ の鍵ファイル', () => {
  const repoRoot = new URL('../../', import.meta.url);
  const read = (path) => readFileSync(fileURLToPath(new URL(path, repoRoot)), 'utf8');
  const keyFiles = readdirSync(fileURLToPath(new URL('home/', repoRoot))).filter((name) =>
    /^[A-Za-z0-9-]{8,128}\.txt$/.test(name),
  );

  it('home/ に鍵ファイルが1枚ある', () => {
    assert.equal(keyFiles.length, 1, `home/ の鍵ファイル: ${keyFiles.join(', ') || 'なし'}`);
  });

  it('中身がファイル名（拡張子を除く）と一致する', () => {
    for (const name of keyFiles) {
      assert.equal(verifyKey(name, read(`home/${name}`)), name.slice(0, -'.txt'.length));
    }
  });

  it('deploy.yml が同じ鍵ファイルを指している', () => {
    const deploy = read('.github/workflows/deploy.yml');
    for (const name of keyFiles) {
      assert.ok(deploy.includes(`home/${name}`), `deploy.yml が home/${name} を指していません`);
    }
  });

  it('サイトの案内（llms.txt / sitemap-home.xml）には載せない', () => {
    for (const name of keyFiles) {
      const stem = name.slice(0, -'.txt'.length);
      assert.ok(!read('home/llms.txt').includes(stem));
      assert.ok(!read('home/sitemap-home.xml').includes(stem));
    }
  });

  it('robots.txt がクローラーを弾いていない（鍵ファイルを取りに来られる）', () => {
    assert.match(read('home/robots.txt'), /^\s*Allow:\s*\/\s*$/m);
    assert.doesNotMatch(read('home/robots.txt'), /^\s*Disallow:\s*\/\s*$/m);
  });
});
