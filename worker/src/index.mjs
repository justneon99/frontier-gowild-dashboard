import { normalizeTask, evaluateCheck } from './booking.mjs';
const DAY = 86_400_000;
const json = (data, status, origin) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store', 'Vary': 'Origin' } });
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const now = () => new Date().toISOString();
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const adminEmail = env => String(env.ADMIN_EMAIL || '').trim().toLowerCase();
const validEmail = value => { const email = String(value || '').trim().toLowerCase(); if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail('Invalid email'); return email; };
const site = env => { const url = new URL(env.SITE_URL); if (url.protocol !== 'https:') throw fail('SITE_URL must use HTTPS', 503); return url; };
const ready = env => Boolean(env.DB && env.GOOGLE_CLIENT_ID && !String(env.GOOGLE_CLIENT_ID).startsWith('REPLACE_') && env.ADMIN_EMAIL && env.SITE_URL);
const body = async request => { try { const data = await request.json(); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data; } catch { throw fail('Invalid JSON object'); } };
const decode = value => { const base64 = value.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), c => c.charCodeAt(0)); };

// Google publishes signing keys at this endpoint. Verify cryptography and every required claim server-side.
export async function verifyGoogleIdToken(credential, clientId, fetchKeys = fetch) {
  if (typeof credential !== 'string' || credential.length > 10000) throw fail('Invalid Google credential', 401);
  const parts = credential.split('.');
  if (parts.length !== 3) throw fail('Invalid Google credential', 401);
  let header, claims;
  try { header = JSON.parse(new TextDecoder().decode(decode(parts[0]))); claims = JSON.parse(new TextDecoder().decode(decode(parts[1]))); } catch { throw fail('Invalid Google credential', 401); }
  if (header.alg !== 'RS256' || !header.kid || !/^[\w-]+$/.test(header.kid)) throw fail('Invalid Google credential', 401);
  const response = await fetchKeys('https://www.googleapis.com/oauth2/v3/certs');
  if (!response.ok) throw fail('Google sign-in verification unavailable', 503);
  const keys = await response.json();
  const jwk = keys.keys?.find(item => item.kid === header.kid && item.kty === 'RSA' && item.alg === 'RS256' && item.use === 'sig');
  if (!jwk) throw fail('Unrecognized Google signing key', 401);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), signed)) throw fail('Invalid Google signature', 401);
  const seconds = Math.floor(Date.now() / 1000);
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) || claims.aud !== clientId || !Number.isFinite(claims.exp) || claims.exp <= seconds || !Number.isFinite(claims.iat) || claims.iat > seconds + 60 || claims.email_verified !== true || !claims.sub || typeof claims.sub !== 'string') throw fail('Invalid Google identity', 401);
  return { email: validEmail(claims.email), sub: claims.sub };
}

async function accountFromRequest(request, env) {
  const secret = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!secret) throw fail('Unauthorized', 401);
  const user = await env.DB.prepare('SELECT users.id, users.email, users.google_sub AS googleSub FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires_at>? AND users.revoked_at IS NULL').bind(await hash(secret), now()).first();
  if (!user) throw fail('Unauthorized', 401);
  return user;
}
async function googleSignIn(request, env) {
  const input = await body(request);
  const identity = await verifyGoogleIdToken(input.credential, env.GOOGLE_CLIENT_ID);
  const date = now();
  let user = await env.DB.prepare('SELECT id, email, google_sub AS googleSub, revoked_at AS revokedAt FROM users WHERE email=?').bind(identity.email).first();
  if (user?.revokedAt) throw fail('Account access revoked', 403);
  if (user?.googleSub && user.googleSub !== identity.sub) throw fail('This Google account does not match the registered account', 403);
  if (!user && identity.email !== adminEmail(env)) {
    const inviteToken = String(input.inviteToken || '');
    if (!/^[a-f0-9]{64}$/.test(inviteToken)) throw fail('An invitation for this Google account is required', 403);
    const invite = await env.DB.prepare('SELECT id, email FROM invitations WHERE token_hash=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?').bind(await hash(inviteToken), date).first();
    if (!invite || invite.email !== identity.email) throw fail('Invitation expired, used, or for another email', 403);
    const claim = await env.DB.prepare('UPDATE invitations SET accepted_at=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?').bind(date, invite.id, date).run();
    if (!claim.meta.changes) throw fail('Invitation already used', 403);
  }
  if (!user) {
    await env.DB.prepare('INSERT INTO users(id,email,google_sub,created_at,last_signed_in_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), identity.email, identity.sub, date, date).run();
  } else {
    await env.DB.prepare('UPDATE users SET google_sub=?, last_signed_in_at=? WHERE id=?').bind(identity.sub, date, user.id).run();
  }
  user = await env.DB.prepare('SELECT id, email FROM users WHERE email=?').bind(identity.email).first();
  const session = token();
  await env.DB.prepare('INSERT INTO sessions(hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await hash(session), user.id, new Date(Date.now() + 30 * DAY).toISOString(), date).run();
  return { session, email: identity.email, isAdmin: identity.email === adminEmail(env) };
}
async function overview(env) {
  const users = await env.DB.prepare('SELECT id,email,created_at AS createdAt,last_signed_in_at AS lastSignedInAt,revoked_at AS revokedAt FROM users ORDER BY created_at DESC LIMIT 200').all();
  const invitations = await env.DB.prepare('SELECT id,email,created_at AS createdAt,expires_at AS expiresAt,accepted_at AS acceptedAt,revoked_at AS revokedAt FROM invitations ORDER BY created_at DESC LIMIT 100').all();
  return { users: users.results, invitations: invitations.results };
}
async function invite(request, env, admin) {
  const input = await body(request), email = validEmail(input.email), date = now();
  if (email === adminEmail(env)) throw fail('Admin account already has access', 409);
  const user = await env.DB.prepare('SELECT revoked_at FROM users WHERE email=?').bind(email).first();
  if (user) throw fail(user.revoked_at ? 'Restore this account first' : 'Account already has access', 409);
  const pending = await env.DB.prepare('SELECT id FROM invitations WHERE email=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?').bind(email, date).first();
  if (pending) throw fail('A current invitation already exists', 409);
  const secret = token(), id = crypto.randomUUID(), expiresAt = new Date(Date.now() + 7 * DAY).toISOString();
  await env.DB.prepare('INSERT INTO invitations(id,token_hash,email,invited_by,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(id, await hash(secret), email, admin.id, date, expiresAt).run();
  const link = new URL('admin.html', site(env)); link.searchParams.set('invite', secret);
  return { id, email, expiresAt, link: link.href };
}
async function setAccess(env, id, action) {
  const target = await env.DB.prepare('SELECT id,email FROM users WHERE id=?').bind(id).first();
  if (!target) throw fail('Account not found', 404);
  if (target.email === adminEmail(env)) throw fail('Admin access cannot be changed here', 403);
  if (action === 'revoke') {
    await env.DB.prepare('UPDATE users SET revoked_at=? WHERE id=?').bind(now(), id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
  } else await env.DB.prepare('UPDATE users SET revoked_at=NULL WHERE id=?').bind(id).run();
  return { id, status: action === 'revoke' ? 'revoked' : 'active' };
}
async function revokeInvitation(env, id) {
  const result = await env.DB.prepare('UPDATE invitations SET revoked_at=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL').bind(now(), id).run();
  if (!result.meta.changes) throw fail('Pending invitation not found', 404);
  return { id, status: 'revoked' };
}
const taskId = path => path.match(/^\/personal\/tasks\/([a-f0-9-]{36})(?:\/(checks|cancel))?$/)?.slice(1);
async function getTask(env, id, userId) {
  const row = await env.DB.prepare('SELECT id,origin,destination,travel_date AS travelDate,earliest_time AS earliestTime,latest_time AS latestTime,max_total_cents AS maxTotalCents,status,created_at AS createdAt,updated_at AS updatedAt,cancelled_at AS cancelledAt FROM booking_tasks WHERE id=? AND owner_id=?').bind(id, userId).first();
  if (!row) throw fail('Task not found', 404);
  return row;
}
async function listTasks(env, userId) {
  const rows = await env.DB.prepare('SELECT id,origin,destination,travel_date AS travelDate,earliest_time AS earliestTime,latest_time AS latestTime,max_total_cents AS maxTotalCents,status,created_at AS createdAt,updated_at AS updatedAt,cancelled_at AS cancelledAt FROM booking_tasks WHERE owner_id=? ORDER BY created_at DESC LIMIT 50').bind(userId).all();
  return rows.results;
}
async function createTask(request, env, user) {
  const value = normalizeTask(await body(request)), date = now(), id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO booking_tasks(id,owner_id,origin,destination,travel_date,earliest_time,latest_time,max_total_cents,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id, user.id, value.origin, value.destination, value.travelDate, value.earliestTime, value.latestTime, value.maxTotalCents, 'planned', date, date).run();
  return getTask(env, id, user.id);
}
async function recordCheck(request, env, user, id) {
  const task = await getTask(env, id, user.id);
  if (task.cancelledAt) throw fail('Task has been cancelled', 409);
  const value = evaluateCheck(task, await body(request)), date = now();
  await env.DB.prepare('INSERT INTO booking_checks(id,task_id,checked_at,result,reasons_json,flight_number,departure_time,arrival_time,total_cents,evidence_url,checkpoint) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), id, date, value.result, JSON.stringify(value.reasons), value.flightNumber, value.departureTime, value.arrivalTime, value.totalCents, value.evidenceUrl, value.checkpoint).run();
  await env.DB.prepare('UPDATE booking_tasks SET status=?,updated_at=? WHERE id=? AND owner_id=?').bind(value.result, date, id, user.id).run();
  return { ...value, checkedAt: date, task: await getTask(env, id, user.id) };
}
async function checks(env, user, id) {
  await getTask(env, id, user.id);
  const rows = await env.DB.prepare('SELECT checked_at AS checkedAt,result,reasons_json AS reasonsJson,flight_number AS flightNumber,departure_time AS departureTime,arrival_time AS arrivalTime,total_cents AS totalCents,evidence_url AS evidenceUrl,checkpoint FROM booking_checks WHERE task_id=? ORDER BY checked_at DESC LIMIT 20').bind(id).all();
  return rows.results.map(row => ({ ...row, reasons: JSON.parse(row.reasonsJson), reasonsJson: undefined }));
}
async function cancelTask(env, user, id) {
  const task = await getTask(env, id, user.id);
  if (!task.cancelledAt) await env.DB.prepare('UPDATE booking_tasks SET status=?,cancelled_at=?,updated_at=? WHERE id=? AND owner_id=?').bind('cancelled', now(), now(), id, user.id).run();
  return getTask(env, id, user.id);
}
export default {
  async fetch(request, env) {
    const allowed = site(env).origin, origin = request.headers.get('Origin') || '';
    if (origin && origin !== allowed) return json({ error: 'Origin not allowed' }, 403, '');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' } });
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    try {
      if (path === '/health' && request.method === 'GET') return json({ ok: ready(env) }, ready(env) ? 200 : 503, allowed);
      if (!ready(env)) throw fail('Google sign-in or account database is not configured', 503);
      if (path === '/auth/google' && request.method === 'POST') return json(await googleSignIn(request, env), 200, allowed);
      const user = await accountFromRequest(request, env);
      if (path === '/me' && request.method === 'GET') return json({ email: user.email, isAdmin: user.email === adminEmail(env) }, 200, allowed);
      if (path.startsWith('/personal/')) {
        if (user.email !== adminEmail(env)) throw fail('Personal booking access required', 403);
        if (path === '/personal/tasks' && request.method === 'GET') return json({ tasks: await listTasks(env, user.id) }, 200, allowed);
        if (path === '/personal/tasks' && request.method === 'POST') return json(await createTask(request, env, user), 201, allowed);
        const match = taskId(path);
        if (match) {
          const [id, action] = match;
          if (!action && request.method === 'GET') return json(await getTask(env, id, user.id), 200, allowed);
          if (action === 'checks' && request.method === 'GET') return json({ checks: await checks(env, user, id) }, 200, allowed);
          if (action === 'checks' && request.method === 'POST') return json(await recordCheck(request, env, user, id), 201, allowed);
          if (action === 'cancel' && request.method === 'POST') return json(await cancelTask(env, user, id), 200, allowed);
        }
      }
      if (path.startsWith('/admin/')) {
        if (user.email !== adminEmail(env)) throw fail('Admin access required', 403);
        if (path === '/admin/overview' && request.method === 'GET') return json(await overview(env), 200, allowed);
        if (path === '/admin/invitations' && request.method === 'POST') return json(await invite(request, env, user), 201, allowed);
        const matchInvite = path.match(/^\/admin\/invitations\/([a-f0-9-]{36})\/revoke$/);
        if (matchInvite && request.method === 'POST') return json(await revokeInvitation(env, matchInvite[1]), 200, allowed);
        const matchUser = path.match(/^\/admin\/users\/([a-f0-9-]{36})\/(revoke|restore)$/);
        if (matchUser && request.method === 'POST') return json(await setAccess(env, matchUser[1], matchUser[2]), 200, allowed);
      }
      return json({ error: 'Not found' }, 404, allowed);
    } catch (error) { return json({ error: error.message || 'Server error' }, error.status || 500, allowed); }
  }
};
