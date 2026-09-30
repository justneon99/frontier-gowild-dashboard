import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker/src/index.mjs';

const origin = 'https://justneon99.github.io';
const baseEnv = { SITE_URL: `${origin}/frontier-gowild-dashboard/`, ADMIN_EMAIL: 'howardyangemail@gmail.com', GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com' };
const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

async function fixture(t) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8'));
  t.after(() => db.close());
  const DB = { prepare(sql) { const statement = db.prepare(sql); return { all: async () => ({ results: statement.all() }), bind(...values) { return { first: async () => statement.get(...values), all: async () => ({ results: statement.all(...values) }), run: async () => ({ meta: { changes: statement.run(...values).changes } }) }; } }; } };
  const keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const publicKey = { ...await crypto.subtle.exportKey('jwk', keyPair.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => { assert.equal(url, 'https://www.googleapis.com/oauth2/v3/certs'); return Response.json({ keys: [publicKey] }); };
  t.after(() => { globalThis.fetch = oldFetch; });
  const credential = async (email, overrides = {}) => { const header = b64({ alg: 'RS256', kid: 'test-key' }); const payload = b64({ iss: 'https://accounts.google.com', aud: baseEnv.GOOGLE_CLIENT_ID, sub: `sub-${email}`, email, email_verified: true, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...overrides }); const content = `${header}.${payload}`; const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(content)); return `${content}.${Buffer.from(signature).toString('base64url')}`; };
  const env = { ...baseEnv, DB };
  const call = (path, method = 'GET', data, session, requestOrigin = origin) => worker.fetch(new Request(`https://example.workers.dev${path}`, { method, headers: { Origin: requestOrigin, ...(session ? { Authorization: `Bearer ${session}` } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) }), env);
  return { db, env, credential, call };
}

test('health requires Google client and database; CORS rejects other sites', async t => {
  const { call, env } = await fixture(t);
  const health = await call('/health'); assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  assert.equal((await call('/health', 'GET', null, null, 'https://evil.example')).status, 403);
  assert.equal((await call('/auth/google', 'OPTIONS')).status, 204);
  delete env.GOOGLE_CLIENT_ID;
  assert.equal((await call('/health')).status, 503);
});

test('Google identity, invitation binding, one-time use, admin restrictions, revocation', async t => {
  const { credential, call } = await fixture(t);
  const badAudience = await call('/auth/google', 'POST', { credential: await credential('howardyangemail@gmail.com', { aud: 'other.apps.googleusercontent.com' }) });
  assert.equal(badAudience.status, 401);
  const badEmail = await call('/auth/google', 'POST', { credential: await credential('howardyangemail@gmail.com', { email_verified: false }) });
  assert.equal(badEmail.status, 401);
  const invalidSignature = (await credential('howardyangemail@gmail.com')).slice(0, -2) + 'xx';
  assert.equal((await call('/auth/google', 'POST', { credential: invalidSignature })).status, 401);
  const adminResponse = await call('/auth/google', 'POST', { credential: await credential('howardyangemail@gmail.com') });
  assert.equal(adminResponse.status, 200);
  const admin = await adminResponse.json(); assert.equal(admin.isAdmin, true);
  const session = admin.session;
  assert.equal((await call('/auth/google', 'POST', { credential: await credential('friend@example.com') })).status, 403);
  const created = await call('/admin/invitations', 'POST', { email: 'friend@example.com' }, session);
  assert.equal(created.status, 201);
  const invite = await created.json();
  assert.match(invite.link, /^https:\/\/justneon99.github.io\/frontier-gowild-dashboard\/admin.html\?invite=[a-f0-9]{64}$/);
  const inviteToken = new URL(invite.link).searchParams.get('invite');
  assert.equal((await call('/auth/google', 'POST', { credential: await credential('other@example.com'), inviteToken })).status, 403);
  const friendResponse = await call('/auth/google', 'POST', { credential: await credential('friend@example.com'), inviteToken });
  assert.equal(friendResponse.status, 200);
  const friend = await friendResponse.json(); assert.equal(friend.isAdmin, false);
  assert.equal((await call('/admin/overview', 'GET', null, friend.session)).status, 403);
  const overview = await (await call('/admin/overview', 'GET', null, session)).json();
  assert.equal(overview.users.length, 2);
  assert.ok(overview.invitations[0].acceptedAt);
  assert.equal((await call('/auth/google', 'POST', { credential: await credential('friend@example.com', { sub: 'different-sub' }) })).status, 403);
  const target = overview.users.find(row => row.email === 'friend@example.com');
  assert.equal((await call(`/admin/users/${target.id}/revoke`, 'POST', null, session)).status, 200);
  assert.equal((await call('/me', 'GET', null, friend.session)).status, 401);
  assert.equal((await call('/auth/google', 'POST', { credential: await credential('friend@example.com') })).status, 403);
  assert.equal((await call(`/admin/users/${target.id}/restore`, 'POST', null, session)).status, 200);
  assert.equal((await call('/auth/google', 'POST', { credential: await credential('friend@example.com') })).status, 200);
  const second = await (await call('/admin/invitations', 'POST', { email: 'second@example.com' }, session)).json();
  assert.equal((await call(`/admin/invitations/${second.id}/revoke`, 'POST', null, session)).status, 200);
  assert.equal((await call('/auth/google', 'POST', { credential: await credential('second@example.com'), inviteToken: new URL(second.link).searchParams.get('invite') })).status, 403);
  assert.equal((await call('/reminders', 'GET', null, session)).status, 404);
});
