export type Id = string;
export type ServiceCustomer = { id: Id; name: string; phone?: string; email?: string };
export type ServiceLocation = { id: Id; customerId: Id; label: string; address: string; lat: number; lon: number; notes?: string };
export type ServiceJob = {
  id: Id; customerId: Id; locationId: Id; serviceName: string;
  rateCents: number; estimatedMinutes: number;
  earliestStartMinute?: number; latestFinishMinute?: number;
  fixedStartMinute?: number; priority?: number; due?: boolean;
};
export type TravelMatrix = Record<string, Record<string, number>>; // drive minutes, from nodeId to nodeId
export type PlannerInput = {
  jobs: ServiceJob[]; locations: ServiceLocation[]; travelMinutes: TravelMatrix;
  startNodeId: Id; endNodeId: Id; startMinute: number; endMinute: number; maxJobs: number;
  minimumBufferMinutes?: number;
};
export type PlannedStop = { jobId: Id; locationId: Id; arrivalMinute: number; startMinute: number; finishMinute: number; driveMinutes: number; waitMinutes: number };
export type PlanResult = { stops: PlannedStop[]; excluded: { jobId: Id; reason: string }[]; plannedFinishMinute: number; totalDriveMinutes: number; totalServiceMinutes: number; revenueCents: number; returnDriveMinutes: number; feasible: boolean };
