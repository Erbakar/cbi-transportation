'use client';
import {useEffect,useId} from 'react';
import {notificationMessage,type NoticeTone} from '@/lib/notification-message';
import {showNotice,notify} from '@/lib/notify';

/** A notification follows its originating operation and is removed on navigation.
 * Unchanged polling results do not re-open a dismissed notification. */
export function OperationToast({message,tone='auto'}:{message:unknown;tone?:NoticeTone|'auto'}){
 const id=useId(),notice=notificationMessage(message,tone);
 const text=notice?.description||'',kind=notice?.tone||'info',title=notice?.title||'';
 useEffect(()=>{
  if(text)showNotice(message,tone,{id});else notify.dismiss(id);
  return()=>{notify.dismiss(id);};
  // The normalized text/type define the notification; new Error objects and
  // repeated polling responses with the same content are not new operations.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[id,text,kind,title]);
 return null;
}
