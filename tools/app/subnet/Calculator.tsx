'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CLOUDS,
  CLOUD_RULES,
  addressCount,
  buildShareUrl,
  checkContains,
  cloudLabel,
  groupDigits,
  parseInput,
  readShareQuery,
  readingNote,
  reverseFromHosts,
  splitAllText,
  splitSubnet,
  summarizeV4,
  summarizeV6,
  trackableAction,
  usableHosts,
  formatIPv4,
  prefixToMask,
  prefixToWildcard,
  type Cloud,
  type ParsedInput,
  type SplitRow,
  type SubnetAction,
} from '@/lib/subnet';
import { trackToolUse } from '@/lib/analytics';

/**
 * サブネット計算の画面。ロジックは lib/subnet.ts。
 *
 * 入力したアドレスは**どこにも送らない**（docs/features/subnet-keisan.md「共有のURLと計測」）。
 * - 入力のたびに URL を書き換えない。「共有用のURLをコピー」を押したときだけ組み立てる
 * - `?q=` 付きで開かれたら、読んで計算したあと `history.replaceState` でクエリを消す
 *   （page_view からも `lib/analytics.ts` の `pageLocationForAnalytics()` が外す）
 * - tool_use の action は calc / split / reverse / contains / share と、クラウドを選んだときの `-cloud-aws` などだけ
 */

const SLUG = 'subnet';
const DEBOUNCE_MS = 300;

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  overflowWrap: 'anywhere',
};

const buttonStyle = (active = false): React.CSSProperties => ({
  minHeight: 44,
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'var(--accent-soft)' : 'var(--surface)',
  color: 'var(--text)',
  fontSize: 'var(--fs-sm)',
  fontWeight: 600,
  cursor: 'pointer',
});

const th: React.CSSProperties = { textAlign: 'left', padding: '6px', fontWeight: 600, verticalAlign: 'top', whiteSpace: 'nowrap' };
const summaryStyle: React.CSSProperties = { cursor: 'pointer', fontWeight: 600, padding: '8px 0', minHeight: 44 };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** 同じ action は1回の表示につき1度だけ送る */
function useTrackOnce() {
  const sent = useRef(new Set<string>());
  return useCallback((action: SubnetAction, cloud: Cloud = 'none') => {
    const a = trackableAction(action, { touched: true, ok: true, cloud });
    if (a === null || sent.current.has(a)) return;
    sent.current.add(a);
    trackToolUse(SLUG, a);
  }, []);
}

function CopyButton({ value, label, id, copied, onCopy }: {
  value: string;
  label: string;
  id: string;
  copied: string | null;
  onCopy: (value: string, id: string) => void;
}) {
  return (
    <button type="button" onClick={() => onCopy(value, id)} style={{ ...buttonStyle(), minHeight: 36, padding: '4px 10px', flexShrink: 0 }} aria-label={`${label}をコピー`}>
      {copied === id ? 'コピーしました' : 'コピー'}
    </button>
  );
}

/** 結果の1行。幅 360px でも値が潰れないよう、項目名を上・値を下に積む */
function Row({ label, value, copy, children, copied, onCopy }: {
  label: string;
  value?: string;
  copy?: string;
  children?: React.ReactNode;
  copied: string | null;
  onCopy: (value: string, id: string) => void;
}) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '6px 0' }}>
      <div className="hint" style={{ margin: 0, fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          {value !== undefined && <span style={{ ...mono, fontWeight: 700 }}>{value}</span>}
          {children}
        </div>
        {copy !== undefined && <CopyButton value={copy} label={label} id={`row-${label}`} copied={copied} onCopy={onCopy} />}
      </div>
    </div>
  );
}

/** 2進数。ネットワーク部を太字・下線、ホスト部を薄く。オクテットごとに折り返してよい */
function Binary({ octets, prefix }: { octets: string[]; prefix: number }) {
  return (
    <span style={{ ...mono, display: 'inline-flex', flexWrap: 'wrap', columnGap: 2 }}>
      {octets.map((o, oi) => (
        <span key={oi} style={{ whiteSpace: 'nowrap' }}>
          {o.split('').map((b, bi) => {
            const isNet = oi * 8 + bi < prefix;
            return (
              <span key={bi} style={isNet ? { fontWeight: 700, color: 'var(--accent)', textDecoration: 'underline' } : { color: 'var(--muted)' }}>
                {b}
              </span>
            );
          })}
          {oi < 3 ? '.' : ''}
        </span>
      ))}
    </span>
  );
}

function SplitTable({ rows }: { rows: SplitRow[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
      <thead>
        <tr>
          <th style={{ ...th, width: '3em' }}>#</th>
          <th style={th}>範囲</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.index} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={{ padding: '4px 6px', verticalAlign: 'top' }}>{groupDigits(r.index)}</td>
            <td style={{ padding: '4px 6px' }}>
              <div style={{ ...mono, fontWeight: 700 }}>{r.cidr}</div>
              <div className="hint" style={{ ...mono, margin: 0 }}>{r.first} 〜 {r.last}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Calculator() {
  const [input, setInput] = useState('192.168.10.0/26');
  /** ワイルドカードとして読み替えたプレフィックス長（両方に読めるマスクのとき） */
  const [override, setOverride] = useState<number | null>(null);
  const [cloud, setCloud] = useState<Cloud>('none');
  const [containsText, setContainsText] = useState('');
  const [newPrefix, setNewPrefix] = useState<number | null>(null);
  const [hosts, setHosts] = useState('50');
  const [reverseCloud, setReverseCloud] = useState<Cloud>('none');
  const [copied, setCopied] = useState<string | null>(null);
  const track = useTrackOnce();
  /** 利用者が上の入力（入力欄・クラウド・?q=）に触ったか。触る前の既定の例では tool_use を送らない */
  const inputTouched = useRef(false);
  /** 逆算（台数・逆算のクラウド）に触ったか */
  const reverseTouched = useRef(false);

  // ?q= で開かれたら読んで、アドレスバーからクエリを消す（入力をURLに残さない）
  useEffect(() => {
    try {
      const q = readShareQuery(window.location.search);
      if (q !== null) {
        inputTouched.current = true;
        setInput(q);
        window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash);
      }
    } catch {
      // 読めなければ既定の例のまま
    }
  }, []);

  const debounced = useDebounced(input, DEBOUNCE_MS);
  useEffect(() => setOverride(null), [debounced]);

  const parsed: ParsedInput = useMemo(() => parseInput(debounced), [debounced]);
  const effective: ParsedInput = useMemo(() => {
    if (override === null) return parsed;
    if (parsed.kind === 'v4') return { ...parsed, prefix: override, source: 'wildcard' as const, alternative: undefined };
    if (parsed.kind === 'mask-only') return { ...parsed, prefix: override, source: 'wildcard' as const, alternative: undefined };
    return parsed;
  }, [parsed, override]);

  const v4 = effective.kind === 'v4' ? summarizeV4(effective.address, effective.prefix, cloud) : null;
  const v6 = effective.kind === 'v6' ? summarizeV6(effective.address, effective.prefix) : null;

  useEffect(() => {
    const ok = effective.kind === 'v4' || effective.kind === 'v6' || effective.kind === 'mask-only';
    const a = trackableAction('calc', { touched: inputTouched.current, ok, cloud: effective.kind === 'v4' ? cloud : 'none' });
    if (a !== null) track('calc', effective.kind === 'v4' ? cloud : 'none');
  }, [effective, cloud, track]);

  const onCopy = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // クリップボードが使えない環境では、表示を手で選んでコピーできる
    }
  };

  const onShare = () => {
    track('share');
    onCopy(buildShareUrl(input), 'share');
  };

  // 分割（既定は今の長さ +2）
  const splitPrefix = v4 ? Math.min(32, Math.max(v4.prefix, newPrefix ?? v4.prefix + 2)) : 0;
  const split = effective.kind === 'v4' ? splitSubnet(effective.address, effective.prefix, splitPrefix) : null;

  // このIPは入るか
  const contains = effective.kind === 'v4' && containsText.trim() !== '' ? checkContains(effective.address, effective.prefix, containsText) : [];
  useEffect(() => {
    if (contains.length > 0) track('contains');
  }, [contains.length, track]);

  // 逆算
  const hostsNum = Number(hosts.replace(/[,，\s]/g, ''));
  const reverse = hosts.trim() === '' ? null : reverseFromHosts(hostsNum, reverseCloud);
  useEffect(() => {
    const a = trackableAction('reverse', { touched: reverseTouched.current, ok: reverse?.ok === true, cloud: reverseCloud });
    if (a !== null) track('reverse', reverseCloud);
  }, [reverse?.ok, hostsNum, reverseCloud, track]);

  const note = readingNote(effective);
  const canFlip = override === null && (parsed.kind === 'v4' || parsed.kind === 'mask-only') && parsed.source === 'mask' && parsed.alternative !== undefined;

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="subnet-input">IPアドレス／CIDR・サブネットマスク</label>
        <input
          id="subnet-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={input}
          onChange={(e) => {
            inputTouched.current = true;
            setInput(e.target.value);
          }}
          placeholder="192.168.10.0/26"
          style={{ ...mono, fontSize: 16 }}
          aria-describedby="subnet-input-hint"
        />
        <p className="hint" id="subnet-input-hint">
          「192.168.10.37/26」「192.168.10.0 255.255.255.192」「10.0.0.0 0.0.0.255」（ワイルドカード）「/26」「2001:db8::/48」の形で入れられます。入力はこの画面の中だけで計算し、どこにも送りません。
        </p>
      </div>

      <div className="field">
        <span className="hint" style={{ display: 'block', margin: '0 0 4px' }}>クラウド（使える数から予約アドレスを引く）</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="クラウド">
          {CLOUDS.map((c) => (
            <button key={c} type="button" style={buttonStyle(cloud === c)} aria-pressed={cloud === c} onClick={() => {
              inputTouched.current = true;
              setCloud(c);
            }}>
              {cloudLabel(c)}
            </button>
          ))}
        </div>
      </div>

      {effective.kind === 'error' && (
        <div className="note" role="alert">{effective.message}</div>
      )}

      {note && (
        <div className="note" style={{ marginTop: 12 }}>
          {note}
          {canFlip && (
            <div style={{ marginTop: 8 }}>
              <button type="button" style={buttonStyle()} onClick={() => setOverride(parsed.kind === 'v4' || parsed.kind === 'mask-only' ? parsed.alternative ?? null : null)}>
                /{parsed.kind === 'v4' || parsed.kind === 'mask-only' ? parsed.alternative : ''} に読み替える
              </button>
            </div>
          )}
        </div>
      )}

      {effective.kind === 'mask-only' && (
        <div style={{ marginTop: 12, fontSize: 'var(--fs-sm)' }}>
            <Row label="プレフィックス長" value={`/${effective.prefix}`} copy={`/${effective.prefix}`} copied={copied} onCopy={onCopy} />
            <Row label="サブネットマスク" value={formatIPv4(prefixToMask(effective.prefix))} copy={formatIPv4(prefixToMask(effective.prefix))} copied={copied} onCopy={onCopy} />
            <Row label="ワイルドカードマスク" value={formatIPv4(prefixToWildcard(effective.prefix))} copy={formatIPv4(prefixToWildcard(effective.prefix))} copied={copied} onCopy={onCopy} />
            <Row label="アドレス数" value={groupDigits(addressCount(effective.prefix))} copied={copied} onCopy={onCopy} />
            <Row label="使えるホスト数" value={groupDigits(usableHosts(effective.prefix))} copied={copied} onCopy={onCopy} />
        </div>
      )}

      {v4 && (
        <>
          {v4.position !== null && (
            <p className="hint" style={{ margin: '12px 0 0' }}>
              入力の <span style={mono}>{v4.inputAddress}</span> は、この範囲の {groupDigits(v4.position)} 番目です（ネットワークアドレスに揃えて計算しました）
            </p>
          )}
          <div style={{ marginTop: 12, fontSize: 'var(--fs-sm)' }}>
              <Row label="ネットワークアドレス" value={`${v4.network}/${v4.prefix}`} copy={`${v4.network}/${v4.prefix}`} copied={copied} onCopy={onCopy} />
              <Row label="ブロードキャスト" value={v4.prefix >= 31 ? 'なし' : v4.broadcast} copy={v4.prefix >= 31 ? undefined : v4.broadcast} copied={copied} onCopy={onCopy} />
              <Row
                label="使える範囲"
                value={v4.firstUsable === v4.lastUsable ? v4.firstUsable : `${v4.firstUsable} 〜 ${v4.lastUsable}`}
                copy={v4.firstUsable === v4.lastUsable ? v4.firstUsable : `${v4.firstUsable}-${v4.lastUsable}`}
                copied={copied}
                onCopy={onCopy}
              />
              <Row label="使えるホスト数" copied={copied} onCopy={onCopy}>
                <strong style={{ fontSize: '1.1em' }}>{v4.specialNote ?? `${groupDigits(v4.usable)} 台`}</strong>
                {v4.cloud !== 'none' && (
                  <div style={{ marginTop: 4 }}>
                    {v4.cloudUsable !== null ? (
                      <>
                        {cloudLabel(v4.cloud)}：<strong>{groupDigits(v4.cloudUsable)} 台</strong>（予約 {CLOUD_RULES[v4.cloud].reserved.length} 個を引いた数）
                      </>
                    ) : (
                      <strong>{v4.cloudNote}</strong>
                    )}
                  </div>
                )}
              </Row>
              <Row label="アドレス数" value={groupDigits(v4.total)} copied={copied} onCopy={onCopy} />
              <Row label="サブネットマスク" value={v4.mask} copy={v4.mask} copied={copied} onCopy={onCopy} />
              <Row label="ワイルドカードマスク" value={v4.wildcard} copy={v4.wildcard} copied={copied} onCopy={onCopy} />
              <Row label="2進数" copied={copied} onCopy={onCopy}>
                <Binary octets={v4.binary} prefix={v4.prefix} />
                <div className="hint" style={{ margin: '2px 0 0' }}>太字の下線がネットワーク部（{v4.prefix} ビット）、薄い字がホスト部（{32 - v4.prefix} ビット）</div>
              </Row>
              <Row label="種類" copied={copied} onCopy={onCopy}>
                <span>{v4.classification.label}</span>
              </Row>
              <Row label="16進数・整数" copied={copied} onCopy={onCopy}>
                <span style={mono}>{v4.hex}／{v4.integer}</span>
              </Row>
          </div>

          {v4.cloudReserved.length > 0 && (
            <div className="note" style={{ marginTop: 12 }}>
              <strong>{cloudLabel(v4.cloud)} で予約されるアドレス</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: '1.2em' }}>
                {v4.cloudReserved.map((r) => (
                  <li key={r.address}>
                    <span style={mono}>{r.address}</span>：{r.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {v6 && (
        <div style={{ marginTop: 12, fontSize: 'var(--fs-sm)' }}>
            <Row label="ネットワーク" value={`${v6.network}/${v6.prefix}`} copy={`${v6.network}/${v6.prefix}`} copied={copied} onCopy={onCopy} />
            <Row label="範囲" copied={copied} onCopy={onCopy}>
              <span style={{ ...mono, fontWeight: 700 }}>{v6.network}</span>
              <div style={mono}>〜 {v6.last}</div>
            </Row>
            <Row label="アドレス数" copied={copied} onCopy={onCopy}>
              <strong>2^{v6.exponent}</strong>
              <div style={mono}>{groupDigits(v6.count)}</div>
            </Row>
            {!v6.aligned && (
              <Row label="入力" value={v6.inputAddress} copied={copied} onCopy={onCopy}>
                <div className="hint" style={{ margin: 0 }}>ネットワークアドレスに揃えて計算しました</div>
              </Row>
            )}
        </div>
      )}
      {v6 && <p className="hint">IPv6 は範囲とアドレス数だけを出します（分割・クラウドの予約は IPv4 のみ）。</p>}

      {(v4 || v6 || effective.kind === 'mask-only') && (
        <div style={{ marginTop: 12 }}>
          <button type="button" style={buttonStyle()} onClick={onShare}>
            {copied === 'share' ? 'コピーしました' : '共有用のURLをコピー'}
          </button>
          <p className="hint" style={{ margin: '4px 0 0' }}>URL には入力したアドレスが入ります。社内のアドレスなどを共有するときは宛先に気をつけてください。</p>
        </div>
      )}

      {v4 && effective.kind === 'v4' && (
        <>
          <details style={{ marginTop: 16 }}>
            <summary style={summaryStyle}>このIPは入るか</summary>
            <div className="field">
              <label htmlFor="subnet-contains">IPアドレス（1行に1つ）</label>
              <textarea
                id="subnet-contains"
                rows={4}
                value={containsText}
                onChange={(e) => setContainsText(e.target.value)}
                placeholder={`${v4.firstUsable}\n10.0.0.1`}
                style={{ ...mono, fontSize: 16, width: '100%' }}
                spellCheck={false}
              />
            </div>
            {contains.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: 'var(--fs-sm)' }}>
                {contains.map((r, i) => (
                  <li key={i}>
                    <span style={mono}>{r.input}</span>：
                    <strong>{r.result === 'in' ? `入る（${v4.network}/${v4.prefix}）` : r.result === 'out' ? '入らない' : 'IPv4 アドレスとして読めません'}</strong>
                  </li>
                ))}
              </ul>
            )}
          </details>

          <details style={{ marginTop: 8 }}>
            <summary style={summaryStyle}>分割（/{v4.prefix} を小さく分ける）</summary>
            <div className="field">
              <label htmlFor="subnet-split">新しいプレフィックス長</label>
              <select id="subnet-split" value={splitPrefix} onChange={(e) => { setNewPrefix(Number(e.target.value)); track('split'); }} style={{ fontSize: 16 }}>
                {Array.from({ length: 33 - v4.prefix }, (_, i) => v4.prefix + i).map((p) => (
                  <option key={p} value={p}>/{p}（{groupDigits(addressCount(p))} 個ずつ）</option>
                ))}
              </select>
            </div>
            {split && !split.ok && <p className="note">{split.message}</p>}
            {split && split.ok && (
              <>
                <p style={{ margin: '4px 0 8px' }}>
                  <strong>{groupDigits(split.count)} 個</strong>の /{split.newPrefix} に分かれます。
                </p>
                {split.tooMany ? (
                  <>
                    <p className="note">数が多すぎるので一覧は出しません。先頭と末尾だけ表示します。</p>
                    <SplitTable rows={split.head} />
                    <p className="hint" style={{ textAlign: 'center', margin: '4px 0' }}>⋮</p>
                    <SplitTable rows={split.tail} />
                  </>
                ) : (
                  <>
                    <SplitTable rows={split.head} />
                    {split.count > split.head.length && (
                      <p className="hint">先頭 {split.head.length} 件を表示しています（全 {groupDigits(split.count)} 件）。</p>
                    )}
                    <button
                      type="button"
                      style={{ ...buttonStyle(), marginTop: 8 }}
                      onClick={() => {
                        const all = splitAllText(effective.address, effective.prefix, split.newPrefix);
                        if (all !== null) onCopy(all, 'split-all');
                        track('split');
                      }}
                    >
                      {copied === 'split-all' ? 'コピーしました' : `全 ${groupDigits(split.count)} 件をコピー`}
                    </button>
                  </>
                )}
              </>
            )}
          </details>
        </>
      )}

      <details style={{ marginTop: 8 }}>
        <summary style={summaryStyle}>必要な台数から逆算</summary>
        <div className="field">
          <label htmlFor="subnet-hosts">置きたい台数</label>
          <input
            id="subnet-hosts"
            type="text"
            inputMode="numeric"
            value={hosts}
            onChange={(e) => {
              reverseTouched.current = true;
              setHosts(e.target.value);
            }}
            style={{ fontSize: 16 }}
          />
        </div>
        <div className="field">
          <span className="hint" style={{ display: 'block', margin: '0 0 4px' }}>クラウド</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="逆算のクラウド">
            {CLOUDS.map((c) => (
              <button key={c} type="button" style={buttonStyle(reverseCloud === c)} aria-pressed={reverseCloud === c} onClick={() => {
                reverseTouched.current = true;
                setReverseCloud(c);
              }}>
                {cloudLabel(c)}
              </button>
            ))}
          </div>
        </div>
        {reverse && !reverse.ok && <p className="note">{reverse.message}</p>}
        {reverse && reverse.ok && (
          <>
            <p style={{ margin: '4px 0' }}>
              <strong style={{ fontSize: '1.2em' }}>/{reverse.prefix}</strong>（{formatIPv4(prefixToMask(reverse.prefix))}）
              ：アドレス {groupDigits(reverse.total)} 個、使えるのは {groupDigits(reverse.usable)} 台
              {reverseCloud !== 'none' && `（${cloudLabel(reverseCloud)} の予約 ${CLOUD_RULES[reverseCloud].reserved.length} 個を引いた数）`}
            </p>
            {reverse.note && <p className="hint">{reverse.note}</p>}
          </>
        )}
      </details>
    </div>
  );
}
