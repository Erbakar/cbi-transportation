'use client';
import {userMessage} from '@/lib/user-message';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useWorkspaceUser} from './workspace-session';
import {readDisplayCache,refreshDisplayCache,writeDisplayCache,displayCacheGeneration} from '@/lib/workspace-cache';
const freshness = 5 * 60 * 1000;
export function useDisplayCache<T>(key: string, loader: (signal: AbortSignal, publish:(value:T)=>void) => Promise<T>) {
 const {username}=useWorkspaceUser();
 const [snapshot,setSnapshot]=useState(()=>readDisplayCache<T>(username,key));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const fetcher=useRef(loader);
 useEffect(()=>{fetcher.current=loader;},[loader]);
 const mounted=useRef(false),revision=useRef(0);
 const refresh=useCallback(async(force=true)=>{
  const requestRevision=revision.current;
  const cached=readDisplayCache<T>(username,key);
  if(!force&&cached&&!cached.stale&&Date.now()-cached.checkedAt<freshness){setBusy(false);return;}
  setBusy(true);setError('');
  try {await refreshDisplayCache(username,key,signal=>{const epoch=displayCacheGeneration();return fetcher.current(signal,value=>{if(!signal.aborted&&mounted.current&&revision.current===requestRevision){writeDisplayCache(username,key,value,epoch);setSnapshot(readDisplayCache<T>(username,key));}});});if(mounted.current&&revision.current===requestRevision)setSnapshot(readDisplayCache<T>(username,key));}
  catch(e){if(mounted.current&&revision.current===requestRevision)setError(userMessage(e));}
  finally{if(mounted.current&&revision.current===requestRevision)setBusy(false);}
 },[username,key]);
 useEffect(()=>{
  mounted.current=true;const effectRevision=++revision.current;
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setSnapshot(readDisplayCache<T>(username,key));
  void refresh(false);
  const check=()=>{if(document.visibilityState==='visible')void refresh(false);};
  const timer=setInterval(check,60000);window.addEventListener('focus',check);
  return()=>{mounted.current=false;revision.current=effectRevision+1;clearInterval(timer);window.removeEventListener('focus',check);};
 },[username,key,refresh]);
 return {data:snapshot?.value??null,checkedAt:snapshot?.checkedAt,busy,error,refresh};
}
