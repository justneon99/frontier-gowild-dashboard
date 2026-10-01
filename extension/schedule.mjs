export const ZONES = { ATL:'America/New_York',TPA:'America/New_York',SJC:'America/Los_Angeles',SFO:'America/Los_Angeles',SLC:'America/Denver',LAX:'America/Los_Angeles',SAN:'America/Los_Angeles',LAS:'America/Los_Angeles',DEN:'America/Denver',MCO:'America/New_York',CLT:'America/New_York',CUN:'America/Cancun',SJO:'America/Costa_Rica',GUA:'America/Guatemala',SAL:'America/El_Salvador',SAP:'America/Tegucigalpa',EWR:'America/New_York',LGA:'America/New_York',SEA:'America/Los_Angeles' };
const INTERNATIONAL = new Set(['CUN','SJO','GUA','SAL','SAP']);
export const OFFSETS = [0, 1, 2, 4, 8, 16, 32, 60];
const MINUTE = 60_000;
const FOLLOW_UP_START = 90 * MINUTE;
const FOLLOW_UP_INTERVAL = 30 * MINUTE;
export function localMidnight(date, zone) {
  const target = `${date} 00:00`;
  const format = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const start = Date.parse(`${date}T00:00:00Z`) - 14 * 3_600_000;
  for (let at = start; at <= start + 28 * 3_600_000; at += 60_000) {
    const p = Object.fromEntries(format.formatToParts(at).map(part => [part.type, part.value]));
    if (`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` === target) return at;
  }
  throw new Error('Could not resolve departure-airport midnight');
}
export function windowStart(task) {
  if (!ZONES[task.origin] || !ZONES[task.destination]) throw new Error('Unsupported airport');
  const days = INTERNATIONAL.has(task.origin) || INTERNATIONAL.has(task.destination) ? 10 : 1;
  const date = new Date(Date.parse(`${task.travelDate}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  return localMidnight(date, ZONES[task.origin]);
}

export function monitorCutoff(task) {
  const zone = ZONES[task.origin];
  const target = `${task.travelDate} ${task.earliestTime}`;
  const format = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const approximate = localMidnight(task.travelDate, zone) + (Number(task.earliestTime.slice(0, 2)) * 60 + Number(task.earliestTime.slice(3))) * MINUTE;
  for (let delta = -120; delta <= 120; delta++) {
    const at = approximate + delta * MINUTE;
    const p = Object.fromEntries(format.formatToParts(at).map(part => [part.type, part.value]));
    if (`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` === target) return at - 120 * MINUTE;
  }
  throw new Error('Could not resolve earliest departure time');
}

export function nextFollowUp(task, now = Date.now()) {
  const first = windowStart(task) + FOLLOW_UP_START;
  const next = first + Math.max(0, Math.floor((now - first) / FOLLOW_UP_INTERVAL) + 1) * FOLLOW_UP_INTERVAL;
  return next < monitorCutoff(task) ? next : null;
}

export function checkTimes(task, now = Date.now()) {
  const start = windowStart(task), cutoff = monitorCutoff(task);
  const times = OFFSETS.map(minutes => start + minutes * MINUTE).filter(at => at > now && at < cutoff);
  for (let at = nextFollowUp(task, now); at !== null && at < cutoff; at += FOLLOW_UP_INTERVAL) times.push(at);
  return times;
}
