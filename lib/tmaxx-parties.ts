import type {Extraction,Field} from './domain';

type Link={id?:number;name?:string};
export type SourcePosition={abroadAgent?:Link|null;abroadAgentAddress?:Link|null};
export type AgentAddress={id?:number;company?:Link;address?:{addressDetail?:string}};
// Only the exact position's selected address is authoritative, never an old MBL.
export function applyTmaxxParties(ex:Extraction,position:SourcePosition,address:AgentAddress|undefined,reference:string){
 const agent=position.abroadAgent;
 const field=(value:string):Field=>({value,source:'T-MAXX '+reference+' · Yurtdışı acente',confidence:1});
 if(agent){
  if(!agent.id||!agent.name?.trim()||!position.abroadAgentAddress?.id||address?.id!==position.abroadAgentAddress.id||address.company?.id!==agent.id||!address.address?.addressDetail?.trim())throw Error('T-MAXX acentesinin seçili adres kartı eksik veya acenteyle eşleşmiyor.');
  for(const role of ['Consignee','Notify']){
   ex.fields['mbl'+role+'Name']=field(agent.name.trim());
   ex.fields['mbl'+role+'Address']=field(address.address.addressDetail.trim());
  }
  ex.hblRequired=true;
 }else{
  // Missing property is not evidence that the position has no agent.
  if(!Object.hasOwn(position,'abroadAgent')||position.abroadAgent!==null)throw Error('T-MAXX acente durumu doğrulanamadı.');
  for(const [target,source]of [['Shipper','shipper'],['Consignee','consignee'],['Notify','consignee']])for(const suffix of ['Name','Address']){
   const original=ex.fields[source+suffix];
   ex.fields['mbl'+target+suffix]=original?structuredClone(original):{value:null,source:'',confidence:0};
  }
  ex.hblRequired=false;
 }
 return ex;
}
