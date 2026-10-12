import { planDay } from './planner';
import { roadTravelDistancesMiles, roadTravelMinutes, type RoadPoint, type RoadMatrixResponse } from './road-matrix';
import { estimateRouteFuel, type FuelAssumptions, type FuelEstimate } from './fuel';
import type { PlannerInput, PlanResult } from './types';

export type RoadPlanInput=Omit<PlannerInput,'travelMinutes'> & {fuelAssumptions?:FuelAssumptions};
export type RoadPlanResult=PlanResult & {totalDriveDistanceMiles:number|null;fuelEstimate:FuelEstimate|null};
/** Plan with provider durations; compute mileage/fuel only from complete provider distances. */
export function planWithRoadMatrix(input:RoadPlanInput,points:RoadPoint[],response:RoadMatrixResponse):RoadPlanResult{
 const required=new Set([input.startNodeId,input.endNodeId,...input.jobs.map(j=>j.locationId)]);
 const available=new Set(points.map(p=>p.id));
 for(const id of required)if(!available.has(id))throw new Error('Missing road point: '+id);
 const matrix=roadTravelMinutes(points,response);
 const {fuelAssumptions,...plannerInput}=input;
 const plan=planDay({...plannerInput,travelMinutes:matrix});
 if(!response.distances)return {...plan,totalDriveDistanceMiles:null,fuelEstimate:null};
 const distances=roadTravelDistancesMiles(points,response);
 const path=[input.startNodeId,...plan.stops.map(stop=>stop.locationId),input.endNodeId];
 let totalDriveDistanceMiles=0;
 for(let i=0;i<path.length-1;i++){
  const leg=distances[path[i]]?.[path[i+1]];
  if(leg===undefined)return {...plan,totalDriveDistanceMiles:null,fuelEstimate:null};
  totalDriveDistanceMiles+=leg;
 }
 const fuelEstimate=fuelAssumptions?estimateRouteFuel(totalDriveDistanceMiles,fuelAssumptions):null;
 return {...plan,totalDriveDistanceMiles,fuelEstimate};
}
