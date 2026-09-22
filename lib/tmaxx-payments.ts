import type {Manual} from './manual';
export type PositionPayments={freight?:unknown;local?:unknown;discharge?:unknown};
export function positionCharges(charges:Manual['charges'],payments:PositionPayments,moveType=''){
 return charges.map(row=>{
  if(payments.freight==='PP'){
   const prepaid=['5','4','3'].includes(row.chargeType)||(['3','4'].includes(moveType)&&['1','2'].includes(row.chargeType));
   return {...row,freightTerm:prepaid?'Prepaid' as const:'Collect' as const,payer:prepaid?'5':'4'};
  }
  if(payments.freight==='CC'){
   const prepaid=['5','4'].includes(row.chargeType);
   return {...row,freightTerm:prepaid?'Prepaid' as const:'Collect' as const,payer:prepaid?'5':'4'};
  }
  return row;
 });
}
