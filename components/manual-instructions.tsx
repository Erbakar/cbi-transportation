'use client';

import {useEffect,useState} from 'react';
import {moveTypes,chargeTypes,payerTypes} from '@/lib/inttra-options';
import {emptyInttra,InttraSettings,Location} from './inttra-settings';
import {emptyManual,Manual} from '@/lib/manual';
import {Fields,Extraction,names,minimumFields} from '@/lib/domain';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ActualParties} from './actual-parties';
import {CargoEditor} from './cargo-editor';
import {positionCharges,type PositionPayments} from '@/lib/tmaxx-payments';

type Props={pausedPlatforms?:string[];actualParties?:Extraction['actualParties'];recordId:string;onDirtyChange:(dirty:boolean)=>void;value:Manual|null;fields?:Fields;containers?:Fields[];cargoLines?:Fields[];disabled:boolean;onSave:(m:Manual)=>Promise<void>};
type SourceResult={error?:string;fields:Fields;containers:Fields[];locations?:Record<string,string>;hblRequired?:boolean;agentName?:string;houseBillNumber?:string;blReference?:string;payments?:PositionPayments;deliveryCity?:string};

export function ManualInstructions({pausedPlatforms=[],actualParties,recordId,onDirtyChange,value,fields,containers,cargoLines,disabled,onSave}:Props){
 const initial=():Manual=>({...structuredClone(emptyManual),...(!value?{chargeMode:'individual' as const,charges:chargeTypes.map(option=>({chargeType:option.value,freightTerm:option.value==='5'||option.value==='4'?'Prepaid' as const:'Collect' as const,payer:option.value==='5'||option.value==='4'?'5':'4',paymentLocation:''}))}:{}),...value,inttra:{...emptyInttra,...(!value?{paymentMethod:'D' as const}:{}),...value?.inttra}});
 const [m,set]=useState<Manual>(initial);
 const [showAll,setShowAll]=useState(false);
 const [importing,setImporting]=useState(false);
 const [sourceMessage,setSourceMessage]=useState('');
 const [sourcePayments,setSourcePayments]=useState<PositionPayments>();
 useEffect(()=>onDirtyChange(JSON.stringify(m)!==JSON.stringify(initial())),[m,value,onDirtyChange]);
 const update=(key:string,next:string)=>set(current=>({...current,[key]:next,...(key==='moveType'&&sourcePayments&&current.chargeMode==='individual'?{charges:positionCharges(current.charges,sourcePayments,next)}:{})}));
 const known=(key:string)=>Boolean((value?.[key as keyof Manual] as string)||fields?.[key]?.value&&fields[key].confidence>=.95);
 const containerEdit=(number:string)=>m.containerOverrides.find(item=>item.containerNumber===number);
 const setContainer=(number:string,key:'containerType'|'sealNumber'|'omitSeal',next:string|boolean)=>{const current=containerEdit(number);set({...m,containerOverrides:[...m.containerOverrides.filter(item=>item.containerNumber!==number),{containerNumber:number,containerType:current?.containerType||'',sealNumber:current?.sealNumber||'',omitSeal:current?.omitSeal||false,[key]:next}]});};
 async function importSource(){
  setImporting(true);setSourceMessage('');
  try{
   const response=await fetch('/api/records/'+recordId+'/source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
   const data=await response.json() as SourceResult;if(!response.ok)throw Error(data.error||'Yük bulunamadı.');
   const next=structuredClone(m);next.inttra={...emptyInttra,...next.inttra};
   if(data.payments){setSourcePayments(data.payments);if(next.chargeMode==='individual')next.charges=positionCharges(next.charges,data.payments,next.moveType);}
   if(typeof data.hblRequired==='boolean')next.inttra.houseBill=data.hblRequired?'2':'0';
   for(const key of ['houseBillNumber','blReference'] as const)if(!next[key]&&data[key])next[key]=data[key]!;
   if(!next.bookingNumber&&data.fields.bookingNumber?.value)next.bookingNumber=data.fields.bookingNumber.value;
   for(const key of ['mblShipperName','mblShipperAddress','mblConsigneeName','mblConsigneeAddress','mblNotifyName','mblNotifyAddress'] as const)if(data.fields[key]?.value)next.fieldOverrides[key]=data.fields[key].value!;
   for(const key of ['loadPort','dischargePort','origin','destination'] as const)if(!next.inttra[key]&&data.locations?.[key])next.inttra[key]=data.locations[key];
   for(const key of ['vessel','voyage'] as const)if(!next[key]&&data.fields[key]?.value)next[key]=data.fields[key].value!;
   for(const key of ['loadPort','dischargePort'] as const)if(data.fields[key]?.value)next.fieldOverrides[key]=data.fields[key].value!;
   for(const sourceContainer of data.containers){const number=sourceContainer.containerNumber?.value;if(!number)continue;let edit=next.containerOverrides.find(item=>item.containerNumber===number);if(!edit){edit={containerNumber:number,containerType:'',sealNumber:''};next.containerOverrides.push(edit);}for(const key of ['containerType','sealNumber'] as const)if(!edit[key]&&sourceContainer[key]?.value)edit[key]=sourceContainer[key].value!;}
   set(next);setSourceMessage(data.hblRequired===false?'Acente yok: yalnızca MBL hazırlanacak. MBL tarafları gerçek gönderen ve alıcıdan alındı. Kontrol edip kaydedin.':data.agentName?`Acente: ${data.agentName}. HBL ve MBL hazırlanacak; MBL alıcı ve notify acentenin adres kartından alındı. Kontrol edip kaydedin.`:'Yük bilgileri getirildi. Kontrol edip kaydedin.');
  }catch(error){setSourceMessage((error as Error).message)}finally{setImporting(false)}
 }
 const missingTop=[['houseBillNumber','House Bill Number'],['bookingNumber','Carrier Booking Number'],['blReference','B/L Reference Number'],['vessel','Vessel'],['voyage','Voyage'],['moveType','Move Type']].filter(([key])=>(key!=='houseBillNumber'||m.inttra?.houseBill!=='0')&&(showAll||!known(key)));
 return <section className="manual-instructions">
  <h3>Kaynaklar ve eksik bilgiler</h3><p>Ana talimattan yük bilgileri alınır. T-MAXX referansında acente varsa MBL alıcı ve notify bilgileri acentenin seçili adresinden tamamlanır. Eski MBL yalnızca taraf ve adres referansıdır.</p>
  {!pausedPlatforms.includes('tmaxx')&&<><div className="reference-import"><label>T-MAXX yük / pozisyon referansı<Input disabled={disabled||importing} value={m.tmaxxReference} placeholder="Örn. S.E.26.09.00636" onChange={event=>update('tmaxxReference',event.target.value)}/></label><Button variant="outline" disabled={disabled||importing||!m.tmaxxReference.trim()} onClick={importSource}>{importing?'Yük aranıyor…':'Yük bilgilerini getir'}</Button></div>
  <p>Gemi, sefer, liman ve acente bilgileri bu referanstan kontrol edilir. Acente yoksa yalnızca MBL hazırlanır.</p></>}{pausedPlatforms.includes('tmaxx')&&<p className="source-message">T-MAXX duraklatıldı · Yeni hesap bekleniyor. Gemi, sefer ve liman bilgilerini belgeden kontrol ederek tamamlayabilirsiniz.</p>}{sourceMessage&&<p role="status" className="source-message">{sourceMessage}</p>}
  <details><summary>Bulunan bilgileri göster</summary>{['bookingNumber','vessel','voyage','loadPort','dischargePort'].map(key=><p key={key}><b>{names[key]}:</b> {String(m[key as keyof Manual]||m.fieldOverrides[key as keyof typeof m.fieldOverrides]||fields?.[key]?.value||'Henüz bulunamadı')}</p>)}</details>
  <label className="form-toggle"><input type="checkbox" checked={showAll} onChange={event=>setShowAll(event.target.checked)}/><span>Dolu ve isteğe bağlı alanları da düzenle</span></label>
  {missingTop.length>0&&<h4>{showAll?'Yük ve sefer bilgileri':'Eksik zorunlu bilgiler'}</h4>}<div className="manual-grid">{missingTop.map(([key,label])=><label key={key}>{label}{key==='moveType'?<select disabled={disabled} value={m.moveType} onChange={event=>update(key,event.target.value)}><option value="">Seçin</option>{moveTypes.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:<Input disabled={disabled} maxLength={200} value={m[key as keyof Manual] as string} onChange={event=>update(key,event.target.value)}/>}</label>)}</div>
  <details className="optional-fields"><summary>MBL / HBL tarafları ve diğer belge bilgileri</summary><div className="manual-grid">{Object.entries(fields||{}).filter(([key,field])=>(showAll||(minimumFields.includes(key)&&(!field.value||field.confidence<.95)))&&!['bookingNumber','vessel','voyage','containerNumber','containerType','sealNumber'].includes(key)).map(([key,field])=><label key={key}>{names[key]||key}<textarea disabled={disabled} maxLength={4000} placeholder={field.value||'Belgede bulunamadı'} value={m.fieldOverrides[key as keyof typeof m.fieldOverrides]||''} onChange={event=>set({...m,fieldOverrides:{...m.fieldOverrides,[key]:event.target.value}})}/><small>Belge: {field.value||'Bulunamadı'}</small></label>)}</div></details>
  <h4>Konteyner bilgileri</h4><div className="container-list">{(containers||[]).map((container,index)=>{const number=container.containerNumber?.value||'';const edit=containerEdit(number);const keys=(['containerType','sealNumber'] as const).filter(key=>showAll||(!value?.containerOverrides.find(item=>item.containerNumber===number)?.[key]&&(!container[key]?.value||container[key].confidence<.95)));return <div className="container-row" key={index}><b>{number||'Numarası eksik konteyner · belgeyi düzeltin'}</b><div className="container-fields">{keys.map(key=><label key={key}>{names[key]}<Input disabled={disabled||!number||(key==='sealNumber'&&!!edit?.omitSeal)} maxLength={200} placeholder={container[key]?.value||'Belgede bulunamadı'} value={key==='sealNumber'&&edit?.omitSeal?'':edit?.[key]||''} onChange={event=>setContainer(number,key,event.target.value)}/></label>)}<label className="form-toggle"><input type="checkbox" disabled={disabled||!number} checked={!!edit?.omitSeal} onChange={event=>setContainer(number,'omitSeal',event.target.checked)}/><span>{number} için mühür numarası boş bırakılacak</span></label></div></div>})}</div>
  <CargoEditor rows={cargoLines||[]} manual={m} disabled={disabled} showAll={showAll} onChange={set}/>
  <InttraSettings showAll={showAll} value={m.inttra} disabled={disabled} onChange={inttra=>set({...m,inttra})}/>
  <ActualParties showAll={showAll} parties={actualParties} fields={fields} manual={m} disabled={disabled} onChange={set}/>
  <h4>Freight Charges · Masraflar</h4><p>MBL masrafları “Yük bilgilerini getir” ile pozisyondaki navlun, lokal ve boşaltma ödemesinden hazırlanır. PP ve kapı teslim seçiminde ilk beş satır Prepaid–Forwarder, ek masraflar Collect–Consignee olur. Move Type değişirse kaynak bilgilerini yeniden getirin. Göndermeden önce altı satırı kontrol edebilirsiniz.</p><label>Ödeme kapsamı<select disabled={disabled} value={m.chargeMode} onChange={event=>set({...m,chargeMode:event.target.value as Manual['chargeMode'],charges:event.target.value==='all'?[m.charges[0]||{chargeType:'',freightTerm:'',payer:'',paymentLocation:''}]:m.charges})}><option value="">Seçin</option><option value="all">All Charges</option><option value="individual">Individual Charges</option></select></label>
  {m.charges.map((row,index)=><div className="charge-row" key={index}>{(['chargeType','freightTerm','payer'] as const).map(key=><label key={key}>{({chargeType:'Charge Type',freightTerm:'Freight Term',payer:'Payer',paymentLocation:'Payment Location'})[key]}{(key==='chargeType'&&m.chargeMode!=='all')||key==='payer'?<select disabled={disabled} value={row[key]} onChange={event=>set({...m,charges:m.charges.map((item,n)=>n===index?{...item,[key]:event.target.value}:item)})}><option value="">Seçin</option>{(key==='chargeType'?chargeTypes:payerTypes).map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:key==='freightTerm'?<select disabled={disabled} value={row[key]} onChange={event=>set({...m,charges:m.charges.map((item,n)=>n===index?{...item,freightTerm:event.target.value as typeof row.freightTerm}:item)})}><option value="">Seçin</option><option>Prepaid</option><option>Collect</option></select>:<Input disabled={disabled||(key==='chargeType'&&m.chargeMode==='all')} maxLength={200} value={key==='chargeType'&&m.chargeMode==='all'?'All Charges':row[key]} onChange={event=>set({...m,charges:m.charges.map((item,n)=>n===index?{...item,[key]:event.target.value}:item)})}/>}</label>)}<Location label={'Ödeme yeri · Masraf '+(index+1)} value={row.paymentLocation} disabled={disabled} onChange={paymentLocation=>set({...m,charges:m.charges.map((item,n)=>n===index?{...item,paymentLocation}:item)})}/><Button variant="outline" disabled={disabled} onClick={()=>set({...m,charges:m.charges.filter((_,n)=>n!==index)})}>Satırı sil</Button></div>)}
  <div className="detail-actions form-save"><Button variant="outline" disabled={disabled||m.charges.length>=20||(m.chargeMode==='all'&&m.charges.length===1)} onClick={()=>set({...m,charges:[...m.charges,{chargeType:'',freightTerm:'',payer:'',paymentLocation:''}]})}>Masraf satırı ekle</Button><Button disabled={disabled||importing} onClick={()=>onSave(m)}>Kaydet ve kontrol et</Button></div>
 </section>;
}
