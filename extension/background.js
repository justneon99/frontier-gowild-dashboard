import { ZONES, OFFSETS, windowStart } from './schedule.mjs';
import { appendLog, summarizeResult } from './monitor-state.mjs';
const storage = () => chrome.storage.local.get(['task','boundTabId','lastResult','lastNoticeKey','pendingTrigger','stopped']);
let logQueue = Promise.resolve();
function log(kind, fields = {}) {
  logQueue = logQueue.catch(() => {}).then(async () => {
    const { logs, task } = await chrome.storage.local.get(['logs', 'task']);
    await chrome.storage.local.set({ logs: appendLog(logs, { at: new Date().toISOString(), taskId: task?.id || '', kind, ...fields }) });
  });
  return logQueue;
}
async function snapshot(taskId) {
  const { task, boundTabId, lastResult, logs, stopped } = await chrome.storage.local.get(['task','boundTabId','lastResult','logs','stopped']);
  if (!task || (taskId && task.id !== taskId)) return { active: false };
  const alarms = (await chrome.alarms.getAll()).filter(alarm => alarm.name.startsWith('gowild-')).sort((a, b) => a.scheduledTime - b.scheduledTime);
  const taskLogs = (logs || []).filter(entry => entry.taskId === task.id);
  const lastAttempt = [...taskLogs].reverse().find(entry => ['check_started', 'check_result', 'check_error'].includes(entry.kind));
  const attemptState = lastAttempt?.kind === 'check_started' ? (Date.now() - Date.parse(lastAttempt.at) > 60_000 ? 'no_result' : 'running') : null;
  return { active: true, taskId: task.id, bound: !!boundTabId, stopped: !!stopped, attemptState, lastResult: lastResult || null, nextCheckAt: alarms[0] ? new Date(alarms[0].scheduledTime).toISOString() : null, remainingChecks: alarms.length, logs: taskLogs.slice(-40) };
}
async function schedule(task) {
  await chrome.alarms.clearAll();
  const start = windowStart(task);
  for (const minutes of OFFSETS) if (start + minutes * 60_000 > Date.now()) await chrome.alarms.create(`gowild-${minutes}`, { when: start + minutes * 60_000 });
  return { windowStart: new Date(start).toISOString(), checks: OFFSETS.filter(minutes => start + minutes * 60_000 > Date.now()).length };
}
async function notify(title, message) {
  await chrome.notifications.create({ type: 'basic', iconUrl: 'icon.png', title, message, priority: 2 });
}
async function processResult(result, task, trigger) {
  const summary = summarizeResult(result, task);
  await chrome.storage.local.set({ lastResult: summary, pendingTrigger: null });
  await log('check_result', { trigger, status: summary.status, candidateCount: summary.candidateCount, ...(summary.flightNumber ? { flightNumber: summary.flightNumber, listedPrice: summary.listedPrice } : {}) });
  const { lastNoticeKey } = await storage();
  if (result.status === 'login_required' && lastNoticeKey !== 'login_required') {
    await notify('GoWild Radar: login needed', 'Sign in to Frontier in the bound Chrome tab; monitoring cannot verify GoWild inventory while signed out.');
    await chrome.storage.local.set({ lastNoticeKey: 'login_required' });
  }
  if (result.status === 'mismatch' && lastNoticeKey !== 'mismatch') {
    await notify('GoWild Radar: search changed', 'Open the matching one-way Frontier search for your task and bind the tab again.');
    await chrome.storage.local.set({ lastNoticeKey: 'mismatch' });
  }
  if (result.status === 'unsupported_page' && lastNoticeKey !== 'unsupported_page') {
    await notify('GoWild Radar: check needs attention', 'Frontier did not show a readable flight-results page. Open the bound tab and resolve any sign-in, challenge, or site change.');
    await chrome.storage.local.set({ lastNoticeKey: 'unsupported_page' });
  }
  if (result.status === 'candidate') {
    const candidate = result.candidates.filter(flight => flight.listedPrice * 100 < task.maxTotalCents).sort((a,b) => a.listedPrice - b.listedPrice)[0];
    if (candidate) {
      const key = `${task.id}:${candidate.flightNumber}:${candidate.listedPrice}`;
      if (key !== lastNoticeKey) {
        await notify('Possible GoWild nonstop fare', `${task.origin}→${task.destination} ${task.travelDate}, ${candidate.departureTime}, ${candidate.flightNumber}: listed $${candidate.listedPrice}. Open Frontier and verify the final all-in total before buying.`);
        await chrome.storage.local.set({ lastNoticeKey: key });
        await log('notification_sent', { status: 'fare_below_cap', flightNumber: candidate.flightNumber, listedPrice: candidate.listedPrice });
      }
    }
  }
}
async function scanTab(tabId, task, validateOnly = false) {
  return chrome.tabs.sendMessage(tabId, { type: 'SCAN', task, validateOnly });
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    if (message?.type === 'SAVE_TASK') {
      if (!sender.url?.startsWith('https://justneon99.github.io/frontier-gowild-dashboard/booking.html')) throw new Error('Task must come from the booking page');
      const task = message.task;
      if (!task || !/^[a-f0-9-]{36}$/.test(task.id) || !ZONES[task.origin] || !ZONES[task.destination] || task.origin === task.destination || !/^20\d{2}-\d{2}-\d{2}$/.test(task.travelDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.earliestTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.latestTime) || !Number.isInteger(task.maxTotalCents) || task.maxTotalCents < 100 || task.maxTotalCents > 1_000_000) throw new Error('Invalid task');
      await logQueue;
      const plan = await schedule(task);
      await chrome.storage.local.set({ task, boundTabId: null, lastResult: null, lastNoticeKey: null, pendingTrigger: null, stopped: false, plan, logs: [{ at: new Date().toISOString(), taskId: task.id, kind: 'task_saved' }] });
      return { ok: true, plan };
    }
    if (message?.type === 'GET_STATUS') {
      if (!sender.url?.startsWith('https://justneon99.github.io/frontier-gowild-dashboard/booking.html')) throw new Error('Status is available only on the booking page');
      return { ok: true, snapshot: await snapshot(message.taskId) };
    }
    if (message?.type === 'BIND_ACTIVE') {
      const { task, stopped } = await storage(); if (!task || stopped) throw new Error('Send a task from the website first');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url?.startsWith('https://booking.flyfrontier.com/Flight/Select')) { await log('bind_failed', { status: 'wrong_tab' }); throw new Error('Open the matching Frontier flight-results tab first'); }
      let result;
      try { result = await scanTab(tab.id, task, true); }
      catch { await log('bind_failed', { status: 'unsupported_page' }); throw new Error('Could not read the Frontier result tab. Reload it and try again.'); }
      if (result.status !== 'matched') { await log('bind_failed', { status: result.status }); throw new Error('Frontier tab must show the same route/date, one-way, one adult'); }
      await chrome.storage.local.set({ boundTabId: tab.id, lastResult: { status: 'bound', checkedAt: new Date().toISOString() }, lastNoticeKey: null });
      await log('tab_bound');
      return { ok: true, tabId: tab.id };
    }
    if (message?.type === 'CHECK_NOW') {
      const { task, boundTabId, stopped } = await storage(); if (!task || !boundTabId || stopped) { if (task) await log('check_error', { trigger: 'manual', status: 'tab_not_bound' }); throw new Error('Bind a matching Frontier tab first'); }
      await log('check_started', { trigger: 'manual' });
      try { const result = await scanTab(boundTabId, task); await processResult(result, task, 'manual'); return { ok: true, result: summarizeResult(result, task) }; }
      catch { await log('check_error', { trigger: 'manual' }); throw new Error('Could not read the Frontier tab. Reload it and try again.'); }
    }
    if (message?.type === 'PAGE_READY') {
      const { task, boundTabId, pendingTrigger, stopped } = await storage();
      if (task && !stopped && boundTabId === sender.tab?.id) {
        const trigger = pendingTrigger || 'page_load';
        if (!pendingTrigger) await log('check_started', { trigger });
        try { const result = await scanTab(boundTabId, task); await processResult(result, task, trigger); }
        catch { await chrome.storage.local.set({ pendingTrigger: null }); await log('check_error', { trigger }); }
      }
      return { ok: true };
    }
    if (message?.type === 'STOP') { await chrome.alarms.clearAll(); await chrome.storage.local.set({ boundTabId: null, pendingTrigger: null, stopped: true }); await log('monitor_stopped'); return { ok: true }; }
    return { ok: false, error: 'Unknown message' };
  })().then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith('gowild-')) return;
  const { task, boundTabId, stopped } = await storage();
  if (!task || stopped) return;
  if (!boundTabId) { await log('scheduled_skipped', { status: 'tab_not_bound' }); return; }
  try {
    const tab = await chrome.tabs.get(boundTabId);
    if (!tab.url?.startsWith('https://booking.flyfrontier.com/Flight/Select')) {
      await chrome.alarms.clearAll();
      await chrome.storage.local.set({ lastResult: { status: 'paused_after_results', checkedAt: new Date().toISOString() } });
      await log('monitor_paused', { status: 'page_changed' });
      return;
    }
    await log('check_started', { trigger: 'scheduled' });
    await chrome.storage.local.set({ pendingTrigger: 'scheduled' });
    await chrome.tabs.reload(boundTabId);
  }
  catch { await chrome.storage.local.set({ lastResult: { status: 'tab_closed', checkedAt: new Date().toISOString() }, pendingTrigger: null }); await log('check_error', { trigger: 'scheduled', status: 'tab_closed' }); await notify('GoWild Radar: tab closed', 'Reopen and bind a matching Frontier result tab to continue the remaining checks.'); }
});
