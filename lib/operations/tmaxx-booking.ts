import {operationDates,nativeDateValid} from './tmaxx-operations';
import {z} from 'zod';
export type ErpScope='position'|'good';
export type CardKind='company'|'port'|'vessel'|'user'|'branch';
export type ErpField={key:string;label:string;card?:CardKind;enum?:string;required?:boolean;section?:'operations';date?:boolean};
const dates:ErpField[]=operationDates.map(f=>({...f,section:'operations',date:true}));
const common:ErpField[]=[{key:'branch',label:'Şube',card:'branch',required:true},{key:'transportDirection',label:'Taşıma yönü',enum:'transportDirection',required:true},{key:'partialFull',label:'Yükleme şekli',enum:'partialFullSea',required:true},{key:'freightPayment',label:'Navlun ödeme',enum:'freightPayment',required:true},{key:'localPayment',label:'Çıkış masrafları ödeme',enum:'freightPayment',required:true},{key:'dischargePayment',label:'Varış masrafları ödeme',enum:'freightPayment',required:true},{key:'fromPort',label:'Yükleme limanı',card:'port',required:true},{key:'toPort',label:'Boşaltma limanı',card:'port',required:true},{key:'shipOwner',label:'Armatör',card:'company',required:true},{key:'lineAgent',label:'Hat acentesi',card:'company'},{key:'vessel',label:'Gemi',card:'vessel'},{key:'voyageNo',label:'Sefer'},{key:'rezervationNo',label:'Booking numarası'},{key:'operationRepresentative',label:'Operasyon sorumlusu',card:'user',required:true},{key:'description',label:'Açıklama'}];
export const erpFields:Record<ErpScope,ErpField[]>={position:[...common,...dates,{key:'shipper',label:'Gönderen',card:'company'},{key:'receiver',label:'Alıcı',card:'company'},{key:'notify',label:'Notify',card:'company'}],good:[...common,...dates,{key:'customer',label:'Müşteri',card:'company',required:true},{key:'invoiceCustomer',label:'Fatura müşterisi',card:'company',required:true},{key:'sender',label:'Gönderen',card:'company',required:true},{key:'consignee',label:'Alıcı',card:'company'},{key:'notify',label:'Notify',card:'company'},{key:'salesRepresentative',label:'Satış sorumlusu',card:'user'},{key:'incoterm',label:'Incoterm',enum:'incoterms',required:true},{key:'customerRef',label:'Müşteri / satış referansı'}]};
export type ErpValue=string|number|null;
export type ErpValues=Record<ErpScope,Record<string,ErpValue>>;
export type ErpCard={id:number;name:string};
export type ErpEditorState={mode:'create'|'update';bookingRevision:number;positionVersion:number;goodVersion:number;positionReference:string;goodReference:string;values:ErpValues;cards:Record<string,ErpCard>;enums:Record<string,{code:string;name:string}[]>;run?:{id:string;status:string}|null};
const fields=z.record(z.union([z.string().max(2000),z.number().int().positive().max(Number.MAX_SAFE_INTEGER),z.null()]));
export const erpPrepareSchema=z.object({bookingRevision:z.number().int().positive(),positionVersion:z.number().int().nonnegative(),goodVersion:z.number().int().nonnegative(),values:z.object({position:fields,good:fields}).strict()}).strict();
export function valuesFromEntity(scope:ErpScope,entity:Record<string,unknown>){return Object.fromEntries(erpFields[scope].map(f=>[f.key,f.card?((entity[f.key] as {id?:number}|null)?.id??null):entity[f.key]??null])) as Record<string,ErpValue>;}
export function changedErpFields(scope:ErpScope,before:Record<string,unknown>,values:Record<string,ErpValue>){
 const allowed=new Set(erpFields[scope].map(f=>f.key));if(Object.keys(values).some(k=>!allowed.has(k)))throw new Error('Desteklenmeyen T-MAXX alanı.');
 const current=valuesFromEntity(scope,before);
 return erpFields[scope].filter(f=>Object.hasOwn(values,f.key)&&(values[f.key]??'')!==(current[f.key]??''));
}
export function verifyErpFields(scope:ErpScope,entity:Record<string,unknown>,expected:Record<string,unknown>,keys:string[]){
 for(const key of keys){const f=erpFields[scope].find(f=>f.key===key);if(!f)throw new Error('Bilinmeyen doğrulama alanı.');const value=(v:unknown)=>f.card?(v as {id?:number}|null)?.id??null:f.date&&typeof v==='string'&&nativeDateValid(v)?Date.parse(v+'Z'):v??null;if(value(entity[key])!==value(expected[key]))throw new Error(`${f.label} T-MAXX’ten geri okunarak doğrulanamadı.`);}
}
