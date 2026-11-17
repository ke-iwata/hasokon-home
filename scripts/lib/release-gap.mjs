// 「直したのに本番が古い」を数えるための純粋関数と、git の読み取り。
//
// 仕様: docs/features/honban-release-gap-2026-11-16.md の B
//
// 最後の `v*` タグ以降に main に入った `feat:` のコミットを、
// 本番で見えるものに効くかどうかで 4 区分（＋どれにも効かない other）に分ける。
// **git の履歴と registry の字面だけから数える**（ラベル運用はしない。仕様書の C）。
// 依存パッケージは増やさない（scripts/ の約束）。

import { execFileSync } from 'node:child_process';

/** `public-fix` が本番に届かないまま、これを超えたら warning にする（日） */
export const DEFAULT_MAX_DAYS = 3;

/** 件名にこれを含む `feat:` は「公開中ページの誤りの修正」とみなす */
export const FIX_KEYWORDS = Object.freeze(['正確さ', '誤り', 'ずれ', '条文']);

/** 区分。並びは Job Summary に出す順 */
export const CATEGORIES = Object.freeze(['public-fix', 'public-update', 'deps', 'unlisted', 'other']);

export const CATEGORY_LABELS = Object.freeze({
  'public-fix': '本番に届いていない公開中ページの修正（public-fix）',
  'public-update': '公開中ページの更新（public-update）',
  deps: '依存の更新（deps）',
  unlisted: '公開前のもの（unlisted）',
  other: '本番のページに効かないもの（other）',
});

export const SHALLOW_WARNING =
  '::warning::履歴が shallow のため、リリースの遅れを数えられません（checkout の fetch-depth を確認）';

const PACKAGE_FILES = new Set(['package.json', 'package-lock.json']);

/**
 * registry の読み取り結果から、アプリごとの slug → stage の表を作る。
 *
 * @param {{kind: string, slug: string, stage: string}[]} entries
 *   `loadRegistries()` と `loadChapters()` の結果を並べたもの
 */
export function buildStageIndex(entries) {
  /** @type {Record<string, Map<string, string>>} */
  const slugs = {};
  /** @type {Record<string, boolean>} */
  const hasPublic = {};
  for (const e of entries) {
    slugs[e.kind] ??= new Map();
    slugs[e.kind].set(e.slug, e.stage);
    if (e.stage === 'public') hasPublic[e.kind] = true;
  }
  return { slugs, hasPublic };
}

/**
 * 新しいツール・ゲームを足すたびに 1〜2 行ずつ増えるだけの「台帳」のファイル。
 *
 * 公開前のものを足す PR はほぼ必ずここを触るので、`lib/` を一律に安全側へ倒すと
 * 公開前の追加がすべて `public-update` に化ける（表が読めなくなる）。
 * そのため**このファイルだけでは区分を決めない**：同じコミットが slug のファイルを
 * 触っていればそちらに従い、台帳だけを触ったとき（`stage` を上げた など）は公開中扱い。
 */
export const LEDGER_FILES = Object.freeze([
  'tools/lib/registry.ts',
  'games/lib/registry.ts',
  'learn/lib/curriculum.ts',
  'tools/app/ToolIcon.tsx',
  'games/app/GameIcon.tsx',
  'tools/app/globals.css',
  'games/app/globals.css',
]);

/** `lib/` のファイル名（拡張子を除く）・ディレクトリ名に一致する slug。いちばん長いもの */
function slugOfLibName(name, slugs) {
  let best;
  for (const slug of slugs.keys()) {
    if ((name === slug || name.startsWith(`${slug}-`)) && (!best || slug.length > best.length)) {
      best = slug;
    }
  }
  return best;
}

/**
 * 1 ファイルの変更が、本番で見えるものにどう効くか。
 *
 * @returns {'public' | 'unlisted' | 'deps' | 'ledger' | 'none'}
 */
export function fileEffect(path, index, { added = false } = {}) {
  if (path.startsWith('home/')) return 'public';
  if (LEDGER_FILES.includes(path)) return 'ledger';

  const parts = path.split('/');
  const [app, dir, seg] = parts;
  if (!['tools', 'games', 'learn'].includes(app)) return 'none';
  if (parts.length === 2 && PACKAGE_FILES.has(dir)) return 'deps';

  // ビルドに入らないもの（テスト・docs・各アプリのスクリプト・README など）
  if (!['app', 'lib', 'public'].includes(dir) || !seg) return 'none';

  const shared = () => (index.hasPublic[app] ? 'public' : 'unlisted');
  const byStage = (stage) => (stage === 'public' ? 'public' : 'unlisted');
  // learn の章は `app/<slug>/` ではなく curriculum のデータで持っているので、
  // learn の app / lib / public はまとめて「learn の本文」として扱う
  if (app === 'learn') return shared();

  const slugs = index.slugs[app] ?? new Map();
  if (dir === 'app' && slugs.has(seg)) return byStage(slugs.get(seg));
  if (dir === 'lib') {
    // `lib/yukyu-fuyo.ts`・`lib/chess-puzzles.ts`・`lib/nonogram/` のように
    // 名前が slug で始まるものは、その slug の段階に従う（名前の字面だけ。import はたどらない）
    const name = seg.replace(/\.[^.]+$/, '');
    const slug = slugOfLibName(name, slugs);
    if (slug) return byStage(slugs.get(slug));
  }
  // `app/layout.tsx`・`app/_cards/`・`lib/rounding.ts` など、slug に結びつかない共通のもの。
  // import はたどらない（仕様書 B-1）。安全側で公開中扱いにする。
  // ただし**そのコミットで新しく足したファイル**は、まだ誰も import していないので
  // 公開中のページを変えられない（変えるなら公開中のファイルも同じコミットで触る）。台帳と同じ扱い
  if (added) return 'ledger';
  return shared();
}

/** 件名が「誤りの修正」を名乗っているか */
export function isFixSubject(subject) {
  return FIX_KEYWORDS.some((k) => subject.includes(k));
}

/**
 * コミット 1 本の区分を決める。
 *
 * - 公開中のものに 1 ファイルでも効けば `public-*`（`wip` と両方触っていても安全側で public）
 * - そうでなく、公開前のものだけに効けば `unlisted`（台帳のファイルはそちらに従う）
 * - 台帳のファイルだけなら `public-*`
 * - package.json / package-lock.json だけなら `deps`
 * - どれにも効かない（scripts/・docs/・テストだけ など）なら `other`
 *
 * @param {{subject: string, files: string[], added?: string[]}} commit
 *   `added` はそのコミットで新しく足したファイル（`git show --name-status` の `A`）
 */
export function classifyCommit({ subject, files, added = [] }, index) {
  const addedSet = new Set(added);
  const effects = new Set(files.map((f) => fileEffect(f, index, { added: addedSet.has(f) })));
  const pub = () => (isFixSubject(subject) ? 'public-fix' : 'public-update');
  if (effects.has('public')) return pub();
  if (effects.has('unlisted')) return 'unlisted';
  // 台帳だけを触った（`stage` を上げた・アイコンを描き直した など）。安全側で公開中扱い
  if (effects.has('ledger')) return pub();
  if (effects.has('deps')) return 'deps';
  return 'other';
}

/** squash の件名末尾の `(#NNN)` から PR 番号を取る。無ければ null */
export function prNumberOf(subject) {
  const m = subject.match(/\(#(\d+)\)\s*$/);
  return m ? Number(m[1]) : null;
}

/** 表に出す識別子。PR 番号があれば `#NNN`、無ければ短い SHA */
export function refLabel({ subject, sha }) {
  const pr = prNumberOf(subject);
  return pr === null ? sha.slice(0, 7) : `#${pr}`;
}

/** 日時を JST の暦日（YYYY-MM-DD）にする */
export function jstDate(iso) {
  const ms = new Date(iso).getTime() + 9 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** JST の暦日で数えた日数（`2026-11-05` に入って `2026-11-08` に数えたら 3） */
export function jstDaysBetween(fromIso, toIso) {
  const day = (iso) => Date.parse(`${jstDate(iso)}T00:00:00Z`);
  return Math.round((day(toIso) - day(fromIso)) / 86_400_000);
}

/** 表に出す件名。`feat:` と末尾の `(#NNN)` は ref と重なるので外す */
export function displaySubject(subject) {
  return subject.replace(/^feat:\s*/, '').replace(/\s*\(#\d+\)\s*$/, '');
}

/** `feat:` で始まるか（PR タイトルの約束。CLAUDE.md） */
export function isFeat(subject) {
  return /^feat:/.test(subject);
}

/**
 * 集計する。
 *
 * @param {object} input
 * @param {{name: string, date: string} | null} input.tag 最新の `v*` タグ。無ければ null
 * @param {{sha: string, date: string, subject: string, files: string[]}[]} input.commits
 *   タグ以降のコミット（新しい順でも古い順でもよい）
 * @param {ReturnType<typeof buildStageIndex>} input.index
 * @param {string} input.now 数えた日時（ISO）
 * @param {number} [input.maxDays]
 */
export function summarize({ tag, commits, index, now, maxDays = DEFAULT_MAX_DAYS }) {
  const feats = commits
    .filter((c) => isFeat(c.subject))
    .map((c) => ({
      ...c,
      ref: refLabel(c),
      day: jstDate(c.date),
      category: classifyCommit(c, index),
      ageDays: jstDaysBetween(c.date, now),
    }))
    // 古い順に並べる（いちばん長く止まっているものが上）
    .sort((a, b) => a.date.localeCompare(b.date));

  /** @type {Record<string, typeof feats>} */
  const groups = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  for (const f of feats) groups[f.category].push(f);

  const fixes = groups['public-fix'];
  const oldestFixDays = fixes.length ? Math.max(...fixes.map((f) => f.ageDays)) : null;
  const overdue = fixes.filter((f) => f.ageDays > maxDays);

  return {
    tag: tag ? { ...tag, day: jstDate(tag.date), ageDays: jstDaysBetween(tag.date, now) } : null,
    featCount: feats.length,
    groups,
    oldestFixDays,
    maxDays,
    overdue,
    warn: overdue.length > 0,
  };
}

/** 本文（コンソールと Job Summary の両方に出す） */
export function formatReport(summary) {
  const lines = [];
  if (summary.tag) {
    lines.push(
      `本番の最終リリース: ${summary.tag.name}（${summary.tag.day}、${summary.tag.ageDays} 日前）`,
    );
  } else {
    lines.push('本番の最終リリース: なし（リリース前。v* タグが 1 本もありません）');
  }
  lines.push(`main との差: feat ${summary.featCount} 本`);
  lines.push('');

  // 一覧を出すのは public-*。deps / unlisted / other は本数だけ
  const listed = new Set(['public-fix', 'public-update']);
  for (const cat of CATEGORIES) {
    const items = summary.groups[cat];
    if (cat === 'other' && items.length === 0) continue;
    let head = `${CATEGORY_LABELS[cat]}: ${items.length} 本`;
    if (cat === 'public-fix' && summary.oldestFixDays !== null) {
      head += ` ← 最長 ${summary.oldestFixDays} 日`;
    }
    if (cat === 'unlisted') head += '（本番に出しても一覧には出ない）';
    lines.push(head);
    if (listed.has(cat)) {
      for (const f of items) lines.push(`  ${f.ref} ${f.day}  ${displaySubject(f.subject)}`);
    }
  }
  return lines.join('\n');
}

/** warning の 1 行。出さないときは null */
export function warningLine(summary) {
  if (!summary.warn) return null;
  const refs = summary.overdue.map((f) => f.ref).join('・');
  return `::warning::公開中ページの修正 ${summary.overdue.length} 本（${refs}）が ${summary.maxDays} 日を超えて本番に届いていません（最長 ${summary.oldestFixDays} 日）。テスト環境で確かめてリリースを検討してください。docs/features/honban-release-gap-2026-11-16.md`;
}

/** 実際に git を叩く。テストでは差し替える */
export function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * git から、最新タグとそれ以降のコミットを読む。
 *
 * @param {(args: string[]) => string} git
 * @param {string} ref 数える先（既定は origin/main）
 * @returns {{shallow: true} | {shallow: false, tag: {name: string, date: string} | null, commits: object[]}}
 */
export function readHistory(git, ref) {
  // **shallow のときは「リリース前」と言わない**（仕様書 B-1 の 0）。
  // タグが取れないのは checkout の fetch-depth のせいで、リリースが無いからではない
  if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') return { shallow: true };

  let tag = null;
  try {
    const name = git(['describe', '--tags', '--abbrev=0', '--match', 'v*', ref]).trim();
    const date = git(['for-each-ref', '--format=%(creatordate:iso-strict)', `refs/tags/${name}`]).trim();
    tag = { name, date };
  } catch {
    // shallow でないのに描けない＝タグが 1 本も無い（リリース前）
  }

  const range = tag ? `${tag.name}..${ref}` : ref;
  const log = git(['log', range, '--format=%H%x09%cI%x09%s']).trim();
  const commits = log
    ? log.split('\n').map((line) => {
        const [sha, date, ...rest] = line.split('\t');
        return { sha, date, subject: rest.join('\t') };
      })
    : [];

  for (const c of commits) {
    c.files = [];
    c.added = [];
    if (!isFeat(c.subject)) continue;
    const rows = git(['show', '--name-status', '--no-renames', '--format=', c.sha])
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((row) => row.split('\t'));
    for (const [status, path] of rows) {
      c.files.push(path);
      if (status === 'A') c.added.push(path);
    }
  }
  return { shallow: false, tag, commits };
}
