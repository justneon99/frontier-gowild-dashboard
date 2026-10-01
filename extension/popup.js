const $ = selector => document.querySelector(selector);
async function refresh() {
  const { task, boundTabId, lastResult, logs, stopped } = await chrome.storage.local.get(['task','boundTabId','lastResult','logs','stopped']);
  const alarms = (await chrome.alarms.getAll()).filter(alarm => alarm.name.startsWith('gowild-')).sort((a,b) => a.scheduledTime - b.scheduledTime);
  $('#task').textContent = task ? `${task.origin} → ${task.destination} · ${task.travelDate} · ${task.earliestTime}–${task.latestTime} · listed fare below $${(task.maxTotalCents / 100).toFixed(2)}\n${stopped ? 'Stopped' : boundTabId ? 'Frontier tab bound' : 'Open the matching one-way Frontier results, then bind this tab'}\n${alarms.length} checks remain${alarms[0] ? ` · next ${new Date(alarms[0].scheduledTime).toLocaleString()}` : ''}` : 'No task. Create one at the GoWild Radar booking page, then click “Send to local monitor.”';
  $('#status').textContent = lastResult ? `Last result: ${lastResult.status}${lastResult.listedPrice != null ? ` · ${lastResult.flightNumber} $${lastResult.listedPrice}` : ''}${lastResult.checkedAt ? `\n${new Date(lastResult.checkedAt).toLocaleString()}` : ''}` : '';
  $('#logs').replaceChildren(...(logs || []).filter(entry => entry.taskId === task?.id).slice(-12).reverse().map(entry => { const item = document.createElement('li'); const time = document.createElement('time'); time.textContent = new Date(entry.at).toLocaleString(); item.append(time, document.createTextNode(`${entry.kind}${entry.trigger ? ` · ${entry.trigger}` : ''}${entry.status ? ` · ${entry.status}` : ''}${entry.listedPrice != null ? ` · $${entry.listedPrice}` : ''}`)); return item; }));
}
async function run(type) {
  $('#status').textContent = 'Working…';
  try {
    const result = await chrome.runtime.sendMessage({ type });
    await refresh();
    if (!result?.ok) $('#status').textContent = result?.error || 'Action failed';
  } catch (error) { $('#status').textContent = error.message || 'Action failed'; }
}
$('#bind').addEventListener('click', () => run('BIND_ACTIVE'));
$('#check').addEventListener('click', () => run('CHECK_NOW'));
$('#stop').addEventListener('click', () => run('STOP'));
refresh();
