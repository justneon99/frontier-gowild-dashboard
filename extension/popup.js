const $ = selector => document.querySelector(selector);
async function refresh() {
  const { task, boundTabId, lastResult, plan } = await chrome.storage.local.get(['task','boundTabId','lastResult','plan']);
  $('#task').textContent = task ? `${task.origin} → ${task.destination} · ${task.travelDate} · ${task.earliestTime}–${task.latestTime} · listed fare below $${(task.maxTotalCents / 100).toFixed(2)}\n${boundTabId ? 'Frontier tab bound' : 'Open the matching one-way Frontier results, then bind this tab'}\n${plan?.checks ?? 0} scheduled checks remain` : 'No task. Create one at the GoWild Radar booking page, then click “Send to local monitor.”';
  $('#status').textContent = lastResult ? `Last result: ${lastResult.status}${lastResult.candidates?.length ? ` · ${lastResult.candidates.map(f => `${f.flightNumber} $${f.listedPrice}`).join(', ')}` : ''}${lastResult.checkedAt ? `\n${lastResult.checkedAt}` : ''}` : '';
}
async function run(type) {
  const result = await chrome.runtime.sendMessage({ type });
  $('#status').textContent = result?.ok ? (type === 'BIND_ACTIVE' ? 'Frontier tab bound.' : type === 'STOP' ? 'Monitoring stopped.' : `Check complete: ${result.result?.status || 'unknown'}`) : (result?.error || 'Action failed');
  await refresh();
}
$('#bind').addEventListener('click', () => run('BIND_ACTIVE'));
$('#check').addEventListener('click', () => run('CHECK_NOW'));
$('#stop').addEventListener('click', () => run('STOP'));
refresh();
