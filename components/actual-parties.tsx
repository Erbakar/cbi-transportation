'use client';
import {useEffect,useState} from 'react';
import type {Extraction,Fields} from '@/lib/domain';
import type {Manual} from '@/lib/manual';
import {addressKeys,addressLabels,addressLimits,partyLabels,partyRoles} from '@/lib/inttra-quality';
import {Input} from './ui/input';
import {Button} from './ui/button';
type Country={value:string;label:string;code?:string};
async function fetchCountries(signal:AbortSignal){const response=await fetch('/api/platform-options',{signal});const data=await response.json() as {error?:string;countries?:Country[]};if(!response.ok)throw Error(data.error);return data.countries||[];}
export function ActualParties({showAll=false,parties,fields,manual,disabled,onChange}:{showAll?:boolean;parties?:Extraction['actualParties'];fields?:Fields;manual:Manual;disabled:boolean;onChange:(m:Manual)=>void}){
 const [countries,setCountries]=useState<Country[]>([]),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const enabled=manual.inttra?.houseBill==='2';
 useEffect(()=>{if(disabled||!enabled)return;const controller=new AbortController();fetchCountries(controller.signal).then(list=>{if(!controller.signal.aborted){setCountries(list);setError('');}}).catch(e=>{if(!controller.signal.aborted)setError((e as Error).message);});return()=>controller.abort();},[disabled,enabled,retry]);
 if(manual.inttra?.houseBill!=='2')return null;
 return <details className="form-section" open><summary>Gerçek taraflar · HBL adresleri</summary><p>INTTRA’nın ayrı adres alanları burada hazırlanır. Belgede açıkça bulunmayan bilgiyi tamamlayın. MBL tarafları belge bilgilerinde ayrıca korunur.</p>{error&&<div className="notice" role="alert">{error}<Button variant="outline" onClick={()=>setRetry(n=>n+1)}>Ülkeleri yeniden getir</Button></div>}
 {partyRoles.map(role=>{const source=parties?.[role]||{},overrides=manual.partyOverrides?.[role]||{};return <section className="party-card" key={role}><h4>{partyLabels[role]}</h4><strong>{fields?.[role+'Name']?.value||'Firma adı eksik'}</strong><p className="source-address">{fields?.[role+'Address']?.value||'Belgede adres yok'}</p><div className="manual-grid">{addressKeys.filter(key=>showAll||['street','city','country'].includes(key)||overrides[key]||source[key]?.value).map(key=>{const value=overrides[key]??source[key]?.value??'';const required=['street','city','country'].includes(key);return <label key={key} className={key==='street'?'full-width':''}>{addressLabels[key]}{required?' *':''}{key==='country'?<select disabled={disabled} value={countries.find(c=>c.value===value||c.code===value||c.label.toUpperCase()===value.toUpperCase())?.value||value} onChange={e=>onChange({...manual,partyOverrides:{...manual.partyOverrides,[role]:{...overrides,[key]:e.target.value}}})}><option value="">Ülke seçin</option>{value&&!countries.some(c=>c.value===value||c.code===value||c.label.toUpperCase()===value.toUpperCase())&&<option value={value}>{value}</option>}{countries.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select>:<Input disabled={disabled} value={value} maxLength={addressLimits[key]} placeholder={required?'Belgede bulunamadı':'İsteğe bağlı'} onChange={e=>onChange({...manual,partyOverrides:{...manual.partyOverrides,[role]:{...overrides,[key]:e.target.value}}})}/>}</label>})}</div></section>})}</details>;
}
