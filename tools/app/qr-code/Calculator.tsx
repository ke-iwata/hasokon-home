'use client';

import { useMemo, useState } from 'react';
import {
  encodeQr,
  maxBytes,
  qrPathData,
  qrToSvg,
  qrViewBoxSize,
  QUIET_ZONE,
  utf8Bytes,
  wifiPayload,
  QrCapacityError,
  type EcLevel,
  type QrCode,
  type WifiAuth,
} from '@/lib/qr-code';
import { trackToolUse } from '@/lib/analytics';

/** 入力の種類。テキスト/URLとWi-Fi設定の2つから始める（仕様書のとおり） */
type Mode = 'text' | 'wifi';

/** ダウンロードするPNGの一辺（px）。印刷にはSVGを使ってもらう */
const PNG_SIZE = 512;

const EC_LABEL: Record<EcLevel, string> = {
  M: 'M（標準・約15%まで復元）',
  Q: 'Q（高め・約25%まで復元）',
};

const AUTH_LABEL: Record<WifiAuth, string> = {
  WPA: 'WPA / WPA2 / WPA3',
  WEP: 'WEP（古い機器向け）',
  nopass: '暗号化なし',
};

/** ブラウザにファイルを保存させる。生成物はすべて手元で作っているので送信は起きない */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // 参照が残るとメモリを掴んだままになるので、次のタスクで解放する
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** ボタンの見た目。既存ツールに合わせて最小限のインラインstyleで組む */
const buttonStyle = (enabled: boolean): React.CSSProperties => ({
  padding: '8px 18px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  fontSize: 'var(--fs-sm)',
  fontWeight: 600,
  cursor: enabled ? 'pointer' : 'default',
  opacity: enabled ? 1 : 0.5,
});

export default function Calculator() {
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [auth, setAuth] = useState<WifiAuth>('WPA');
  const [hidden, setHidden] = useState(false);
  const [ecLevel, setEcLevel] = useState<EcLevel>('M');

  // QRに入る文字列。Wi-Fiのときは端末が解釈できる WIFI: 形式に組み立てる
  const payload =
    mode === 'text' ? text : ssid === '' ? '' : wifiPayload({ ssid, password, auth, hidden });

  // 入力のたびに作り直すので、同じ入力では計算し直さないようにしている
  const result = useMemo((): { qr: QrCode } | { error: string } | null => {
    if (payload === '') return null;
    try {
      return { qr: encodeQr(payload, ecLevel) };
    } catch (error) {
      if (error instanceof QrCapacityError) {
        return {
          error: `入力が長すぎてQRコードに収まりません（${error.byteLength.toLocaleString('ja-JP')}バイト／上限 ${error.limit.toLocaleString('ja-JP')}バイト）。文字を減らすか、誤り訂正レベルをMにしてください。`,
        };
      }
      throw error;
    }
  }, [payload, ecLevel]);

  const qr = result && 'qr' in result ? result.qr : null;

  const onDownloadSvg = () => {
    if (!qr) return;
    download(new Blob([qrToSvg(qr)], { type: 'image/svg+xml' }), 'qrcode.svg');
    trackToolUse('qr-code', 'download-svg');
  };

  const onDownloadPng = () => {
    if (!qr) return;
    const side = qrViewBoxSize(qr);
    const canvas = document.createElement('canvas');
    canvas.width = PNG_SIZE;
    canvas.height = PNG_SIZE;
    const context = canvas.getContext('2d');
    if (!context) return;

    // マスの幅を整数pxに切り下げ、余った分は余白として中央に寄せる。
    // 端数のまま描くとマスの幅が1pxずつばらつき、小さく印刷したときに読み取りにくくなる
    const cell = Math.max(1, Math.floor(PNG_SIZE / side));
    const offset = Math.floor((PNG_SIZE - cell * side) / 2);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, PNG_SIZE, PNG_SIZE);
    context.fillStyle = '#000000';
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (!qr.modules[y][x]) continue;
        // 静かな余白（クワイエットゾーン）の分だけずらして描く
        context.fillRect(
          offset + (x + QUIET_ZONE) * cell,
          offset + (y + QUIET_ZONE) * cell,
          cell,
          cell,
        );
      }
    }
    canvas.toBlob((blob) => {
      if (blob) download(blob, 'qrcode.png');
    }, 'image/png');
    trackToolUse('qr-code', 'download-png');
  };

  const byteLength = utf8Bytes(payload).length;

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">作りたいQRコード</span>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {(
            [
              ['text', 'テキスト・URL'],
              ['wifi', 'Wi-Fi設定'],
            ] as [Mode, string][]
          ).map(([value, label]) => (
            <label key={value} style={{ fontWeight: mode === value ? 700 : 400 }}>
              <input
                type="radio"
                name="qr-mode"
                value={value}
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  trackToolUse('qr-code', `mode-${value}`);
                }}
                style={{ width: 'auto', marginRight: 6 }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {mode === 'text' ? (
        <div className="field">
          <label htmlFor="qr-text">URL・テキスト</label>
          <textarea
            id="qr-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="https://example.com/ など。文章もそのまま入ります"
          />
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="qr-ssid">ネットワーク名（SSID）</label>
            <input
              id="qr-ssid"
              type="text"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="例: my-home-wifi"
            />
          </div>
          <div className="field-row">
            <label>
              暗号化方式
              <select value={auth} onChange={(e) => setAuth(e.target.value as WifiAuth)}>
                {(Object.keys(AUTH_LABEL) as WifiAuth[]).map((value) => (
                  <option key={value} value={value}>
                    {AUTH_LABEL[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              パスワード
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                disabled={auth === 'nopass'}
                placeholder={auth === 'nopass' ? '（暗号化なし）' : 'ルーターの暗号化キー'}
              />
            </label>
          </div>
          <div className="field">
            <label style={{ fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
                style={{ width: 'auto', marginRight: 6 }}
              />
              ステルスSSID（ネットワーク名を公開していない設定）
            </label>
          </div>
          <p className="hint">
            パスワードもブラウザの中だけで扱われ、サーバーには送信されません。読み取った人は
            Wi-Fiに接続できるようになるので、来客用のネットワークで使うことをおすすめします。
          </p>
        </>
      )}

      <div className="field">
        <label htmlFor="qr-ec">誤り訂正レベル</label>
        <select
          id="qr-ec"
          value={ecLevel}
          onChange={(e) => setEcLevel(e.target.value as EcLevel)}
          style={{ maxWidth: 320 }}
        >
          {(Object.keys(EC_LABEL) as EcLevel[]).map((value) => (
            <option key={value} value={value}>
              {EC_LABEL[value]}
            </option>
          ))}
        </select>
        <p className="hint">
          汚れやかすれが想定される屋外の掲示ではQ、画面や手元の紙で使うならMで足ります。
        </p>
      </div>

      {result === null && (
        <div className="panel quiet">
          <p style={{ margin: 0 }}>
            {mode === 'text'
              ? 'URLか文章を入力すると、その場でQRコードが表示されます。'
              : 'ネットワーク名（SSID）を入力すると、その場でQRコードが表示されます。'}
          </p>
        </div>
      )}

      {result !== null && 'error' in result && <div className="note">{result.error}</div>}

      {qr && (
        <div className="panel">
          <div
            style={{
              display: 'flex',
              gap: 20,
              flexWrap: 'wrap',
              alignItems: 'flex-start',
            }}
          >
            <svg
              // 拡大しても粗くならないよう、マスをそのまま図形で描いている
              viewBox={`0 0 ${qrViewBoxSize(qr)} ${qrViewBoxSize(qr)}`}
              width={256}
              height={256}
              shapeRendering="crispEdges"
              role="img"
              aria-label={`QRコード（版数${qr.version}）`}
              style={{ background: '#ffffff', borderRadius: 8, maxWidth: '100%', height: 'auto' }}
            >
              <rect width={qrViewBoxSize(qr)} height={qrViewBoxSize(qr)} fill="#ffffff" />
              <path d={qrPathData(qr)} fill="#000000" />
            </svg>

            <div style={{ flex: '1 1 220px' }}>
              <dl className="kv">
                <div>
                  <dt>型番（バージョン）</dt>
                  <dd>
                    {qr.version}（{qr.size} × {qr.size} マス）
                  </dd>
                </div>
                <div>
                  <dt>誤り訂正レベル</dt>
                  <dd>{qr.ecLevel}</dd>
                </div>
                <div>
                  <dt>入れた情報量</dt>
                  <dd>
                    {byteLength.toLocaleString('ja-JP')} / {maxBytes(qr.ecLevel).toLocaleString('ja-JP')} バイト
                  </dd>
                </div>
              </dl>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button type="button" onClick={onDownloadPng} style={buttonStyle(true)}>
                  PNGで保存（{PNG_SIZE}px）
                </button>
                <button type="button" onClick={onDownloadSvg} style={buttonStyle(true)}>
                  SVGで保存（印刷向け）
                </button>
              </div>
              <p className="hint" style={{ marginTop: 10 }}>
                このQRコードは静的QRです。作った時点で内容が決まるので、
                <strong>期限もなく、当サイトが閉じても読み取れます</strong>。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
