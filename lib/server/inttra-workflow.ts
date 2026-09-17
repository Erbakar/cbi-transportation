import {mapInttraManual} from '../inttra-mapping';
import type {Manual} from '../manual';
import {AppError,runtime} from './runtime';
import {contracts,platformSession} from './platforms';
export function inttraWireBody(payload:unknown){return encodeURIComponent(JSON.stringify(payload));}
export function reviewResult(value:unknown){const r=value as {status?:string;errorcode?:string;exceptions?:{code?:string;type?:string;message?:string;description?:string}[];content?:{ShipmentInstruction?:Record<string,unknown>}};
 if(r?.status!=='OK'||r.errorcode!=='0000'||!r.content?.ShipmentInstruction||(r.exceptions||[]).some(e=>e.type!=='001'))throw new AppError('INTTRA kontrolü: '+((r?.exceptions||[]).map(e=>String(e.message||e.description||e.code||'').replace(/<[^>]*>/g,'')).join(' · ').slice(0,3000)||'Talimat kabul edilmedi; gönderim durduruldu.'),422);
 const warnings=(r.exceptions||[]).map(e=>({code:String(e.code||''),message:String(e.message||e.description||'INTTRA uyarısı').replace(/<[^>]*>/g,'').slice(0,2000)}));return {shipment:r.content.ShipmentInstruction,warnings};
}
export function submittedReference(value:unknown){const root=(value as {root?:{SiId?:unknown;originalSiId?:unknown;SiSequence?:unknown}})?.root;if(!root||!Number.isSafeInteger(root.SiId)||Number(root.SiId)<=0||root.SiId!==root.originalSiId||!Number.isInteger(root.SiSequence))throw new AppError('INTTRA gönderim sonucu doğrulanamadı. Tekrar göndermeden kaydı kontrol edin.',502);return String(root.SiId);}
export async function inttraRequest(owner:string,path:string,payload:unknown){const paths=['/siact/createPageParams','/siact/userParams','/siact/geographySi','/siact/checkDuplicateSIName','/siact/review','/siact/submit','/siact/saveDocument'];if(!paths.includes(path))throw new AppError('Geçersiz INTTRA servisi.');const c=contracts().find(c=>c.id==='inttra');if(!c)throw new AppError('INTTRA bağlantısı tanımlanmalı.',503);const session=await platformSession(c,owner);if(!session.cookie)throw new AppError('INTTRA web oturumu yeniden açılmalı.',503);const env=runtime();if(!env.INTTRA_RELAY_URL||!env.INTTRA_RELAY_KEY)throw new AppError('INTTRA bağlantı sunucusu tanımlanmalı.',503);const relay=new URL(env.INTTRA_RELAY_URL);if(relay.protocol!=='https:'||relay.username||relay.password)throw new AppError('INTTRA bağlantı adresi geçersiz.',503);const r=await fetch(new URL('/request',relay),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.INTTRA_RELAY_KEY},body:JSON.stringify({path,cookie:session.cookie,body:path==='/siact/geographySi'?encodeURIComponent(String(payload)):inttraWireBody(payload)}),redirect:'manual',signal:AbortSignal.timeout(35000)});if(!r.ok)throw new AppError(`INTTRA servisi tamamlanamadı (HTTP ${r.status}).`,502);return r.json();}

export async function reviewInttraDraft(owner:string,draft:{ShipmentInstruction:Record<string,unknown>;chargesArray:unknown},manual:Manual){
 const mapped=mapInttraManual(manual);const source=draft.ShipmentInstruction;if(!source||!Array.isArray(source.Containers)||!source.Containers.length||!source.SICompanies)throw new AppError('INTTRA belge alanları tamamlanmalı.',422);
 if(source.SiId||source.originalSiId||source.ShipmentId)throw new AppError('Önceden gönderilmiş veya taslak kaydın kimliği yeni gönderimde kullanılamaz.',409);
 const payload={...draft,ShipmentInstruction:{...source,...mapped,SIReferences:{...(source.SIReferences as Record<string,unknown>||{}),...mapped.SIReferences}}};
 const reviewed=reviewResult(await inttraRequest(owner,'/siact/review',payload));return {payload:{ShipmentInstruction:reviewed.shipment},warnings:reviewed.warnings};
}

export async function prepareInttra(run:import('./platform-journal').Run,ex:import('../domain').Extraction,manual:Manual){
 const {buildInttraDraft}=await import('./inttra-builder');const {db,digest}=await import('./runtime');const {runStep}=await import('./platform-journal');
 const inputHash=await digest(JSON.stringify({ex,manual}));
 const stored=await db().prepare('SELECT * FROM platform_reviews WHERE record_id=? AND revision=?').bind(run.id,run.revision).first<{input_hash:string;payload:string;warnings:string;approved:number;created_at:string}>();
 if(stored&&stored.input_hash===inputHash&&Date.now()-Date.parse(stored.created_at)<30*60000)return {payload:JSON.parse(stored.payload),warnings:JSON.parse(stored.warnings) as {code:string;message:string}[],approved:!!stored.approved,inputHash};
 const options=await inttraRequest(run.owner,'/siact/createPageParams',null) as Record<string,unknown>;
 const user=await inttraRequest(run.owner,'/siact/userParams',null) as Record<string,unknown>;
 const {paymentLocations}=await import('./inttra-preflight');const locations=await paymentLocations(run.owner,manual);
 const draft=buildInttraDraft(ex,manual,options,user,run.id,locations);
 if(stored){const own=JSON.parse(stored.payload).ShipmentInstruction;draft.ShipmentInstruction.SiId=own.SiId||'';draft.ShipmentInstruction.ShipmentId=own.ShipmentId||'';}
 const reviewed=await runStep(run,'inttra','review:'+inputHash+':'+(stored?.created_at||'initial'),draft,async()=>{const r=reviewResult(await inttraRequest(run.owner,'/siact/review',draft));return {payload:{ShipmentInstruction:r.shipment},warnings:r.warnings};});
 await db().prepare('INSERT INTO platform_reviews(record_id,revision,input_hash,payload,warnings,approved,created_at) VALUES(?,?,?,?,?,0,?) ON CONFLICT(record_id) DO UPDATE SET revision=excluded.revision,input_hash=excluded.input_hash,payload=excluded.payload,warnings=excluded.warnings,approved=0,created_at=excluded.created_at').bind(run.id,run.revision,inputHash,JSON.stringify(reviewed.payload),JSON.stringify(reviewed.warnings),new Date().toISOString()).run();
 return {...reviewed,approved:false,inputHash};
}
export async function executeInttra(run:import('./platform-journal').Run,prepared:Awaited<ReturnType<typeof prepareInttra>>){
 if(prepared.warnings.length&&!prepared.approved)throw new AppError('INTTRA uyarılarını inceleyip onaylayın.',422);
 const {runStep}=await import('./platform-journal');return runStep(run,'inttra','submit',prepared.payload,async()=>submittedReference(await inttraRequest(run.owner,'/siact/submit',prepared.payload)));
}
