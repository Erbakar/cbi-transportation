import {mapInttraManual} from '../inttra-mapping';
import type {Manual} from '../manual';
import {AppError,runtime} from './runtime';
import {contracts,platformSession} from './platforms';
export function inttraWireBody(payload:unknown){return encodeURIComponent(JSON.stringify(payload));}
export function reviewResult(value:unknown){const r=value as {status?:string;errorcode?:string;exceptions?:{code?:string;type?:string;message?:string;description?:string}[];content?:{ShipmentInstruction?:Record<string,unknown>}};
 if(r?.status!=='OK'||r.errorcode!=='0000'||!r.content?.ShipmentInstruction)throw new AppError('INTTRA incelemesi başarılı değil; gönderim durduruldu.',422);
 const warnings=(r.exceptions||[]).map(e=>({code:String(e.code||''),message:String(e.message||e.description||'INTTRA uyarısı').replace(/<[^>]*>/g,'').slice(0,2000)}));return {shipment:r.content.ShipmentInstruction,warnings};
}
export function submittedReference(value:unknown){const root=(value as {root?:{SiId?:unknown;originalSiId?:unknown;SiSequence?:unknown}})?.root;if(!root||!Number.isSafeInteger(root.SiId)||Number(root.SiId)<=0||root.SiId!==root.originalSiId||!Number.isInteger(root.SiSequence))throw new AppError('INTTRA gönderim sonucu doğrulanamadı. Tekrar göndermeden kaydı kontrol edin.',502);return String(root.SiId);}
export async function inttraRequest(owner:string,path:string,payload:unknown){const paths=['/siact/createPageParams','/siact/userParams','/siact/geographySi','/siact/checkDuplicateSIName','/siact/review','/siact/submit','/siact/saveDocument'];if(!paths.includes(path))throw new AppError('Geçersiz INTTRA servisi.');const c=contracts().find(c=>c.id==='inttra');if(!c)throw new AppError('INTTRA bağlantısı tanımlanmalı.',503);const session=await platformSession(c,owner);if(!session.cookie)throw new AppError('INTTRA web oturumu yeniden açılmalı.',503);const env=runtime();if(!env.INTTRA_RELAY_URL||!env.INTTRA_RELAY_KEY)throw new AppError('INTTRA bağlantı sunucusu tanımlanmalı.',503);const relay=new URL(env.INTTRA_RELAY_URL);if(relay.protocol!=='https:'||relay.username||relay.password)throw new AppError('INTTRA bağlantı adresi geçersiz.',503);const r=await fetch(new URL('/request',relay),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.INTTRA_RELAY_KEY},body:JSON.stringify({path,cookie:session.cookie,body:inttraWireBody(payload)}),redirect:'manual',signal:AbortSignal.timeout(35000)});if(!r.ok)throw new AppError(`INTTRA servisi tamamlanamadı (HTTP ${r.status}).`,502);return r.json();}

export async function reviewInttraDraft(owner:string,draft:{ShipmentInstruction:Record<string,unknown>;chargesArray:unknown},manual:Manual){
 const mapped=mapInttraManual(manual);const source=draft.ShipmentInstruction;if(!source||!Array.isArray(source.Containers)||!source.Containers.length||!source.SICompanies)throw new AppError('INTTRA belge alanları tamamlanmalı.',422);
 if(source.SiId||source.originalSiId||source.ShipmentId)throw new AppError('Önceden gönderilmiş veya taslak kaydın kimliği yeni gönderimde kullanılamaz.',409);
 const payload={...draft,ShipmentInstruction:{...source,...mapped,SIReferences:{...(source.SIReferences as Record<string,unknown>||{}),...mapped.SIReferences}}};
 const reviewed=reviewResult(await inttraRequest(owner,'/siact/review',payload));return {payload:{ShipmentInstruction:reviewed.shipment},warnings:reviewed.warnings};
}
