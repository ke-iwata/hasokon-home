/**
 * OS のコマンドで同じ値を出すときの打ち方。
 *
 * 仕様: docs/features/hash-keisan.md「結果」のコマンドの欄
 *
 * **ファイル名は必ず引用する。** 空白・`&`・`$`・`;` を含む名前を貼っても壊れない・
 * 意図しない実行にならないため。
 * - Windows（certutil・PowerShell）：`"…"` で囲む（`"` はファイル名に使えないので、混ざっていたら外す）
 * - PowerShell は `-LiteralPath`（`[` `]` をワイルドカードと解釈させない）
 * - macOS・Linux：`'…'` で囲み、中の `'` は `'\''` にする
 *
 * 出典: Microsoft Learn Get-FileHash https://learn.microsoft.com/ja-jp/powershell/module/microsoft.powershell.utility/get-filehash
 */
import type { Algorithm } from './digest';

export const FILENAME_PLACEHOLDER = 'ファイル名';

export interface Command {
  os: string;
  command: string;
}

const WIN_NAME: Record<Algorithm, string> = { md5: 'MD5', sha1: 'SHA1', sha256: 'SHA256', sha384: 'SHA384', sha512: 'SHA512' };
const SHASUM_BITS: Record<Exclude<Algorithm, 'md5'>, string> = { sha1: '1', sha256: '256', sha384: '384', sha512: '512' };

export function quoteWindows(name: string): string {
  return `"${name.replace(/"/g, '')}"`;
}

export function quotePosix(name: string): string {
  return `'${name.replace(/'/g, `'\\''`)}'`;
}

/** ファイル名（未選択なら null）とアルゴリズムから、4つの OS の打ち方を作る */
export function commandsFor(filename: string | null, algorithm: Algorithm): Command[] {
  const name = filename ?? FILENAME_PLACEHOLDER;
  const w = quoteWindows(name);
  const p = quotePosix(name);
  const mac = algorithm === 'md5' ? `md5 ${p}` : `shasum -a ${SHASUM_BITS[algorithm]} ${p}`;
  return [
    { os: 'Windows（コマンドプロンプト）', command: `certutil -hashfile ${w} ${WIN_NAME[algorithm]}` },
    { os: 'Windows（PowerShell）', command: `Get-FileHash -LiteralPath ${w} -Algorithm ${WIN_NAME[algorithm]}` },
    { os: 'macOS', command: mac },
    { os: 'Linux', command: `${algorithm}sum ${p}` },
  ];
}
