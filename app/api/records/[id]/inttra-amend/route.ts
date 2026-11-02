import {requireControlApproval} from '@/lib/server/control-gate';
import {requireUser} from '@/lib/server/auth';
import {owned,view} from '@/lib/server/records';
import {AppError,db,digest,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {inttraRequest,reviewResult} from '@/lib/server/inttra-workflow';
import {decodeOptions} from '@/lib/inttra-reference';
import {amendmentFields,applyAmendment,assertAmendmentIdentity,prepareAmendmentForm,type Shipment} from '@/lib/inttra-amendment';
import {runStep} from '@/lib/server/platform-journal';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 let id='',owner='',lease=0,locked=false;
 try{
  sameOrigin(req);owner=await requireUser(req);id=(await params).id;const record=await owned(id,owner);
  const raw=await req.text();if(raw.length>200000)throw new AppError('Revizyon çok uzun.',413);const input=raw?JSON.parse(raw):{};
  if(!['inspect','preview','apply'].includes(input.action))throw new AppError('Geçersiz işlem.');
  lease=Date.now()+15*60000;const claim=await db().prepare('UPDATE records SET lock_until=? WHERE id=? AND owner=? AND lock_until<=?').bind(lease,id,owner,Date.now()).run();if(!claim.meta.changes)throw new AppError('Kayıt işleniyor.',409);locked=true;
  const d=await db().prepare("SELECT id,reference FROM deliveries WHERE record_id=? AND platform='inttra' AND status='created'").bind(id).first<{id:string;reference:string}>();
  if(!d||!/^\d{1,15}$/.test(d.reference))throw new AppError('Gönderilmiş INTTRA kaydı bulunamadı.',409);
  const current=await inttraRequest(owner,`/siact/view?siId=${d.reference}&searchOrViewFlag=view`,null) as {ShipmentInstruction:Shipment};
  const s=current.ShipmentInstruction;if(String(s?.SiId)!==d.reference||!s.ShipmentId)throw new AppError('Mevcut INTTRA talimatı doğrulanamadı.',409);
  const original=String(s.originalSiId||s.SiId);if(!/^\d{1,15}$/.test(original))throw new AppError('Orijinal SI kimliği doğrulanamadı.',409);
  const fingerprint=await digest(JSON.stringify(s));
  const run={id,owner,revision:record.revision};
  if(input.action==='apply'){
   if(typeof input.reviewKey!=='string'||!/^amend-review:[a-f0-9]{64}$/.test(input.reviewKey))throw new AppError('Önce revizyonu kontrol edin.',422);
   const row=await db().prepare("SELECT result,updated_at FROM platform_steps WHERE record_id=? AND revision=? AND platform='inttra' AND step=? AND status='complete'").bind(id,record.revision,input.reviewKey).first<{result:string;updated_at:string}>();
   if(!row||Date.now()-Date.parse(row.updated_at)>30*60000)throw new AppError('Revizyon önizlemesini yenileyin.',409);
   const prepared=JSON.parse(row.result);if(prepared.fingerprint!==fingerprint)throw new AppError('INTTRA kaydı değişti; son halini yeniden okuyun.',409);
   assertAmendmentIdentity(prepared.payload.ShipmentInstruction,original,s.ShipmentId);
   const uncertain=await db().prepare("SELECT step FROM platform_steps WHERE record_id=? AND platform='inttra' AND step LIKE 'amend-submit:%' AND status IN ('unknown','sending')").bind(id).first();if(uncertain)throw new AppError('Önceki revizyonun sonucu belirsiz; tekrar gönderilmedi. INTTRA kaydı doğrulanmalı.',409);
   await requireControlApproval(run,'inttra-amend',prepared.payload);
   const reference=await runStep({...run,control:{kind:'inttra-amend',payload:prepared.payload}},'inttra','amend-submit:'+input.reviewKey.slice(13),prepared.payload,async()=>{
    const response=await inttraRequest(owner,'/siact/submit',prepared.payload) as {root?:Shipment};const root=response?.root;
    if(!root||String(root.originalSiId)!==original||!/^\d{1,15}$/.test(String(root.SiId))||Number(root.SiSequence)<=Number(s.SiSequence))throw new AppError('INTTRA revizyon sonucu doğrulanamadı. Yeniden gönderilmedi.',409);
    return String(root.SiId);
   });
   await db().prepare("UPDATE deliveries SET reference=?,payload=?,message='Mevcut INTTRA talimatı revize edildi.',updated_at=? WHERE id=? AND status='created'").bind(reference,JSON.stringify(prepared),new Date().toISOString(),d.id).run();
   return json({record:await view(await owned(id,owner))});
  }
  const options=await inttraRequest(owner,'/siact/createPageParams',null) as Record<string,unknown>;
  const fields=amendmentFields(s,{containerTypes:decodeOptions(options.containerTypeList),packageTypes:decodeOptions(options.packageTypesList)});
  if(input.action==='inspect')return json({fields,fingerprint,reference:d.reference,original});
  if(input.fingerprint!==fingerprint)throw new AppError('INTTRA kaydı değişti; yeniden okuyun.',409);
  if(!input.edits||typeof input.edits!=='object'||Array.isArray(input.edits))throw new AppError('Revizyon alanları geçersiz.',422);
  const draft=await inttraRequest(owner,`/siact/amend?siId=${d.reference}&originalSiId=${original}`,null) as {ShipmentInstruction:Shipment};
  assertAmendmentIdentity(draft.ShipmentInstruction,original,s.ShipmentId);
  const user=await inttraRequest(owner,'/siact/userParams',null) as Shipment;
  const amended=applyAmendment(prepareAmendmentForm(draft.ShipmentInstruction,user),fields,input.edits);
  const draftPayload={ShipmentInstruction:amended,chargesArray:Object.entries(amended.PaymentInstructions||{}).filter(([key])=>key.startsWith("IndividualCharges_")).sort(([a],[b])=>a.localeCompare(b)).map(([,value])=>value)};
  const hash=await digest(JSON.stringify({fingerprint,draftPayload})),reviewKey='amend-review:'+hash;
  const reviewed=await runStep(run,'inttra',reviewKey,draftPayload,async()=>{
   const checked=reviewResult(await inttraRequest(owner,'/siact/review',draftPayload));assertAmendmentIdentity(checked.shipment,original,s.ShipmentId);
   return {payload:{ShipmentInstruction:checked.shipment},fingerprint,warnings:checked.warnings};
  });
  return json({fields:amendmentFields(reviewed.payload.ShipmentInstruction,{containerTypes:decodeOptions(options.containerTypeList),packageTypes:decodeOptions(options.packageTypesList)}),fingerprint,reviewKey,warnings:reviewed.warnings,reference:d.reference,original});
 }catch(e){return errorResponse(e instanceof AppError?e:new AppError(e instanceof Error?e.message:'Revizyon tamamlanamadı.',422));}
 finally{if(locked)await db().prepare('UPDATE records SET lock_until=0 WHERE id=? AND owner=? AND lock_until=?').bind(id,owner,lease).run();}
}
