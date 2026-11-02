import {validDate,zonedInstant} from './schedule';
export const operationDates=[{key:'etd',label:'Tahmini kalkış · ETD'},{key:'atd',label:'Gerçekleşen kalkış · ATD'},{key:'eta',label:'Tahmini varış · ETA'},{key:'ata',label:'Gerçekleşen varış · ATA'},{key:'bdCutoffDate',label:'Belge son teslim'},{key:'vgmCutoffDate',label:'VGM son teslim'},{key:'tdCutoffDate',label:'Terminal son teslim'},{key:'containerEntryDate',label:'Konteyner giriş tarihi'}] as const;
export const goodOperationDates=[{key:'loadEstDate',label:'Planlanan yükleme'},{key:'loadDate',label:'Yükleme tarihi'},{key:'unloadEstDate',label:'Planlanan boşaltma'},{key:'unloadDate',label:'Boşaltma tarihi'}] as const;
export const fieldTextFields=[{key:'loadAddress',label:'Yükleme adresi'},{key:'unloadAddress',label:'Boşaltma adresi'},{key:'phoneNoToMeet',label:'İrtibat telefonu'},{key:'containerReceivingPlace',label:'Konteyner teslim alma yeri'},{key:'loadSupplierPlateNo',label:'Yükleme nakliyeci plakası'},{key:'unLoadSupplierPlateNo',label:'Boşaltma nakliyeci plakası'}] as const;
export function nativeDateValid(value:string){const m=value.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?$/);return !!m&&validDate(m[1]);}
export function operationDateAlert(key:string,value:string|null,now=Date.now()){
 if(!value)return {severity:'info',text:'Tarih girilmemiş'};
 if(!nativeDateValid(value))return {severity:'warning',text:'T-MAXX tarih biçimi kontrol edilmeli'};
 if(['atd','ata','loadDate','unloadDate','containerEntryDate'].includes(key))return {severity:'info',text:'Gerçekleşen tarih'};
 const delta=zonedInstant(value.slice(0,10),value.slice(11,16),'Europe/Istanbul')-now;
 if(delta<0)return {severity:'danger',text:'Tarih geçti'};
 if(delta<=4*3600000)return {severity:'danger',text:'Kritik · son 4 saat'};
 if(delta<=24*3600000)return {severity:'warning',text:'Son 24 saat'};
 return {severity:'info',text:'Planlandı'};
}
