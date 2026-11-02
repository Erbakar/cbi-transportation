'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {useEffect,useState} from 'react';
import {useDisplayCache} from './use-display-cache';
import type {tmaxxReport} from '@/lib/server/tmaxx-finance';
import {operationDateAlert} from '@/lib/operations/tmaxx-operations';
import '@/app/home.css';
type Report=Awaited<ReturnType<typeof tmaxxReport>>;
export function TmaxxOverview(){
 const [now,setNow]=useState(()=>Date.now());
 const {data:filesData,busy,error,checkedAt,refresh}=useDisplayCache('tmaxx-report',async signal=>{
  let cursor:string|null='',all:Report['files']=[];const seen=new Set<string>();
  do{const r=await fetch('/api/tmaxx/report'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{signal,cache:'no-store'}),d=await r.json() as Report&{error?:string};if(!r.ok)throw Error(d.error||'T-MAXX özeti okunamadı.');all=all.concat(d.files);cursor=d.nextCursor;if(cursor&&seen.has(cursor))throw Error('Rapor sayfalaması doğrulanamadı.');if(cursor)seen.add(cursor);}while(cursor);
  if(all.some(f=>f.error))throw Error('Bazı dosyalar okunamadı. Son başarılı özet korunuyor.');return all;
 });
 const files=filesData??[],checked=checkedAt?new Date(checkedAt).toISOString():'';
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(t);},[]);
 const good=files.filter(f=>!f.error&&f.finance?.linked&&f.position),failed=files.filter(f=>f.error),positions=[...new Map(good.map(f=>[f.position!.position.id,f])).values()];
 const dates=positions.flatMap(f=>([['vgm','VGM son teslim'],['documents','Belge son teslim']] as const).map(([key,label])=>({bookingId:f.bookingId,reference:f.position!.position.reference,label,value:f.position!.position.dates[key],alert:operationDateAlert(key,f.position!.position.dates[key],now)}))).filter(d=>d.alert.severity!=='info');
 return <section className="home-panel"><div className="home-section-title"><div><p className="home-eyebrow">CANLI T-MAXX VERİLERİ</p><h2>Operasyon özeti</h2></div><button disabled={busy} onClick={()=>void refresh()}>T-MAXX’i yenile</button></div><p>Platforma bağlanan tüm T-MAXX yükleri sayfalar halinde okunur. Şirketin bağlanmamış dosyaları bu özete dahil değildir.</p>{error&&<OperationToast tone="error" message={userMessage(error)}/>}{busy&&!filesData?<p role="status">T-MAXX dosyaları okunuyor…</p>:<><div className="home-cards"><div className="home-card"><span>Okunan yük</span><strong>{good.length}</strong></div><div className="home-card"><span>Tekil pozisyon</span><strong>{positions.length}</strong></div><div className="home-card"><span>Tarih kontrolü gereken</span><strong>{dates.length}</strong></div><div className="home-card"><span>Okunamayan dosya</span><strong>{failed.length}</strong></div></div>{failed.length>0&&<OperationToast tone="warning" message={"Özet eksik: "+failed.length+" dosya okunamadı ve hesaplara dahil edilmedi. Listeyi yenileyerek kontrol edin."}/>}<h3>Son teslim kontrolleri</h3><p>Tarihler Türkiye saatidir; 24 ve 4 saat uyarıları uygulanır. Geçmiş tarih, işlemin tamamlanmadığının kanıtı değildir; dosya durumunu kontrol edin.</p>{dates.map(d=><p key={d.reference+d.label}><a href={'/booking/'+d.bookingId}>{d.reference} · {d.label}</a> · {d.value} · {d.alert.text}</p>)}{!dates.length&&<p>Okunan tarihlerde uyarı yok.</p>}<h3>Dosyalar ve finans</h3>{files.map(f=><article key={f.bookingId}><a href={'/booking/'+f.bookingId+'/finance'}>{f.finance?.linked?f.finance.goodReference:'Dosyayı aç'}</a>{f.error?<p role="alert">{userMessage(f.error)}</p>:<p>{f.position?.position.status||'Durum belirtilmemiş'} · {f.position?.position.vessel} / {f.position?.position.voyage} · {f.finance?.lines.length||0} finans satırı</p>}</article>)}{!files.length&&<p>Henüz T-MAXX yüküne bağlanmış booking yok.</p>}<p>Son okuma: {new Date(checked).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}. Finans tutarlarını dosya bağlantısından özgün dövizleriyle açabilirsiniz.</p></>}</section>;
}
