import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTruckPreview} from '../src/domain/truck-preview';

test('groups stops in existing queue order without assigning them automatically',()=>{
 const visits=[{id:'a',lat:29,lon:-80},{id:'b',lat:29.1,lon:-80.1},{id:'c',lat:29.2,lon:-80.2}];
 assert.deepEqual(prepareTruckPreview(visits,{}),{status:'missing_assignment',unassignedVisitIds:['a','b','c']});
 const plan=prepareTruckPreview(visits,{'a':'truck-2','b':'truck-1','c':'truck-2'});
 assert.equal(plan.status,'ready');
 if(plan.status!=='ready')return;
 assert.deepEqual(plan.routes[0].stops.map(x=>x.visitId),['b']);
 assert.deepEqual(plan.routes[1].stops.map(x=>x.visitId),['a','c']);
 assert.equal(plan.routes[1].elementCount,4);
 assert.equal(plan.routes[2].elementCount,0);
});

test('blocks missing or invalid saved coordinates and more than 25 stops per truck',()=>{
 assert.deepEqual(prepareTruckPreview([{id:'a',lat:null,lon:null}],{a:'truck-1'}),{status:'missing_coordinates',visitIds:['a']});
 const visits=Array.from({length:26},(_,i)=>({id:'v'+i,lat:29,lon:-80}));
 const assignments=Object.fromEntries(visits.map(v=>[v.id,'truck-3' as const]));
 assert.deepEqual(prepareTruckPreview(visits,assignments),{status:'too_many_points',truck:'truck-3',count:26});
});
