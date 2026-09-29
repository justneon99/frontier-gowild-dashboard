import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingReminder, bookingWindowDays, estimateFare, recommend, publicFareHistory, airportOpportunities } from '../dist/engine.mjs';
import routesData from '../dist/data/routes.json' with { type: 'json' };

const routes=[{a:'SJC',b:'LAS',days:[1,0,0,1,1,0,1]},{a:'SFO',b:'LAS',days:[1,1,1,1,1,1,1]}];
const observations=[{route:'SFO→LAS',amount:23,currency:'USD',travelDate:'2026-11-18',observedAt:'2026-09-28T12:00:00Z',nonstop:true,fareType:'Discount Den',source:'https://flights.flyfrontier.com/en/flights-from-san-francisco'}];
const now=new Date('2026-09-29T12:00:00Z');

test('reminder uses origin local midnight across daylight saving time',()=>{
  assert.equal(bookingReminder('2026-11-02','SFO',0).at,'2026-11-01T07:00:00.000Z');
  assert.equal(bookingReminder('2026-11-02','DEN',8).at,'2026-11-01T15:00:00.000Z');
});
test('international travel opens a ten-day booking check in the origin time zone',()=>{
  assert.equal(bookingWindowDays('MCO','SJO'),10);
  assert.equal(bookingWindowDays('SJO','MCO'),10);
  assert.equal(bookingWindowDays('MCO','LAS'),1);
  assert.equal(bookingReminder('2026-10-24','MCO',0,'SJO').at,'2026-10-14T04:00:00.000Z');
  assert.equal(bookingReminder('2026-10-24','SJO',0,'MCO').at,'2026-10-14T06:00:00.000Z');
});
test('new nonstop coverage distinguishes seasonal dates from unknown weekdays',()=>{
  const routes=routesData.routes;
  assert.equal(recommend({origin:'MCO',destination:'CUN',from:'2026-10-01',to:'2026-12-20'},routes,[],now).status,'season_not_yet_in_window');
  assert.equal(recommend({origin:'MCO',destination:'LGA',from:'2026-12-01',to:'2026-12-15'},routes,[],now).status,'schedule_unverified');
  assert.equal(recommend({origin:'MCO',destination:'SJO',from:'2026-10-24',to:'2026-10-24'},routes,[],now).options[0].reminder.localDate,'2026-10-14');
  assert.equal(recommend({origin:'SAN',destination:'SAP',from:'2026-10-24',to:'2026-10-24'},routes,[],now).status,'no_verified_nonstop');
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
test('airport opportunities use nonstop routes and fresh fares in the correct direction',()=>{
  const schedule=[{a:'SFO',b:'LAS',status:'active'},{a:'SFO',b:'SLC',status:'seasonal'}];
  const fares=[
    {route:'SFO→LAS',amount:23,currency:'USD',nonstop:true,observedAt:'2026-09-28T12:00:00Z',refreshStatus:'fresh'},
    {route:'LAS→SFO',amount:19,currency:'USD',nonstop:true,observedAt:'2026-09-23T12:00:00Z',refreshStatus:'stale'},
    {route:'SFO→SLC',amount:30,currency:'USD',nonstop:false,observedAt:'2026-09-28T12:00:00Z',refreshStatus:'fresh'}
  ];
  const sfo=airportOpportunities(schedule,fares).find(item=>item.airport==='SFO');
  assert.equal(sfo.currentCount,1);assert.equal(sfo.seasonalCount,1);
  assert.equal(sfo.lowestOutgoing.amount,23);
  assert.equal(sfo.destinations.find(item=>item.airport==='LAS').toQuote,null);
  assert.equal(sfo.destinations.find(item=>item.airport==='SLC').fromQuote,null);
});
