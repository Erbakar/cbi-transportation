import type {Extraction} from '../domain';
import type {Manual} from '../manual';
import {locationParts} from '../inttra-reference';
import {buildInttraDraft} from './inttra-builder';
import {inttraRequest} from './inttra-workflow';
import {AppError} from './runtime';

export async function paymentLocations(owner:string,manual:Manual){
 const locations:Record<string,ReturnType<typeof locationParts>>={};
 for(const value of [...new Set(manual.charges.map(c=>c.paymentLocation).filter(Boolean))]){
  const encoded=/^\d+:[^:]+:.+$/.test(value);const selected=encoded?locationParts(value):null;
  const label=selected?.label||value;
  const result=await inttraRequest(owner,'/siact/geographySi',label.split(',')[0].trim()) as {cities?:string[][]};
  const matches=(result.cities||[]).filter(([name,code])=>encoded?code===value:name.toUpperCase()===value.toUpperCase());
  if(matches.length!==1)throw new AppError('Ödeme yeri: “'+label+'” için Konum bul ile listeden bir konum seçin.',422);
  locations[value]=locationParts(matches[0][1]);
 }
 return locations;
}
// Read-only platform lookups and local mapping. Never reviews or submits an SI.
export async function validateInttraInput(owner:string,ex:Extraction,manual:Manual){
 const options=await inttraRequest(owner,'/siact/createPageParams',null) as Record<string,unknown>;
 const user=await inttraRequest(owner,'/siact/userParams',null) as Record<string,unknown>;
 const locations=await paymentLocations(owner,manual);
 try{return buildInttraDraft(ex,manual,options,user,'validation-only',locations);}catch(error){if(error instanceof AppError)throw error;throw new AppError(error instanceof Error?error.message:'INTTRA alan eşlemesi doğrulanamadı.',422);}
}
