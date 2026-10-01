export const ZONES = { ATL:'America/New_York',TPA:'America/New_York',SJC:'America/Los_Angeles',SFO:'America/Los_Angeles',SLC:'America/Denver',LAX:'America/Los_Angeles',SAN:'America/Los_Angeles',LAS:'America/Los_Angeles',DEN:'America/Denver',MCO:'America/New_York',CLT:'America/New_York',CUN:'America/Cancun',SJO:'America/Costa_Rica',GUA:'America/Guatemala',SAL:'America/El_Salvador',SAP:'America/Tegucigalpa',EWR:'America/New_York',LGA:'America/New_York',SEA:'America/Los_Angeles' };
const INTERNATIONAL = new Set(['CUN','SJO','GUA','SAL','SAP']);
export const OFFSETS = [0, 1, 2, 4, 8, 16, 32, 60];
const LATER_OFFSETS = [120, 240, 360, 540, 720, 900, 1080, 1260];
const DAILY_HOURS = [8, 12, 16, 20];
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

export function checkTimes(task, now = Date.now()) {
  const start = windowStart(task);
  const zone = ZONES[task.origin];
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(start)).map(part => [part.type, part.value]));
  const openingDate = `${parts.year}-${parts.month}-${parts.day}`;
  const dates = [];
  for (let date = openingDate; date <= task.travelDate; date = new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) dates.push(date);
  const earliestMinutes = Number(task.earliestTime.slice(0, 2)) * 60 + Number(task.earliestTime.slice(3));
  const times = [...OFFSETS, ...LATER_OFFSETS].map(minutes => start + minutes * 60_000);
  for (const date of dates.slice(1)) {
    const midnight = localMidnight(date, zone);
    for (const hour of DAILY_HOURS) {
      if (date === task.travelDate && hour * 60 >= earliestMinutes - 120) continue;
      const format = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' });
      const approximate = midnight + hour * 3_600_000;
      const matches = [approximate - 3_600_000, approximate, approximate + 3_600_000].find(at => Number(format.format(new Date(at))) === hour);
      if (matches != null) times.push(matches);
    }
  }
  return [...new Set(times)].filter(at => at > now).sort((a, b) => a - b);
}
