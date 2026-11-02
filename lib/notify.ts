'use client';
import {toast as sonner,type ExternalToast} from 'sonner';
import {notificationMessage,type NoticeTone} from './notification-message';

export function showNotice(value:unknown,tone:NoticeTone|'auto'='auto',options:Pick<ExternalToast,'id'|'action'>={}){
 const notice=notificationMessage(value,tone);
 if(!notice)return;
 return sonner[notice.tone](notice.title,{...options,description:notice.description,duration:notice.tone==='error'?Infinity:notice.tone==='warning'?14000:9000});
}
// Keep event handlers using one presentation layer; raw service responses never
// go straight to Sonner. A shared id replaces repeat clicks instead of stacking.
function eventNotice(value:unknown,tone:NoticeTone){
 const notice=notificationMessage(value,tone);if(!notice)return;
 return showNotice(value,tone,{id:'event:'+notice.tone+':'+notice.description});
}
export const notify={
 success:(value:unknown)=>eventNotice(value,'success'),
 error:(value:unknown)=>eventNotice(value,'error'),
 warning:(value:unknown)=>eventNotice(value,'warning'),
 info:(value:unknown)=>eventNotice(value,'info'),
 dismiss:(id?:string|number)=>sonner.dismiss(id),
};
