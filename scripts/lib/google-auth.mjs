// サービスアカウントのJSONから、Google API のアクセストークンを取る。
//
// google-auth-library を入れれば済む話ではあるが、このリポジトリは
// package.json を持たない素の静的HTMLという方針なので、
// JWT の署名は node:crypto でやっている（RS256 の署名1回で足りる）。

import { createSign } from 'node:crypto';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

export const READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

export function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 環境変数の中身をサービスアカウントとして読む。
 * 生のJSONでも、base64で包んだものでも受け取れるようにしてある
 * （CIのSecretに改行を含むJSONを置くと壊れやすいため）。
 */
export function parseServiceAccount(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('サービスアカウントのJSONが空です');
  }

  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('サービスアカウントのJSONを解析できません（生のJSONかbase64を渡してください）');
  }

  for (const field of ['client_email', 'private_key']) {
    if (typeof parsed[field] !== 'string' || parsed[field] === '') {
      throw new Error(`サービスアカウントのJSONに ${field} がありません`);
    }
  }

  return {
    ...parsed,
    // Secret 経由だと改行が \n のまま入っていることがある
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
    token_uri: parsed.token_uri ?? TOKEN_ENDPOINT,
  };
}

/**
 * トークン交換に使う署名済みJWTを作る。
 *
 * @param {object} serviceAccount parseServiceAccount の戻り値
 * @param {{ scope?: string, now?: number, lifetimeSeconds?: number }} [options] now は秒（テストから固定するため）
 */
export function buildAssertion(serviceAccount, options = {}) {
  const scope = options.scope ?? READONLY_SCOPE;
  const issuedAt = Math.floor(options.now ?? Date.now() / 1000);
  const lifetime = options.lifetimeSeconds ?? 3600;
  if (lifetime <= 0 || lifetime > 3600) {
    throw new Error('JWTの有効期間は1〜3600秒にしてください');
  }

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope,
      aud: serviceAccount.token_uri,
      iat: issuedAt,
      exp: issuedAt + lifetime,
    }),
  );

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(serviceAccount.private_key).toString('base64');
  return `${header}.${claim}.${signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

/**
 * アクセストークンを取る。
 *
 * @param {object} serviceAccount
 * @param {{ scope?: string, now?: number, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ accessToken: string, expiresIn: number }>}
 */
export async function fetchAccessToken(serviceAccount, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const assertion = buildAssertion(serviceAccount, options);

  const response = await fetchImpl(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: GRANT_TYPE, assertion }).toString(),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`アクセストークンを取得できません（HTTP ${response.status}）: ${body}`);
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error('トークンのレスポンスがJSONではありません');
  }
  if (!payload.access_token) {
    throw new Error('トークンのレスポンスに access_token がありません');
  }

  return { accessToken: payload.access_token, expiresIn: payload.expires_in ?? 3600 };
}
