// 週1回の計測ワークフロー（.github/workflows/gsc-audit.yml）の配線。
//
// 仕様: docs/features/google-index-recovery.md の「A. 監査スクリプトの内訳出力」
// 「週1回・結果は artifact・commitはしない」が守られているかを見張る。
// YAMLパーサは入れられない（scripts/ は依存パッケージゼロ）ので字面で見ている。

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const WORKFLOW = fileURLToPath(new URL('../../.github/workflows/gsc-audit.yml', import.meta.url));
const yaml = readFileSync(WORKFLOW, 'utf8');

describe('gsc-audit.yml', () => {
  it('週1回のスケジュールで回る', () => {
    assert.match(yaml, /^\s+schedule:$/m);
    // 曜日指定（cron の5番目）があること。毎日回すとURL検査APIの上限に近づく
    assert.match(yaml, /cron: '[^']*\s[0-7]'/);
  });

  it('手でも回せる', () => {
    assert.match(yaml, /^\s+workflow_dispatch:$/m);
  });

  it('監査スクリプトを --out つきで呼ぶ', () => {
    assert.match(yaml, /node scripts\/gsc-canonical-audit\.mjs .*--out /);
  });

  it('サービスアカウントを Secret から渡す', () => {
    assert.match(yaml, /GOOGLE_SERVICE_ACCOUNT_JSON: \$\{\{ secrets\.GOOGLE_SERVICE_ACCOUNT_JSON \}\}/);
  });

  it('結果を artifact に残す', () => {
    assert.match(yaml, /actions\/upload-artifact@v\d/);
  });

  it('結果をリポジトリにcommitしない', () => {
    // 計測のたびにコミットが増えると履歴が読めなくなる。仕様書の「コミットはしない」
    assert.doesNotMatch(yaml, /git (commit|push)/);
  });

  it('書き込み権限を持たない', () => {
    assert.match(yaml, /^permissions:\n\s+contents: read$/m);
  });

  it('終了コード1（統合が未完了）ではジョブを落とさない', () => {
    // 1 は「旧サブドメインが残っている／検査に失敗したURLがある」で、いまはこれがふつう。
    // bash -e に素で書くとここで落ちるので、`|| code=$?` で受けているか見る
    assert.match(yaml, /\|\| code=\$\?/);
    assert.match(yaml, /if \[ "\$code" -ge 2 \]/);
  });
});
