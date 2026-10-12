import type { PlannerInput, ServiceCustomer, ServiceLocation, ServiceJob, TravelMatrix } from '../domain/types';

export const customers: ServiceCustomer[] = Array.from({length:50},(_,i)=>({
  id:'c'+(i+1),name:'Example Customer '+(i+1),
  phone:undefined
}));
export const locations: ServiceLocation[] = customers.map((c,i)=>({
  id:'loc'+(i+1),customerId:c.id,label:'Service location '+(i+1),
  address:'Synthetic address '+(i+1)+', Demo City, FL',
  lat:28.9+Math.floor(i/10)*0.004,lon:-80.9+(i%10)*0.004,
  notes:i%7===0?'Customer requests a call before service':undefined
}));
export const jobs: ServiceJob[] = customers.map((c,i)=>({
  id:'job'+(i+1),customerId:c.id,locationId:'loc'+(i+1),
  serviceName:['Cleaning','Lawn care','Pool service','Mobile detailing','Property maintenance'][i%5],
  rateCents:4000+(i%9)*1000,
  estimatedMinutes:25+(i%6)*10,
  priority:i%4,
  earliestStartMinute:i%8===0?9*60:undefined,
  latestFinishMinute:i%9===0?14*60:undefined,
  due:true
}));
const nodes = ['base',...locations.map(l=>l.id)];
// Synthetic driving matrix for internal tests only; production uses a real road matrix.
export const travelMinutes:TravelMatrix={};
for(let i=0;i<nodes.length;i++){
  travelMinutes[nodes[i]]={};
  for(let j=0;j<nodes.length;j++){
    travelMinutes[nodes[i]][nodes[j]]=i===j?0:Math.max(3,Math.ceil(Math.abs(i-j)/3)+4);
  }
}
export const sampleDay:PlannerInput={
  jobs,locations,travelMinutes,startNodeId:'base',endNodeId:'base',
  startMinute:8*60,endMinute:15*60,maxJobs:8,minimumBufferMinutes:5
};
