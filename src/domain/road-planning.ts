import { planDay } from './planner';
import { roadTravelMinutes, type RoadPoint, type RoadMatrixResponse } from './road-matrix';
import type { PlannerInput, PlanResult } from './types';

export type RoadPlanInput=Omit<PlannerInput,'travelMinutes'>;
/**
 * Plan a day's stops against road-provider durations rather than synthetic travel.
 * Caller supplies a verified provider result in the same order as nodes.
 * This does not call a map provider and must not be labeled live until integrated.
 */
export function planWithRoadMatrix(input:RoadPlanInput,points:RoadPoint[],response:RoadMatrixResponse):PlanResult{
 const required=new Set([input.startNodeId,input.endNodeId,...input.jobs.map(j=>j.locationId)]);
 const available=new Set(points.map(p=>p.id));
 for(const id of required)if(!available.has(id))throw new Error('Missing road point: '+id);
 const matrix=roadTravelMinutes(points,response);
 return planDay({...input,travelMinutes:matrix});
}
