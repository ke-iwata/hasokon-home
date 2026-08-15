'use client';

import { useState } from 'react';
import {
  CATEGORY_LABELS,
  DEFAULT_DAYS,
  MAX_PEOPLE_PER_TYPE,
  MAX_PETS_PER_TYPE,
  PERSON_LABELS,
  PET_LABELS,
  STOCK_DAYS_OPTIONS,
  WATER_BOTTLES_PER_CASE,
  WATER_BOTTLE_LITERS,
  calcBosaiBichiku,
  groupByCategory,
  type PersonType,
  type PetType,
} from '@/lib/bosai-bichiku';
import { trackToolUse } from '@/lib/analytics';

/** 人数の入力欄。並び順はそのまま画面の並びになる */
const PERSON_FIELDS: { type: PersonType; hint: string }[] = [
  { type: 'adult', hint: '中学生以上' },
  { type: 'senior', hint: '常備薬がある方' },
  { type: 'child', hint: '自分で食事をとる年齢' },
  { type: 'infant', hint: 'ミルク・おむつが要る年齢' },
];

const PET_FIELDS: PetType[] = ['dog', 'cat'];

/** 入力欄の初期値。ひとり暮らしを初期状態にすると結果が空にならず、何が出るか伝わる */
const INITIAL_PEOPLE: Record<PersonType, string> = {
  adult: '1',
  senior: '0',
  child: '0',
  infant: '0',
};

const INITIAL_PETS: Record<PetType, string> = { dog: '0', cat: '0' };

/** 入力文字列を数に直す。空欄は0（入力途中で結果が消えないようにするため） */
function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 小数の出る品目（水）だけ小数第1位まで出す。整数はそのまま */
function formatQuantity(value: number): string {
  return value.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
}

export default function Calculator() {
  const [people, setPeople] = useState<Record<PersonType, string>>(INITIAL_PEOPLE);
  const [pets, setPets] = useState<Record<PetType, string>>(INITIAL_PETS);
  const [days, setDays] = useState<number>(DEFAULT_DAYS);

  const result = calcBosaiBichiku({
    adults: toNumber(people.adult),
    seniors: toNumber(people.senior),
    children: toNumber(people.child),
    infants: toNumber(people.infant),
    dogs: toNumber(pets.dog),
    cats: toNumber(pets.cat),
    days,
  });

  const groups = groupByCategory(result.lines);
  const totalPets = result.pets.dog + result.pets.cat;

  /** 「大人2人・子ども1人 ／ 3日分」の見出し。印刷したとき何の一覧か分かるようにする */
  const heading = [
    ...(Object.entries(result.people) as [PersonType, number][])
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${PERSON_LABELS[type]}${count}人`),
    ...(Object.entries(result.pets) as [PetType, number][])
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${PET_LABELS[type]}${count}匹`),
  ].join('・');

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">家族の人数</span>
        <div className="field-row">
          {PERSON_FIELDS.map(({ type, hint }) => (
            <label key={type}>
              {PERSON_LABELS[type]}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_PEOPLE_PER_TYPE}
                value={people[type]}
                onChange={(e) => setPeople({ ...people, [type]: e.target.value })}
                onBlur={() => trackToolUse('bosai-bichiku-keisan', type)}
              />
              <span className="hint">{hint}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">ペット（いる場合）</span>
        <div className="field-row">
          {PET_FIELDS.map((type) => (
            <label key={type}>
              {PET_LABELS[type]}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_PETS_PER_TYPE}
                value={pets[type]}
                onChange={(e) => setPets({ ...pets, [type]: e.target.value })}
                onBlur={() => trackToolUse('bosai-bichiku-keisan', type)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">備蓄日数</span>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {STOCK_DAYS_OPTIONS.map((value) => (
            <label key={value} style={{ fontWeight: days === value ? 700 : 400 }}>
              <input
                type="radio"
                name="bosai-days"
                value={value}
                checked={days === value}
                onChange={() => {
                  setDays(value);
                  trackToolUse('bosai-bichiku-keisan', `days-${value}`);
                }}
                style={{ width: 'auto', marginRight: 6 }}
              />
              {value}日分
            </label>
          ))}
        </div>
        <p className="hint">
          国は「最低3日分、できれば1週間分」を勧めています（農林水産省）。7日分は、支援が届くまで時間のかかる大規模災害を想定した量です。まず3日分をそろえ、余裕ができたら7日分に増やしてください。
        </p>
      </div>

      {result.lines.length === 0 ? (
        <p className="panel quiet" role="status">
          家族の人数を入力すると、必要な備蓄の量が出ます。
        </p>
      ) : (
        <>
          <p style={{ margin: '16px 0 0' }}>
            <button
              type="button"
              onClick={() => {
                trackToolUse('bosai-bichiku-keisan', 'print');
                window.print();
              }}
              style={{ width: 'auto' }}
            >
              買い物チェックリストを印刷する
            </button>
          </p>
          <p className="hint">
            印刷すると、下のチェックリストだけが1枚に出ます（入力欄や解説は印刷されません）。PDFとして保存すれば、買い出しのときにスマホでも見られます。
          </p>

          {/*
            印刷用チェックリスト。
            data-print="sheet" が付いた要素だけが印刷され、それ以外（ヘッダ・入力欄・
            解説・広告）は消える。印刷の指定は app/globals.css の @media print 側にある
            （このページのためだけに新しいCSSクラスは足していない）
          */}
          <div data-print="sheet">
            <div className="panel">
              <p style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem' }}>
                防災備蓄チェックリスト
              </p>
              <p className="hint" style={{ margin: '2px 0 0' }}>
                {heading} ／ {result.days}日分
              </p>

              {groups.map((group) => (
                <section key={group.category} style={{ marginTop: 14 }}>
                  <h3 style={{ fontSize: '1rem', margin: '0 0 6px' }}>
                    {CATEGORY_LABELS[group.category]}
                  </h3>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {group.lines.map((line) => (
                      <li
                        key={line.id}
                        style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}
                      >
                        <label
                          style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: 0 }}
                        >
                          {/*
                            幅を inline style で指定しない。インラインは印刷用CSSの
                            width より強く、appearance:none と組み合わさると
                            紙の上で枠が潰れて書き込めなくなる
                          */}
                          <input
                            type="checkbox"
                            aria-label={`${line.name}を用意した`}
                            style={{ flex: 'none' }}
                          />
                          <span style={{ flex: '1 1 auto' }}>
                            {line.name}
                            {line.basis === 'derived' && (
                              <span className="chip" style={{ marginLeft: 6 }}>
                                当サイトの目安
                              </span>
                            )}
                          </span>
                          <strong style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {formatQuantity(line.quantity)}
                            {line.unit}
                          </strong>
                        </label>
                        <p className="hint" style={{ margin: '4px 0 0 26px' }}>
                          {line.note ? `${line.note} ` : ''}
                          根拠：{line.source}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {result.water.liters > 0 && (
                <p className="hint" style={{ marginTop: 14 }}>
                  水の買い方の目安：{WATER_BOTTLE_LITERS}Lのペットボトルで
                  {result.water.bottles.toLocaleString('ja-JP')}本（
                  {WATER_BOTTLES_PER_CASE}本入りなら{result.water.cases.toLocaleString('ja-JP')}
                  箱）。主食をすべて米でまかなうなら約{result.riceKg.toLocaleString('ja-JP')}
                  kgです（1食75g・0.5合で換算）。
                </p>
              )}

              <p className="hint" style={{ marginTop: 10 }}>
                数量は農林水産省「災害時に備えた食品ストックガイド」と東京都「東京備蓄ナビ」の目安にもとづく概算です。「当サイトの目安」と付いた項目は一次資料に数値の定めが無く、体格・月齢・体重で大きく変わります。常備薬の備蓄はかかりつけ医にご相談ください。／ hasokon.com
              </p>
            </div>
          </div>
        </>
      )}

      <p className="hint" style={{ marginTop: 12 }}>
        入力した内容はブラウザの中だけで計算され、どこにも送信されません。
        {totalPets > 0 && 'ペットのフードと水は、体重によって必要量が大きく変わります。'}
      </p>
    </div>
  );
}
