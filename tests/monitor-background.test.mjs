import test from 'node:test';
import assert from 'node:assert/strict';

test('background records task, binding, manual check, and a readable status snapshot', async () => {
  const data = {};
  const alarms = new Map();
  let onMessage;
  let reloads = 0;
  let scanResult = { status: 'candidate', candidates: [{ flightNumber: 'F9 2458', departureTime: '21:03', listedPrice: 49 }] };
  globalThis.chrome = {
    storage: { local: {
      async get(keys) { return Object.fromEntries(keys.map(key => [key, data[key]])); },
      async set(values) { Object.assign(data, values); },
    } },
    alarms: {
      async clearAll() { alarms.clear(); },
      async create(name, options) { alarms.set(name, options); },
      async getAll() { return [...alarms].map(([name, options]) => ({ name, scheduledTime: options.when })); },
      onAlarm: { addListener() {} },
    },
    tabs: {
      async query() { return [{ id: 7, url: 'https://booking.flyfrontier.com/Flight/Select' }]; },
      async get() { return { id: 7, url: 'https://booking.flyfrontier.com/Flight/Select' }; },
      async reload() { reloads++; },
      async sendMessage(id, message) { return message.validateOnly ? { status: 'matched' } : scanResult; },
    },
    notifications: { async create() {} },
    runtime: { onMessage: { addListener(listener) { onMessage = listener; } } },
  };
  await import('../extension/background.js');
  const send = (message, sender = {}) => new Promise(resolve => onMessage(message, sender, resolve));
  const task = { id: '12345678-1234-1234-1234-123456789abc', origin: 'SJC', destination: 'LAX', travelDate: '2026-10-02', earliestTime: '18:00', latestTime: '23:59', maxTotalCents: 5000 };
  const page = { url: 'https://justneon99.github.io/frontier-gowild-dashboard/booking.html' };
  assert.equal((await send({ type: 'SAVE_TASK', task }, page)).ok, true);
  assert.equal((await send({ type: 'BIND_ACTIVE' })).ok, true);
  assert.equal((await send({ type: 'CHECK_NOW' })).started, true);
  assert.equal(reloads, 1);
  assert.equal((await send({ type: 'PAGE_READY' }, { tab: { id: 7 } })).ok, true);
  const status = await send({ type: 'GET_STATUS', taskId: task.id }, page);
  assert.equal(status.snapshot.bound, true);
  assert.deepEqual(status.snapshot.logs.map(entry => entry.kind), ['task_saved', 'tab_bound', 'check_started', 'check_result', 'notification_sent']);
  assert.equal(status.snapshot.lastResult.listedPrice, 49);
  assert.equal(status.snapshot.logs.some(entry => 'url' in entry || 'password' in entry), false);
  scanResult = { status: 'login_required' };
  await send({ type: 'CHECK_NOW' });
  await send({ type: 'PAGE_READY' }, { tab: { id: 7 } });
  assert.equal(alarms.size, 0);
  assert.equal((await send({ type: 'GET_STATUS', taskId: task.id }, page)).snapshot.logs.at(-1).kind, 'monitor_paused');
  const international = { ...task, id: '87654321-1234-1234-1234-123456789abc', destination: 'CUN', travelDate: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10) };
  await send({ type: 'SAVE_TASK', task: international }, page);
  assert.ok(alarms.size <= 9);
  assert.equal(alarms.get('gowild-follow-up')?.periodInMinutes, 30);
  delete globalThis.chrome;
});
