type SchedulerEnv={APP:Fetcher;PREALERT_QUEUE_KEY:string};
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
const scheduler = {
 async scheduled(_event:ScheduledController,env:SchedulerEnv){
  await dispatch(env,'cron');
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
