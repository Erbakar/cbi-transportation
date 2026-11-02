import {applyManual} from '../manual-extraction';
import {manualSchema,emptyManual} from '../manual';
import {controlReadingSchema,controlFindings,latestDecisions} from '../operations/control-review';
import {compareControl,controlLabels,type ControlSource,type ControlKey} from '../operations/bill-control';
import {zonedInstant,type ScheduleTask} from '../operations/schedule';
import type {controlState} from './control-state';
import type {FieldSource} from '../operations/field-operation';
export const controlDocumentTypes=['instruction','booking_confirmation','booking_revision','carrier_si','vgm','hbl_draft','mbl_draft','hbl_final','mbl_final','sea_waybill'];
type State=Awaited<ReturnType<typeof controlState>>;
export function assessControl(state:State){
 const draft=JSON.parse(state.booking.data),field:FieldSource|null=state.field?.source?JSON.parse(state.field.source):null;
 const containerSources=new Map<string,ControlSource[]>();
 const addContainer=(number:string,source:ControlSource)=>{const key=number.replace(/[\s-]/g,'').toUpperCase();containerSources.set(key,[...(containerSources.get(key)||[]),source]);};
 const sources:ControlSource[]=[{id:'booking',label:'Booking kaydı',kind:'booking',status:'Kayıt revizyonu '+state.booking.revision,values:{}}];
 for(const [key,value] of Object.entries(draft))if(key in controlLabels&&value!==''&&value!==0)sources[0].values[key as ControlKey]={value:String(value),proof:'Kayıtlı booking bilgisi'};
 const tmaxx:ControlSource={id:'tmaxx',label:'T-MAXX pozisyonu',kind:'tmaxx',status:field?'Son okuma: '+field.checkedAt:'Pozisyon kaynağı bekleniyor',values:{}};
 if(field){tmaxx.values.position={value:field.reference,proof:field.goodReference};for(const [key,value] of Object.entries(field.values))if(value&&key in controlLabels)tmaxx.values[key as ControlKey]={value,proof:'Kayıtlı T-MAXX kaynak görüntüsü'};
 if(field.containers.length)tmaxx.values.containers={value:field.containers.map(c=>c.number).sort().join(' · '),proof:field.goodReference};}
 sources.push(tmaxx);
 if(field)for(const c of field.containers){const values:ControlSource['values']={};for(const [key,value] of Object.entries({equipmentType:c.type,seals:c.seal,grossKg:c.cargoGrossKg,tareKg:c.tareKg}))if(value)values[key as ControlKey]={value,proof:'T-MAXX konteyner '+c.number};addContainer(c.number,{...tmaxx,values});}

 const rawIssues:{subject:string;message:string;critical:boolean}[]=[];
 for(const doc of state.docs.filter(d=>d.current&&controlDocumentTypes.includes(d.type))){
  const s:ControlSource={id:doc.id,label:doc.filename,kind:doc.type,status:'Sürüm '+doc.version,href:'/api/bookings/'+doc.booking_id+'/documents/'+doc.id,values:{}};
  const latest=state.readings.find(r=>r.document_id===doc.id);
  if(!latest||latest.status!=='ready'||!latest.result||latest.document_hash!==doc.hash)rawIssues.push({subject:'document:'+doc.id,message:doc.filename+': tamamlanmış güncel alan okuması gerekli.',critical:true});
  else {const parsed=controlReadingSchema.safeParse(JSON.parse(latest.result));if(!parsed.success)rawIssues.push({subject:'document:'+doc.id,message:doc.filename+': okuma doğrulanamadı.',critical:true});else{
   const read=parsed.data;
   if(read.documentType!==doc.type)rawIssues.push({subject:'document:'+doc.id,message:doc.filename+': belgeden okunan tür ('+read.documentType+') arşiv türüyle eşleşmiyor.',critical:true});
   if(!read.fields.length&&!read.containers.length)rawIssues.push({subject:'document:'+doc.id,message:doc.filename+': karşılaştırılabilir alan okunamadı.',critical:true});
   for(const f of read.fields)s.values[f.key]={value:f.value,proof:f.proof,page:f.page,confidence:f.confidence};
   if(read.containers.length)s.values.containers={value:read.containers.map(c=>c.number.replace(/[\s-]/g,'').toUpperCase()).sort().join(' · '),proof:read.containers.map(c=>c.proof).join('\n')};
   for(const c of read.containers){const values:ControlSource['values']={};for(const [key,value] of Object.entries({equipmentType:c.type,seals:c.seal,grossKg:c.grossKg,tareKg:c.tareKg,vgmKg:c.vgmKg}))if(value)values[key as ControlKey]={value,proof:c.proof,page:c.page};addContainer(c.number,{...s,values});
    if(c.grossKg&&c.tareKg&&c.vgmKg&&Math.abs(Number(c.grossKg)+Number(c.tareKg)-Number(c.vgmKg))>.0005)rawIssues.push({subject:'reading:'+doc.id,message:doc.filename+' · '+c.number+': VGM ile yük brüt + dara farklı; VGM ekranından ağırlığı doğrulayın.',critical:true});
   }
   for(const c of read.containers)if(!field?.containers.some(f=>f.number.replace(/[\s-]/g,'').toUpperCase()===c.number.replace(/[\s-]/g,'').toUpperCase()))rawIssues.push({subject:'document:'+doc.id,message:doc.filename+': '+c.number+' seçilen pozisyon yükünde bulunmuyor.',critical:true});
   if(read.fields.some(f=>f.confidence<.95))rawIssues.push({subject:'reading:'+doc.id,message:doc.filename+': düşük güvenli alanları belgenin aslından kontrol edin.',critical:false});
   for(const issue of read.issues)rawIssues.push({subject:'reading:'+doc.id,message:doc.filename+': '+issue,critical:false});
  }}sources.push(s);
 }
 for(const record of state.links){
  if(!record.extraction){rawIssues.push({subject:'record:'+record.id,message:record.filename+': talimat okuması gerekli.',critical:true});continue;}
  const manual=manualSchema.parse(record.manual?JSON.parse(record.manual):emptyManual),ex=applyManual(JSON.parse(record.extraction),manual);
  if(!field||![field.reference,field.goodReference].some(r=>r.trim().toUpperCase()===(manual.tmaxxReference||'').trim().toUpperCase()))rawIssues.push({subject:'record:'+record.id,message:record.filename+': pozisyon bağlantısı değişmiş.',critical:true});
  const source:ControlSource={id:record.id,label:record.filename+' · aktarım verisi',kind:'record',status:'Konşimento revizyonu '+record.revision,href:'/bills/'+record.id,values:{}};
  const mapping:Record<string,ControlKey>={bookingNumber:'bookingNumber',shipperName:'shipper',consigneeName:'consigneeName',notifyName:'notifyName',loadPort:'loadPort',dischargePort:'dischargePort',vessel:'vessel',voyage:'voyage',description:'description',packageCount:'packages',grossWeightKg:'grossKg',netWeightKg:'netKg',volumeM3:'volume',hsCode:'hsCode',freightPayment:'freightPayment',blType:'blType'};
  for(const [key,target] of Object.entries(mapping)){const f=ex.fields[key];if(f?.value)source.values[target]={value:f.value,proof:f.source,confidence:f.confidence};}
  if(ex.containers.length)source.values.containers={value:ex.containers.map(c=>c.containerNumber?.value||'').sort().join(' · '),proof:'Konşimento konteyner listesi'};
  if(ex.containers.some(c=>!field?.containers.some(f=>f.number.replace(/[\s-]/g,'').toUpperCase()===(c.containerNumber?.value||'').replace(/[\s-]/g,'').toUpperCase())))rawIssues.push({subject:'record:'+record.id,message:record.filename+': pozisyon dışı konteyner.',critical:true});
  sources.push(source);
  for(const c of ex.containers){const values:ControlSource['values']={};for(const [key,target] of Object.entries({containerType:'equipmentType',sealNumber:'seals',grossWeightKg:'grossKg'})){const f=c[key];if(f?.value)values[target as ControlKey]={value:f.value,proof:f.source};}addContainer(c.containerNumber?.value||'',{...source,values});}

 }
 const findings=controlFindings(sources,state.decisions,state.fingerprint),excluded=new Set(findings.excluded);
 const latest=latestDecisions(state.decisions,state.fingerprint);
 const containerRows=[...containerSources.entries()].flatMap(([number,list])=>compareControl(list.filter(s=>!excluded.has('document:'+s.id))).filter(r=>r.present.length).map(r=>{const subject='container:'+number+':'+r.key,decision=latest.get(subject);return {...r,subject,label:number+' · '+r.label,decision:decision||null,resolved:r.level==='review'&&!!decision&&decision.action==='accept'&&r.present.some(p=>p.sourceId===decision.choice)};}));
 const blockers=rawIssues.filter(i=>!excluded.has(i.subject)&&!excluded.has(i.subject.replace(/^reading:/,'document:')));
 for(const row of containerRows)if(row.level==='review'&&!row.resolved)blockers.push({subject:row.subject,message:row.label+': konteyner bazındaki fark için gerekçeli karar gerekli.',critical:false});
 for(const row of findings.rows)if(row.level==='critical'||row.level==='review'&&!row.resolved)blockers.push({subject:'field:'+row.key,message:row.label+': '+(row.level==='critical'?'kritik uyuşmazlık; kaynağı düzeltin veya yanlış belgeyi gerekçesiyle dışlayın.':'fark için gerekçeli karar gerekli.'),critical:row.level==='critical'});
 for(const required of ['bookingNumber','loadPort','dischargePort'] as const)if(!findings.active.some(s=>['instruction','booking_confirmation','booking_revision'].includes(s.kind)&&s.values[required]?.value))blockers.push({subject:'evidence:'+required,message:controlLabels[required]+': talimat veya booking belgesinde açık kanıt gerekli.',critical:true});
 const current=state.docs.filter(d=>d.current&&!excluded.has('document:'+d.id));
 for(const required of ['instruction','booking_confirmation'])if(!current.some(d=>d.type===required||required==='booking_confirmation'&&d.type==='booking_revision'))blockers.push({subject:'required:'+required,message:(required==='instruction'?'Müşteri talimatı':'Booking teyidi')+' gerekli.',critical:true});
 if(!field)blockers.push({subject:'position',message:'T-MAXX pozisyon kaynağı gerekli.',critical:true});
 for(const d of current.filter(d=>['hbl_final','mbl_final','sea_waybill'].includes(d.type)))if(!state.events.some(e=>e.document_id===d.id&&e.kind==='final_verified'&&current.some(x=>x.id===e.related_id)&&state.events.some(a=>a.document_id===e.related_id&&a.kind==='draft_approved')))blockers.push({subject:'final:'+d.id,message:d.filename+': onaylı güncel taslak ile final doğrulaması gerekli.',critical:true});
 const tasks:ScheduleTask[]=state.schedule?JSON.parse(state.schedule.data):[];
 for(const t of tasks.filter(t=>t.kind.endsWith('Cutoff')&&t.status!=='cancelled'&&t.requiredDocument&&t.date)){
  if(!t.time){blockers.push({subject:'cutoff:'+t.id,message:t.label+': son teslim saati bilinmiyor; takvimde doğrulayın.',critical:true});continue;}
  const due=zonedInstant(t.date,t.time,t.zone);
  if(due<Date.now()&&!state.events.some(e=>e.kind==='dispatch'&&e.related_id===t.id&&current.some(d=>d.id===e.document_id&&d.type===t.requiredDocument)))blockers.push({subject:'cutoff:'+t.id,message:t.label+': süre geçti; güncel gerekli belgenin gönderim kanıtı yok.',critical:true});
 }
 const acknowledged=state.decisions.filter(d=>d.fingerprint===state.fingerprint&&d.action==='accept').map(d=>d.subject);
 return {sources,rows:findings.rows,containerRows,excluded:findings.excluded,blockers:blockers.filter(b=>b.critical||!acknowledged.includes(b.subject)),field,tasks};
}
