'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {useRef,useState} from 'react';
import {ArrowUpRight,ArrowRight,Globe2,RefreshCw,Monitor,Link2} from 'lucide-react';
import {useDisplayCache} from './use-display-cache';
import type {siteConnections} from '@/lib/server/site-connections';
import type {CmaBrowserState} from '@/lib/server/cma-browser';
type Data=Awaited<ReturnType<typeof siteConnections>>;
export function SiteConnections(){
 const [error,setError]=useState(''),[reading,setReading]=useState(false),[snapshot,setSnapshot]=useState<CmaBrowserState|null>(null);
 const flight=useRef(false);
 const {data,busy,error:loadError,refresh:load}=useDisplayCache('site-status',async signal=>{const r=await fetch('/api/connections/sites',{cache:'no-store',signal}),d=await r.json() as Data&{error?:string};if(!r.ok)throw Error(d.error||'Bağlantılar okunamadı.');return d;});
 async function read(){if(flight.current)return;flight.current=true;setReading(true);setError('');setSnapshot(null);try{const r=await fetch('/api/carriers/cma-cgm/browser',{method:'POST'}),d=await r.json() as CmaBrowserState&{error?:string};if(!r.ok)throw Error(d.error||'CMA kayıtları okunamadı.');setSnapshot(d);await load();}catch(e){setError(userMessage(e));}finally{flight.current=false;setReading(false);}}
 const count=data?.sites.filter(s=>s.state==='ready'||s.state==='browser_ready').length||0;
 return <section id="site-hub" className="site-hub" aria-labelledby="site-hub-title"><div className="site-hub-heading"><div><p className="home-eyebrow"><Globe2 size={14}/> BAĞLANTI MERKEZİ</p><h2 id="site-hub-title">Çalıştığınız platformlar</h2><p>Operasyon sistemlerinize tek noktadan erişin.</p></div><div className="site-hub-summary"><span>{data?`${count} / ${data.sites.length} erişim hazır`:'Durumlar yükleniyor'}</span><button type="button" onClick={()=>void load()} disabled={busy||reading} aria-label="Platform durumlarını yenile"><RefreshCw size={16} className={busy?'spin':''}/></button></div></div>
 {(error||loadError)&&<OperationToast tone="error" message={userMessage(error||loadError)}/>}
 <div className="site-grid">{data?data.sites.map(s=><article className={'site-card site-'+s.id} key={s.id}><div className="site-card-top"><span className="site-monogram" aria-hidden="true">{s.monogram}</span><span className={'site-status '+s.state}><i/>{s.label}</span></div><p className="site-category">{s.category}</p><h3>{s.name}</h3><p className="site-description">{s.description}</p><div className="site-state-detail"><Link2 size={14}/><span>{s.detail}</span></div><div className="site-card-actions"><a href={s.url} target="_blank" rel="noopener noreferrer">Siteyi aç <ArrowUpRight size={16}/></a><a href={s.workspace}>{s.workspaceLabel}<ArrowRight size={15}/></a></div>{s.id==='cma-cgm'&&<button className="site-browser-read" onClick={()=>void read()} disabled={reading||!('browser' in s&&s.browser?.extensionOnline)}><Monitor size={16}/>{reading?'Güncelleniyor…':'VGM listesini güncelle'}</button>}</article>):Array.from({length:3},(_,i)=><div key={i} className="site-card site-loading" aria-hidden="true"><span/><span/><span/></div>)}</div>
 <p className="site-hub-note">{data?`Son kontrol: ${new Date(data.checkedAt).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}. `:''}Siteyi açmak yeni sekme açar. Hazır oturum, gönderim yapıldığı anlamına gelmez.</p>
 {snapshot&&<div className="site-browser-result" role="status"><h3>CMA CGM · VGM kayıtları</h3>{snapshot.state==='ready'?<><p>Toplam {snapshot.total} kaydın {snapshot.rows?.length} kayıt okundu. {snapshot.accountVerified?'Şirket hesabı doğrulandı.':'Hesap eşleşmesi henüz doğrulanmadı.'} Liste okuması gönderim yapmaz.</p><div className="site-table-scroll"><table><thead><tr>{['Booking','Son tarih','Durum','Konteyner','Dara (kg)','VGM','İmzalayan','Gönderim tarihi','Kanal'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{snapshot.rows?.map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{v||'—'}</td>)}</tr>)}</tbody></table></div></>:<p>{userMessage(snapshot.message)||'CMA kayıtları arka planda güncelleniyor.'}</p>}</div>}
 </section>;
}
