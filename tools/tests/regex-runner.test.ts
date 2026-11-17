import { describe, expect, it } from 'vitest';
import { MatchRunner, type Timers, type WorkerLike } from '@/lib/regex-runner';

// 仕様: docs/features/seiki-hyogen-checker.md「安全の約束」1
// #518 のレビューの必須 1：重い照合の途中でパターンを直したら、直したほうは時間切れにならずに照合される

interface Req {
  pattern: string;
}
interface Res {
  id: number;
  pattern: string;
}

/** 手で進めるタイマー */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const jobs = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set: (fn, ms) => {
      jobs.set(++seq, { at: now + ms, fn });
      return seq;
    },
    clear: (h) => {
      jobs.delete(h as number);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [k, j] of [...jobs].sort((a, b) => a[1].at - b[1].at)) {
      if (j.at <= now && jobs.has(k)) {
        jobs.delete(k);
        j.fn();
      }
    }
  };
  return { timers, advance };
}

/**
 * 1 本のスレッドの Worker のまね。重いパターン（`heavy`）を受け取ると止まり、
 * 後ろに並んだ依頼にも返事をしない。terminate されたら何も返さない
 */
class FakeWorker implements WorkerLike {
  static all: FakeWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  terminated = false;
  stuck = false;
  received: (Req & { id: number })[] = [];
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: unknown) {
    const req = m as Req & { id: number };
    this.received.push(req);
    if (this.stuck || this.terminated) return;
    if (req.pattern === 'heavy') {
      this.stuck = true;
      return;
    }
    // 返事は非同期（ここでは手で呼ぶ flush で返す）
    this.queue.push(req);
  }
  queue: (Req & { id: number })[] = [];
  flush() {
    if (this.terminated || this.stuck) return;
    for (const r of this.queue.splice(0)) this.onmessage?.({ data: { id: r.id, pattern: r.pattern } satisfies Res });
  }
  terminate() {
    this.terminated = true;
  }
}

function setup() {
  FakeWorker.all = [];
  const { timers, advance } = fakeTimers();
  const results: Res[] = [];
  let timeouts = 0;
  const runner = new MatchRunner<Req, Res>(
    () => new FakeWorker(),
    { onResult: (r) => results.push(r), onTimeout: () => timeouts++ },
    1000,
    timers,
  );
  const current = () => FakeWorker.all[FakeWorker.all.length - 1];
  return { runner, results, timeouts: () => timeouts, advance, current };
}

describe('MatchRunner', () => {
  it('ふつうの照合は結果を返す', () => {
    const t = setup();
    t.runner.run({ pattern: 'a+' });
    t.current().flush();
    expect(t.results.map((r) => r.pattern)).toEqual(['a+']);
    t.advance(2000);
    expect(t.timeouts()).toBe(0);
  });

  it('1 秒で返らなければ止めて作り直し、時間切れを知らせる', () => {
    const t = setup();
    t.runner.run({ pattern: 'heavy' });
    const first = t.current();
    t.advance(999);
    expect(t.timeouts()).toBe(0);
    t.advance(1);
    expect(t.timeouts()).toBe(1);
    expect(first.terminated).toBe(true);
    expect(t.current()).not.toBe(first);
    // 作り直したあとも照合できる
    t.runner.run({ pattern: 'a+' });
    t.current().flush();
    expect(t.results.map((r) => r.pattern)).toEqual(['a+']);
  });

  it('重い照合の途中で直したパターンは、時間切れにならずに照合される（#518 必須 1）', () => {
    const t = setup();
    t.runner.run({ pattern: 'heavy' });
    const stuck = t.current();
    t.advance(500); // 1 秒以内に直す
    t.runner.run({ pattern: 'a+' });
    // 止まっている Worker の後ろに並べず、作り直した Worker に送っている
    expect(stuck.terminated).toBe(true);
    expect(t.current()).not.toBe(stuck);
    expect(t.current().received.map((r) => r.pattern)).toEqual(['a+']);
    t.current().flush();
    expect(t.results.map((r) => r.pattern)).toEqual(['a+']);
    t.advance(3000);
    expect(t.timeouts()).toBe(0);
  });

  it('返事が来たあとの依頼では Worker を作り直さない', () => {
    const t = setup();
    t.runner.run({ pattern: 'a' });
    const w = t.current();
    w.flush();
    t.runner.run({ pattern: 'b' });
    expect(t.current()).toBe(w);
    expect(w.terminated).toBe(false);
  });

  it('古い依頼の返事は捨てる', () => {
    const t = setup();
    t.runner.run({ pattern: 'a' });
    const w = t.current();
    // 返事が来る前に次を送る → 作り直すので、古い Worker の返事は届いても捨てる
    t.runner.run({ pattern: 'b' });
    w.terminated = false;
    w.flush();
    expect(t.results).toEqual([]);
    t.current().flush();
    expect(t.results.map((r) => r.pattern)).toEqual(['b']);
  });

  it('cancel は重い照合を止め、時間切れを出さない', () => {
    const t = setup();
    t.runner.run({ pattern: 'heavy' });
    const stuck = t.current();
    t.runner.cancel();
    expect(stuck.terminated).toBe(true);
    expect(t.runner.busy).toBe(false);
    t.advance(3000);
    expect(t.timeouts()).toBe(0);
  });

  it('Worker が作れない環境では available が false', () => {
    const r = new MatchRunner<Req, Res>(() => null, { onResult: () => {}, onTimeout: () => {} }, 1000);
    expect(r.available).toBe(false);
  });
});
