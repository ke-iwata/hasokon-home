import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { before, describe, it } from 'node:test';

import { READONLY_SCOPE, base64url, buildAssertion, fetchAccessToken, parseServiceAccount } from '../lib/google-auth.mjs';

let serviceAccountJson;
let publicKey;

before(() => {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  publicKey = pair.publicKey;
  serviceAccountJson = JSON.stringify({
    type: 'service_account',
    client_email: 'claude@hasokon-site.iam.gserviceaccount.com',
    private_key: pair.privateKey,
  });
});

const decodeSegment = (segment) => JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));

describe('base64url', () => {
  it('+ / = を含まない', () => {
    const encoded = base64url(Buffer.from([0xfb, 0xff, 0xfe, 0x01]));
    assert.doesNotMatch(encoded, /[+/=]/);
    assert.deepEqual(Buffer.from(encoded, 'base64url'), Buffer.from([0xfb, 0xff, 0xfe, 0x01]));
  });
});

describe('parseServiceAccount', () => {
  it('生のJSONを読む', () => {
    const sa = parseServiceAccount(serviceAccountJson);
    assert.equal(sa.client_email, 'claude@hasokon-site.iam.gserviceaccount.com');
    assert.equal(sa.token_uri, 'https://oauth2.googleapis.com/token');
  });

  it('base64で包んだものも読む', () => {
    const sa = parseServiceAccount(Buffer.from(serviceAccountJson).toString('base64'));
    assert.equal(sa.client_email, 'claude@hasokon-site.iam.gserviceaccount.com');
  });

  it('前後の空白があっても読む', () => {
    assert.equal(parseServiceAccount(`\n  ${serviceAccountJson}  \n`).client_email, 'claude@hasokon-site.iam.gserviceaccount.com');
  });

  it('秘密鍵の \\n を実際の改行に直す', () => {
    const escaped = JSON.stringify({
      client_email: 'a@b.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\\nAAAA\\n-----END PRIVATE KEY-----\\n',
    });
    assert.equal(
      parseServiceAccount(escaped).private_key,
      '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n',
    );
  });

  it('token_uri が入っていればそれを使う', () => {
    const withUri = JSON.stringify({
      client_email: 'a@b.iam.gserviceaccount.com',
      private_key: 'x',
      token_uri: 'https://example.test/token',
    });
    assert.equal(parseServiceAccount(withUri).token_uri, 'https://example.test/token');
  });

  it('空なら分かる形で落ちる', () => {
    assert.throws(() => parseServiceAccount(''), /空です/);
    assert.throws(() => parseServiceAccount(undefined), /空です/);
  });

  it('JSONとして壊れていたら分かる形で落ちる', () => {
    assert.throws(() => parseServiceAccount('{ not json'), /解析できません/);
  });

  it('必要な項目が無ければ、どれが無いか言う', () => {
    assert.throws(() => parseServiceAccount('{"client_email":"a@b"}'), /private_key/);
    assert.throws(() => parseServiceAccount('{"private_key":"x"}'), /client_email/);
  });
});

describe('buildAssertion', () => {
  it('Googleが要求する形のJWTを作る', () => {
    const sa = parseServiceAccount(serviceAccountJson);
    const [header, claim] = buildAssertion(sa, { now: 1_000_000 }).split('.');

    assert.deepEqual(decodeSegment(header), { alg: 'RS256', typ: 'JWT' });
    assert.deepEqual(decodeSegment(claim), {
      iss: 'claude@hasokon-site.iam.gserviceaccount.com',
      scope: READONLY_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_000_000,
      exp: 1_000_000 + 3600,
    });
  });

  it('秘密鍵で署名されている', () => {
    const sa = parseServiceAccount(serviceAccountJson);
    const [header, claim, signature] = buildAssertion(sa, { now: 1_000_000 }).split('.');

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${claim}`);
    assert.equal(verifier.verify(publicKey, Buffer.from(signature, 'base64url')), true);
  });

  it('署名にURLセーフでない文字が混ざらない', () => {
    const sa = parseServiceAccount(serviceAccountJson);
    // 署名は鍵ごとに変わるので、+ / = が出うる組み合わせを何度か引く
    for (let i = 0; i < 20; i += 1) {
      assert.doesNotMatch(buildAssertion(sa, { now: 1_000_000 + i }).split('.')[2], /[+/=]/);
    }
  });

  it('scope を差し替えられる', () => {
    const sa = parseServiceAccount(serviceAccountJson);
    const claim = decodeSegment(buildAssertion(sa, { now: 1, scope: 'https://example.test/scope' }).split('.')[1]);
    assert.equal(claim.scope, 'https://example.test/scope');
  });

  it('有効期間が1時間を超えたら落とす（Googleが受け付けない）', () => {
    const sa = parseServiceAccount(serviceAccountJson);
    assert.throws(() => buildAssertion(sa, { now: 1, lifetimeSeconds: 7200 }), /1〜3600秒/);
    assert.throws(() => buildAssertion(sa, { now: 1, lifetimeSeconds: 0 }), /1〜3600秒/);
  });
});

describe('fetchAccessToken', () => {
  const okResponse = (body) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  });

  it('トークンエンドポイントにJWTを渡してトークンを受け取る', async () => {
    const sa = parseServiceAccount(serviceAccountJson);
    const seen = {};
    const fetchImpl = async (url, init) => {
      seen.url = url;
      seen.init = init;
      return okResponse({ access_token: 'ya29.test', expires_in: 3599 });
    };

    const result = await fetchAccessToken(sa, { now: 1_000_000, fetchImpl });

    assert.equal(result.accessToken, 'ya29.test');
    assert.equal(result.expiresIn, 3599);
    assert.equal(seen.url, 'https://oauth2.googleapis.com/token');
    assert.equal(seen.init.method, 'POST');

    const body = new URLSearchParams(seen.init.body);
    assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    assert.equal(decodeSegment(body.get('assertion').split('.')[1]).iat, 1_000_000);
  });

  it('HTTPエラーは本文つきで報告する', async () => {
    const sa = parseServiceAccount(serviceAccountJson);
    const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'invalid_grant' });

    await assert.rejects(() => fetchAccessToken(sa, { now: 1, fetchImpl }), /HTTP 401.*invalid_grant/s);
  });

  it('access_token が無ければ落とす', async () => {
    const sa = parseServiceAccount(serviceAccountJson);
    const fetchImpl = async () => okResponse({ expires_in: 3600 });

    await assert.rejects(() => fetchAccessToken(sa, { now: 1, fetchImpl }), /access_token がありません/);
  });

  it('JSONでない返事は分かる形で落とす', async () => {
    const sa = parseServiceAccount(serviceAccountJson);
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => '<html>502</html>' });

    await assert.rejects(() => fetchAccessToken(sa, { now: 1, fetchImpl }), /JSONではありません/);
  });
});
