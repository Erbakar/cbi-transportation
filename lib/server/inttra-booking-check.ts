import {z} from 'zod';
import {runtime} from './runtime';
import {contracts,platformSession} from './platforms';

type Warning={code:string;message:string};
type Data=Record<string,unknown>;
const verified=z.object({status:z.literal('verified'),source:z.literal('inttra-booking'),bookingNumber:z.string(),carrierId:z.string(),companyId:z.string(),blReference:z.string(),containerNumbers:z.array(z.string()),inttraReference:z.string().regex(/^\d{1,15}$/),confirmedAt:z.string().datetime(),checkedAt:z.string().datetime()});
const object=(v:unknown):Data=>v&&typeof v==='object'&&!Array.isArray(v)?v as Data:{};
function singleReference(shipment:Data,name:string){const refs=Object.values(object(object(shipment.SIReferences)[name]));return refs.length===1?String(object(refs[0]).ReferenceValue||''):'';}

export async function resolveInttraBookingWarning(owner:string,shipment:Data,warnings:Warning[]){
 if(!warnings.some(w=>w.code==='10136'))return {warnings};
 const unresolved=(reason:string)=>({warnings,bookingCheck:{status:'unverified' as const,reason}});
 try{
  const c=contracts().find(c=>c.id==='inttra'),env=runtime();
  if(!c||!env.INTTRA_RELAY_URL||!env.INTTRA_RELAY_KEY)return unresolved('unavailable');
  const relay=new URL(env.INTTRA_RELAY_URL);
  if(relay.protocol!=='https:'||relay.username||relay.password)return unresolved('unavailable');
  const expected={bookingNumber:singleReference(shipment,'CarrierBookingNumber'),blReference:singleReference(shipment,'BLReferenceNumber'),carrierId:String(object(object(shipment.SICompanies).Carrier).ESCompanyId||''),companyId:String(shipment.CreatorCompanyId||''),containerNumbers:Array.isArray(shipment.Containers)?shipment.Containers.map(c=>String(object(c).ContainerNumber||'')):[]};
  if(!expected.bookingNumber||!expected.blReference||!expected.carrierId||!expected.companyId||!expected.containerNumbers.length)return unresolved('incomplete-input');
  const session=await platformSession(c,owner);
  const response=await fetch(new URL('/booking-check',relay),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.INTTRA_RELAY_KEY},body:JSON.stringify({...expected,token:session.token}),redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(!response.ok)return unresolved('unavailable');
  const proof=verified.safeParse(await response.json());
  if(!proof.success)return unresolved('not-verified');
  const check=proof.data;
  if(['bookingNumber','blReference','carrierId','companyId'].some(k=>check[k as keyof typeof expected]!==expected[k as keyof typeof expected])||JSON.stringify(check.containerNumbers)!==JSON.stringify(expected.containerNumbers)||Math.abs(Date.now()-Date.parse(check.checkedAt))>60000)return unresolved('proof-mismatch');
  // Preserve the original warning and authoritative evidence in the transfer journal.
  // Other warnings still require the existing explicit approval.
  return {warnings:warnings.filter(w=>w.code!=='10136'),sourceWarnings:warnings,bookingCheck:check};
 }catch{return unresolved('unavailable');}
}
