'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {useEffect,useState} from 'react';
import {Button} from './ui/button';
import {ShippingSelect} from './shipping-select';
import {BookingConfirmation} from './booking-confirmation';
import {Input} from './ui/input';
type Row={id:string;scope:string;load:string;label:string;key:string;current:string;expected:string;matches:boolean;numeric:boolean;derived?:boolean};
type Review={loads?:{goodId:number;reference:string;booking:string}[];issues?:{id:string;message:string}[];rows:Row[];blockers:string[];fingerprint:string};
export function TmaxxRecovery({recordId,onComplete}:{recordId:string;onComplete:()=>void}){
 const [review,setReview]=useState<Review|null>(null),[edits,setEdits]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
 async function request(action:'inspect'|'preview'|'apply'){
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/records/'+recordId+'/tmaxx-recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,fingerprint:review?.fingerprint,edits})});
   const data=await r.json() as Review & {error?:string};if(!r.ok)throw Error(data.error||'Kontrol tamamlanamadı.');
   if(action==='apply'){setReview(null);onComplete();return;}
   setReview(current=>({...data,loads:data.loads||current?.loads}));setEdits(Object.fromEntries(data.rows.map((row:Row)=>[row.id,row.expected])));setConfirmed(action==='preview'&&!data.issues?.length);
  }catch(e){setError(userMessage(e));setConfirmed(false);}finally{setBusy(false);}
 }
 useEffect(()=>{void request('inspect');},[recordId]);
 return <section id="tmaxx-recovery" tabIndex={-1} aria-label="T-MAXX alanlarını kontrol et ve düzelt" className="tmaxx-recovery"><h3>T-MAXX alanlarını kontrol et ve düzelt</h3><p>Konteyner, mal ve HBL bilgilerini kontrol edip düzenleyin. Düzenlemeler yalnız T-MAXX’e uygulanır; gönderilmiş INTTRA talimatı değişmez.</p><Button variant="outline" disabled={busy} onClick={()=>request('inspect')}>{busy?'Kontrol ediliyor…':review?'Mevcut değerleri yenile':'Değerleri karşılaştır'}</Button>
 {error&&<OperationToast tone="error" message={userMessage(error)}/>}
 {review&&<><BookingConfirmation recordId={recordId} loads={review.loads||[]} onUploaded={()=>request('inspect')}/><p>Mal satırlarını bir kez düzenleyin; konteyner ve yük toplamları otomatik hesaplanır.</p><p>Toplamlar mal satırlarından hesaplanır. Sayıları binlik ayırıcı olmadan yazın (ör. 23110).</p>{(review.blockers.length>0||!!review.issues?.length)&&<OperationToast tone="warning" message="T-MAXX aktarımından önce düzeltilmesi gereken bilgiler var. Aşağıdaki uyarıları ve işaretli alanları kontrol edin."/>}{review.blockers.map(b=><p role="alert" key={b}>{userMessage(b)}</p>)}<div className="recovery-fields">{review.rows.filter(row=>!row.derived).map(row=>{
 const locked=!!(busy||review.blockers.length||row.derived||['no','hblNo','bookingNo'].includes(row.key));
 const props={id:'recovery-'+row.id,'aria-label':row.scope+' · '+row.label,disabled:locked,value:edits[row.id]??row.expected,onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>{setEdits({...edits,[row.id]:e.target.value});setConfirmed(false);}};
 const issue=review.issues?.find(i=>i.id===row.id);
 const long=['consignor','consignee','notify','goodDescription','quantityAndDescription'].includes(row.key);
 return <div key={row.id} tabIndex={-1} data-recovery-key={row.key} data-recovery-label={row.label} className="recovery-field"><div className="recovery-field-heading"><label htmlFor={props.id}>{row.label}</label><span>{row.scope}</span></div><div className="recovery-field-values recovery-single-value"><div><label className="recovery-caption" htmlFor={props.id}>Aktarılacak değer</label>{['containerType','packing'].includes(row.key)?<ShippingSelect codeSelection={false} id={props.id} kind={row.key==='containerType'?'container':'package'} value={props.value} disabled={locked} onChange={value=>{setEdits({...edits,[row.id]:value});setConfirmed(false);}}/>:long?<textarea {...props} rows={4}/>:<Input {...props} aria-invalid={!!issue} aria-describedby={issue?'issue-'+row.id:undefined} inputMode={row.numeric?'decimal':undefined}/>} {issue&&<p id={'issue-'+row.id} role="alert" className="text-red-600">{userMessage(issue.message)}</p>}</div></div></div>;
 })}</div><div className="recovery-actions"><Button variant="outline" disabled={busy||!!review.blockers.length} onClick={()=>request('preview')}>Düzeltmeleri kontrol et</Button>{confirmed&&<Button disabled={busy} onClick={()=>request('apply')}>Onayla ve yalnız T-MAXX’i tamamla</Button>}</div>{confirmed&&<p>Yukarıdaki aktarılacak değerleri kontrol edin. Onayınızla mevcut T-MAXX kayıtları güncellenecek.</p>}</>}
 </section>;
}
