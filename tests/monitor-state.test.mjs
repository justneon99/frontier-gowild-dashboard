import test from 'node:test';
import assert from 'node:assert/strict';
import { appendLog, summarizeResult } from '../extension/monitor-state.mjs';

test('execution log stays bounded and preserves the newest entries', () => {
  let logs = [];
  for (let index = 0; index < 125; index++) logs = appendLog(logs, { index });
  assert.equal(logs.length, 120);
  assert.equal(logs[0].index, 5);
  assert.equal(logs.at(-1).index, 124);
});

test('fare result uses a strict cap and keeps the lowest listed nonstop', () => {
  const task = { maxTotalCents: 5000 };
  const atCap = summarizeResult({ status: 'candidate', candidates: [{ flightNumber: 'F9 1', listedPrice: 50 }] }, task);
  assert.equal(atCap.status, 'fare_above_cap');
  const below = summarizeResult({ status: 'candidate', candidates: [{ flightNumber: 'F9 1', listedPrice: 50 }, { flightNumber: 'F9 2', listedPrice: 49.99 }] }, task);
  assert.equal(below.status, 'fare_below_cap');
  assert.equal(below.flightNumber, 'F9 2');
  assert.equal(below.listedPrice, 49.99);
});
