import { AIRPORTS, findRoute } from './engine.mjs';
const $ = selector => document.querySelector(selector);
const state = { lang: localStorage.getItem('frontier-language') === 'en' ? 'en' : 'zh', apiBase: '', clientId: '', session: sessionStorage.getItem('frontier-session') || '', email: sessionStorage.getItem('frontier-email') || '', ready: false, isAdmin: false, routes: [], tasks: [], selected: null };
const say = (zh, en) => state.lang === 'zh' ? zh : en;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
async function api(path, options = {}) {
  const response = await fetch(state.apiBase + path, { ...options, headers: { 'Content-Type': 'application/json', ...(state.session ? { Authorization: `Bearer ${state.session}` } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function renderGate() {
  $('#booking-content').hidden = !state.isAdmin;
  $('#booking-gate').hidden = state.isAdmin;
  $('#booking-gate').textContent = !state.ready ? say('账号服务暂不可用。', 'Account service is unavailable.') : !state.session ? say('请以管理员 Google 账号登录。', 'Sign in with the administrator Google account.') : say('此账号没有个人抢票任务权限。', 'This account cannot access personal booking tasks.');
  $('#google-signin').hidden = !state.ready || !!state.session;
  $('#booking-session').hidden = !state.session;
  $('#user-email').textContent = state.email;
}
function renderTasks() {
  const status = { planned: say('待检查', 'Planned'), user_review_ready: say('人工录入条件符合 · 仍须核对 Frontier', 'Self-reported match · verify on Frontier'), does_not_match: say('条件不符', 'Does not match'), cancelled: say('已取消', 'Cancelled') };
  $('#task-list').innerHTML = state.tasks.length ? state.tasks.map(task => `<div class="booking-task ${task.id === state.selected?.id ? 'selected' : ''}"><div><b>${esc(task.origin)} → ${esc(task.destination)} · ${esc(task.travelDate)}</b><small>${esc(task.earliestTime)}–${esc(task.latestTime)} · ${say('总价严格低于', 'Total strictly below')} $${(task.maxTotalCents / 100).toFixed(2)} · ${esc(status[task.status] || task.status)}</small></div><div class="booking-actions"><button type="button" data-open="${esc(task.id)}">${say('查看', 'Open')}</button>${task.cancelledAt ? '' : `<button type="button" data-cancel="${esc(task.id)}">${say('取消', 'Cancel')}</button>`}</div></div>`).join('') : `<p class="empty">${say('还没有任务。', 'No tasks yet.')}</p>`;
  const task = state.selected;
  $('#check-area').hidden = !task || !!task.cancelledAt;
  if (task && !task.cancelledAt) $('#selected-task').textContent = `${task.origin} → ${task.destination} · ${task.travelDate} · ${task.earliestTime}–${task.latestTime} · ${say('总价 <', 'total <')} $${(task.maxTotalCents / 100).toFixed(2)}`;
}
function renderHistory(checks) {
  const labels = { flight_number_unconfirmed: say('航班号未确认', 'Flight number unconfirmed'), itinerary_mismatch: say('航线或日期不符', 'Itinerary mismatch'), departure_outside_window: say('起飞时间不在范围内', 'Departure outside window'), not_nonstop: say('不是直飞', 'Not nonstop'), not_one_way_one_passenger: say('不是单人单程', 'Not one-way for one'), gowild_not_verified: say('GoWild 未核实', 'GoWild not verified'), paid_addons: say('存在付费附加项', 'Paid add-ons'), total_not_below_cap: say('总价未低于上限', 'Total is not below cap'), payment_review_not_reached: say('未到付款前确认页', 'Payment review not reached'), invalid_frontier_url: say('来源链接不符', 'Invalid source link') };
  $('#check-history').innerHTML = checks.length ? checks.map(check => `<div class="booking-check"><b>${check.result === 'user_review_ready' ? say('人工录入条件符合', 'Self-reported match') : say('条件不符', 'Does not match')}</b><span>${esc(check.checkedAt)} · ${esc(check.flightNumber)} · $${(check.totalCents / 100).toFixed(2)}</span>${check.reasons.length ? `<small>${esc(check.reasons.map(reason => labels[reason] || reason).join('、'))}</small>` : `<small>${say('仍需在 Frontier 付款前页面亲自核对。', 'Verify personally on Frontier before payment.')}</small>`}</div>`).join('') : `<p class="muted">${say('暂无检查记录。', 'No checks yet.')}</p>`;
}
async function loadTasks(selectId) {
  state.tasks = (await api('/personal/tasks')).tasks;
  state.selected = state.tasks.find(task => task.id === selectId) || state.tasks.find(task => task.id === state.selected?.id) || null;
  renderTasks();
  if (state.selected && !state.selected.cancelledAt) renderHistory((await api(`/personal/tasks/${state.selected.id}/checks`)).checks);
}
function setLanguage(lang) {
  state.lang = lang; localStorage.setItem('frontier-language', lang); document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-zh]').forEach(el => { if (!el.closest('option')) el.textContent = el.dataset[lang]; });
  document.querySelectorAll('option[data-zh]').forEach(el => { el.textContent = el.dataset[lang]; });
  $('#lang').textContent = lang === 'zh' ? 'English' : '中文'; renderGate(); renderTasks();
}
function clearSession() {
  state.session = ''; state.email = ''; state.isAdmin = false; state.tasks = []; state.selected = null;
  sessionStorage.removeItem('frontier-session'); sessionStorage.removeItem('frontier-email');
  renderGate(); renderTasks();
}
async function signIn(response) {
  try {
    const result = await api('/auth/google', { method: 'POST', body: JSON.stringify({ credential: response.credential }) });
    state.session = result.session; state.email = result.email; state.isAdmin = result.isAdmin;
    sessionStorage.setItem('frontier-session', result.session); sessionStorage.setItem('frontier-email', result.email);
    renderGate(); if (state.isAdmin) await loadTasks();
  } catch (error) { $('#login-message').textContent = error.message; }
}
function loadGoogleButton() {
  const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
  script.onload = () => { google.accounts.id.initialize({ client_id: state.clientId, callback: signIn }); google.accounts.id.renderButton($('#google-button'), { theme: 'outline', size: 'large', text: 'signin_with', width: 260 }); };
  script.onerror = () => { $('#login-message').textContent = say('无法载入 Google 登录。', 'Could not load Google sign-in.'); }; document.head.append(script);
}
async function init() {
  for (const field of ['#task-origin', '#task-destination']) $(field).innerHTML = [...AIRPORTS].sort().map(code => `<option value="${code}">${code}</option>`).join('');
  $('#task-origin').value = 'SJC'; $('#task-destination').value = 'LAX';
  try {
    const [config, routes] = await Promise.all([fetch('config.json', { cache: 'no-store' }).then(r => r.json()), fetch('data/routes.json', { cache: 'no-store' }).then(r => r.json())]);
    state.routes = routes.routes; state.apiBase = String(config.apiBase || '').replace(/\/$/, ''); state.clientId = config.googleClientId || '';
    if (state.apiBase && state.clientId) { await api('/health'); state.ready = true; loadGoogleButton(); }
    if (state.ready && state.session) { const me = await api('/me'); state.email = me.email; state.isAdmin = me.isAdmin; if (state.isAdmin) await loadTasks(); }
  } catch (error) { if (/Unauthorized|401|403/.test(error.message)) clearSession(); else $('#login-message').textContent = error.message; }
  setLanguage(state.lang);
}
$('#task-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(event.currentTarget));
  if (!findRoute(state.routes, input.origin, input.destination)) { $('#task-message').textContent = say('当前航线资料没有这条 Frontier 直飞组合。', 'This pair is not in the current Frontier nonstop route data.'); return; }
  try { const task = await api('/personal/tasks', { method: 'POST', body: JSON.stringify(input) }); $('#task-message').textContent = say('任务已创建。请到 Frontier 核实具体航班。', 'Task created. Verify the exact flight on Frontier.'); await loadTasks(task.id); } catch (error) { $('#task-message').textContent = error.message; }
});
$('#task-list').addEventListener('click', async event => {
  const open = event.target.closest('[data-open]'); const cancel = event.target.closest('[data-cancel]');
  if (open) { try { await loadTasks(open.dataset.open); } catch (error) { $('#check-message').textContent = error.message; } }
  if (cancel && confirm(say('取消这个任务？检查记录会保留。', 'Cancel this task? Check history will remain.'))) { try { await api(`/personal/tasks/${cancel.dataset.cancel}/cancel`, { method: 'POST' }); await loadTasks(); } catch (error) { $('#check-message').textContent = error.message; } }
});
$('#check-form').addEventListener('submit', async event => {
  event.preventDefault(); const task = state.selected; if (!task) return;
  const form = new FormData(event.currentTarget);
  const input = { origin: task.origin, destination: task.destination, travelDate: task.travelDate, flightNumber: form.get('flightNumber'), departureTime: form.get('departureTime'), arrivalTime: form.get('arrivalTime'), totalUSD: Number(form.get('totalUSD')), addOnsUSD: Number(form.get('addOnsUSD')), evidenceUrl: form.get('evidenceUrl'), checkpoint: form.get('checkpoint'), nonstop: form.has('nonstop'), oneWay: form.has('oneWay'), passengers: 1, fareType: form.has('gowild') ? 'GoWild' : 'Unknown', passholderValidated: form.has('gowild') };
  try { const result = await api(`/personal/tasks/${task.id}/checks`, { method: 'POST', body: JSON.stringify(input) }); $('#check-message').textContent = result.result === 'user_review_ready' ? say('录入的条件一致。请再次核对 Frontier 付款前页面；购买仍须你亲自完成。', 'Entered conditions match. Recheck Frontier payment review; you complete the purchase.') : say('有条件未满足，已记录原因。', 'Some conditions failed; reasons were recorded.'); await loadTasks(task.id); } catch (error) { $('#check-message').textContent = error.message; }
});
$('#send-to-extension').addEventListener('click', () => {
  if (!state.selected) return;
  const { id, origin, destination, travelDate, earliestTime, latestTime, maxTotalCents } = state.selected;
  $('#extension-message').textContent = say('正在发送任务到 Chrome 本机监控器…', 'Sending task to the Chrome local monitor…');
  window.postMessage({ source: 'gowild-radar-page', type: 'SAVE_TASK', task: { id, origin, destination, travelDate, earliestTime, latestTime, maxTotalCents } }, location.origin);
  setTimeout(() => { if ($('#extension-message').textContent.includes('正在发送') || $('#extension-message').textContent.includes('Sending task')) $('#extension-message').textContent = say('没有收到本机监控器回应。请先安装并启用扩展。', 'No reply from the local monitor. Install and enable the extension first.'); }, 1500);
});
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.data?.source !== 'gowild-radar-extension' || event.data?.type !== 'SAVE_TASK_RESULT') return;
  $('#extension-message').textContent = event.data.ok ? say('已发送。请在 Chrome 打开同一航线、日期的 Frontier 单程搜索结果，并在扩展中绑定该标签页。', 'Sent. Open the matching one-way Frontier result in Chrome and bind that tab in the extension.') : String(event.data.error || say('发送失败。', 'Could not send task.'));
});
$('#lang').addEventListener('click', () => setLanguage(state.lang === 'zh' ? 'en' : 'zh'));
$('#sign-out').addEventListener('click', clearSession);
init();
