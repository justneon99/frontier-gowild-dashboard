const isoDate = value => { const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/); return match ? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : ''; };
const to24 = value => { const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i); if (!match) return ''; return `${String((Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0)).padStart(2, '0')}:${match[2]}`; };
const text = (root, selector) => root.querySelector(selector)?.textContent?.trim() || '';
function routeAndDate(task) {
  const header = document.querySelector('.greenBarLeftContentWrapper');
  const airports = header?.innerText?.match(/\b[A-Z]{3}\b/g) || [];
  const oneWay = !document.querySelector('.ibe-return-section');
  const oneAdult = /\b1 adult\b/i.test(header?.innerText || '');
  const date = isoDate(document.querySelector('#searchDepartureDate')?.value);
  return { matches: airports[0] === task.origin && airports[1] === task.destination && date === task.travelDate && oneWay && oneAdult, airports, date, oneWay, oneAdult };
}
async function scan(task, validateOnly = false) {
  if (location.hostname !== 'booking.flyfrontier.com' || location.pathname !== '/Flight/Select') return { status: 'unsupported_page' };
  const itinerary = routeAndDate(task);
  if (!itinerary.matches) return { status: 'mismatch', itinerary };
  if (validateOnly) return { status: 'matched' };
  const gw = document.querySelector('.ibe-depart-section .navItem.gw');
  if (!gw) return { status: 'unsupported_page' };
  if (!gw.classList.contains('navSelected')) { gw.click(); await new Promise(resolve => setTimeout(resolve, 350)); }
  if (!document.querySelector('.ibe-depart-section .navItem.gw.navSelected')) return { status: 'unsupported_page' };
  const loggedIn = !!document.querySelector('.user-logged-in')?.getClientRects().length;
  if (!loggedIn) return { status: 'login_required' };
  const candidates = [];
  for (const card of document.querySelectorAll('.ibe-depart-section .ibe-flight-info')) {
    if (!/^Nonstop$/i.test(text(card, '.ibe-flight-duration-stops'))) continue;
    const origin = text(card, '.depart-station-name'), destination = text(card, '.arrival-station-name');
    const departureTime = to24(text(card, '.ibe-flight-time-depart .ibe-flight-select-time'));
    if (origin !== task.origin || destination !== task.destination || departureTime < task.earliestTime || departureTime > task.latestTime) continue;
    let flightNumber = '';
    try { const details = JSON.parse(card.querySelector('.flight-number')?.getAttribute('data-det-json') || '[]'); if (details.length !== 1 || details[0].departureStation !== origin || details[0].arrivalStation !== destination || !String(details[0].sellKey || '').includes(task.travelDate.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2/$3/$1'))) continue; flightNumber = `${details[0].carrierCode} ${details[0].flightNumber}`; } catch { continue; }
    const fares = [...card.querySelectorAll('.ibe-flight-farebox-fare')].filter(el => !/Unavailable/i.test(el.innerText));
    const listedPrices = fares.map(el => Number(el.innerText.match(/\$\s*(\d+(?:\.\d{2})?)/)?.[1])).filter(Number.isFinite);
    if (listedPrices.length) candidates.push({ flightNumber, departureTime, arrivalTime: to24(text(card, '.ibe-flight-time-arrive .ibe-flight-select-time')), listedPrice: Math.min(...listedPrices) });
  }
  return { status: candidates.length ? 'candidate' : 'no_candidate', candidates, checkedAt: new Date().toISOString(), url: location.href };
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'SCAN') return;
  scan(message.task, !!message.validateOnly).then(sendResponse, error => sendResponse({ status: 'error', error: error.message }));
  return true;
});
chrome.runtime.sendMessage({ type: 'PAGE_READY' }).catch(() => {});
