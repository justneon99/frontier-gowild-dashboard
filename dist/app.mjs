import { AIRPORTS, TIME_ZONES, airportDate, recommend, publicFareHistory, airportOpportunities, bookingWindowDays } from './engine.mjs?v=20260929-atl-tpa-admin';

const $ = selector => document.querySelector(selector);
const elements = { origin: $('#origin'), destination: $('#destination'), from: $('#from'), to: $('#to'), budget: $('#budget'), hour: $('#hour') };
const state = { lang: localStorage.getItem('frontier-language') === 'en' ? 'en' : 'zh', routes: [], routesUpdatedAt: '', observations: [], fareCoverage: new Map(), updatedAt: '', selectedAirport: 'SFO', apiBase: '', apiReady: false, session: sessionStorage.getItem('frontier-session') || '', email: sessionStorage.getItem('frontier-email') || '', result: null, isAdmin: false, adminData: null };
const dict = {
  zh: { loadError:'数据加载失败，请稍后再试。', noRoute:'这两个机场目前没有已核实的 Frontier 直飞组合。', noDates:'所选范围没有可推荐的直飞日期。试试扩大范围或更换机场。', invalid:'请选择未来 90 天内的有效日期范围。', rec:'全部直飞班期日期按出行日期排序；公开价格和预算不影响日期展示。GoWild 价格与座位需查票时确认。', data:'数据更新', estimate:'公开票价推断', insufficient:'价格样本不足', budget:'预算内可能', over:'可能超预算', check:'建议查票', local:'出发机场当地时间', source:'查看班期', evidence:'最近参考报价', reverse:'反向航线', low:'估算可信度低', limited:'估算可信度有限', invite:'邮件日历邀请', download:'下载日历提醒', emailSent:'如果该邮箱已有访问权限，请检查登录链接。', emailError:'发送失败，请稍后再试。', backendReady:'邮件提醒已连接。登录后可保存行程并接收日历邀请。', backendOff:'邮件服务尚未连接。你仍可规划行程并下载日历提醒；邮箱邀请暂不可用。', signIn:'请先输入邮箱并通过登录链接验证，随后会继续保存所选提醒。', sent:'日历邀请已发送到注册邮箱。', saved:'行程已更新，新的日历邀请已发送。', cancelled:'提醒已取消。', booked:'已标记订票，后续提醒已停止。', emptyTrips:'还没有保存的行程。', cancel:'取消', bookedButton:'已订票', change:'修改时间', retry:'重发邀请', active:'等待查票', done:'已订票', cancelState:'已取消', pending:'发送中', sendError:'发送失败', unauth:'登录已过期，请重新验证邮箱。' },
  en: { loadError:'Could not load data. Please try again.', noRoute:'No verified Frontier nonstop pair for these airports.', noDates:'No recommended nonstop dates in this range. Try widening the range or changing airports.', invalid:'Choose a valid range within the next 90 days.', rec:'All nonstop schedule dates in date order. Public fares and budget do not filter dates. Confirm GoWild price and seats when checking.', data:'Data updated', estimate:'Public fare inference', insufficient:'Not enough fare data', budget:'May fit budget', over:'May exceed budget', check:'Suggested check', local:'Departure airport local time', source:'Schedule source', evidence:'Reference fare', reverse:'Reverse direction', low:'Low confidence', limited:'Limited confidence', invite:'Email calendar invite', download:'Download calendar reminder', emailSent:'If this email has access, check it for the sign-in link.', emailError:'Could not send email. Please try again.', backendReady:'Email reminders are connected. Sign in to save a trip and receive a calendar invite.', backendOff:'Email service is not connected yet. You can plan a trip and download a calendar reminder; email invites are unavailable.', signIn:'Verify your email using the sign-in link. Your selected reminder will then be saved.', sent:'Calendar invitation sent to your registered email.', saved:'Trip updated and a new calendar invitation sent.', cancelled:'Reminder canceled.', booked:'Marked booked. Future reminders are stopped.', emptyTrips:'No saved trips yet.', cancel:'Cancel', bookedButton:'Booked', change:'Change time', retry:'Resend invite', active:'Waiting to check', done:'Booked', cancelState:'Canceled', pending:'Sending', sendError:'Send failed', unauth:'Sign-in expired. Please verify your email again.' }
};
const t = key => dict[state.lang][key];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

const cities = {
  ATL:['亚特兰大','Atlanta'], TPA:['坦帕','Tampa'], CLT:['夏洛特','Charlotte'], CUN:['坎昆','Cancún'], DEN:['丹佛','Denver'], EWR:['纽瓦克','Newark'],
  GUA:['危地马拉城','Guatemala City'], LAS:['拉斯维加斯','Las Vegas'], LAX:['洛杉矶','Los Angeles'],
  LGA:['纽约','New York City'], MCO:['奥兰多','Orlando'], SAL:['圣萨尔瓦多','San Salvador'],
  SAN:['圣迭戈','San Diego'], SAP:['圣佩德罗苏拉','San Pedro Sula'], SEA:['西雅图','Seattle'],
  SFO:['旧金山','San Francisco'], SJC:['圣何塞·加州','San Jose, CA'], SJO:['圣何塞·哥斯达黎加','San José, Costa Rica'],
  SLC:['盐湖城','Salt Lake City']
};
const sortedAirports = [...AIRPORTS].sort((a,b)=>a.localeCompare(b));
const airportLabel = code => cities[code] ? `${code}${state.lang==='zh'?'（':' ('}${cities[code][state.lang==='zh'?0:1]}${state.lang==='zh'?'）':')'}` : code;
const pairLabel = (a,b,arrow=' → ') => `${airportLabel(a)}${arrow}${airportLabel(b)}`;
const airportOptions = () => sortedAirports.map(code=>`<option value="${code}">${esc(airportLabel(code))}</option>`).join('');
function renderPlannerAirports() {
  for(const select of [elements.origin,elements.destination]){const value=select.value;select.innerHTML=airportOptions();if(value)select.value=value;}
}

function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),3500); }
function formatDate(date, options={}) { return new Date(`${date}T12:00:00Z`).toLocaleDateString(state.lang==='zh'?'zh-CN':'en-US',{timeZone:'UTC',year:'numeric',month:'short',day:'numeric',weekday:'short',...options}); }
function formatObserved(value) { return new Date(value).toLocaleString(state.lang==='zh'?'zh-CN':'en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Los_Angeles',timeZoneName:'short'}); }
function syncOriginDates(){
  const today=airportDate(new Date(),elements.origin.value);
  elements.from.min=today;elements.to.min=today;
  if(elements.from.value&&elements.from.value<today)elements.from.value=today;
  if(elements.to.value&&elements.to.value<elements.from.value)elements.to.value=elements.from.value;
}
function input() { return Object.fromEntries(Object.entries(elements).map(([key,element])=>[key,element.value])); }
function setLanguage(lang) {
  state.lang=lang; localStorage.setItem('frontier-language',lang); document.documentElement.lang=lang==='zh'?'zh-CN':'en';
  document.querySelectorAll('[data-zh]').forEach(el=>{ const value=el.dataset[lang]; if(el.tagName==='H1')el.innerHTML=value; else el.textContent=value; });
  $('#lang').textContent=lang==='zh'?'English':'中文'; renderPlannerAirports(); renderStatus(); if(state.result)renderResults(); renderRoutes(); renderOpportunities(); renderHistory(); renderTrips();
}
function routeLabel(route) {
  return route.displayLabel?.[state.lang] || (route.status==='seasonal' ? (state.lang==='zh'?'计划班期自 ':'Scheduled from ')+route.starts : (state.lang==='zh'?'当前直飞':'Current nonstop'));
}
function routeNote(route) {
  const note=route.scheduleNote?.[state.lang];
  return note?`<p class="route-note">${esc(note)} <a href="${esc(route.bookingSource||route.source)}" target="_blank" rel="noreferrer">${state.lang==='zh'?'到 Frontier 查票':'Check Frontier'} ↗</a></p>`:'';
}
function renderOpportunities() {
  const all=airportOpportunities(state.routes,state.observations),zh=state.lang==='zh';
  const maxConnections=Math.max(1,...all.map(item=>item.totalCount));
  const selected=all.find(item=>item.airport===state.selectedAirport)||all[0];
  $('#opportunity-updated').textContent=state.routesUpdatedAt?`${zh?'班期快照':'Schedule snapshot'}: ${state.routesUpdatedAt}`:'';
  $('#airport-chart').innerHTML=all.map(item=>`<button type="button" class="airport-tile ${item.airport===selected.airport?'selected':''}" data-airport="${item.airport}" aria-pressed="${item.airport===selected.airport}"><span class="airport-tile-top"><b>${esc(airportLabel(item.airport))}</b><strong>${item.totalCount}</strong></span><span class="airport-meter"><span style="width:${Math.round((item.totalCount)/maxConnections*100)}%"></span></span><span class="airport-tile-bottom">${zh?'直飞目的地 · 含计划班期':'nonstop destinations · includes planned service'}</span></button>`).join('');
  $('#opportunity-title').textContent=`${airportLabel(selected.airport)} · ${selected.totalCount} ${zh?'个直飞目的地':'nonstop destinations'}`;
  $('#opportunity-subtitle').textContent=zh?'当前与计划班期合并展示，每个目的地只计一次；具体运营日期见航线说明。':'Current and planned service share one entry per destination. See each route for operating dates.';
  const fare=(quote,direction)=>quote?`<a href="${esc(quote.source)}" target="_blank" rel="noreferrer"><b>$${Number(quote.amount)}</b> <small>${esc(quote.fareType)} · ${esc(quote.travelDate)}<br>${zh?'观察':'Observed'} ${esc(formatObserved(quote.observedAt))} ↗</small></a>`:`<span class="opportunity-no-quote">${state.fareCoverage.has(direction)?(zh?'本轮未观察到低于 $100 的报价':'No under-$100 quote observed this round'):(zh?'公开票价尚未核实':'Public fare not yet checked')}</span>`;
  $('#opportunity-routes').innerHTML=selected.destinations.length?selected.destinations.map(item=>`<article class="opportunity-route"><div class="opportunity-route-head"><b>${esc(pairLabel(selected.airport,item.airport,' ↔ '))}</b><span class="route-state ${item.route.status==='seasonal'?'seasonal':''}">${esc(routeLabel(item.route))}</span><a href="${esc(item.route.source)}" target="_blank" rel="noreferrer">${zh?'班期':'Schedule'} ↗</a></div>${routeNote(item.route)}<div class="opportunity-fares"><div><span>${esc(pairLabel(selected.airport,item.airport))}</span>${fare(item.fromQuote,`${selected.airport}→${item.airport}`)}</div><div><span>${esc(pairLabel(item.airport,selected.airport))}</span>${fare(item.toQuote,`${item.airport}→${selected.airport}`)}</div></div></article>`).join(''):`<p class="muted">${zh?'没有已核实的直飞连接。':'No verified nonstop connections.'}</p>`;
}
function renderRoutes() {
  const select=$('#routes-airport'),value=select.value||'all',zh=state.lang==='zh';
  select.innerHTML=`<option value="all">${zh?'所有机场':'All airports'}</option>`+airportOptions();select.value=value;
  const rows=state.routes.filter(row=>value==='all'||row.a===value||row.b===value);
  $('#routes-updated').textContent=state.routesUpdatedAt?`${zh?'班期快照':'Schedule snapshot'}: ${state.routesUpdatedAt}`:'';
  $('#routes-count').textContent=`${rows.length} ${zh?'条直飞组合':'nonstop pairs'}`;
  const labels=zh?['一','二','三','四','五','六','日']:['M','T','W','T','F','S','S'];
  const full=zh?['周一','周二','周三','周四','周五','周六','周日']:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  $('#route-list').innerHTML=rows.length?rows.map(row=>`<div class="route-row"><div class="route-identity"><b>${esc(pairLabel(row.a,row.b,' ↔ '))}</b><span class="route-state ${row.status==='seasonal'?'seasonal':''}">${esc(routeLabel(row))}</span></div><div class="route-days" aria-label="${zh?'星期':'Weekdays'}">${row.days.map((day,index)=>`<span class="route-day ${day===1?'operates':day===null?'unknown':''}" title="${full[index]}: ${day===1?(zh?'有班次':'service'):day===null?(zh?'待核实':'unverified'):(zh?'无班次':'no service')}" aria-label="${full[index]} ${day===1?(zh?'有班次':'service'):day===null?(zh?'待核实':'unverified'):(zh?'无班次':'no service')}">${labels[index]}</span>`).join('')}</div><a href="${esc(row.source)}" target="_blank" rel="noreferrer">${zh?'班期来源':'Schedule source'} ↗</a>${routeNote(row)}</div>`).join(''):`<p class="muted">${zh?'没有符合条件的直飞航线。':'No nonstop routes match.'}</p>`;
}
function renderHistory() {
  const origin=$('#history-origin'),destination=$('#history-destination');
  for(const select of [origin,destination]){const value=select.value||'all';select.innerHTML=`<option value="all">${state.lang==='zh'?'所有机场':'All airports'}</option>`+airportOptions();select.value=value;}
  const {rows,days}=publicFareHistory(state.observations,{origin:origin.value,destination:destination.value,includeHistorical:$('#history-window').value==='all'});
  const zh=state.lang==='zh';
  $('#history-updated').textContent=state.updatedAt?`${zh?'数据更新':'Data updated'}: ${state.updatedAt.slice(0,10)}`:'';
  const low=rows.length?Math.min(...rows.map(row=>Number(row.amount))):null;
  $('#history-stats').innerHTML=`<div><b>${rows.length}</b><span>${zh?'条符合筛选的报价':'matching quotes'}</span></div><div><b>${low===null?'—':'$'+low}</b><span>${zh?'样本最低价':'lowest sample'}</span></div><div><b>${days.length}</b><span>${zh?'个观察日':'observation days'}</span></div>`;
  const max=Math.max(100,...days.map(day=>day.lowest));
  $('#history-chart').innerHTML=days.length?days.map(day=>`<div class="history-bar"><span class="history-bar-value">$${day.lowest}</span><div class="history-bar-track"><div style="height:${Math.max(12,Math.round(day.lowest/max*100))}%"></div></div><span>${esc(day.day)}</span><small>${day.count} ${zh?'条':'quotes'}</small></div>`).join(''):`<p class="muted">${zh?'此筛选条件下没有已核实的公开报价。':'No verified public quote matches these filters.'}</p>`;
  $('#history-body').innerHTML=rows.length?rows.map(row=>`<tr><td><b>${esc(row.route.split('→').map(airportLabel).join(' → '))}</b></td><td class="history-amount">$${Number(row.amount)}</td><td>${esc(row.fareType)}</td><td>${esc(row.travelDate)}</td><td>${esc(formatObserved(row.observedAt))}</td><td><span class="history-status ${row.refreshStatus==='fresh'?'fresh':'stale'}">${row.refreshStatus==='fresh'?(zh?'本轮核实':'This round'):(zh?'历史·未复核':'Historical · not rechecked')}</span></td><td><a href="${esc(row.source)}" target="_blank" rel="noreferrer">Frontier ↗</a></td></tr>`).join(''):`<tr><td colspan="7" class="history-empty">${zh?'此筛选条件下没有已核实的公开报价。':'No verified public quote matches these filters.'}</td></tr>`;
}
function renderStatus(){const box=$('#backend-status');box.textContent=state.lang==='zh'?'选择推荐日期下载日历提醒，并在手机或电脑上导入。此功能不需要登录；提醒由你的日历应用发出。':'Choose a recommended date to download a calendar reminder and import it on your phone or computer. No sign-in is needed; your calendar app sends the alert.';box.classList.remove('offline');$('#email-form').hidden=true;$('#session-area').hidden=true;}

function renderResults() {
  const result=state.result, q=input(), zh=state.lang==='zh'; if(!result)return;
  $('#results').hidden=false; $('#results-title').textContent=pairLabel(q.origin,q.destination);
  $('#results-note').textContent=result.status==='ok'?`${result.options.length} ${zh?'个班期日期。':'schedule dates. '}${t('rec')}`:result.status==='no_verified_nonstop'?t('noRoute'):result.status==='schedule_unverified'?(zh?'这条 Frontier 直飞的运营星期尚未核实，暂不能列出具体日期；不代表没有航班。':'Frontier operating weekdays remain unverified, so specific dates cannot be listed. This does not mean there are no flights.'):result.status==='season_not_yet_in_window'?(zh?`公开来源列出的 Frontier 直飞班期自 ${result.route.starts} 起；所选更早日期尚未核实，请到 Frontier 确认。`:`Public sources list Frontier nonstop service from ${result.route.starts}; earlier dates in your range remain unverified. Check Frontier.`):t('noDates');
  $('#data-age').textContent=`${t('data')}: ${state.updatedAt.slice(0,10)}`;
  $('#results-empty').hidden=result.options.length>0; $('#results-empty').textContent=$('#results-note').textContent; if(result.route?.scheduleNote)$('#results-empty').innerHTML=routeNote(result.route);
  $('#result-cards').innerHTML=result.options.map((option,index)=>{
    const e=option.estimate, time=`${String(option.reminder.localHour).padStart(2,'0')}:00`;
    const blackout=!option.gowildEligible, canRemind=!blackout&&Date.parse(option.reminder.at)>Date.now();
    const label=blackout?(zh?'GoWild 禁用日期':'GoWild blackout date'):canRemind?(zh?'等待查票时间':'Upcoming booking check'):(zh?'现在查票':'Check now');
    const evidence=e.kind==='estimate'?`${t('evidence')} $${e.reference.amount} · ${formatDate(e.reference.travelDate)} · ${formatObserved(e.reference.observedAt)} · ${esc(e.reference.fareType)}${e.reference.reverse?' · '+t('reverse'):''}`:t('insufficient');
    const budgetNote=option.withinBudget===null?'':option.withinBudget?(zh?' · 公开价参考可能在预算内':' · Public estimate may fit budget'):(zh?' · 公开价参考可能超预算':' · Public estimate may exceed budget');
    const check=blackout?(zh?'此日不能使用 GoWild；可查询普通票价。':'GoWild is unavailable on this date; check regular fares.'):canRemind?`${esc(formatDate(option.reminder.localDate,{weekday:'short',year:undefined}))} ${time}`:(zh?'建议查票时间已到；现在前往 Frontier 确认。':'The suggested check time has arrived. Check Frontier now.');
    const action=canRemind?`<button class="secondary" type="button" data-action="remind" data-index="${index}">${t('download')} ↗</button>`:`<a class="secondary" href="https://www.flyfrontier.com/" target="_blank" rel="noreferrer">${blackout?(zh?'查看普通票价':'Check regular fares'):(zh?'现在查票':'Check now')} ↗</a>`;
    return `<article class="result-card"><div class="card-top"><span class="pill ${blackout?'warn':''}">${label}</span><span class="muted">${esc(pairLabel(option.origin,option.destination))}</span></div><div class="date-main">${esc(formatDate(option.travelDate))}<small>${zh?'直飞班期':'Nonstop schedule'} · <a class="source-link" href="${esc(option.routeSource)}" target="_blank" rel="noreferrer">${t('source')} ↗</a></small></div><div class="price"><span class="availability-label">${blackout?(zh?'普通票价待查':'Regular fare unverified'):(zh?'GoWild 价格与座位待查':'GoWild price & seats unverified')}</span><small>${e.kind==='estimate'?`${zh?'公开票价参考':'Public fare estimate'} $${e.low}–$${e.high} · ${e.samples} ${zh?'个样本':'samples'}${budgetNote}`:t('insufficient')}</small></div><div class="card-row"><span>${blackout?(zh?'GoWild 日历规则':'GoWild calendar rule'):canRemind?`${t('check')} · ${bookingWindowDays(option.origin,option.destination)} ${zh?'天前':'days before'}`:label}</span><b>${check}</b></div><div class="evidence">${e.kind==='estimate'?`<a href="${esc(e.reference.source)}" target="_blank" rel="noreferrer">${evidence} ↗</a>`:evidence}<br>${t('local')}: ${esc(option.reminder.timeZone)}</div><div class="card-actions">${action}</div></article>`;
  }).join('');
  $('#result-cards').scrollTop=0;
  $('#results').scrollIntoView({behavior:'smooth',block:'start'});
}
async function api(path,options={}) {const response=await fetch(state.apiBase+path,{...options,headers:{'Content-Type':'application/json',...(state.session?{'Authorization':`Bearer ${state.session}`}:{}) ,...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);return data;}
function ics(option,method='PUBLISH',uid=`${option.origin}-${option.destination}-${option.travelDate}@frontier-gowild-dashboard`) {
  const at=new Date(option.reminder.at),end=new Date(at.getTime()+30*60000);
  const stamp=date=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Frontier GoWild Flight Radar//EN',`METHOD:${method}`,'BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(at)}`,`DTEND:${stamp(end)}`,`SUMMARY:Check Frontier GoWild ${option.origin} to ${option.destination}`,`DESCRIPTION:Travel ${option.travelDate}. GoWild availability requires signed-in confirmation on Frontier. https://www.flyfrontier.com/`,`URL:https://www.flyfrontier.com/`,'BEGIN:VALARM','TRIGGER:-PT0M','ACTION:DISPLAY','DESCRIPTION:Check Frontier GoWild','END:VALARM','END:VEVENT','END:VCALENDAR'];
  return lines.join('\r\n')+'\r\n';
}
function downloadCalendar(option) {const blob=new Blob([ics(option)],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`frontier-${option.origin}-${option.destination}-${option.travelDate}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);if(!sessionStorage.getItem("frontier-support-shown")){$("#support-after-calendar").hidden=false;sessionStorage.setItem("frontier-support-shown","1");}}
async function createReminder(option) {if(!option.gowildEligible||Date.parse(option.reminder.at)<=Date.now()){toast(state.lang==='zh'?'此日期请直接到 Frontier 查票，无需设置过去的提醒。':'Check this date directly on Frontier; a past reminder cannot be scheduled.');renderResults();return;}downloadCalendar(option);}
async function renderTrips(){renderStatus();const list=$('#trip-list');if(!state.session||!state.apiReady){list.innerHTML='';return;}try{const data=await api('/reminders');list.innerHTML=data.reminders.length?data.reminders.map(item=>`<div class="trip-row"><div><b>${esc(pairLabel(item.origin,item.destination))} · ${esc(formatDate(item.travelDate))}</b><small>${t(item.status==='booked'?'done':item.status==='cancelled'?'cancelState':item.status==='send_failed'?'sendError':item.status==='sending'?'pending':'active')} · ${esc(new Date(item.remindAt).toLocaleString(state.lang==='zh'?'zh-CN':'en-US',{timeZone:item.timeZone,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}))} ${esc(item.timeZone)}</small></div><div>${item.status==='active'||item.status==='send_failed'?`<button data-action="change" data-id="${esc(item.id)}">${t('change')}</button> <button data-action="booked" data-id="${esc(item.id)}">${t('bookedButton')}</button> <button data-action="cancel" data-id="${esc(item.id)}">${t('cancel')}</button>`:''}${item.status==='send_failed'?` <button data-action="retry" data-id="${esc(item.id)}">${t('retry')}</button>`:''}</div></div>`).join(''):`<p class="muted">${t('emptyTrips')}</p>`;}catch(error){if(error.message.includes('401')){state.session='';sessionStorage.removeItem('frontier-session');toast(t('unauth'));}else list.textContent=error.message;renderStatus();}}
async function loadIdentity(){
  try{const me=await api('/me');state.email=me.email;state.isAdmin=me.isAdmin===true;sessionStorage.setItem('frontier-email',me.email);renderStatus();}
  catch(error){if(error.message.includes('401')||error.message.includes('403')){state.session='';state.email='';state.isAdmin=false;sessionStorage.removeItem('frontier-session');sessionStorage.removeItem('frontier-email');renderStatus();}else toast(error.message);}
}
async function init(){
  renderPlannerAirports();
  elements.origin.value='SFO';elements.destination.value='LAS';const today=airportDate(new Date(),elements.origin.value),future=new Date(Date.parse(`${today}T12:00:00Z`)+21*86400000);elements.from.value=today;elements.to.value=future.toISOString().slice(0,10);syncOriginDates();
  const fragment=new URLSearchParams(location.hash.slice(1));if(fragment.get('session')){state.session=fragment.get('session');state.email=fragment.get('email')||'';sessionStorage.setItem('frontier-session',state.session);sessionStorage.setItem('frontier-email',state.email);history.replaceState({},'',location.pathname+location.search);}
  try{const [routes,history,config]=await Promise.all([fetch('data/routes.json?v=20260929-atl-tpa-admin').then(r=>r.json()),fetch('data/fare-history.json').then(r=>r.json()),fetch('config.json',{cache:'no-store'}).then(r=>r.json())]);state.routes=routes.routes;state.routesUpdatedAt=routes.updatedAt;state.observations=history.observations;state.fareCoverage=new Map((history.weeklyRefresh?.directions||[]).map(row=>[row.route,row.status]));state.updatedAt=history.updatedAt;$('#airport-count').textContent=AIRPORTS.length;$('#pair-count').textContent=state.routes.length;state.apiBase=(config.apiBase||'').replace(/\/$/,'');}catch(error){if(!state.routes.length)toast(t('loadError'));}
  setLanguage(state.lang);

}
$('#dismiss-support').addEventListener('click',()=>{$('#support-after-calendar').hidden=true;});
$('#planner-form').addEventListener('submit',event=>{event.preventDefault();try{state.result=recommend(input(),state.routes,state.observations);renderResults();}catch(error){toast(t('invalid'));}});
elements.origin.addEventListener('change',syncOriginDates);
$('#swap').addEventListener('click',()=>{[elements.origin.value,elements.destination.value]=[elements.destination.value,elements.origin.value];syncOriginDates();});
$('#lang').addEventListener('click',()=>setLanguage(state.lang==='zh'?'en':'zh'));
$('#routes-airport').addEventListener('change',renderRoutes);
$('#airport-chart').addEventListener('click',event=>{const button=event.target.closest('[data-airport]');if(!button)return;state.selectedAirport=button.dataset.airport;renderOpportunities();});
$('#opportunity-plan').addEventListener('click',()=>{const selected=airportOpportunities(state.routes,state.observations).find(item=>item.airport===state.selectedAirport);elements.origin.value=selected.airport;const destination=selected.destinations.find(item=>item.route.status==='active')||selected.destinations[0];if(destination)elements.destination.value=destination.airport;syncOriginDates();$('#planner').scrollIntoView({behavior:'smooth'});});
for(const id of ['history-origin','history-destination','history-window']){$(`#${id}`).addEventListener('change',renderHistory);}
$('#result-cards').addEventListener('click',event=>{const button=event.target.closest('[data-action="remind"]');if(button)createReminder(state.result.options[Number(button.dataset.index)]);});

init();
