# 雇用保険料率の令和8年度改定（5.5 → 5/1,000）が 2ファイルに未反映で、社保概算は令和7年度の料率のまま — 6ツールの数字がずれている

**状態**：提案（2026-09-17 起票、未実装。同日の企画レビュー（#221）で「料率は葉のモジュールに切り出す」
「テストの範囲は 5ファイル」の 2点を反映）。**法対応の修正**なので、新機能より先に入れる。
実装 PR は `fix(tools):`（`lib/`・`tests/` を触るため `docs:` にしない）
**対象**：`tools/lib/shaho-ryoritsu.ts`（新規）・`tools/lib/hatarakizon.ts`・`tools/lib/furusato-nozei.ts`・
`tools/tests/hatarakizon.test.ts`・`tools/tests/furusato-nozei.test.ts`・`tools/tests/nenmatsu-chosei.test.ts`・
`tools/tests/ideco.test.ts`・`tools/tests/iryohi-kojo.test.ts`・`tools/CLAUDE.md`（運用表に 1行）
**起票**：2026-09-17

---

## 背景と根拠

2026-09-17 の定期点検（7ツールの制度定数を一次情報と突き合わせ）で、
**社会保険料率の定数が 2か所で古い**ことが分かった。日付・金額ほか他の定数
（子育て支援金 0.23%・令和8年分の控除・年収の壁・たばこ税の段階・高校授業料・
自転車の反則金・ふるさと納税の控除表）はすべて一次情報と一致している。

### 1. 雇用保険料率（労働者負担・一般の事業）は令和8年4月1日から **5/1,000**。コードは 5.5/1,000 のまま

厚生労働省「令和8年4月1日から令和9年3月31日までの雇用保険料率」
（ https://www.mhlw.go.jp/content/001692566.pdf ）：一般の事業 **13.5/1,000**（労働者負担 **5/1,000**・
事業主負担 8.5/1,000）。令和7年度は 14.5/1,000（労働者 5.5・事業主 9.0）だったので、
**労働者負担が 0.5/1,000 下がった**。

```ts
// tools/lib/hatarakizon.ts:90
/** 雇用保険料率（労働者負担・一般の事業）。標準報酬月額ではなく実際の賃金にかかる */
export const EMPLOYMENT_RATE = 0.0055;   // ← 令和7年度の値。令和8年度は 0.005

// tools/lib/furusato-nozei.ts:245
const employment = income * 0.0055;      // ← 同じく令和7年度の値
```

`hatarakizon.ts` は 2026-08-13 に **健康保険 9.9%・介護 1.62%・子育て支援金 0.23% を令和8年度に
更新した**（[hatarakizon-r8-hokenryoritsu.md](./hatarakizon-r8-hokenryoritsu.md)）が、
**同じファイルの雇用保険料率だけ見落とした**。ファイル冒頭の一次情報の一覧にも雇用保険の
出典が無い（協会けんぽ・年金機構・こども家庭庁の 3つだけ）。出典が無い定数は点検の対象から
漏れる、という構造の問題でもある。

### 2. `estimateSocialInsurance()` は健保・介護も令和7年度のままで、支援金が入っていない

```ts
// tools/lib/furusato-nozei.ts:238-246
export function estimateSocialInsurance(income: number, kaigo = false): number {
  // 協会けんぽの全国平均（本人負担分）。介護保険は40〜64歳のみ
  const healthRate = 0.0499 + (kaigo ? 0.008 : 0);   // ← 令和7年度（9.98%・1.60%）。令和8年度は 4.95%・0.81%、支援金 0.115% が加算
  ...
  const employment = income * 0.0055;                  // ← 5/1,000 へ
```

この関数は **ふるさと納税・年末調整・iDeCo・医療費控除の 4ツール**が「社会保険料の額を
入力しない場合の概算」として呼んでいる（`furusato-nozei.ts:444`・`nenmatsu-chosei.ts:551`・
`ideco.ts:403`・`iryohi-kojo.ts:364`）。一方 `hatarakizon.ts` の `calcPremiums()` は
令和8年度の料率で、**手取り計算機・社会保険 損得計算機**が使う。
**同じ年収を入れても、ツールによって社保の概算が令和7年度と令和8年度で食い違う**状態になっている。

### 影響の大きさ（年収500万円・40歳未満）

| | 現状 | 令和8年度の料率 | 差 |
|---|---|---|---|
| `estimateSocialInsurance(5,000,000)` | 734,500円 | **735,750円**（健保 253,250＋厚年 457,500＋雇用 25,000） | +1,250円 |
| `calcPremiums(5,000,000).employment` | 27,500円 | **25,000円** | −2,500円 |

金額の差は小さい（ふるさと納税の上限で数百円、手取りで年 2,500円）。
**問題は大きさではなく、「一次情報どおり」を売りにしているサイトで料率が年度をまたいで
混在していること**。年末調整（12月）・ふるさと納税（駆け込みの 11〜12月）の
繁忙期に入る前に揃えておく。

## 提案する仕様

### A. 料率を**葉のモジュール** `tools/lib/shaho-ryoritsu.ts` に切り出し、両ファイルがそこから import する

**`furusato-nozei.ts` から `hatarakizon.ts` を import してはいけない。**
`hatarakizon.ts:43-50` は `BASIC_DEDUCTION_DIFF` / `adjustmentDeduction` / `basicDeductionIncomeTax` /
`basicDeductionResidentTax` / `incomeTaxAmount` / `salaryIncome` を `@/lib/furusato-nozei` から
import している（ファイル冒頭にも「計算式は lib/furusato-nozei.ts のものをそのまま再利用」とある）。
逆向きの import を足すと **furusato-nozei ⇄ hatarakizon の循環**になる。定数は関数の中でしか
使わないので ESM の live binding で動いてしまう可能性はあるが、バンドラの評価順に依存する形を
「一次情報を 1か所に」の実装で持ち込まない（起票時の「循環 import は起きない」は誤りだった。
企画レビュー #221 の指摘）。

- **新規 `tools/lib/shaho-ryoritsu.ts`**（名前は任意）に、本人負担・労使折半後の 5定数を置く：
  `HEALTH_RATE`（0.0495）・`KAIGO_RATE`（0.0081）・`SHIENKIN_RATE`（`kosodate-shienkin.ts` の
  `FISCAL_YEARS` から現行年度の `rate / 2` を引く。数字を書き写さない）・`PENSION_RATE`（0.0915）・
  **`EMPLOYMENT_RATE`（0.005。令和8年度。JSDoc に上記 PDF）**。
  C の点検表コメントもこのファイルの冒頭に置く。
  import は `@/lib/kosodate-shienkin` だけ（`kosodate-shienkin.ts` は `shaho-grades` しか
  import しない葉なので循環しない。`furusato-nozei.ts` 自身は import を 1つも持たない）
- `hatarakizon.ts` は自前の 5定数を消して `shaho-ryoritsu.ts` から import し、
  **同名で re-export する**（`export { HEALTH_RATE, ... } from '@/lib/shaho-ryoritsu'`）。
  `tedori-keisan.ts:60`・`tests/tedori-keisan.test.ts:131`・`tests/hatarakizon.test.ts` など
  既存の import 元は変えない
- `furusato-nozei.ts` の `estimateSocialInsurance()` は自前の数字を捨て、
  `import { HEALTH_RATE, KAIGO_RATE, SHIENKIN_RATE, PENSION_RATE, EMPLOYMENT_RATE } from '@/lib/shaho-ryoritsu'` で
  組み立てる（`healthRate = HEALTH_RATE + SHIENKIN_RATE + (kaigo ? KAIGO_RATE : 0)`）
- 上限（`HEALTH_CAP`・`PENSION_CAP`）と「等級に丸めない概算」という性格はそのまま
  （このツール群は年収ベースの概算で足りる。等級で厳密に出すのは手取り計算機の役割）
- `tools/CLAUDE.md` の運用表（「毎年3月 | 協会けんぽの料率改定を…」の行）の更新先を
  `lib/shaho-ryoritsu.ts` に直し、**「毎年4月 | 雇用保険料率（労働者負担）を `lib/shaho-ryoritsu.ts` の
  `EMPLOYMENT_RATE` に反映」の 1行を足す**（触っても `fix(tools):` のままでよい）

### B. テストを「率を固定する」形から「一次情報の値を 1か所で見る」形に直す

概算 `estimateSocialInsurance()` に依存する assertion は **5ファイル**にある
（`git grep -n "socialInsurance: null\|734_500" tools/tests` で洗い出した。起票時の「3ファイル・3行」は不足。
企画レビュー #221 の指摘）。**方針：実額で固定している期待値は新しい値に付け替える。
率や大小で見ているもの（「約14.7%」・`toBeGreaterThan`）はそのまま。**

- `tests/hatarakizon.test.ts:91`：`2_400_000 * 0.0055` のべた書きを `EMPLOYMENT_RATE` 経由にし、
  **別に「令和8年度の労働者負担は 5/1,000」を一次情報つきで固定する 1本**を足す
  （率そのものが変わったら落ちる。`tests/tedori-keisan.test.ts:131` は既に `EMPLOYMENT_RATE` 経由なので変更不要）
- `tests/furusato-nozei.test.ts:162-163`：`734_500` → `735_750`。「約14.7%」の見出しはそのまま（14.7%）。
  **同 337-339 行**（`socialInsurance: null` で `r.socialInsurance` が `734_500` を期待）も `735_750` へ
- `tests/nenmatsu-chosei.test.ts:22` のコメント（734,500円＝健保4.99%＋厚年9.15%＋雇用0.55%）を
  新しい内訳に直す。**同 189-191 行**（`socialInsurance: null` で `734_500` を期待）は
  「コメントだけ直す」では落ちるので `735_750` へ。
  **28 行の `socialInsurance: 734_500` の実額入力はそのままでよい**
  （このテストは「推計に依存させない」ために実額を渡しており、値が現実の年度と
  ずれていてもテストの意図には影響しない。コメントだけ嘘にならないようにする）
- `tests/ideco.test.ts:259`・`tests/iryohi-kojo.test.ts:35`：**base 入力が `socialInsurance: null`**
  なので、そのファイル内で金額を固定している assertion は概算の +1,250円ぶんずれる。
  実額の期待値は付け替え、率・大小・区分で見ているものは触らない（上の方針どおり）

### C. 「年度で変わる料率」を点検表に載せる

`shaho-ryoritsu.ts` の冒頭コメントに、**毎年 3〜4月に見る一次情報**として次の 4行を並べる
（`hatarakizon.ts` の冒頭「■ 一次情報」からは料率の出典を外し、「料率は shaho-ryoritsu.ts」と 1行書く）：

| 料率 | 改定時期 | 一次情報 |
|---|---|---|
| 健康保険（協会けんぽ全国平均）・介護 | 3月分（4月納付分）から | 協会けんぽ「令和◯年度の都道府県毎の保険料率」 |
| 子ども・子育て支援金 | 4月分から | こども家庭庁（`kosodate-shienkin.ts` の `FISCAL_YEARS`） |
| **雇用保険（労働者負担）** | **4月1日から** | **厚生労働省「令和◯年度の雇用保険料率」** |
| 厚生年金 | 18.3% で固定（平成29年9月〜） | 日本年金機構 |

## 期待される効果

| 効果 | 測り方 |
|---|---|
| 6ツール（手取り・損得・ふるさと納税・年末調整・iDeCo・医療費控除）の社保概算が令和8年度で揃う | 同じ年収で `calcPremiums().employment` と `estimateSocialInsurance()` の雇用保険分が一致 |
| 料率の定義が `shaho-ryoritsu.ts` の 1か所になり、次の改定（令和9年4月）で 1ファイルだけ直せばよくなる | `grep -rn "0\.005\|0\.0495\|0\.0081\|0\.0915" tools/lib` が `shaho-ryoritsu.ts` だけを返す |
| 雇用保険料率が点検の対象に入る（出典つき定数になり、`tools/CLAUDE.md` の運用表に行がある） | `shaho-ryoritsu.ts` 冒頭の一次情報一覧と CLAUDE.md の表に雇用保険の行がある |
| 循環 import を持ち込まない | `furusato-nozei.ts` の import が `@/lib/shaho-ryoritsu` の 1行だけ |

## 工数の見積り

| 作業 | 消費トークン（目安） |
|---|---|
| 一次情報の再確認（厚労省 PDF を実装時に読み直す。本ファイルは二次情報 3件と PDF の表題で裏取り） | 10k |
| A（`shaho-ryoritsu.ts` 新設・`hatarakizon.ts` の re-export・`furusato-nozei.ts` の import・JSDoc・`tools/CLAUDE.md` の運用表） | 20k |
| B（テスト 5ファイル） | 20k |
| C（点検表） | 5k |
| `npm test && npm run build`、テスト環境での 6ツールの表示確認 | 10k |
| **合計** | **約65k** |

## やらないこと

- **`estimateSocialInsurance()` を `calcPremiums()`（等級ベース）に置き換える。** 概算の性格が変わり、
  4ツールの結果が一斉に動く。年末調整・ふるさと納税は「源泉徴収票の実額を入れれば正確」という
  設計なので、概算は年収ベースの近似で足りる
- **健康保険料率を都道府県別にする。** 全国平均 9.9% のまま（`hatarakizon-r8-hokenryoritsu.md` の判断を踏襲）
- **令和7年度の料率を残して年度切替を入れる。** 手取り計算機だけが「令和7年分との比較」を持つが、
  それは税（控除）の比較で、保険料は現行年度だけでよい（`tedori-keisan.ts` の設計どおり）
- **賞与の保険料。** 年収ベースの概算では月給・賞与の配分を持たない（従来どおり）
- **`furusato-nozei.ts` から `hatarakizon.ts` を直接 import する。** 循環になる（A のとおり）。
  料率だけを葉に出すのが最小の直し方で、既存の import 元を 1つも変えずに済む

## 一次情報

- 厚生労働省「令和8年4月1日から令和9年3月31日までの雇用保険料率」
  https://www.mhlw.go.jp/content/001692566.pdf （一般の事業 13.5/1,000、労働者負担 5/1,000）。
  **本ファイルは二次情報 3件と PDF の表題で裏取りしており、PDF 本文は機械的に読めていない。
  実装時に PDF 本文で再確認する**（企画レビュー #221 も同条件）
- 全国健康保険協会「令和8年度の都道府県毎の保険料率」
  https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html
  （全国平均 9.9%・介護 1.62%）
- こども家庭庁「子ども・子育て支援金制度」 https://www.cfa.go.jp/policies/kodomokosodateshienkinseido （令和8年度 0.23%）
