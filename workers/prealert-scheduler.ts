type SchedulerEnv={APP:Fetcher;PREALERT_QUEUE_KEY:string;MAIL_SYNC_KEY?:string};
type Wakeup={documentId:string;enqueuedAt:number};
async function dispatch(env:SchedulerEnv,source:'cron'|'queue',wakeup?:Wakeup){
 if(!env.PREALERT_QUEUE_KEY)throw new Error('Pre-alert scheduler key is missing');
 const started=Date.now();
 const response=await env.APP.fetch('https://cbi.internal/api/internal/prealert-queue'+(wakeup?'?documentId='+encodeURIComponent(wakeup.documentId):''),{
  method:'POST',headers:{Authorization:'Bearer '+env.PREALERT_QUEUE_KEY,'X-Prealert-Dispatched-At':String(started)},
 });
 if(!response.ok)throw new Error('Pre-alert scheduler HTTP '+response.status);
 const result=await response.json() as {status:string;retryAfterSeconds?:number};
 if(!['complete','idle','waiting','review','disabled'].includes(result.status))throw new Error('Pre-alert scheduler returned an invalid status');
 console.log(JSON.stringify({event:'prealert-queue',source,status:result.status,elapsedMs:Date.now()-started,...(wakeup?{documentId:wakeup.documentId,deliveryDelayMs:Math.max(0,started-wakeup.enqueuedAt)}:{})}));
 return result;
}
/** Read-only mailbox observation; optional so the pre-alert schedule never depends on it. */
async function dispatchMail(env:SchedulerEnv){
 if(!env.MAIL_SYNC_KEY)return;
 const started=Date.now();
 const response=await env.APP.fetch('https://cbi.internal/api/internal/mail-sync',{method:'POST',headers:{Authorization:'Bearer '+env.MAIL_SYNC_KEY}});
 if(!response.ok)throw new Error('Mail sync HTTP '+response.status);
 const result=await response.json() as {status:string};
 console.log(JSON.stringify({event:'mail-sync',source:'cron',status:result.status,elapsedMs:Date.now()-started}));
 // A ready mail record is transferred in a separate request, so it gets its own subrequest budget.
 const submit=await env.APP.fetch('https://cbi.internal/api/internal/mail-submit',{method:'POST',headers:{Authorization:'Bearer '+env.MAIL_SYNC_KEY}});
 if(!submit.ok)throw new Error('Mail submit HTTP '+submit.status);
 console.log(JSON.stringify({event:'mail-submit',source:'cron',status:(await submit.json() as {status:string}).status}));
}
/** Two triggers: pre-alerts keep their 5-minute cron, the mailbox has its own 1-minute cron. */
const PREALERT_CRON='*/5 * * * *',MAIL_CRON='* * * * *';
const scheduler = {
 async scheduled(event:ScheduledController,env:SchedulerEnv){
  // Both run independently: a mailbox outage must not delay or fail pre-alert transfers.
  const [prealert,mail]=await Promise.allSettled([event?.cron!==MAIL_CRON?dispatch(env,'cron'):Promise.resolve(),event?.cron!==PREALERT_CRON?dispatchMail(env):Promise.resolve()]);
  if(prealert.status==='rejected')throw prealert.reason;
  if(mail.status==='rejected')throw mail.reason;
 },
 async queue(batch:MessageBatch<Wakeup>,env:SchedulerEnv){
  for(const message of batch.messages){
   const body=message.body;
   if(!body||typeof body.documentId!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.documentId)||!Number.isFinite(body.enqueuedAt)||body.enqueuedAt<=0){
    console.warn(JSON.stringify({event:'prealert-queue',source:'queue',status:'invalid-notification'}));message.ack();continue;
   }
   try{
    const result=await dispatch(env,'queue',body);
    if(result.status==='waiting'||result.status==='review')message.retry({delaySeconds:Math.min(1800,Math.max(30,result.retryAfterSeconds||300))});
    else message.ack();
   }catch{
    // Re-delivery only wakes the journaled outbox. It never replays a PDF write.
    console.warn(JSON.stringify({event:'prealert-queue',source:'queue',status:'dispatch-failed',documentId:body.documentId}));message.retry({delaySeconds:30});
   }
  }
 },
};
export default scheduler;
