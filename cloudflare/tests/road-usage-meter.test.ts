import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateRoadCostMicroUsd,reserveRoadUsage,roadBillingMonthKey,ROAD_MONTHLY_ELEMENT_LIMIT,ROAD_MONTHLY_SPEND_CAP_MICRO_USD} from '../src/road-usage-meter';

test('billing month follows the Pacific reset boundary, including daylight time',()=>{
 assert.equal(roadBillingMonthKey(new Date('2026-11-01T06:59:59.000Z')),'2026-10');
 assert.equal(roadBillingMonthKey(new Date('2026-11-01T07:00:00.000Z')),'2026-11');
 assert.equal(roadBillingMonthKey(new Date('2026-04-01T06:59:59.000Z')),'2026-03');
 assert.equal(roadBillingMonthKey(new Date('2026-04-01T07:00:00.000Z')),'2026-04');
});

test('Edgewater allowance estimates no-free-credit exposure below the hard spend cap',()=>{
 assert.equal(estimateRoadCostMicroUsd(19_500,5_000_000),97_500_000);
 assert.equal(ROAD_MONTHLY_ELEMENT_LIMIT,19_500);
 assert.equal(ROAD_MONTHLY_SPEND_CAP_MICRO_USD,120_000_000);
 assert.equal(estimateRoadCostMicroUsd(144,5_000_000),720_000);
});

test('usage is reserved with one conditional atomic upsert and rejects at either limit',async()=>{
 let sql='',parameters:unknown[]=[];
 const db={prepare(query:string){sql=query;return {bind(...values:unknown[]){parameters=values;return {async first(){return {billing_month:'2026-10'};}};}};}} as unknown as D1Database;
 assert.equal(await reserveRoadUsage(db,'2026-10',144,720_000,new Date('2026-10-13T12:00:00Z')),true);
 assert.match(sql,/ON CONFLICT\(billing_month\) DO UPDATE/);
 assert.match(sql,/element_count\+excluded\.element_count<=\?/);
 assert.match(sql,/estimated_cost_micro_usd\+excluded\.estimated_cost_micro_usd<=\?/);
 assert.match(sql,/RETURNING billing_month/);
 assert.deepEqual(parameters,['2026-10',144,720_000,'2026-10-13T12:00:00.000Z',19_500,120_000_000]);
 const rejected={prepare(){return {bind(){return {async first(){return null;}};}};}} as unknown as D1Database;
 assert.equal(await reserveRoadUsage(rejected,'2026-10',19_501,1,new Date()),false);
 assert.equal(await reserveRoadUsage(rejected,'2026-10',1,120_000_001,new Date()),false);
});
