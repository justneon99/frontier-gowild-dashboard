import { AIRPORTS, TIME_ZONES, bookingReminder, recommend } from '../../dist/engine.mjs';
import routesData from '../../dist/data/routes.json' with { type: 'json' };

const HOUR_CHOICES = [0, 8, 12, 18];
const DAY = 86400000;
const routeRows = routesData.routes;

function reply(data,status=200,origin='') { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Vary':'Origin','Cache-Control':'no-store' } }); }
function error(message,status=400) { const e=new Error(message);e.status=status;return e; }
function htmlEscape(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function randomToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
async function hash(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
function site(env){const url=new URL(env.SITE_URL);if(url.protocol!=='https:')throw error('SITE_URL must use HTTPS',503);return url;}
function configReady(env){return Boolean(env.DB&&env.RESEND_API_KEY&&env.MAIL_FROM&&env.SITE_URL);}
async function sendMail(env,{to,subject,text,attachment,key}){
  const payload={from:env.MAIL_FROM,to:[to],subject,text};
  if(attachment)payload.attachments=[{filename:attachment.filename,content:btoa(attachment.content)}];
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload)});
  if(!response.ok){const body=await response.text();throw error(`Email provider rejected request (${response.status}): ${body.slice(0,160)}`,502);}
  return response.json();
}
async function readJson(request){try{return await request.json();}catch{throw error('Invalid JSON');}}
function validateSelection(payload){
  const {origin,destination,travelDate,remindAt}=payload;
  if(!AIRPORTS.includes(origin)||!AIRPORTS.includes(destination)||origin===destination)throw error('Invalid airport pair');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(travelDate)||!Number.isFinite(Date.parse(remindAt)))throw error('Invalid date');
  if(payload.timeZone&&payload.timeZone!==TIME_ZONES[origin])throw error('Invalid time zone');
  let valid=false;
  for(const hour of HOUR_CHOICES){
    try{const result=recommend({origin,destination,from:travelDate,to:travelDate,hour},routeRows,[]);if(result.options[0]?.reminder.at===remindAt){valid=true;break;}}catch{}
  }
  if(!valid)throw error('Reminder must match a verified future nonstop date and the applicable local booking window');
  const estimate=payload.estimate;
  const low=estimate&&Number.isFinite(Number(estimate.low))&&Number(estimate.low)>=0&&Number(estimate.low)<1000?Math.round(Number(estimate.low)):null;
  const high=estimate&&Number.isFinite(Number(estimate.high))&&Number(estimate.high)>=low&&Number(estimate.high)<1000?Math.round(Number(estimate.high)):null;
  return {origin,destination,travelDate,remindAt,timeZone:TIME_ZONES[origin],low,high};
}
async function userFromRequest(request,env){
  const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(!token)throw error('Unauthorized',401);
  const row=await env.DB.prepare('SELECT users.id,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires_at>?').bind(await hash(token),new Date().toISOString()).first();
  if(!row)throw error('Unauthorized',401);
  return row;
}
function ics(row,method='REQUEST'){
  const start=new Date(row.remind_at),end=new Date(start.getTime()+30*60000);
  const stamp=date=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Frontier GoWild Flight Radar//EN','CALSCALE:GREGORIAN',`METHOD:${method}`,'BEGIN:VEVENT',`UID:${row.id}@frontier-gowild-dashboard`,`SEQUENCE:${row.sequence}`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(start)}`,`DTEND:${stamp(end)}`,`SUMMARY:Check Frontier GoWild ${row.origin} to ${row.destination}`,`DESCRIPTION:Travel ${row.travel_date}. Check availability while signed in. https://www.flyfrontier.com/`,'URL:https://www.flyfrontier.com/',`STATUS:${method==='CANCEL'?'CANCELLED':'CONFIRMED'}`,'BEGIN:VALARM','TRIGGER:-PT0M','ACTION:DISPLAY','DESCRIPTION:Check Frontier GoWild','END:VALARM','END:VEVENT','END:VCALENDAR'];
  return lines.join('\r\n')+'\r\n';
}
async function sendInvite(env,user,row,method='REQUEST'){
  const action=method==='CANCEL'?'canceled':'scheduled';
  const when=new Date(row.remind_at).toLocaleString('en-US',{timeZone:row.time_zone,dateStyle:'medium',timeStyle:'short'});
  return sendMail(env,{to:user.email,subject:`Frontier GoWild reminder ${action}: ${row.origin} → ${row.destination}`,text:`Travel date: ${row.travel_date}\nSuggested check: ${when} (${row.time_zone})\n\nThis is a suggested time to check Frontier, not a guaranteed inventory release.\nOpen Frontier: https://www.flyfrontier.com/\nManage your reminder: ${site(env).href}`,attachment:{filename:`frontier-gowild-${row.id}.ics`,content:ics(row,method)},key:`invite-${row.id}-${row.sequence}-${method}`});
}
async function authStart(request,env){
  const body=await readJson(request),email=String(body.email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw error('Invalid email');
  const recent=await env.DB.prepare('SELECT COUNT(*) AS n FROM login_codes WHERE email=? AND created_at>?').bind(email,new Date(Date.now()-3600000).toISOString()).first();
  if(recent.n>=3)return {ok:true};
  const token=randomToken(),now=new Date().toISOString(),expires=new Date(Date.now()+15*60000).toISOString();
  await env.DB.prepare('INSERT INTO login_codes(hash,email,expires_at,created_at) VALUES(?,?,?,?)').bind(await hash(token),email,expires,now).run();
  const link=new URL('auth/verify',new URL('https://frontier-gowild-reminders.invalid/'));
  // The Worker request origin is used only for this one-time link; no user redirect is accepted.
  link.host=new URL(request.url).host;link.protocol='https:';link.searchParams.set('token',token);
  try{await sendMail(env,{to:email,subject:'Sign in to Frontier GoWild Flight Radar',text:`Open this one-time link within 15 minutes:\n${link.href}\n\nIf you did not request this, ignore this email.`,key:`login-${await hash(token)}`});}
  catch(err){await env.DB.prepare('DELETE FROM login_codes WHERE hash=?').bind(await hash(token)).run();throw err;}
  return {ok:true};
}
async function authVerify(request,env){
  const token=new URL(request.url).searchParams.get('token');if(!/^[a-f0-9]{64}$/.test(token||''))throw error('Invalid login link',401);
  const tokenHash=await hash(token),row=await env.DB.prepare('SELECT email FROM login_codes WHERE hash=? AND expires_at>?').bind(tokenHash,new Date().toISOString()).first();
  if(!row)throw error('Login link expired or already used',401);
  await env.DB.prepare('DELETE FROM login_codes WHERE hash=?').bind(tokenHash).run();
  const now=new Date().toISOString();await env.DB.prepare('INSERT OR IGNORE INTO users(id,email,created_at) VALUES(?,?,?)').bind(crypto.randomUUID(),row.email,now).run();
  const user=await env.DB.prepare('SELECT id,email FROM users WHERE email=?').bind(row.email).first();
  const session=randomToken();await env.DB.prepare('INSERT INTO sessions(hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await hash(session),user.id,new Date(Date.now()+30*DAY).toISOString(),now).run();
  const redirect=site(env);redirect.hash=new URLSearchParams({session,email:row.email}).toString();
  return Response.redirect(redirect.href,302);
}
async function listReminders(env,user){const rows=await env.DB.prepare('SELECT id,origin,destination,travel_date AS travelDate,remind_at AS remindAt,time_zone AS timeZone,status,estimate_low AS estimateLow,estimate_high AS estimateHigh FROM reminders WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(user.id).all();return {reminders:rows.results};}
async function createReminder(request,env,user){
  const data=validateSelection(await readJson(request)),now=new Date().toISOString();
  let row=await env.DB.prepare('SELECT * FROM reminders WHERE user_id=? AND origin=? AND destination=? AND travel_date=?').bind(user.id,data.origin,data.destination,data.travelDate).first();
  if(row&&row.status==='active'&&row.remind_at===data.remindAt)return {id:row.id,status:row.status,existing:true};
  if(row){await env.DB.prepare('UPDATE reminders SET remind_at=?,time_zone=?,estimate_low=?,estimate_high=?,status=?,sequence=sequence+1,notified_at=NULL,notify_claimed_at=NULL,updated_at=? WHERE id=?').bind(data.remindAt,data.timeZone,data.low,data.high,'sending',now,row.id).run();}
  else{const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO reminders(id,user_id,origin,destination,travel_date,remind_at,time_zone,estimate_low,estimate_high,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,user.id,data.origin,data.destination,data.travelDate,data.remindAt,data.timeZone,data.low,data.high,'sending',now,now).run();}
  row=await env.DB.prepare('SELECT * FROM reminders WHERE user_id=? AND origin=? AND destination=? AND travel_date=?').bind(user.id,data.origin,data.destination,data.travelDate).first();
  try{await sendInvite(env,user,row);await env.DB.prepare('UPDATE reminders SET status=? WHERE id=?').bind('active',row.id).run();return{id:row.id,status:'active'};}
  catch(err){await env.DB.prepare('UPDATE reminders SET status=? WHERE id=?').bind('send_failed',row.id).run();throw err;}
}
async function updateReminder(request,env,user,id){
  const row=await env.DB.prepare('SELECT * FROM reminders WHERE id=? AND user_id=?').bind(id,user.id).first();if(!row)throw error('Reminder not found',404);
  const body=await readJson(request),now=new Date().toISOString();
  if(body.status==='booked'||body.status==='cancelled'){
    if(row.status==='booked'||row.status==='cancelled')return{id,status:row.status};
    await env.DB.prepare('UPDATE reminders SET status=?,sequence=sequence+1,updated_at=? WHERE id=?').bind(body.status,now,id).run();
    if(row.status==='active'){const updated={...row,sequence:row.sequence+1};await sendInvite(env,user,updated,'CANCEL');}
    return{id,status:body.status};
  }
  if(body.remindAt){
    if(row.status==='booked'||row.status==='cancelled')throw error('This reminder is closed');
    const newAt=String(body.remindAt);if(!HOUR_CHOICES.some(hour=>bookingReminder(row.travel_date,row.origin,hour,row.destination).at===newAt)||Date.parse(newAt)<=Date.now())throw error('Invalid reminder time');
    await env.DB.prepare('UPDATE reminders SET remind_at=?,status=?,sequence=sequence+1,notified_at=NULL,notify_claimed_at=NULL,updated_at=? WHERE id=?').bind(newAt,'sending',now,id).run();
    const updated=await env.DB.prepare('SELECT * FROM reminders WHERE id=?').bind(id).first();
    try{await sendInvite(env,user,updated);await env.DB.prepare('UPDATE reminders SET status=? WHERE id=?').bind('active',id).run();return{id,status:'active'};}
    catch(err){await env.DB.prepare('UPDATE reminders SET status=? WHERE id=?').bind('send_failed',id).run();throw err;}
  }
  throw error('No valid change provided');
}
async function retryInvite(env,user,id){const row=await env.DB.prepare('SELECT * FROM reminders WHERE id=? AND user_id=? AND status=?').bind(id,user.id,'send_failed').first();if(!row)throw error('No failed invitation to retry',404);await sendInvite(env,user,row);await env.DB.prepare('UPDATE reminders SET status=? WHERE id=?').bind('active',id).run();return{id,status:'active'};}
async function runDue(env){
  if(!configReady(env))return;
  const now=new Date().toISOString(),stale=new Date(Date.now()-15*60000).toISOString();
  const result=await env.DB.prepare("SELECT reminders.*,users.email FROM reminders JOIN users ON users.id=reminders.user_id WHERE reminders.status='active' AND reminders.remind_at<=? AND reminders.notified_at IS NULL AND (reminders.notify_claimed_at IS NULL OR reminders.notify_claimed_at<?) AND reminders.notify_attempts<5 LIMIT 30").bind(now,stale).all();
  for(const row of result.results){
    const claim=await env.DB.prepare("UPDATE reminders SET notify_claimed_at=?,notify_attempts=notify_attempts+1 WHERE id=? AND status='active' AND notified_at IS NULL AND (notify_claimed_at IS NULL OR notify_claimed_at<?)").bind(now,row.id,stale).run();
    if(!claim.meta.changes)continue;
    try{await sendMail(env,{to:row.email,subject:`Time to check Frontier: ${row.origin} → ${row.destination}`,text:`Check Frontier GoWild availability now for ${row.origin} → ${row.destination} on ${row.travel_date}.\n\nOpen Frontier: https://www.flyfrontier.com/\nThis reminder does not confirm GoWild seats or price.\nManage trip: ${site(env).href}`,key:`due-${row.id}-${row.sequence}`});await env.DB.prepare('UPDATE reminders SET notified_at=?,notify_claimed_at=NULL WHERE id=?').bind(new Date().toISOString(),row.id).run();}
    catch{await env.DB.prepare('UPDATE reminders SET notify_claimed_at=NULL WHERE id=?').bind(row.id).run();}
  }
  await env.DB.prepare('DELETE FROM login_codes WHERE expires_at<?').bind(now).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now).run();
}
export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin')||'',allowed=site(env).origin;
    if(origin&&origin!==allowed)return reply({error:'Origin not allowed'},403,'');
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Vary':'Origin'}});
    const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
    try{
      if(path==='/health'&&request.method==='GET')return reply({ok:configReady(env)},configReady(env)?200:503,allowed);
      if(!configReady(env))throw error('Email service is not configured',503);
      if(path==='/auth/start'&&request.method==='POST')return reply(await authStart(request,env),200,allowed);
      if(path==='/auth/verify'&&request.method==='GET')return await authVerify(request,env);
      const user=await userFromRequest(request,env);
      if(path==='/reminders'&&request.method==='GET')return reply(await listReminders(env,user),200,allowed);
      if(path==='/reminders'&&request.method==='POST')return reply(await createReminder(request,env,user),201,allowed);
      const match=path.match(/^\/reminders\/([a-f0-9-]{36})(?:\/(retry))?$/);
      if(match&&request.method==='PATCH'&&!match[2])return reply(await updateReminder(request,env,user,match[1]),200,allowed);
      if(match&&request.method==='POST'&&match[2]==='retry')return reply(await retryInvite(env,user,match[1]),200,allowed);
      return reply({error:'Not found'},404,allowed);
    }catch(err){return reply({error:err.message||'Server error'},err.status||500,allowed);}
  },
  async scheduled(_controller,env,ctx){ctx.waitUntil(runDue(env));}
};
