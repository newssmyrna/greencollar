import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateRouteFuel} from '../src/domain/fuel';

test('uses vehicle MPG when no trailer is attached',()=>{
 assert.deepEqual(estimateRouteFuel(100,{vehicleMpg:20,towingMpg:12,trailerAttached:false,fuelPriceCentsPerGallon:350}),
  {distanceMiles:100,mpgUsed:20,gallons:5,estimatedCostCents:1750});
});
test('uses the editable towing MPG when trailer is attached',()=>{
 assert.deepEqual(estimateRouteFuel(24,{vehicleMpg:20,towingMpg:10,trailerAttached:true,fuelPriceCentsPerGallon:350}),
  {distanceMiles:24,mpgUsed:10,gallons:2.4,estimatedCostCents:840});
});
test('fuel cost is omitted if no fuel price is supplied',()=>{
 assert.deepEqual(estimateRouteFuel(30,{vehicleMpg:15,towingMpg:10,trailerAttached:false}),
  {distanceMiles:30,mpgUsed:15,gallons:2});
});
test('invalid distances MPG and fuel prices are rejected',()=>{
 assert.throws(()=>estimateRouteFuel(-1,{vehicleMpg:20,towingMpg:10,trailerAttached:false}),/distance/);
 assert.throws(()=>estimateRouteFuel(10,{vehicleMpg:0,towingMpg:10,trailerAttached:false}),/MPG/);
 assert.throws(()=>estimateRouteFuel(10,{vehicleMpg:20,towingMpg:10,trailerAttached:true,fuelPriceCentsPerGallon:-1}),/Fuel price/);
});
