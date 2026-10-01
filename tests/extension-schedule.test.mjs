import test from 'node:test';
import assert from 'node:assert/strict';
import { windowStart, monitorCutoff, nextFollowUp, checkTimes, OFFSETS } from '../extension/schedule.mjs';

test('personal monitor uses origin-local midnight and finite checks', () => {
  const la = windowStart({ origin: 'SJC', destination: 'LAX', travelDate: '2026-10-02' });
  assert.equal(new Date(la).toISOString(), '2026-10-01T07:00:00.000Z');
  const den = windowStart({ origin: 'DEN', destination: 'SLC', travelDate: '2026-10-02' });
  assert.equal(new Date(den).toISOString(), '2026-10-01T06:00:00.000Z');
  const international = windowStart({ origin: 'SJC', destination: 'CUN', travelDate: '2026-10-20' });
  assert.equal(new Date(international).toISOString(), '2026-10-10T07:00:00.000Z');
  assert.deepEqual(OFFSETS, [0,1,2,4,8,16,32,60]);
});

test('a missed midnight window still has later checks before departure', () => {
  const task = { origin: 'SJC', destination: 'LAX', travelDate: '2026-10-02', earliestTime: '18:00' };
  const afterMidnight = checkTimes(task, Date.parse('2026-10-01T09:00:00Z')).map(at => new Date(at).toISOString());
  assert.equal(new Date(nextFollowUp(task, Date.parse('2026-10-01T09:00:00Z'))).toISOString(), '2026-10-01T09:30:00.000Z');
  assert.ok(afterMidnight.includes('2026-10-01T11:00:00.000Z')); // 04:00 Pacific
  assert.ok(afterMidnight.includes('2026-10-01T19:00:00.000Z')); // 12:00 Pacific
  assert.ok(afterMidnight.includes('2026-10-02T19:00:00.000Z')); // 12:00 Pacific on travel day
  assert.ok(!afterMidnight.includes('2026-10-02T23:00:00.000Z')); // within two hours of earliest departure
  assert.ok(afterMidnight.every((at, index) => index === 0 || Date.parse(at) - Date.parse(afterMidnight[index - 1]) <= 30 * 60_000));
  assert.deepEqual(checkTimes(task, Date.parse('2026-10-03T00:00:00Z')), []);
});

test('international checks continue after the ten-day opening date', () => {
  const task = { origin: 'SJC', destination: 'CUN', travelDate: '2026-10-20', earliestTime: '18:00' };
  const times = checkTimes(task, Date.parse('2026-10-11T00:00:00Z')).map(at => new Date(at).toISOString());
  assert.ok(times.includes('2026-10-12T15:00:00.000Z')); // Oct 12, 08:00 Pacific
  assert.ok(times.includes('2026-10-19T19:00:00.000Z')); // Oct 19, 12:00 Pacific
  assert.ok(checkTimes(task, Date.parse('2026-10-09T00:00:00Z')).length > 500); // the extension must use one recurring alarm
});

test('travel-day cutoff respects the origin time zone through daylight saving', () => {
  const task = { origin: 'SFO', destination: 'LAS', travelDate: '2026-11-01', earliestTime: '18:00' };
  assert.equal(new Date(monitorCutoff(task)).toISOString(), '2026-11-02T00:00:00.000Z');
});
