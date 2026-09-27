'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { formatDate, parseDate } from '@/lib/date-parts';
import { parseHandoffQuery } from '@/lib/shussan-yoteibi';
import { trackToolUse } from '@/lib/analytics';
import {
  calcMenjo,
  FUKA_PREMIUM,
  formatMonthJa,
  reiwaFiscalYear,
  ROLE_LABELS,
  splitRows,
  spouseRole,
  type Category,
  type MenjoResult,
  type MonthCell,
  type Period,
  type Role,
} from '@/lib/kokunen-ikuji-menjo';

const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;

const periodJa = (p: Period) =>
  p.from === p.to
    ? `${formatMonthJa(p.from)}の1か月`
    : `${formatMonthJa(p.from)}〜${formatMonthJa(p.to)}の${p.months}か月`;

const ROLES: Role[] = ['mother', 'father', 'adoptive'];

const radioRow = { display: 'flex', gap: 16, flexWrap: 'wrap' as const, fontSize: 'var(--fs-sm)' };
const radioLabel = { fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' };
const checkLabel = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  fontWeight: 400,
  marginTop: 12,
};

/**
 * 国民年金 産前産後・育児期間の保険料免除の計算UI。
 *
 * 必須は 3 つ（子の生年月日・あなたは・国民年金の区分）で、任意は `<details>` に畳む。
 * ロジックは持たせない（すべて lib/kokunen-ikuji-menjo.ts の純関数）。
 */
export default function Calculator() {
  const [birthDate, setBirthDate] = useState('');
  const [role, setRole] = useState<Role>('mother');
  const [category, setCategory] = useState<Category>('first');
  const [multiple, setMultiple] = useState(false);
  const [spouseFirst, setSpouseFirst] = useState(false);
  const [fuka, setFuka] = useState(false);
  const [adoptionDate, setAdoptionDate] = useState('');
  const [noSanzen, setNoSanzen] = useState(false);

  /**
   * 出産予定日 計算機からの引き継ぎ（`?due=YYYY-MM-DD&babies=2`）を初期値として読む。
   * `useSearchParams` は使わない（静的エクスポートでページが CSR 化するため。shussan-teate と同じ）
   */
  useEffect(() => {
    const handoff = parseHandoffQuery(window.location.search);
    if (handoff.dueDate) setBirthDate(formatDate(handoff.dueDate));
    if (handoff.fetusCount && handoff.fetusCount > 1) setMultiple(true);
  }, []);

  const birth = parseDate(birthDate);
  const adoption = parseDate(adoptionDate);
  const input = birth
    ? {
        birthDate: birth,
        category,
        multiple,
        adoptionDate: role === 'adoptive' ? (adoption ?? undefined) : undefined,
      }
    : null;
  const r = input ? calcMenjo({ ...input, role, noSanzen: role === 'mother' && noSanzen }) : null;
  const spouse =
    input && spouseFirst && category === 'first' ? calcMenjo({ ...input, role: spouseRole(role) }) : null;

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="menjo-birth">子の生年月日（生まれる前なら出産予定日）</label>
        <input
          id="menjo-birth"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          onBlur={() => trackToolUse('kokunen-ikuji-menjo', 'birth-date')}
        />
      </div>

      <div className="field">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>あなたは</div>
        <div style={radioRow}>
          {ROLES.map((x) => (
            <label key={x} style={radioLabel}>
              <input
                type="radio"
                name="menjo-role"
                checked={role === x}
                onChange={() => setRole(x)}
                style={{ width: 'auto' }}
              />
              {ROLE_LABELS[x]}
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>国民年金の区分</div>
        <div style={radioRow}>
          <label style={radioLabel}>
            <input
              type="radio"
              name="menjo-category"
              checked={category === 'first'}
              onChange={() => setCategory('first')}
              style={{ width: 'auto' }}
            />
            第1号被保険者（自営業・フリーランス・学生・無職）
          </label>
          <label style={radioLabel}>
            <input
              type="radio"
              name="menjo-category"
              checked={category === 'other'}
              onChange={() => setCategory('other')}
              style={{ width: 'auto' }}
            />
            それ以外（会社員・公務員・その扶養）
          </label>
        </div>
      </div>

      {role === 'adoptive' && (
        <div className="field">
          <label htmlFor="menjo-adoption">養育を始めた日（縁組の日）</label>
          <input
            id="menjo-adoption"
            type="date"
            value={adoptionDate}
            onChange={(e) => setAdoptionDate(e.target.value)}
          />
          <p className="hint">空欄なら生まれた月から養育しているものとして計算します。</p>
        </div>
      )}

      <details className="field">
        <summary style={{ cursor: 'pointer' }}>詳しい条件（任意）</summary>

        <label style={checkLabel}>
          <input
            type="checkbox"
            checked={multiple}
            onChange={(e) => setMultiple(e.target.checked)}
            style={{ width: 'auto', marginTop: 3 }}
          />
          <span className="hint">多胎妊娠（双子以上。実母の産前産後免除が6か月になります）</span>
        </label>

        {role === 'mother' && (
          <label style={checkLabel}>
            <input
              type="checkbox"
              checked={noSanzen}
              onChange={(e) => setNoSanzen(e.target.checked)}
              style={{ width: 'auto', marginTop: 3 }}
            />
            <span className="hint">
              産前産後免除の期間が無い（出産のころは会社員だった等。実父と同じく生まれた月から最大12か月で数えます）
            </span>
          </label>
        )}

        <label style={checkLabel}>
          <input
            type="checkbox"
            checked={spouseFirst}
            onChange={(e) => setSpouseFirst(e.target.checked)}
            style={{ width: 'auto', marginTop: 3 }}
          />
          <span className="hint">配偶者も第1号被保険者（夫婦の合計を出します）</span>
        </label>

        <label style={checkLabel}>
          <input
            type="checkbox"
            checked={fuka}
            onChange={(e) => setFuka(e.target.checked)}
            style={{ width: 'auto', marginTop: 3 }}
          />
          <span className="hint">付加保険料（月{yen(FUKA_PREMIUM)}）を払っている</span>
        </label>
      </details>

      {r === null ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            子の生年月日（または出産予定日）を入れると、免除される月と額が出ます。
          </p>
        </div>
      ) : !r.eligible ? (
        <div className="panel quiet">
          <p style={{ margin: 0 }}>
            この免除は<strong>国民年金の第1号被保険者</strong>
            （自営業・フリーランス・学生・無職など）の制度です。会社員・公務員（厚生年金の加入者）は、
            勤務先を通じて<strong>産休・育休中の厚生年金・健康保険の保険料が免除</strong>
            される別の仕組みがあり、会社員・公務員の扶養に入っている配偶者（第3号被保険者）は
            もともと保険料を払っていません。育休中の収入は
            <Link href="/ikuji-kyugyo-kyufu/">育児休業給付金 計算機</Link>で出せます。
          </p>
        </div>
      ) : (
        <Result r={r} spouse={spouse} fuka={fuka} />
      )}
    </div>
  );
}

function Result({
  r,
  spouse,
  fuka,
}: {
  r: MenjoResult;
  spouse: MenjoResult | null;
  fuka: boolean;
}) {
  const uniform = r.byFiscalYear.length > 0 && r.byFiscalYear.every((y) => y.premium === r.byFiscalYear[0].premium);
  const estimatedFrom = r.estimatedPeriod ? r.byFiscalYear.find((y) => y.estimated) : undefined;
  const basisYear = r.byFiscalYear.filter((y) => !y.estimated).at(-1);

  return (
    <>
      <div className="panel" style={{ textAlign: 'center' }}>
        {r.exemptMonths === 0 ? (
          <p style={{ margin: 0 }}>
            免除される月はありません。育児免除は<strong>2026年10月分から</strong>
            の制度で、子が1歳になる誕生日の前月までが対象です。
          </p>
        ) : (
          <>
            <div className="metric">
              <span className="value">{r.amount.toLocaleString('ja-JP')}</span>
              <span className="unit">円</span>
              <span className="label">
                が免除される保険料（{r.exemptMonths}か月
                {uniform && `・${yen(r.byFiscalYear[0].premium)} × ${r.exemptMonths}`}）
              </span>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              {[r.sanzen && `産前産後免除：${periodJa(r.sanzen)}`, r.ikuji && `育児免除：${periodJa(r.ikuji)}`]
                .filter(Boolean)
                .join('　／　')}
            </p>
            {r.estimatedPeriod && estimatedFrom && basisYear && (
              <p className="hint" style={{ margin: 0 }}>
                うち{periodJa(r.estimatedPeriod)}は{reiwaFiscalYear(estimatedFrom.fiscalYear)}
                以降の分で、月額は{reiwaFiscalYear(basisYear.fiscalYear)}の額（{yen(basisYear.premium)}
                ）で概算しています（保険料は毎年4月に改定）。
              </p>
            )}
          </>
        )}
      </div>

      {r.cells.length > 0 && <MonthBand cells={r.cells} />}

      {r.ikujiDroppedMonths > 0 && (
        <p className="hint">
          灰色の{r.ikujiDroppedMonths}か月は本来なら育児免除の期間ですが、制度が始まる2026年10月より前なので対象外です。
          {r.role === 'mother' &&
            '実母の育児免除は「産前産後免除の翌月から9か月目まで」で、10月から9か月に延びるわけではありません。'}
        </p>
      )}

      <div className="note">
        <strong>免除されても、将来の年金額は減りません。</strong>
        産前産後免除・育児免除の期間は保険料を納めた期間として老齢基礎年金の額に反映されます。
        所得で決まる一般の申請免除・納付猶予（年金額が減る・追納が必要）とは別の制度です。
      </div>

      {spouse && (
        <table>
          <tbody>
            <tr>
              <td style={{ textAlign: 'left' }}>
                配偶者（{spouse.role === 'mother' ? '実母' : spouse.role === 'father' ? '実父' : '養父母'}）の分
              </td>
              <td>
                {yen(spouse.amount)}（{spouse.exemptMonths}か月）
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'left' }}>夫婦の合計</td>
              <td>
                <strong>{yen(r.amount + spouse.amount)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <p>
        <strong>届出：</strong>
        {r.noFilingIfSanzenFiled
          ? '産前産後免除を届け出ていて、マイナンバーで親子関係と同一世帯を確認できれば、育児免除の届出は不要です（日本年金機構から「国民年金保険料育児免除該当通知書」が届きます）。それ以外は、市区町村の国民年金担当窓口に届書を出す（郵送可）か、マイナポータルから電子申請します。'
          : '市区町村の国民年金担当窓口に届書を出す（郵送可）か、マイナポータルから電子申請します（2026年10月1日以降）。'}
      </p>

      {fuka && (
        <p>
          <strong>付加保険料：</strong>免除中も月{yen(FUKA_PREMIUM)}
          の付加保険料は納められます（上の免除額には含めていません）。
        </p>
      )}

      <p className="hint">
        出産の月が予定と前後した場合は、免除の月が1か月前後することがあります。
        最終的な該当と期間は年金事務所または市区町村の国民年金窓口で確認してください。
      </p>
    </>
  );
}

const CELL_STYLE: Record<MonthCell['kind'], CSSProperties> = {
  sanzen: { background: 'var(--accent-soft)', color: 'var(--text)' },
  ikuji: { background: 'var(--accent)', color: 'var(--on-accent)' },
  'before-enforcement': { background: 'var(--surface-2)', color: 'var(--muted)' },
};

/** 月ごとの帯。12 マスを超えたら年度の境（4 月）で折り返す */
function MonthBand({ cells }: { cells: MonthCell[] }) {
  const rows = splitRows(cells);
  return (
    <div style={{ margin: '12px 0' }}>
      {rows.map((row) => (
        <div key={row[0].ym} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', marginBottom: 2 }}>
            {formatMonthJa(row[0].ym)}〜{formatMonthJa(row[row.length - 1].ym)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2 }}>
            {row.map((c) => (
              <div
                key={c.ym}
                title={`${formatMonthJa(c.ym)}：${
                  c.kind === 'sanzen' ? '産前産後免除' : c.kind === 'ikuji' ? '育児免除' : '対象外（施行前）'
                }`}
                style={{
                  ...CELL_STYLE[c.kind],
                  textAlign: 'center',
                  fontSize: 'var(--fs-xs)',
                  padding: '6px 0',
                  borderRadius: 4,
                }}
              >
                {Number(c.ym.slice(5))}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 'var(--fs-xs)' }}>
        {(['sanzen', 'ikuji', 'before-enforcement'] as const)
          .filter((k) => cells.some((c) => c.kind === k))
          .map((k) => (
            <span key={k} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <span style={{ ...CELL_STYLE[k], width: 12, height: 12, borderRadius: 2, display: 'inline-block' }} />
              {k === 'sanzen' ? '産前産後免除' : k === 'ikuji' ? '育児免除' : '対象外（2026年10月より前）'}
            </span>
          ))}
      </div>
    </div>
  );
}
