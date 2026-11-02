'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {useId,useState} from 'react';
import {Download,FileText,Loader2} from 'lucide-react';
import {Button} from './ui/button';
import {Dialog,DialogTrigger,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './ui/dialog';
import './hbl-document.css';
type HblChoice={goodId:number;number?:string;reference?:string};
export function HblDocument({recordId,goodId,documents,compact=false}:{recordId:string;goodId?:number;documents?:HblChoice[];compact?:boolean}){
 const formId=useId();
 const [open,setOpen]=useState(false),[reports,setReports]=useState<{id:number;name:string}[]>([]),[reportId,setReportId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<HblChoice|null>(null);
 const choices:HblChoice[]=documents?[...documents].sort((a,b)=>(a.number||a.reference||'').localeCompare(b.number||b.reference||'','tr',{numeric:true})):goodId?[{goodId}]:[];
 const endpoint=(id:number)=>'/api/records/'+recordId+'/tmaxx-document?goodId='+id;
 async function download(){if(!selected||!reportId||busy)return;setBusy(true);setError('');try{const r=await fetch(endpoint(selected.goodId)+'&reportId='+reportId);if(!r.ok){const d=await r.json() as {error?:string};throw Error(d.error||'Belge alınamadı.');}const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download='TMAXX-HBL-'+selected.goodId+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);setOpen(false);}catch(e){setError(userMessage(e))}finally{setBusy(false)}}
 async function choose(hbl:HblChoice){setSelected(hbl);setReports([]);setReportId('');setBusy(true);setError('');try{const r=await fetch(endpoint(hbl.goodId));const d=await r.json() as {reports:{id:number;name:string}[];error?:string};if(!r.ok)throw Error(d.error);setReports(d.reports);if(d.reports.length===1)setReportId(String(d.reports[0].id));if(!d.reports.length)setError('Platformda HBL rapor şablonu bulunamadı.');}catch(e){setError(userMessage(e))}finally{setBusy(false)}}
 if(!choices.length)return null;
 return <Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild><Button type="button" className={compact?'record-download':undefined} aria-label={compact?'HBL PDF indir':undefined} variant="outline" disabled={busy} onClick={()=>void choose(choices[0])}><Download size={15}/>{compact?'İndir':'HBL indir (PDF)'}</Button></DialogTrigger>
  <DialogContent className="hbl-download-dialog">
   <DialogHeader className="hbl-download-heading"><span className="hbl-download-icon"><FileText size={23}/></span><DialogTitle>HBL belgesini indir</DialogTitle><DialogDescription>Konşimentonuzu ve indirmek istediğiniz belge şablonunu seçin.</DialogDescription></DialogHeader>
   <div className="hbl-download-fields">
    {choices.length>1?<div className="hbl-download-field"><label htmlFor={formId+'-hbl'}>Konşimento</label><select id={formId+'-hbl'} disabled={busy} value={selected?.goodId||''} onChange={e=>{const h=choices.find(h=>h.goodId===Number(e.target.value));if(h)void choose(h);}}>{choices.map(h=><option key={h.goodId} value={h.goodId}>HBL {h.number||h.reference}</option>)}</select>{selected?.number&&selected.reference&&<span className="hbl-download-reference">{selected.reference}</span>}</div>:selected&&(selected.number||selected.reference)&&<div className="hbl-download-summary"><FileText size={18}/><span><strong>{selected.number?'HBL '+selected.number:selected.reference}</strong>{selected.number&&selected.reference&&<span>{selected.reference}</span>}</span></div>}
    <div className="hbl-download-field"><label htmlFor={formId+'-template'}>Belge şablonu</label><select id={formId+'-template'} disabled={busy||!reports.length} value={reportId} onChange={e=>setReportId(e.target.value)}><option value="">{busy&&!reports.length?'Şablonlar yükleniyor…':'Belge şablonu seçin'}</option>{reports.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
    {error&&<OperationToast tone="error" message={userMessage(error)}/>}
   </div>
   <DialogFooter className="hbl-download-footer"><Button type="button" variant="outline" onClick={()=>setOpen(false)}>Vazgeç</Button>{error&&!reports.length?<Button type="button" disabled={busy} onClick={()=>selected&&void choose(selected)}>Tekrar dene</Button>:<Button type="button" disabled={busy||!reportId} onClick={()=>void download()}>{busy?<Loader2 size={16} className="spin"/>:<Download size={16}/>} {busy?'Hazırlanıyor…':'PDF indir'}</Button>}</DialogFooter>
  </DialogContent>
 </Dialog>;
}
