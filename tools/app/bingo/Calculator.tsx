'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ANIMATION_MS,
  FREE,
  INITIAL_STATE,
  LETTERS,
  MAX_CARDS,
  MAX_CARD_NO,
  MAX_MAX,
  MIN_CARDS,
  MIN_MAX,
  STANDARD_MAX,
  STORAGE_KEY,
  addBingoDone,
  boardRows,
  cardNoLabel,
  checkCard,
  cryptoUint32,
  drawNext,
  isValidMax,
  makeCard,
  newPassphrase,
  normalizePassphrase,
  numberLabel,
  parseSaved,
  randomBelow,
  remainingNumbers,
  resetGame,
  serializeState,
  shouldDrawOnKey,
  undoLast,
  type Card,
  type CardCheck,
  type SavedState,
} from '@/lib/bingo';
import { trackToolUse } from '@/lib/analytics';

/**
 * ビンゴ抽選機の画面。ロジックは lib/bingo.ts。
 *
 * - **キーで引くのは `document` の keydown 1 か所だけ。** 判定は `shouldDrawOnKey`（入力欄・ダイアログ・演出中・
 *   押しっぱなし・「引く」ボタンにフォーカスがあるときは引かない。ボタンの Space / Enter はボタンの click に任せる）
 * - 番号は押した瞬間に決めて保存する。演出は見せ方だけで、演出中に閉じても出た番号は残る
 * - 保存は localStorage の `hasokon:bingo:v1` だけ。カードの中身は保存も送信もしない
 */

const SLUG = 'bingo';

const buttonStyle = (primary = false): React.CSSProperties => ({
  minHeight: 44,
  padding: '8px 16px',
  borderRadius: 8,
  border: `1px solid ${primary ? 'var(--accent)' : 'var(--border)'}`,
  background: primary ? 'var(--accent)' : 'var(--surface)',
  color: primary ? 'var(--on-accent)' : 'var(--text)',
  fontSize: 'var(--fs-sm)',
  fontWeight: 700,
  cursor: 'pointer',
});

const inputStyle: React.CSSProperties = {
  minHeight: 44,
  fontSize: 16,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
};

function readStorage(): SavedState | null {
  try {
    return parseSaved(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStorage(s: SavedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeState(s));
  } catch {
    // 保存が使えない環境（プライベートブラウズなど）でも抽選は続ける
  }
}

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return el.matches('input, textarea, select');
}

/** 短い効果音（Web Audio。音声ファイルは持たない） */
function beep(ctxRef: React.MutableRefObject<AudioContext | null>): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = ctxRef.current ?? new AC();
    ctxRef.current = ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // 音が出せなくても抽選は続ける
  }
}

function ConfirmDialog({
  open,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: 'var(--surface)',
        color: 'var(--text)',
        padding: 24,
        maxWidth: 'min(92vw, 420px)',
      }}
    >
      <p style={{ marginTop: 0 }}>{message}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" style={buttonStyle()} onClick={onCancel} autoFocus>
          やめる
        </button>
        <button type="button" style={buttonStyle(true)} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

/** カード1枚の絵（画面と印刷で共通） */
export function BingoCardView({
  card,
  no,
  passphrase,
  check,
}: {
  card: Card;
  no: number;
  passphrase: string;
  check?: CardCheck;
}) {
  return (
    <div className="bingo-card" aria-label={`ビンゴカード ${cardNoLabel(no)}`}>
      <div className="bingo-card-meta">
        <span>{cardNoLabel(no)}</span>
        <span>合言葉 {passphrase}</span>
      </div>
      <div className="bingo-card-grid">
        {LETTERS.map((l) => (
          <div key={l} className="bingo-card-head">
            {l}
          </div>
        ))}
        {card.map((n, i) => (
          <div
            key={i}
            className="bingo-card-cell"
            data-free={n === FREE ? 'true' : undefined}
            data-marked={check?.marked[i] && n !== FREE ? 'true' : undefined}
          >
            {n === FREE ? 'FREE' : n}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Calculator() {
  const [state, setState] = useState<SavedState>(INITIAL_STATE);
  const [loaded, setLoaded] = useState(false);
  const [resumeOffer, setResumeOffer] = useState<SavedState | null>(null);
  const [display, setDisplay] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const [dialog, setDialog] = useState<'undo' | 'reset' | null>(null);
  const [fullscreenOk, setFullscreenOk] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [maxInput, setMaxInput] = useState(String(STANDARD_MAX));
  const [passInput, setPassInput] = useState('');
  const [countInput, setCountInput] = useState('30');
  const [startInput, setStartInput] = useState('1');
  const [sheet, setSheet] = useState<{ passphrase: string; start: number; count: number } | null>(null);
  const [checkInput, setCheckInput] = useState('');
  const [checked, setChecked] = useState<{ no: number; already: boolean } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const drawButtonRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);

  const { drawn, max, passphrase } = state;
  const last = drawn.length > 0 ? drawn[drawn.length - 1] : null;
  const remaining = max - drawn.length;
  const standard = max === STANDARD_MAX;

  // 開いたとき：保存があれば「続きから／新しく」を選ばせる
  useEffect(() => {
    const saved = readStorage();
    if (saved) {
      if (saved.drawn.length > 0) {
        setResumeOffer(saved);
        setState(resetGame(saved));
      } else {
        setState(saved);
      }
      setMaxInput(String(saved.max));
      setPassInput(saved.passphrase);
    }
    setLoaded(true);
    setFullscreenOk(typeof document !== 'undefined' && document.fullscreenEnabled === true);
  }, []);

  useEffect(() => {
    if (loaded && !resumeOffer) writeStorage(state);
  }, [state, loaded, resumeOffer]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current && !!stageRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
  }, []);

  const draw = useCallback(() => {
    if (animating || resumeOffer || dialog) return;
    const result = drawNext(state.drawn, state.max);
    if (!result) return;
    setState((s) => ({ ...s, drawn: result.drawn }));
    trackToolUse(SLUG, 'draw');
    const reduced =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    if (state.noAnimation || reduced) {
      setDisplay(result.number);
      if (state.sound) beep(audioRef);
      return;
    }
    setAnimating(true);
    const rest = remainingNumbers(state.drawn, state.max);
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      if (Date.now() - started >= ANIMATION_MS) {
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        setDisplay(result.number);
        setAnimating(false);
        if (state.sound) beep(audioRef);
        return;
      }
      setDisplay(rest[randomBelow(rest.length, cryptoUint32)]);
    }, 70);
  }, [animating, resumeOffer, dialog, state]);

  // キー操作は document の keydown 1 か所だけ
  const keyCtx = useRef({ draw, animating, dialogOpen: false });
  keyCtx.current = { draw, animating, dialogOpen: dialog !== null || resumeOffer !== null };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const active = document.activeElement;
      const target = (e.target instanceof Element ? e.target : null) ?? active;
      const ok = shouldDrawOnKey({
        key: e.key,
        repeat: e.repeat,
        inInput: isTextInput(target) || isTextInput(active),
        onDrawButton: target === drawButtonRef.current || active === drawButtonRef.current,
        onOtherControl: !!target?.closest('button, a, summary, [role="button"]'),
        dialogOpen: keyCtx.current.dialogOpen || !!document.querySelector('dialog[open]'),
        animating: keyCtx.current.animating,
      });
      if (!ok) return;
      e.preventDefault();
      keyCtx.current.draw();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else
      void el
        .requestFullscreen?.()
        // 全画面ボタンにフォーカスが残ると、Space で全画面ボタンが押されてしまう
        .then(() => (document.activeElement as HTMLElement | null)?.blur?.())
        .catch(() => undefined);
  };

  const applyMax = (raw: string) => {
    setMaxInput(raw);
    const n = Number(raw);
    if (drawn.length === 0 && isValidMax(n)) setState((s) => ({ ...s, max: n }));
  };

  const applyPassphrase = (raw: string) => {
    setPassInput(raw);
    const p = normalizePassphrase(raw);
    if (p) setState((s) => ({ ...s, passphrase: p }));
    else if (raw.trim() === '') setState((s) => ({ ...s, passphrase: '' }));
  };

  const passError = passInput.trim() !== '' && normalizePassphrase(passInput) === null;
  const maxError = !isValidMax(Number(maxInput));

  const count = Number(countInput);
  const start = Number(startInput);
  const sheetError = !Number.isInteger(count) || count < MIN_CARDS || count > MAX_CARDS
    ? `枚数は ${MIN_CARDS}〜${MAX_CARDS} で入れてください`
    : !Number.isInteger(start) || start < 1 || start + count - 1 > MAX_CARD_NO
      ? `番号は 1〜${MAX_CARD_NO} の範囲に収まるようにしてください`
      : null;

  const createCards = () => {
    if (sheetError) return;
    const p = normalizePassphrase(passInput) ?? newPassphrase();
    setPassInput(p);
    setState((s) => ({ ...s, passphrase: p }));
    setSheet({ passphrase: p, start, count });
    trackToolUse(SLUG, 'make_cards');
  };

  const sheetCards = useMemo(() => {
    if (!sheet) return [];
    return Array.from({ length: sheet.count }, (_, i) => {
      const no = sheet.start + i;
      return { no, card: makeCard(sheet.passphrase, no) };
    });
  }, [sheet]);

  const pages = useMemo(() => {
    const out: { no: number; card: Card }[][] = [];
    for (let i = 0; i < sheetCards.length; i += 4) out.push(sheetCards.slice(i, i + 4));
    return out;
  }, [sheetCards]);

  const checkNo = Number(checkInput);
  const checkError =
    checkInput.trim() === ''
      ? null
      : !Number.isInteger(checkNo) || checkNo < 1 || checkNo > MAX_CARD_NO
        ? `カード番号は 1〜${MAX_CARD_NO} で入れてください`
        : !passphrase
          ? '先に「合言葉」を入れてください（カード右上の6文字）'
          : null;

  const runCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (checkError || checkInput.trim() === '' || !passphrase) return;
    const card = makeCard(passphrase, checkNo);
    const result = checkCard(card, drawn);
    const already = state.bingoDone.includes(checkNo);
    if (result.status === 'bingo') setState((s) => ({ ...s, bingoDone: addBingoDone(s.bingoDone, checkNo) }));
    setChecked({ no: checkNo, already });
    trackToolUse(SLUG, `check_${result.status}`);
  };

  const checkedCard = checked && passphrase ? makeCard(passphrase, checked.no) : null;
  const checkedResult = checkedCard ? checkCard(checkedCard, drawn) : null;

  const shown = animating ? display : last;

  return (
    <div className="card">
      {resumeOffer && (
        <div className="note" role="alert" style={{ marginTop: 0 }}>
          <p style={{ marginTop: 0 }}>
            前回の続きがあります（{resumeOffer.drawn.length} 個目まで。最後は{' '}
            {numberLabel(resumeOffer.drawn[resumeOffer.drawn.length - 1], resumeOffer.max)}）。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={buttonStyle(true)}
              onClick={() => {
                setState(resumeOffer);
                setResumeOffer(null);
                setDisplay(null);
              }}
            >
              続きから引く
            </button>
            <button type="button" style={buttonStyle()} onClick={() => setResumeOffer(null)}>
              新しく始める
            </button>
          </div>
        </div>
      )}

      <div ref={stageRef} className="bingo-stage" data-fullscreen={isFullscreen ? 'true' : undefined}>
        <div className="bingo-now-wrap">
          <div className="bingo-now" aria-live={animating ? 'off' : 'polite'} data-rolling={animating ? 'true' : undefined}>
            {shown === null ? '—' : numberLabel(shown, max)}
          </div>
          <div className="bingo-controls">
            <button
              ref={drawButtonRef}
              type="button"
              className="bingo-draw"
              onClick={draw}
              disabled={animating || remaining === 0 || !!resumeOffer}
            >
              {remaining === 0 ? '全部出ました' : '引く'}
            </button>
            <p className="hint" style={{ margin: '6px 0 0' }}>
              {drawn.length} 個目／残り {remaining} 個（Space・Enter キーでも引けます）
            </p>
          </div>
        </div>

        <div className={standard ? 'bingo-board bingo-board75' : 'bingo-board'} aria-label="出た番号の盤面">
          {boardRows(max).map((row, i) => (
            <div key={i} className="bingo-board-row" style={standard ? undefined : { gridTemplateColumns: 'repeat(10, 1fr)' }}>
              {row.letter && <div className="bingo-board-letter">{row.letter}</div>}
              {row.numbers.map((n) => (
                <div
                  key={n}
                  className="bingo-board-cell"
                  data-drawn={drawn.includes(n) && !(animating && n === last) ? 'true' : undefined}
                  data-last={!animating && n === last ? 'true' : undefined}
                >
                  {n}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        <button type="button" style={buttonStyle()} onClick={() => setDialog('undo')} disabled={drawn.length === 0 || animating}>
          1つ戻す
        </button>
        <button type="button" style={buttonStyle()} onClick={() => setDialog('reset')} disabled={animating}>
          最初からやり直す
        </button>
        {fullscreenOk && (
          <button type="button" style={buttonStyle()} onClick={toggleFullscreen}>
            全画面（プロジェクター用）
          </button>
        )}
      </div>
      {fullscreenOk && <p className="hint">全画面では「いま出た番号」と盤面だけを映します。Space キーで引き、Esc で戻ります。</p>}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 44 }}>
          <input
            type="checkbox"
            checked={state.noAnimation}
            onChange={(e) => setState((s) => ({ ...s, noAnimation: e.target.checked }))}
          />
          演出なし
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 44 }}>
          <input type="checkbox" checked={state.sound} onChange={(e) => setState((s) => ({ ...s, sound: e.target.checked }))} />
          効果音
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          番号の範囲 1〜
          <input
            type="number"
            inputMode="numeric"
            min={MIN_MAX}
            max={MAX_MAX}
            value={maxInput}
            disabled={drawn.length > 0}
            onChange={(e) => applyMax(e.target.value)}
            style={{ ...inputStyle, width: 80 }}
          />
        </label>
      </div>
      {drawn.length > 0 && <p className="hint">範囲は「最初からやり直す」と変えられます。</p>}
      {maxError && drawn.length === 0 && <p className="hint" style={{ color: 'var(--danger-fg)' }}>「1〜◯まで」の◯は {MIN_MAX}〜{MAX_MAX} で入れてください。</p>}

      {drawn.length > 0 && (
        <>
          <h3>出た順</h3>
          <ol className="bingo-history">
            {drawn.map((n, i) => (
              <li key={n} data-last={i === drawn.length - 1 && !animating ? 'true' : undefined}>
                {numberLabel(n, max)}
              </li>
            ))}
          </ol>
        </>
      )}

      {standard ? (
        <>
          <h3>カード番号を確かめる</h3>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            合言葉
            <input
              type="text"
              value={passInput}
              onChange={(e) => applyPassphrase(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={12}
              placeholder="例 K7M2QX"
              style={{ ...inputStyle, width: 140, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
            />
          </label>
          {passError && (
            <p className="hint" style={{ color: 'var(--danger-fg)' }}>
              合言葉はカード右上の英数字6文字です（0・O・1・I は使っていません）。
            </p>
          )}
          <form onSubmit={runCheck} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              No.
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_CARD_NO}
                value={checkInput}
                onChange={(e) => setCheckInput(e.target.value)}
                style={{ ...inputStyle, width: 100 }}
              />
            </label>
            <button type="submit" style={buttonStyle(true)} disabled={!!checkError || checkInput.trim() === ''}>
              確かめる
            </button>
          </form>
          {checkError && <p className="hint" style={{ color: 'var(--danger-fg)' }}>{checkError}</p>}

          {checked && checkedCard && checkedResult && (
            <div style={{ marginTop: 12 }}>
              <div
                className="note"
                role="status"
                style={{
                  background: checkedResult.status === 'bingo' ? 'var(--ok-soft)' : undefined,
                  color: checkedResult.status === 'bingo' ? 'var(--ok-fg)' : undefined,
                }}
              >
                <strong>{cardNoLabel(checked.no)}：</strong>
                {checkedResult.status === 'bingo' && <>ビンゴです（{checkedResult.bingo.map((l) => l.name).join('・')}）。</>}
                {checkedResult.status === 'reach' && (
                  <>
                    ビンゴではありません。リーチ {checkedResult.reach.length} 列で、待っている番号は{' '}
                    {checkedResult.waiting.map((n) => numberLabel(n, STANDARD_MAX)).join('・')} です。
                  </>
                )}
                {checkedResult.status === 'none' && <>ビンゴではありません（リーチもまだです）。</>}
                {checked.already && checkedResult.status === 'bingo' && (
                  <>
                    <br />
                    <strong>このカードはすでに「ビンゴ済み」です。</strong>景品の二重取りに気をつけてください。
                  </>
                )}
              </div>
              <p className="hint">申告した人の手元のカードと、番号の並びが同じか見比べてください。</p>
              <div style={{ maxWidth: 320 }}>
                <BingoCardView card={checkedCard} no={checked.no} passphrase={passphrase} check={checkedResult} />
              </div>
            </div>
          )}

          {state.bingoDone.length > 0 && (
            <p>
              <strong>ビンゴ済み</strong>（{state.bingoDone.length} 枚）：{state.bingoDone.map(cardNoLabel).join('、')}
            </p>
          )}

          <h3>カードを作って印刷する</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column' }}>
              枚数（{MIN_CARDS}〜{MAX_CARDS}）
              <input
                type="number"
                inputMode="numeric"
                min={MIN_CARDS}
                max={MAX_CARDS}
                value={countInput}
                onChange={(e) => setCountInput(e.target.value)}
                style={{ ...inputStyle, width: 100 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column' }}>
              何番から
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_CARD_NO}
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                style={{ ...inputStyle, width: 100 }}
              />
            </label>
            <button type="button" style={buttonStyle(true)} onClick={createCards} disabled={!!sheetError}>
              作る
            </button>
            {sheet && (
              <button type="button" style={buttonStyle()} onClick={() => window.print()}>
                印刷する
              </button>
            )}
          </div>
          {sheetError && <p className="hint" style={{ color: 'var(--danger-fg)' }}>{sheetError}</p>}
          <p className="hint">
            合言葉が空なら新しく決めます。カードは「合言葉＋番号」で決まるので、同じ合言葉で続きの番号を足しても、配ったカードは変わりません。PDF にするときは、印刷先で「PDF に保存」を選びます。
          </p>

          {sheet && (
            <>
              <p>
                合言葉 <strong style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>{sheet.passphrase}</strong>・
                {cardNoLabel(sheet.start)}〜{cardNoLabel(sheet.start + sheet.count - 1)}（A4 {pages.length} 枚）
              </p>
              <div data-print="sheet" className="bingo-sheet">
                {pages.map((page, i) => (
                  <div key={i} className="bingo-page">
                    {page.map(({ no, card }) => (
                      <div key={no} className="bingo-slot">
                        <BingoCardView card={card} no={no} passphrase={sheet.passphrase} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <p className="note">
          カードの作成と「ビンゴ！」の確かめは、番号の範囲が 1〜75 のときだけ使えます（B は 1〜15 のような列分けが 75 の決まりのため）。
        </p>
      )}

      <ConfirmDialog
        open={dialog === 'undo'}
        message={last === null ? '' : `直前の ${numberLabel(last, max)} を取り消して、残りに戻します。よろしいですか？`}
        confirmLabel="1つ戻す"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setState((s) => ({ ...s, drawn: undoLast(s.drawn) }));
          setDisplay(null);
          setDialog(null);
        }}
      />
      <ConfirmDialog
        open={dialog === 'reset'}
        message="出た番号とビンゴ済みのカードをすべて消して、最初からやり直します（合言葉は残します）。よろしいですか？"
        confirmLabel="やり直す"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setState((s) => resetGame(s));
          setDisplay(null);
          setChecked(null);
          setDialog(null);
        }}
      />
    </div>
  );
}
