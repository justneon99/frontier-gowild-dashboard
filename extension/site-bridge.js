window.addEventListener('message', async event => {
  if (event.source !== window || event.origin !== 'https://justneon99.github.io' || event.data?.source !== 'gowild-radar-page' || event.data?.type !== 'SAVE_TASK') return;
  const task = event.data.task;
  if (!task || !/^[A-Z]{3}$/.test(task.origin) || !/^[A-Z]{3}$/.test(task.destination) || !/^20\d{2}-\d{2}-\d{2}$/.test(task.travelDate) || !Number.isInteger(task.maxTotalCents)) return;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'SAVE_TASK', task });
    window.postMessage({ source: 'gowild-radar-extension', type: 'SAVE_TASK_RESULT', ok: !!result?.ok, error: result?.error }, event.origin);
  } catch (error) { window.postMessage({ source: 'gowild-radar-extension', type: 'SAVE_TASK_RESULT', ok: false, error: error.message }, event.origin); }
});
