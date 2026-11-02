'use client';
import {Input} from './ui/input';
export function InstructionField({id,label,value,onChange,disabled,required=false,multiline=false,source}:{id:string;label:string;value:string;onChange:(v:string)=>void;disabled:boolean;required?:boolean;multiline?:boolean;source?:string}){
 const missing=required&&!value.trim();
 const props={id,disabled,value,'aria-invalid':missing,'aria-describedby':missing?id+'-error':undefined,onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>onChange(e.target.value)};
 return <label data-field-label={label} htmlFor={id} className={missing?'field-missing':''}>{label}{required?' *':''}{multiline?<textarea {...props} rows={4} maxLength={4000}/>:<Input {...props} maxLength={4000}/>}{missing&&<small id={id+'-error'}>Bu bilgiyi tamamlayın.</small>}{source&&<small className="field-source">{source}</small>}</label>;
}
export function focusInstructionIssue(message:string){
 const recovery=document.getElementById('tmaxx-recovery');
 if(recovery&&/T[ -]?MAXX/i.test(message)){
  const row=Array.from(recovery.querySelectorAll<HTMLElement>('[data-recovery-key]')).find(el=>{
   const key=el.dataset.recoveryKey||'',label=el.dataset.recoveryLabel||'';
   return (key&&new RegExp('\\b'+key+'\\b','i').test(message))||(label&&message.toLocaleLowerCase('tr').includes(label.toLocaleLowerCase('tr')));
  });
  const target=row||recovery;
  target.scrollIntoView({behavior:'smooth',block:row?'center':'start'});
  const input=row?.querySelector<HTMLElement>('textarea:not(:disabled),input:not(:disabled),select:not(:disabled)');
  (input||target).focus({preventScroll:true});
  target.setAttribute('data-issue-highlight','true');
  window.setTimeout(()=>target.removeAttribute('data-issue-highlight'),4000);
  return;
 }
 window.dispatchEvent(new CustomEvent('instruction-issue',{detail:message}));
}
