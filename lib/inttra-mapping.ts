import type {Manual} from './manual';
import {chargeTypes,moveTypes,payerTypes} from './inttra-options';
export function mapInttraManual(m:Manual){
 const move=moveTypes.find(x=>x.value===m.moveType);if(!move)throw Error('Move Type seçilmeli.');
 if(!m.bookingNumber||!m.blReference||!m.vessel||!m.voyage)throw Error('INTTRA booking, B/L, gemi ve sefer alanları gerekli.');
 if(m.chargeMode!=='individual')throw Error('All Charges servis biçimi henüz doğrulanmadı; Individual Charges kullanın.');
 if(!m.charges.length)throw Error('Masraf satırı gerekli.');
 const payment=Object.fromEntries(m.charges.map((r,i)=>{const charge=chargeTypes.find(x=>x.value===r.chargeType),payer=payerTypes.find(x=>x.value===r.payer);if(!charge||!payer||!['Prepaid','Collect'].includes(r.freightTerm))throw Error('Masraf satırındaki seçimler doğrulanmalı.');if(r.paymentLocation)throw Error('Payment Location için platform konum kodu doğrulanmalı.');return ['IndividualCharges_'+i,{ChargeTypeDesc:charge.label,FreightTermCode:r.freightTerm==='Prepaid'?'2':'1',PartyTypeCode:payer.value,ChargeTypeCode:charge.value,LocationCountry:'',GeographyAreaId:'',PartyName:payer.label,PaymentLocation:'',FreightTermDesc:r.freightTerm,PaymentInstructionId:''}]}));
 const reference=(value:string,code:string,description:string)=>({ReferenceTypeDescription:description,ReferenceId:'',ExpirationDate:'',ReferenceValue:value,ReferenceTypeCode:code,IssuanceDate:''});
 return {Vessel:m.vessel,Voyage:m.voyage,MoveTypeCode:move.value,MoveTypeDesc:move.label,PaymentInstructions:payment,SIReferences:{CarrierBookingNumber:{CarrierBookingNumber_1:reference(m.bookingNumber,'4','Carrier Booking Reference')},BLReferenceNumber:{BLReferenceNumber_1:reference(m.blReference,'8','Bill Of Lading Reference')}}};
}
