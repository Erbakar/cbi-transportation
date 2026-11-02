/* global chrome */
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id||message?.action!=='read-vgm-dashboard')return;
 if(location.origin!=='https://www.cma-cgm.com'||location.pathname!=='/ebusiness/vgm'){respond({state:'unavailable'});return;}
 const text=document.body.innerText;
 if(document.querySelector('input[type=password]')){respond({state:'login_required'});return;}
 const headers=Array.from(document.querySelectorAll('[role=columnheader]')).map(e=>e.textContent.trim());
 const expected=['Booking ref.','Cutoff (Local Time)','VGM Status','Container','Tare (KGM)','VGM integrated','Name or signature','Sending Date','Incoming channel'];
 const columns=expected.map(h=>headers.findIndex(value=>value===h));
 if(columns.some(i=>i<0)){respond(null);return;}
 const total=text.match(/Showing\s+\d+\s+to\s+\d+\s+of\s+(\d+)/i)?.[1];
 const rows=Array.from(document.querySelectorAll('tr')).map(r=>columns.map(i=>r.querySelectorAll('[role=gridcell]')[i]?.innerText.trim()).filter(v=>v!==undefined)).filter(r=>r.length===9);
 if(total==='0'&&!rows.length){respond({state:'ready',rows:[],total:0,complete:true});return;}
 if(total&&rows.length){
  // Pagination only; never use declaration, edit, or submission controls.
  const pages=async()=>{
   const all=[...rows];let range=text.match(/Showing\s+(\d+)\s+to\s+(\d+)\s+of\s+(\d+)/i)?.[0];
   let complete=Number(total)===rows.length;
   const deadline=Date.now()+18000;
   while(!complete&&Date.now()<deadline&&all.length<1000){
    const next=document.querySelector('button[aria-label="Next"]');
    if(!next||next.getAttribute('aria-disabled')==='true')break;
    next.click();let changed=false;
    while(Date.now()<deadline){
     await new Promise(r=>setTimeout(r,150));
     const updated=document.body.innerText.match(/Showing\s+(\d+)\s+to\s+(\d+)\s+of\s+(\d+)/i);
     if(updated&&updated[0]!==range&&Number(updated[1])===all.length+1&&Number(updated[3])===Number(total)){
      range=updated[0];changed=true;break;
     }
    }
    if(!changed)break;
    const page=Array.from(document.querySelectorAll('tr')).map(r=>columns.map(i=>r.querySelectorAll('[role=gridcell]')[i]?.innerText.trim()).filter(v=>v!==undefined)).filter(r=>r.length===9);
    if(!page.length)break;all.push(...page);complete=all.length===Number(total);
   }
   respond({state:'ready',rows:all,total:Number(total),complete});
  };
  void pages().catch(()=>respond({state:'unavailable'}));return true;
 }
 // Do not manufacture an empty list when the page is still loading.
 respond(null);
});
