import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../extension/frontier-scan.js', import.meta.url), 'utf8');
const task = { origin: 'SJC', destination: 'LAX', travelDate: '2026-10-02' };

function itinerary({ selectedDate = task.travelDate, inputDate = '10/2/2026' } = {}) {
  const header = {
    querySelector(selector) {
      if (selector === '.greenBarLeftDeptCity') return { textContent: 'SJC' };
      if (selector === '.greenBarLeftArrvCity') return { textContent: 'LAX' };
      if (selector === '.header-search-button') return { getAttribute: () => 'SJC one way to LAX 1 adults click here to change your itinerary' };
      return null;
    },
  };
  const document = {
    querySelector(selector) {
      if (selector === '.header-search-container') return header;
      if (selector === '.ibe-depart-section .ibe-flight-slider-box-selected') return { getAttribute: () => selectedDate };
      if (selector === '#searchDepartureDate') return { value: inputDate };
      return null;
    },
  };
  const chrome = { runtime: { onMessage: { addListener() {} }, sendMessage: () => Promise.resolve() } };
  return runInNewContext(`${source}\nrouteAndDate(task)`, { document, chrome, task });
}

test('matches the current Frontier header and selected October 2 flight date', () => {
  assert.equal(itinerary().matches, true);
});

test('does not bind while Frontier selected day and search input disagree', () => {
  assert.equal(itinerary({ selectedDate: '2026-10-01' }).matches, false);
});
