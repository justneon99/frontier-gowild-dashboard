import test from 'node:test';
import assert from 'node:assert/strict';
import { windowStart, OFFSETS } from '../extension/schedule.mjs';

test('personal monitor uses origin-local midnight and finite checks', () => {
  const la = windowStart({ origin: 'SJC', destination: 'LAX', travelDate: '2026-10-02' });
  assert.equal(new Date(la).toISOString(), '2026-10-01T07:00:00.000Z');
  const den = windowStart({ origin: 'DEN', destination: 'SLC', travelDate: '2026-10-02' });
  assert.equal(new Date(den).toISOString(), '2026-10-01T06:00:00.000Z');
  const international = windowStart({ origin: 'SJC', destination: 'CUN', travelDate: '2026-10-20' });
  assert.equal(new Date(international).toISOString(), '2026-10-10T07:00:00.000Z');
  assert.deepEqual(OFFSETS, [0,1,2,4,8,16,32,60]);
});
