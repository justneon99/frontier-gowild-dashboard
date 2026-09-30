const bad = message => Object.assign(new Error(message), { status: 400 });
const airport = value => /^[A-Z]{3}$/.test(value || '') ? value : (() => { throw bad('Invalid airport code'); })();
const time = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? value : (() => { throw bad('Invalid local time'); })();
const date = value => {
  const parsed = Date.parse(`${value}T12:00:00Z`);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) throw bad('Invalid travel date');
  const days = (Date.parse(`${value}T12:00:00Z`) - Date.now()) / 86_400_000;
  if (days < -1 || days > 365) throw bad('Travel date must be within the next year');
  return value;
};
const cents = value => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 10000 || Math.abs(Math.round(number * 100) - number * 100) > 0.000001) throw bad('Invalid USD amount');
  return Math.round(number * 100);
};
export function normalizeTask(input) {
  const origin = airport(String(input.origin || '').toUpperCase());
  const destination = airport(String(input.destination || '').toUpperCase());
  if (origin === destination) throw bad('Origin and destination must differ');
  const travelDate = date(input.travelDate);
  const earliestTime = time(input.earliestTime);
  const latestTime = time(input.latestTime);
  if (earliestTime > latestTime) throw bad('Time range must be on the same departure day');
  const maxTotalCents = cents(input.maxTotalUSD);
  if (maxTotalCents < 100) throw bad('Maximum total must be at least $1');
  return { origin, destination, travelDate, earliestTime, latestTime, maxTotalCents };
}
export function evaluateCheck(task, input) {
  const reasons = [];
  const departureTime = time(input.departureTime);
  const arrivalTime = time(input.arrivalTime);
  const totalCents = cents(input.totalUSD);
  const addOnsCents = cents(input.addOnsUSD ?? 0);
  const flightNumber = String(input.flightNumber || '').trim().toUpperCase();
  const evidenceUrl = String(input.evidenceUrl || '').trim();
  if (!/^F9\s?\d{1,4}$/.test(flightNumber)) reasons.push('flight_number_unconfirmed');
  if (input.origin !== task.origin || input.destination !== task.destination || input.travelDate !== task.travelDate) reasons.push('itinerary_mismatch');
  if (departureTime < task.earliestTime || departureTime > task.latestTime) reasons.push('departure_outside_window');
  if (input.nonstop !== true) reasons.push('not_nonstop');
  if (input.oneWay !== true || input.passengers !== 1) reasons.push('not_one_way_one_passenger');
  if (input.fareType !== 'GoWild' || input.passholderValidated !== true) reasons.push('gowild_not_verified');
  if (addOnsCents !== 0) reasons.push('paid_addons');
  if (totalCents >= task.maxTotalCents) reasons.push('total_not_below_cap');
  if (input.checkpoint !== 'payment_review') reasons.push('payment_review_not_reached');
  if (evidenceUrl && (!/^https:\/\/(?:booking\.)?flyfrontier\.com\//i.test(evidenceUrl) || evidenceUrl.length > 500)) reasons.push('invalid_frontier_url');
  return { result: reasons.length ? 'does_not_match' : 'user_review_ready', reasons, flightNumber: flightNumber.slice(0, 12), departureTime, arrivalTime, totalCents, evidenceUrl: evidenceUrl.slice(0, 500), checkpoint: input.checkpoint === 'payment_review' ? 'payment_review' : 'search_or_checkout' };
}
