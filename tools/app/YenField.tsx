/**
 * 円で入れる額の入力欄（保険料控除証明書や源泉徴収票の額をそのまま入れる想定）。
 * 年末調整・生命保険料控除の2つの計算機で同じ作りにするため、ここに置いている
 */
export default function YenField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label style={{ fontSize: 'var(--fs-sm)' }}>
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {hint && (
        <span
          style={{
            display: 'block',
            marginTop: 4,
            color: 'var(--muted)',
            fontWeight: 400,
            fontSize: 'var(--fs-xs)',
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}
