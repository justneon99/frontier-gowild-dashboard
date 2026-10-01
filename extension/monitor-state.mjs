const MAX_LOGS = 120;

export function appendLog(logs, entry) {
  return [...(Array.isArray(logs) ? logs : []), entry].slice(-MAX_LOGS);
}

export function summarizeResult(result, task) {
  const candidates = Array.isArray(result?.candidates) ? result.candidates.filter(flight => Number.isFinite(flight.listedPrice)) : [];
  const best = candidates.reduce((lowest, flight) => !lowest || flight.listedPrice < lowest.listedPrice ? flight : lowest, null);
  const belowCap = candidates.some(flight => flight.listedPrice * 100 < task.maxTotalCents);
  return {
    status: result?.status === 'candidate' ? (belowCap ? 'fare_below_cap' : 'fare_above_cap') : result?.status || 'error',
    checkedAt: new Date().toISOString(),
    candidateCount: candidates.length,
    ...(best ? { flightNumber: best.flightNumber, listedPrice: best.listedPrice } : {}),
  };
}
