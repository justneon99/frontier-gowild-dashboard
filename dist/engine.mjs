export const AIRPORTS = ['SJC', 'SFO', 'SLC', 'LAX', 'SAN', 'LAS', 'DEN', 'MCO', 'CLT', 'CUN', 'SJO', 'GUA', 'SAL', 'SAP', 'EWR', 'LGA', 'SEA'];
export const TIME_ZONES = { SJC: 'America/Los_Angeles', SFO: 'America/Los_Angeles', SLC: 'America/Denver', LAX: 'America/Los_Angeles', SAN: 'America/Los_Angeles', LAS: 'America/Los_Angeles', DEN: 'America/Denver', MCO: 'America/New_York', CLT: 'America/New_York', CUN: 'America/Cancun', SJO: 'America/Costa_Rica', GUA: 'America/Guatemala', SAL: 'America/El_Salvador', SAP: 'America/Tegucigalpa', EWR: 'America/New_York', LGA: 'America/New_York', SEA: 'America/Los_Angeles' };
const INTERNATIONAL_AIRPORTS = new Set(['CUN', 'SJO', 'GUA', 'SAL', 'SAP']);
export const bookingWindowDays = (origin, destination) => INTERNATIONAL_AIRPORTS.has(origin) || INTERNATIONAL_AIRPORTS.has(destination) ? 10 : 1;

// Source: https://www.flyfrontier.com/deals/gowild-pass/ (reviewed Sep 29, 2026).
const BLACKOUTS = new Set([
  '2026-10-08','2026-10-09','2026-10-11','2026-10-12',
  '2026-11-24','2026-11-25','2026-11-28','2026-11-29','2026-11-30',
  '2026-12-19','2026-12-20','2026-12-21','2026-12-22','2026-12-23','2026-12-24','2026-12-26','2026-12-27','2026-12-28','2026-12-29','2026-12-30','2026-12-31',
  '2027-01-01','2027-01-02','2027-01-03','2027-01-14','2027-01-15','2027-01-18'
]);
const DAY = 86400000;
const utcDate = date => new Date(`${date}T12:00:00Z`);
const isoDate = date => date.toISOString().slice(0, 10);
const roundFive = number => Math.max(5, Math.round(number / 5) * 5);

export function findRoute(routes, origin, destination) {
  return routes.find(route => (route.a === origin && route.b === destination) || (route.a === destination && route.b === origin));
}

export function bookingReminder(date, origin, hour = 0, destination = origin) {
  const previous = new Date(utcDate(date).getTime() - bookingWindowDays(origin, destination) * DAY);
  const localDate = isoDate(previous);
  const zone = TIME_ZONES[origin];
  if (!zone || !Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('Invalid reminder time');
  // Resolve a local wall-clock time without assuming a fixed UTC offset or DST.
  const target = `${localDate} ${String(hour).padStart(2, '0')}:00`;
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const start = Date.parse(`${localDate}T${String(hour).padStart(2, '0')}:00:00Z`) - 14 * 3600000;
  for (let at = start; at <= start + 28 * 3600000; at += 60000) {
    const parts = Object.fromEntries(format.formatToParts(at).map(part => [part.type, part.value]));
    if (`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` === target) {
      return { at: new Date(at).toISOString(), localDate, localHour: hour, timeZone: zone };
    }
  }
  throw new Error('Could not resolve local reminder time');
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio));
  return sorted[index];
}

export function estimateFare(observations, origin, destination, date, now = new Date()) {
  const recent = observations.filter(item => item.currency === 'USD' && item.nonstop === true &&
    Number(item.amount) > 0 && Number(item.amount) < 100 &&
    Date.parse(item.observedAt) <= now.getTime() && now.getTime() - Date.parse(item.observedAt) <= 30 * DAY &&
    item.travelDate >= isoDate(now) && item.route === `${origin}→${destination}`);
  const reverse = recent.length ? [] : observations.filter(item => item.currency === 'USD' && item.nonstop === true &&
    Number(item.amount) > 0 && Number(item.amount) < 100 &&
    Date.parse(item.observedAt) <= now.getTime() && now.getTime() - Date.parse(item.observedAt) <= 30 * DAY &&
    item.travelDate >= isoDate(now) && item.route === `${destination}→${origin}`);
  const matching = recent.length ? recent : reverse;
  const newest = matching.length ? Math.max(...matching.map(item => Date.parse(item.observedAt))) : 0;
  // Old observations remain in history, but the displayed estimate follows the
  // newest weekly quote rather than treating an older promotion as current.
  const sample = matching.filter(item => newest - Date.parse(item.observedAt) < 3 * DAY);
  if (!sample.length) return { kind: 'insufficient', samples: 0 };
  const amounts = sample.map(item => Number(item.amount));
  const midpoint = percentile(amounts, .5);
  const uncertainty = sample.length >= 4 ? .25 : .55;
  const nearest = sample.reduce((best, item) => Math.abs(Date.parse(item.travelDate) - Date.parse(date)) < Math.abs(Date.parse(best.travelDate) - Date.parse(date)) ? item : best);
  const gapDays = Math.abs(Date.parse(nearest.travelDate) - Date.parse(date)) / DAY;
  const distanceFactor = 1 + Math.min(gapDays, 90) / 60;
  return {
    kind: 'estimate',
    low: roundFive(Math.max(Math.min(...amounts) * .85, midpoint * .9)),
    high: roundFive(Math.max(percentile(amounts, .75), midpoint * (1 + uncertainty) * distanceFactor)),
    samples: sample.length,
    referenceGapDays: gapDays,
    confidence: recent.length && sample.length >= 4 && gapDays <= 14 ? 'limited' : 'low',
    reference: { amount: Number(nearest.amount), travelDate: nearest.travelDate, observedAt: nearest.observedAt, fareType: nearest.fareType, source: nearest.source, reverse: !recent.length }
  };
}

export function recommend({ origin, destination, from, to, budget, hour = 0 }, routes, observations, now = new Date()) {
  if (!AIRPORTS.includes(origin) || !AIRPORTS.includes(destination) || origin === destination) throw new Error('Choose two different supported airports');
  const route = findRoute(routes, origin, destination);
  if (!route) return { status: 'no_verified_nonstop', options: [] };
  const start = utcDate(from), end = utcDate(to), today = utcDate(isoDate(now));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end || start < today || end > new Date(today.getTime() + 90 * DAY)) throw new Error('Choose a date range within the next 90 days');
  if (route.starts && route.starts > isoDate(end)) return { status: 'season_not_yet_in_window', options: [], route };
  if (route.days.every(day => day === null)) return { status: 'schedule_unverified', options: [], route };
  const options = [];
  for (let date = start; date <= end; date = new Date(date.getTime() + DAY)) {
    const travelDate = isoDate(date);
    if (BLACKOUTS.has(travelDate) || route.starts && travelDate < route.starts) continue;
    const weekday = (date.getUTCDay() + 6) % 7;
    if (route.days[weekday] !== 1) continue;
    const reminder = bookingReminder(travelDate, origin, Number(hour), destination);
    if (Date.parse(reminder.at) <= now.getTime()) continue;
    const estimate = estimateFare(observations, origin, destination, travelDate, now);
    const withinBudget = Number.isFinite(Number(budget)) && budget !== '' && estimate.kind === 'estimate' ? estimate.low <= Number(budget) : null;
    options.push({ origin, destination, travelDate, reminder, estimate, withinBudget, routeSource: route.source,
      score: (estimate.kind === 'estimate' ? estimate.high + estimate.referenceGapDays * .1 : 140) + (withinBudget === false ? 30 : 0) });
  }
  options.sort((a, b) => a.score - b.score || a.travelDate.localeCompare(b.travelDate));
  const chosen=[];
  for(const option of options){if(chosen.every(other=>Math.abs(Date.parse(other.travelDate)-Date.parse(option.travelDate))>=3*DAY))chosen.push(option);if(chosen.length===3)break;}
  return { status: options.length ? 'ok' : 'no_matching_dates', options: chosen, route };
}

export function publicFareHistory(observations, { origin = 'all', destination = 'all', includeHistorical = false } = {}) {
  const rows = observations.filter(row => row.nonstop === true && row.currency === 'USD' && Number.isFinite(Number(row.amount)) && Number(row.amount) >= 0 && Number(row.amount) < 100 &&
    (includeHistorical || row.refreshStatus === 'fresh') &&
    (origin === 'all' || row.route?.split('→')[0] === origin) &&
    (destination === 'all' || row.route?.split('→')[1] === destination) &&
    Number.isFinite(Date.parse(row.observedAt)));
  rows.sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.amount - b.amount);
  const byDay = new Map();
  for (const row of rows) {
    const day = row.observedAt.slice(0, 10);
    const entry = byDay.get(day) || { day, lowest: Infinity, count: 0 };
    entry.lowest = Math.min(entry.lowest, Number(row.amount));
    entry.count++;
    byDay.set(day, entry);
  }
  return { rows, days: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)) };
}

export function airportOpportunities(routes, observations) {
  const current = publicFareHistory(observations).rows;
  const lowest = direction => current.filter(row => row.route === direction).reduce((best, row) => !best || Number(row.amount) < Number(best.amount) ? row : best, null);
  return AIRPORTS.map(airport => {
    const destinations = routes.filter(route => route.a === airport || route.b === airport).map(route => {
      const other = route.a === airport ? route.b : route.a;
      return { airport: other, route, fromQuote: lowest(`${airport}→${other}`), toQuote: lowest(`${other}→${airport}`) };
    }).sort((a, b) => a.airport.localeCompare(b.airport));
    return { airport, destinations, currentCount: destinations.filter(item => item.route.status === 'active').length,
      seasonalCount: destinations.filter(item => item.route.status === 'seasonal').length,
      lowestOutgoing: destinations.reduce((best, item) => item.fromQuote && (!best || Number(item.fromQuote.amount) < Number(best.amount)) ? item.fromQuote : best, null) };
  });
}
