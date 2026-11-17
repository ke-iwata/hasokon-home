/**
 * 正規表現の照合を Web Worker に回し、時間切れで止める係（仕様「安全の約束」1）。
 *
 * Worker の作り方とタイマーを差し替えられるようにして、`tests/regex-runner.test.ts` で
 * 「重い照合の途中で次の依頼が来た」ときの動きを固定している。
 *
 * - **前の依頼がまだ返っていないうちに次を送るときは、先に Worker を止めて作り直す。**
 *   Worker は 1 本のスレッドなので、止めずに送ると新しい依頼は重い照合の後ろに並び、
 *   直したあとのパターンに「時間がかかりすぎます」が出てしまう（#518 のレビューの必須 1）
 * - 時間切れになったら Worker を止めて作り直し、`onTimeout` を呼ぶ
 * - 古い依頼の返事は捨てる
 */

/** Worker のうち、ここで使う部分 */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface RunnerHooks<Res> {
  onResult(res: Res): void;
  onTimeout(): void;
}

export class MatchRunner<Req extends object, Res extends { id: number }> {
  private worker: WorkerLike | null = null;
  /** 返事を待っている依頼の番号（無ければ null） */
  private inFlight: number | null = null;
  private timer: unknown = undefined;
  private nextId = 0;

  constructor(
    private readonly create: () => WorkerLike | null,
    private readonly hooks: RunnerHooks<Res>,
    private readonly timeoutMs: number,
    private readonly timers: Timers = defaultTimers,
  ) {
    this.attach();
  }

  /** Worker が使えるか（使えない環境では照合しない） */
  get available(): boolean {
    return this.worker !== null;
  }

  /** 返事を待っているか */
  get busy(): boolean {
    return this.inFlight !== null;
  }

  /** 照合を頼む。返り値は依頼の番号 */
  run(req: Req): number {
    if (this.inFlight !== null) this.restart();
    this.timers.clear(this.timer);
    const id = ++this.nextId;
    this.inFlight = id;
    this.worker?.postMessage({ ...req, id });
    this.timer = this.timers.set(() => {
      if (this.inFlight !== id) return;
      this.inFlight = null;
      this.restart();
      this.hooks.onTimeout();
    }, this.timeoutMs);
    return id;
  }

  /** 待っている依頼を取り下げる（パターンが空・誤りになったとき）。重い照合なら Worker ごと止める */
  cancel(): void {
    this.timers.clear(this.timer);
    if (this.inFlight !== null) {
      this.inFlight = null;
      this.restart();
    }
  }

  dispose(): void {
    this.timers.clear(this.timer);
    this.inFlight = null;
    this.worker?.terminate();
    this.worker = null;
  }

  private restart(): void {
    this.worker?.terminate();
    this.attach();
  }

  private attach(): void {
    const w = this.create();
    if (w) {
      w.onmessage = (e) => {
        const res = e.data as Res;
        if (res.id !== this.inFlight) return;
        this.timers.clear(this.timer);
        this.inFlight = null;
        this.hooks.onResult(res);
      };
    }
    this.worker = w;
  }
}
