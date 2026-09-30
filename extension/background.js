import { ZONES, OFFSETS, windowStart } from './schedule.mjs';
const storage = () => chrome.storage.local.get(['task','boundTabId','lastResult','lastNoticeKey']);
async function schedule(task) {
  await chrome.alarms.clearAll();
  const start = windowStart(task);
  for (const minutes of OFFSETS) if (start + minutes * 60_000 > Date.now()) await chrome.alarms.create(`gowild-${minutes}`, { when: start + minutes * 60_000 });
  return { windowStart: new Date(start).toISOString(), checks: OFFSETS.filter(minutes => start + minutes * 60_000 > Date.now()).length };
}
async function notify(title, message) {
  await chrome.notifications.create({ type: 'basic', iconUrl: 'icon.png', title, message, priority: 2 });
}
async function processResult(result, task) {
  await chrome.storage.local.set({ lastResult: result });
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
      const plan = await schedule(task);
      await chrome.storage.local.set({ task, boundTabId: null, lastResult: null, lastNoticeKey: null, plan });
      return { ok: true, plan };
    }
    if (message?.type === 'BIND_ACTIVE') {
      const { task } = await storage(); if (!task) throw new Error('Send a task from the website first');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url?.startsWith('https://booking.flyfrontier.com/Flight/Select')) throw new Error('Open the matching Frontier flight-results tab first');
      const result = await scanTab(tab.id, task, true);
      if (result.status !== 'matched') throw new Error('Frontier tab must show the same route/date, one-way, one adult');
      await chrome.storage.local.set({ boundTabId: tab.id, lastResult: { status: 'bound', checkedAt: new Date().toISOString() }, lastNoticeKey: null });
      return { ok: true, tabId: tab.id };
    }
    if (message?.type === 'CHECK_NOW') {
      const { task, boundTabId } = await storage(); if (!task || !boundTabId) throw new Error('Bind a matching Frontier tab first');
      const result = await scanTab(boundTabId, task);
      await processResult(result, task);
      return { ok: true, result };
    }
    if (message?.type === 'PAGE_READY') {
      const { task, boundTabId } = await storage();
      if (task && boundTabId === sender.tab?.id) {
        const result = await scanTab(boundTabId, task);
        await processResult(result, task);
      }
      return { ok: true };
    }
    if (message?.type === 'STOP') { await chrome.alarms.clearAll(); await chrome.storage.local.clear(); return { ok: true }; }
    return { ok: false, error: 'Unknown message' };
  })().then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith('gowild-')) return;
  const { task, boundTabId } = await storage();
  if (!task || !boundTabId) return;
  try {
    const tab = await chrome.tabs.get(boundTabId);
    if (!tab.url?.startsWith('https://booking.flyfrontier.com/Flight/Select')) {
      await chrome.alarms.clearAll();
      await chrome.storage.local.set({ lastResult: { status: 'paused_after_results', checkedAt: new Date().toISOString() } });
      return;
    }
    await chrome.tabs.reload(boundTabId);
  }
  catch { await chrome.storage.local.set({ lastResult: { status: 'tab_closed', checkedAt: new Date().toISOString() } }); await notify('GoWild Radar: tab closed', 'Reopen and bind a matching Frontier result tab to continue the remaining checks.'); }
});
