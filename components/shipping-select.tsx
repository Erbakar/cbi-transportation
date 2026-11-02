'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {useEffect,useState} from 'react';
import {containerTypeNames,packageOption,type Option} from '@/lib/inttra-reference';
import {Button} from './ui/button';
let packageRequest:Promise<Option[]>|undefined;
export function ShippingSelect({kind,value,selectedCode,codeSelection=true,onChange,disabled,id}:{kind:'container'|'package';value:string;selectedCode?:string;codeSelection?:boolean;onChange:(v:string,code?:string)=>void;disabled:boolean;id?:string}){
 const [options,setOptions]=useState<Option[]>(kind==='container'?containerTypeNames.map(x=>({label:x,value:x})):[]),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{if(kind!=='package')return;packageRequest??=fetch('/api/platform-options').then(async r=>{if(!r.ok)throw Error('Ambalaj listesi yüklenemedi.');const d=await r.json() as {packageTypes:Option[]};return d.packageTypes;}).catch(e=>{packageRequest=undefined;throw e;});let active=true;packageRequest.then(v=>{if(active){setOptions(v);setError('');}}).catch(e=>{if(active)setError(userMessage(e))});return()=>{active=false}},[kind,retry]);
 // T-MAXX recovery uses package labels; INTTRA instructions retain native codes.
 const choices=kind==='package'&&!codeSelection?options.filter((o,i)=>options.findIndex(p=>p.label.toUpperCase().replace(/[\s_-]/g,'')===o.label.toUpperCase().replace(/[\s_-]/g,''))===i):options;
 let selected=kind==='package'?'source:'+value:value,resolved=kind==='container'&&options.some(o=>o.value===value);try{if(kind==='package'&&value&&options.length){selected=packageOption(choices,value,codeSelection?selectedCode:undefined).value;resolved=true;}}catch{/* Preserve ambiguous or stale choices until the operator selects an exact code. */}
 return <><select id={id} disabled={disabled} value={value?selected:''} onChange={e=>{const option=options.find(o=>o.value===e.target.value);onChange(kind==='package'?option?.label||'':e.target.value,kind==='package'?option?.value:undefined);}}><option value="">Seçin</option>{value&&!resolved&&<option value={selected}>{value} · Listeden doğrulayın</option>}{choices.map(o=><option key={o.value} value={o.value}>{o.label}{kind==='package'&&codeSelection&&options.filter(p=>p.label.toUpperCase().replace(/\s/g,'')===o.label.toUpperCase().replace(/\s/g,'')).length>1?' (kod '+o.value+')':''}</option>)}</select>{error&&<><OperationToast tone="error" message={error}/><Button type="button" variant="outline" disabled={disabled} onClick={()=>setRetry(n=>n+1)}>Ambalaj listesini yeniden getir</Button></>}</>;
}
