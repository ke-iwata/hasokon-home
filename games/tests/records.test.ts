import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { games } from '@/lib/registry';
import {
  applyResult,
  applyStart,
  browserStorage,
  DEFAULT_VARIANT,
  entryOf,
  formatTime,
  loadRecords,
  markNoteSeen,
  mergeEntry,
  noteSeen,
  parseRecords,
  recordResult,
  recordStart,
  sanitizeEntry,
  saveRecords,
  storageKey,
  updateEntry,
  winRate,
  type RecordStorage,
} from '@/lib/records';

/** テスト用のストレージ。`localStorage` と同じ振る舞いをMapで代用する */
function fakeStorage(initial: Record<string, string> = {}): RecordStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

/** 何をしても例外を投げるストレージ（プライベートブラウズ・容量超過の再現） */
const throwingStorage: RecordStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('storageKey', () => {
  it('ゲームごとに1本のキーになる', () => {
    expect(storageKey('freecell')).toBe('hasokon-games:records:freecell:v1');
    expect(storageKey('2048')).toBe('hasokon-games:records:2048:v1');
  });
});

describe('sanitizeEntry', () => {
  it('使える値だけを残す', () => {
    expect(sanitizeEntry({ plays: 3, wins: 1, bestTimeMs: 1500 })).toEqual({
      plays: 3,
      wins: 1,
      bestTimeMs: 1500,
    });
  });

  it('負数・NaN・文字列・0のベストは捨てる', () => {
    expect(
      sanitizeEntry({
        plays: -1,
        wins: Number.NaN,
        bestTimeMs: '12',
        bestScore: 0,
        bestMoves: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({});
  });

  it('知らない項目は持ち込まない', () => {
    expect(sanitizeEntry({ plays: 1, evil: 'x' })).toEqual({ plays: 1 });
  });

  it('オブジェクト以外は空の記録になる', () => {
    expect(sanitizeEntry(null)).toEqual({});
    expect(sanitizeEntry([1, 2])).toEqual({});
    expect(sanitizeEntry('best')).toEqual({});
  });

  it('clearedIds は文字列だけを残し、空なら持たない', () => {
    expect(sanitizeEntry({ clearedIds: ['a', 5, 'b', null] })).toEqual({ clearedIds: ['a', 'b'] });
    expect(sanitizeEntry({ clearedIds: [] })).toEqual({});
    expect(sanitizeEntry({ clearedIds: 'a' })).toEqual({});
  });
});

describe('parseRecords', () => {
  it('区分ごとに読み分ける', () => {
    const raw = JSON.stringify({ easy: { bestTimeMs: 9000 }, hard: { bestTimeMs: 60000 } });
    expect(parseRecords(raw)).toEqual({ easy: { bestTimeMs: 9000 }, hard: { bestTimeMs: 60000 } });
  });

  it('壊れたJSONは空の記録として扱う（遊べなくならない）', () => {
    expect(parseRecords('{ぐちゃぐちゃ')).toEqual({});
    expect(parseRecords('')).toEqual({});
    expect(parseRecords(null)).toEqual({});
  });

  it('JSONとして読めても形が違えば空の記録', () => {
    expect(parseRecords('[1,2,3]')).toEqual({});
    expect(parseRecords('"best"')).toEqual({});
    expect(parseRecords('{"easy":"12"}')).toEqual({});
  });
});

describe('applyStart / applyResult', () => {
  it('1手目でプレイ数が増える', () => {
    expect(applyStart({})).toEqual({ plays: 1 });
    expect(applyStart({ plays: 4, wins: 2 })).toEqual({ plays: 5, wins: 2 });
  });

  it('はじめての記録はベスト更新として扱う', () => {
    const { entry, improved } = applyResult({ plays: 1 }, { outcome: 'win', timeMs: 90_000, moves: 120 });
    expect(entry).toEqual({ plays: 1, wins: 1, bestTimeMs: 90_000, bestMoves: 120 });
    expect(improved).toEqual({ time: true, score: false, moves: true });
  });

  it('タイムと手数は小さいほうが、スコアは大きいほうが残る', () => {
    const base = { bestTimeMs: 90_000, bestMoves: 120, bestScore: 2048 };
    const better = applyResult(base, { outcome: 'win', timeMs: 61_000, moves: 118, score: 4096 });
    expect(better.entry).toMatchObject({ bestTimeMs: 61_000, bestMoves: 118, bestScore: 4096, wins: 1 });
    expect(better.improved).toEqual({ time: true, score: true, moves: true });

    const worse = applyResult(base, { outcome: 'win', timeMs: 120_000, moves: 130, score: 512 });
    expect(worse.entry).toMatchObject({ bestTimeMs: 90_000, bestMoves: 120, bestScore: 2048 });
    expect(worse.improved).toEqual({ time: false, score: false, moves: false });
  });

  it('勝ち・負け・引き分けを数え分ける', () => {
    let entry = applyResult({}, { outcome: 'win' }).entry;
    entry = applyResult(entry, { outcome: 'loss' }).entry;
    entry = applyResult(entry, { outcome: 'draw' }).entry;
    entry = applyResult(entry, { outcome: 'loss' }).entry;
    expect(entry).toEqual({ wins: 1, losses: 2, draws: 1 });
  });

  it('負けたときのタイムは記録しない側の判断に委ねる（渡さなければ残らない）', () => {
    const { entry, improved } = applyResult({ bestTimeMs: 5000 }, { outcome: 'loss' });
    expect(entry).toEqual({ bestTimeMs: 5000, losses: 1 });
    expect(improved.time).toBe(false);
  });
});

describe('mergeEntry', () => {
  it('良いほうの値を残す', () => {
    expect(
      mergeEntry(
        { plays: 5, bestTimeMs: 90_000, bestScore: 1024 },
        { plays: 2, bestTimeMs: 61_000, bestScore: 4096, bestMoves: 100 },
      ),
    ).toEqual({ plays: 5, bestTimeMs: 61_000, bestScore: 4096, bestMoves: 100 });
  });

  it('解いた問題IDは重複を除いて足し合わせる', () => {
    expect(mergeEntry({ clearedIds: ['a', 'b'] }, { clearedIds: ['b', 'c'] })).toEqual({
      clearedIds: ['a', 'b', 'c'],
    });
  });
});

describe('保存と読み出し', () => {
  it('保存した記録を読み戻せる', () => {
    const storage = fakeStorage();
    saveRecords('freecell', { [DEFAULT_VARIANT]: { wins: 1, bestTimeMs: 61_000 } }, storage);
    expect(loadRecords('freecell', storage)).toEqual({ '': { wins: 1, bestTimeMs: 61_000 } });
    // 無い区分を引いても落ちず、空の記録になる
    expect(entryOf(loadRecords('freecell', storage), 'hard')).toEqual({});
  });

  it('recordStart / recordResult が積み上がる', () => {
    const storage = fakeStorage();
    recordStart('solitaire', DEFAULT_VARIANT, storage);
    recordStart('solitaire', DEFAULT_VARIANT, storage);
    const { entry, improved } = recordResult(
      'solitaire',
      { outcome: 'win', timeMs: 200_000, moves: 150 },
      DEFAULT_VARIANT,
      storage,
    );
    expect(entry).toEqual({ plays: 2, wins: 1, bestTimeMs: 200_000, bestMoves: 150 });
    expect(improved.time).toBe(true);
    expect(entryOf(loadRecords('solitaire', storage))).toEqual(entry);
  });

  it('区分（難易度）ごとに別々に貯まる', () => {
    const storage = fakeStorage();
    recordResult('minesweeper', { outcome: 'win', timeMs: 30_000 }, 'easy', storage);
    recordResult('minesweeper', { outcome: 'loss' }, 'hard', storage);
    const records = loadRecords('minesweeper', storage);
    expect(entryOf(records, 'easy')).toEqual({ wins: 1, bestTimeMs: 30_000 });
    expect(entryOf(records, 'hard')).toEqual({ losses: 1 });
  });

  it('updateEntry で任意の書き換えができる', () => {
    const storage = fakeStorage();
    updateEntry('nonogram', DEFAULT_VARIANT, (e) => ({ ...e, clearedIds: ['e1'] }), storage);
    updateEntry(
      'nonogram',
      DEFAULT_VARIANT,
      (e) => ({ ...e, clearedIds: [...(e.clearedIds ?? []), 'e2'] }),
      storage,
    );
    expect(entryOf(loadRecords('nonogram', storage)).clearedIds).toEqual(['e1', 'e2']);
  });

  it('壊れた値が入っていても、そこから書き直せる', () => {
    const storage = fakeStorage({ [storageKey('2048')]: 'not json' });
    expect(loadRecords('2048', storage)).toEqual({});
    const { entry } = recordResult('2048', { score: 12_345 }, DEFAULT_VARIANT, storage);
    expect(entry).toEqual({ bestScore: 12_345 });
  });
});

describe('ストレージが使えないとき', () => {
  it('読み書きが例外を投げても落ちず、記録なしとして動く', () => {
    expect(loadRecords('freecell', throwingStorage)).toEqual({});
    expect(saveRecords('freecell', { '': { wins: 1 } }, throwingStorage)).toBe(false);
    const { entry } = recordResult('freecell', { outcome: 'win', timeMs: 1000 }, DEFAULT_VARIANT, throwingStorage);
    // 保存できなくても、その場の画面表示のために更新後の値は返す
    expect(entry).toEqual({ wins: 1, bestTimeMs: 1000 });
  });

  it('ストレージそのものが無くても（SSR）落ちない', () => {
    expect(loadRecords('freecell', null)).toEqual({});
    expect(saveRecords('freecell', { '': { wins: 1 } }, null)).toBe(false);
    expect(recordStart('freecell', DEFAULT_VARIANT, null)).toEqual({ '': { plays: 1 } });
  });

  it('browserStorage は window が無ければ null を返す', () => {
    expect(browserStorage()).toBeNull();
  });
});

describe('旧キーの移行', () => {
  it('2048 のベストスコアを移して旧キーを消す', () => {
    const storage = fakeStorage({ 'g2048:best': '13500' });
    expect(entryOf(loadRecords('2048', storage))).toEqual({ bestScore: 13_500 });
    expect(storage.map.has('g2048:best')).toBe(false);
    // 2回目以降は素通りする
    expect(entryOf(loadRecords('2048', storage))).toEqual({ bestScore: 13_500 });
  });

  it('フリーセルの旧ベスト（秒）をミリ秒に直す', () => {
    const storage = fakeStorage({ 'freecell:best': '181' });
    expect(entryOf(loadRecords('freecell', storage))).toEqual({ bestTimeMs: 181_000 });
    expect(storage.map.has('freecell:best')).toBe(false);
  });

  it('ノノグラムの解いた問題を引き継ぐ', () => {
    const storage = fakeStorage({ 'nonogram:solved': '["e1","n3"]' });
    expect(entryOf(loadRecords('nonogram', storage))).toEqual({ clearedIds: ['e1', 'n3'] });
    expect(storage.map.has('nonogram:solved')).toBe(false);
  });

  it('旧キーが壊れていても落ちず、そのキーを片付ける', () => {
    const storage = fakeStorage({ 'nonogram:solved': '{壊れた', 'g2048:best': 'abc' });
    expect(loadRecords('nonogram', storage)).toEqual({});
    expect(loadRecords('2048', storage)).toEqual({});
    expect(storage.map.has('nonogram:solved')).toBe(false);
    expect(storage.map.has('g2048:best')).toBe(false);
  });

  it('新しい記録が既にあるときは、良いほうを残して統合する', () => {
    const storage = fakeStorage({
      'freecell:best': '181',
      [storageKey('freecell')]: JSON.stringify({ '': { wins: 3, bestTimeMs: 240_000 } }),
    });
    expect(entryOf(loadRecords('freecell', storage))).toEqual({ wins: 3, bestTimeMs: 181_000 });
  });

  it('保存できないストレージでは旧キーを消さない（記録を失わないため）', () => {
    const map = new Map([['g2048:best', '13500']]);
    const readOnly: RecordStorage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: (k) => {
        map.delete(k);
      },
    };
    expect(entryOf(loadRecords('2048', readOnly))).toEqual({ bestScore: 13_500 });
    expect(map.has('g2048:best')).toBe(true);
  });

  it('旧キーを持たないゲームには何も起きない', () => {
    const storage = fakeStorage({ 'reversi:level': 'hard', 'reversi:color': 'white' });
    expect(loadRecords('reversi', storage)).toEqual({});
    // 強さ・手番は「設定」なので記録には移さず、そのまま残す
    expect(storage.map.get('reversi:level')).toBe('hard');
  });
});

describe('表示用のヘルパー', () => {
  it('タイムを m:ss で出す', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9_400)).toBe('0:09');
    expect(formatTime(61_000)).toBe('1:01');
    expect(formatTime(161_000)).toBe('2:41');
    expect(formatTime(3_723_000)).toBe('1:02:03');
  });

  it('勝率は決着した対局だけで出し、0局なら null', () => {
    expect(winRate({})).toBeNull();
    expect(winRate({ plays: 5 })).toBeNull();
    expect(winRate({ wins: 3, losses: 1 })).toBe(75);
    expect(winRate({ wins: 1, losses: 1, draws: 2 })).toBe(25);
  });
});

/**
 * 記録の実装が各ゲームでばらけないための見張り。
 * 以前はゲームごとに `Game.tsx` へ直接キーを書いていて、キー名も保存形式も
 * バラバラだった（docs/features/game-records.md の「現状」）。
 */
describe('各ゲームの組み込み', () => {
  const appDir = fileURLToPath(new URL('../app', import.meta.url));
  const gameFiles = readdirSync(appDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ slug: e.name, path: join(appDir, e.name, 'Game.tsx') }))
    .filter((g) => {
      try {
        readFileSync(g.path);
        return true;
      } catch {
        return false;
      }
    })
    .map((g) => ({ ...g, source: readFileSync(g.path, 'utf8') }));

  it('registry の全ゲームぶんの Game.tsx を見ている', () => {
    expect(gameFiles.map((g) => g.slug).sort()).toEqual(games.map((g) => g.slug).sort());
  });

  it('すべてのゲームが記録の共通モジュールを使う', () => {
    for (const g of gameFiles) {
      expect(g.source, `${g.slug} が useRecords を使っていない`).toContain('useRecords');
    }
  });

  it('記録のために localStorage を直接さわらない（キーはモジュールが一元管理する）', () => {
    // リバーシ・五目並べの「強さ・手番」、大富豪の「強さ・ローカルルール」、
    // 七並べの「ローカルルール・CPUの速さ」は、遊んだ記録ではなく設定なので例外
    // （lib/records.ts の LEGACY_KEYS のコメントも参照）
    const allowed = new Set(['reversi', 'gomoku', 'daifugo', 'shichinarabe']);
    for (const g of gameFiles) {
      if (allowed.has(g.slug)) continue;
      expect(g.source, `${g.slug} が localStorage を直接使っている`).not.toMatch(
        /localStorage\.(get|set|remove)Item/,
      );
    }
  });
});

describe('保存先の注記', () => {
  it('一度見せたら覚える', () => {
    const storage = fakeStorage();
    expect(noteSeen(storage)).toBe(false);
    markNoteSeen(storage);
    expect(noteSeen(storage)).toBe(true);
  });

  it('ストレージが使えないときは「見せた」扱いにして邪魔をしない', () => {
    expect(noteSeen(null)).toBe(true);
    expect(noteSeen(throwingStorage)).toBe(true);
    expect(() => markNoteSeen(throwingStorage)).not.toThrow();
  });
});
