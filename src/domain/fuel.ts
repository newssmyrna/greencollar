export type FuelAssumptions={
 vehicleMpg:number;
 towingMpg:number;
 trailerAttached:boolean;
 fuelPriceCentsPerGallon?:number;
};
export type FuelEstimate={
 distanceMiles:number;
 mpgUsed:number;
 gallons:number;
 estimatedCostCents?:number;
};
/** Estimate route fuel using operator-editable MPG and price assumptions. */
export function estimateRouteFuel(distanceMiles:number,assumptions:FuelAssumptions):FuelEstimate{
 if(!Number.isFinite(distanceMiles)||distanceMiles<0)throw new Error('Invalid route distance');
 const mpg=assumptions.trailerAttached?assumptions.towingMpg:assumptions.vehicleMpg;
 if(!Number.isFinite(mpg)||mpg<=0)throw new Error('MPG assumptions must be positive finite numbers');
 const price=assumptions.fuelPriceCentsPerGallon;
 if(price!==undefined&&(!Number.isFinite(price)||price<0))throw new Error('Fuel price must be a non-negative finite number');
 const gallons=distanceMiles/mpg;
 return {
  distanceMiles,mpgUsed:mpg,gallons,
  ...(price===undefined?{}:{estimatedCostCents:Math.round(gallons*price)})
 };
}
