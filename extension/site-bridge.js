window.addEventListener('message', async event => {
  if (event.source !== window || event.origin !== 'https://justneon99.github.io' || event.data?.source !== 'gowild-radar-page' || !['SAVE_TASK','GET_STATUS'].includes(event.data?.type)) return;
  if (event.data.type === 'GET_STATUS') {
    if (!/^[a-f0-9-]{36}$/.test(event.data.taskId || '')) return;
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GET_STATUS', taskId: event.data.taskId });
      window.postMessage({ source: 'gowild-radar-extension', type: 'GET_STATUS_RESULT', taskId: event.data.taskId, ok: !!result?.ok, snapshot: result?.snapshot }, event.origin);
    } catch { window.postMessage({ source: 'gowild-radar-extension', type: 'GET_STATUS_RESULT', taskId: event.data.taskId, ok: false }, event.origin); }
    return;
  }
  const task = event.data.task;
  if (!task || !/^[A-Z]{3}$/.test(task.origin) || !/^[A-Z]{3}$/.test(task.destination) || !/^20\d{2}-\d{2}-\d{2}$/.test(task.travelDate) || !Number.isInteger(task.maxTotalCents)) return;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'SAVE_TASK', task });
    window.postMessage({ source: 'gowild-radar-extension', type: 'SAVE_TASK_RESULT', ok: !!result?.ok, error: result?.error }, event.origin);
  } catch (error) { window.postMessage({ source: 'gowild-radar-extension', type: 'SAVE_TASK_RESULT', ok: false, error: error.message }, event.origin); }
});
