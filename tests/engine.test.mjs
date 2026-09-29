import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingReminder, estimateFare, recommend, publicFareHistory } from '../dist/engine.mjs';

const routes=[{a:'SJC',b:'LAS',days:[1,0,0,1,1,0,1]},{a:'SFO',b:'LAS',days:[1,1,1,1,1,1,1]}];
const observations=[{route:'SFO→LAS',amount:23,currency:'USD',travelDate:'2026-11-18',observedAt:'2026-09-28T12:00:00Z',nonstop:true,fareType:'Discount Den',source:'https://flights.flyfrontier.com/en/flights-from-san-francisco'}];
const now=new Date('2026-09-29T12:00:00Z');

test('reminder uses origin local midnight across daylight saving time',()=>{
  assert.equal(bookingReminder('2026-11-02','SFO',0).at,'2026-11-01T07:00:00.000Z');
  assert.equal(bookingReminder('2026-11-02','DEN',8).at,'2026-11-01T15:00:00.000Z');
});
test('filters non-operating and GoWild blackout dates',()=>{
  const result=recommend({origin:'SJC',destination:'LAS',from:'2026-10-07',to:'2026-10-12',hour:0},routes,[],now);
  assert.deepEqual(result.options.map(option=>option.travelDate),[]);
});
test('estimates only from valid recent observations and labels sparse evidence',()=>{
  const estimate=estimateFare(observations,'SFO','LAS','2026-11-18',now);
  assert.equal(estimate.kind,'estimate');assert.equal(estimate.confidence,'low');assert.equal(estimate.reference.amount,23);
  assert.equal(estimateFare(observations,'SFO','DEN','2026-11-18',now).kind,'insufficient');
});
test('does not infer an unsupported nonstop',()=>{
  assert.equal(recommend({origin:'SAN',destination:'SJC',from:'2026-11-10',to:'2026-11-20',hour:8},routes,observations,now).status,'no_verified_nonstop');
});
test('public fare history separates fresh and historical observations without changing timestamps',()=>{
  const data=[
    {route:'SFO→LAS',amount:23,currency:'USD',nonstop:true,observedAt:'2026-09-28T05:00:00-07:00',refreshStatus:'fresh'},
    {route:'SFO→LAS',amount:19,currency:'USD',nonstop:true,observedAt:'2026-09-23T12:00:00-07:00',refreshStatus:'stale'},
    {route:'LAS→SFO',amount:15,currency:'USD',nonstop:true,observedAt:'2026-09-28T05:00:00-07:00',refreshStatus:'fresh'},
    {route:'SFO→LAS',amount:120,currency:'USD',nonstop:true,observedAt:'2026-09-28T05:00:00-07:00',refreshStatus:'fresh'}
  ];
  const current=publicFareHistory(data,{origin:'SFO',destination:'LAS'});
  assert.deepEqual(current.days,[{day:'2026-09-28',lowest:23,count:1}]);
  assert.equal(current.rows.length,1);
  const all=publicFareHistory(data,{origin:'SFO',destination:'LAS',includeHistorical:true});
  assert.deepEqual(all.days.map(day=>day.lowest),[19,23]);
  assert.equal(all.rows[1].observedAt,'2026-09-23T12:00:00-07:00');
});
