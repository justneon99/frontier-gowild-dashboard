import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker/src/index.mjs';

const env={SITE_URL:'https://justneon99.github.io/frontier-gowild-dashboard/'};

test('mail feature reports unavailable until database and sender are configured',async()=>{
  const response=await worker.fetch(new Request('https://example.workers.dev/health',{headers:{Origin:'https://justneon99.github.io'}}),env);
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{ok:false});
});
test('CORS allows the product origin and rejects other sites',async()=>{
  const allowed=await worker.fetch(new Request('https://example.workers.dev/reminders',{method:'OPTIONS',headers:{Origin:'https://justneon99.github.io'}}),env);
  assert.equal(allowed.status,204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),'https://justneon99.github.io');
  const denied=await worker.fetch(new Request('https://example.workers.dev/health',{headers:{Origin:'https://other.example'}}),env);
  assert.equal(denied.status,403);
});
test('admin access and reminder restrictions are server-enforced',async(t)=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-29T12:00:00Z')});
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../worker/schema.sql',import.meta.url),'utf8'));
  const DB={prepare(sql){const statement=db.prepare(sql);return{all:async()=>({results:statement.all()}),bind(...values){return{first:async()=>statement.get(...values),all:async()=>({results:statement.all(...values)}),run:async()=>({meta:{changes:statement.run(...values).changes}})};}}}};
  const configured={...env,ADMIN_EMAIL:'howardyangemail@gmail.com',DB,RESEND_API_KEY:'test-key',MAIL_FROM:'Radar <radar@example.com>'};
  const sent=[];const originalFetch=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{sent.push(JSON.parse(options.body));return new Response('{"id":"sent"}',{status:200,headers:{'Content-Type':'application/json'}});};
  const call=(path,method='GET',body,token)=>worker.fetch(new Request(`https://example.workers.dev${path}`,{method,headers:{Origin:'https://justneon99.github.io',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})}),configured);
  try{
    assert.equal((await call('/auth/start','POST',{email:'unknown@example.com'})).status,200);
    assert.equal(sent.length,0,'uninvited emails receive no sign-in link');
    await call('/auth/start','POST',{email:'howardyangemail@gmail.com'});
    const adminLink=sent.at(-1).text.match(/https:\/\/\S+\/auth\/verify\?token=[a-f0-9]+/)[0];
    const adminRedirect=await call(new URL(adminLink).pathname+new URL(adminLink).search);
    const adminToken=new URLSearchParams(new URL(adminRedirect.headers.get('Location')).hash.slice(1)).get('session');
    assert.equal((await (await call('/me','GET',null,adminToken)).json()).isAdmin,true);
    const inviteResponse=await call('/admin/invitations','POST',{email:'friend@example.com'},adminToken);
    assert.equal(inviteResponse.status,201);
    const invitationLink=sent.at(-1).text.match(/https:\/\/\S+\/invitations\/accept\?token=[a-f0-9]+/)[0];
    const acceptRedirect=await call(new URL(invitationLink).pathname+new URL(invitationLink).search);
    const friendToken=new URLSearchParams(new URL(acceptRedirect.headers.get('Location')).hash.slice(1)).get('session');
    assert.equal((await call(new URL(invitationLink).pathname+new URL(invitationLink).search)).status,401,'invitation cannot be reused');
    assert.equal((await (await call('/me','GET',null,friendToken)).json()).isAdmin,false);
    assert.equal((await call('/admin/overview','GET',null,friendToken)).status,403);
    const overview=await (await call('/admin/overview','GET',null,adminToken)).json();
    assert.ok(overview.users,JSON.stringify(overview));
    assert.equal(overview.users.length,2);
    assert.equal(overview.invitations[0].acceptedAt!==null,true);
    const friend=overview.users.find(row=>row.email==='friend@example.com');
    db.prepare("INSERT INTO reminders(id,user_id,origin,destination,travel_date,remind_at,time_zone,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(crypto.randomUUID(),friend.id,'SFO','LAS','2026-11-18','2026-11-17T08:00:00Z','America/Los_Angeles','active',new Date().toISOString(),new Date().toISOString());
    assert.equal((await call(`/admin/users/${friend.id}/revoke`,'POST',null,adminToken)).status,200);
    assert.equal(db.prepare('SELECT status FROM reminders WHERE user_id=?').get(friend.id).status,'cancelled');
    assert.equal((await call('/me','GET',null,friendToken)).status,401);
    const sentCount=sent.length;
    await call('/auth/start','POST',{email:'friend@example.com'});
    assert.equal(sent.length,sentCount,'revoked email receives no sign-in link');
    assert.equal((await call(`/admin/users/${friend.id}/restore`,'POST',null,adminToken)).status,200);
    await call('/auth/start','POST',{email:'friend@example.com'});
    assert.equal(sent.length,sentCount+1,'restored email can sign in again');
    const pendingResponse=await call('/admin/invitations','POST',{email:'second@example.com'},adminToken);
    const pending=await pendingResponse.json();
    const pendingLink=sent.at(-1).text.match(/https:\/\/\S+\/invitations\/accept\?token=[a-f0-9]+/)[0];
    assert.equal((await call(`/admin/invitations/${pending.id}/revoke`,'POST',null,adminToken)).status,200);
    assert.equal((await call(new URL(pendingLink).pathname+new URL(pendingLink).search)).status,401,'canceled invitation cannot be accepted');
    const reminder={origin:'SFO',destination:'LAS',timeZone:'America/Los_Angeles'};
    assert.equal((await call('/reminders','POST',{...reminder,travelDate:'2026-10-08',remindAt:'2026-10-07T07:00:00.000Z'},adminToken)).status,400,'blackout dates cannot create GoWild reminders');
    assert.equal((await call('/reminders','POST',{...reminder,travelDate:'2026-09-30',remindAt:'2026-09-29T07:00:00.000Z'},adminToken)).status,400,'past reminders cannot be created');
    assert.equal((await call('/reminders','POST',{...reminder,travelDate:'2026-10-01',remindAt:'2026-09-30T07:00:00.000Z'},adminToken)).status,201,'future eligible reminders still work');
  }finally{globalThis.fetch=originalFetch;db.close();}
});
