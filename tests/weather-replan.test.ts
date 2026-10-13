import test from 'node:test';
import assert from 'node:assert/strict';
import {businessRoleCapabilities,buildRainoutReplan,type RainoutVisit,type TruckDayCapacity} from '../src/domain/weather-replan';

const visits:RainoutVisit[]=Array.from({length:10},(_,i)=>({id:'visit-'+(i+1),estimatedMinutes:60,rateCents:7000}));
const completed=['visit-1','visit-2'];
const capacities:TruckDayCapacity[]=[
 {date:'2026-10-14',truckId:'truck-1',availableServiceMinutes:120,availableStops:2},
 {date:'2026-10-14',truckId:'truck-2',availableServiceMinutes:120,availableStops:2},
 {date:'2026-10-14',truckId:'truck-3',availableServiceMinutes:120,availableStops:2},
 {date:'2026-10-15',truckId:'truck-1',availableServiceMinutes:120,availableStops:2},
 {date:'2026-10-15',truckId:'truck-2',availableServiceMinutes:120,availableStops:2}
];

test('rain-out preserves completed visits and compares next-day with spread options',()=>{
 const proposal=buildRainoutReplan(visits,completed,'2026-10-13',capacities);
 assert.deepEqual(proposal.remainingVisitIds,visits.slice(2).map(v=>v.id));
 assert.deepEqual(proposal.options.nextDay.unchangedCompletedVisitIds,completed);
 assert.equal(proposal.options.nextDay.movedVisitCount,6);
 assert.deepEqual(proposal.options.nextDay.unplacedVisitIds,['visit-9','visit-10']);
 assert.equal(proposal.options.nextDay.projectedRevenueCents,42000);
 assert.equal(proposal.options.nextDay.days[0].utilizationPercent,100);
 assert.equal(proposal.options.spread.movedVisitCount,8);
 assert.deepEqual(proposal.options.spread.unplacedVisitIds,[]);
 assert.equal(proposal.options.spread.totalDaysDelayed,10);
 assert.equal(proposal.options.spread.maxDaysDelayed,2);
 assert.equal(proposal.options.spread.days[1].stopCount,2);
 assert.ok(proposal.options.spread.warnings.some(w=>w.includes('drive time')));
 assert.equal(visits.length,10);
});

test('owner operator has manager and field capabilities; worker cannot approve',()=>{
 assert.deepEqual(businessRoleCapabilities('owner'),{manageSchedule:true,recordFieldWork:true});
 assert.deepEqual(businessRoleCapabilities('admin'),{manageSchedule:true,recordFieldWork:false});
 assert.deepEqual(businessRoleCapabilities('worker'),{manageSchedule:false,recordFieldWork:true});
});

test('rejects duplicate stops, foreign completions, duplicate capacities, and invalid dates',()=>{
 assert.throws(()=>buildRainoutReplan([visits[0],visits[0]],[],'2026-10-13',capacities),/unique/);
 assert.throws(()=>buildRainoutReplan(visits,['unknown'],'2026-10-13',capacities),/members/);
 assert.throws(()=>buildRainoutReplan(visits,[],'2026-10-13',[capacities[0],capacities[0]]),/duplicate/);
 assert.throws(()=>buildRainoutReplan(visits,[],'2026-02-30',[]),/valid local/);
});
