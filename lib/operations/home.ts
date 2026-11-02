import {zonedInstant,type ScheduleTask} from './schedule';
export type HomeFile={id:string;reference:string;updatedAt:string;test:boolean;closed:boolean;tasks:ScheduleTask[]};
export type HomeTask={id:string;bookingId:string;reference:string;label:string;assignee:string;date:string;time:string;zone:string;due:number|null;today:boolean;priority:'overdue'|'urgent'|'upcoming'|'dateOnly'|'unknown'};
export function dailyTasks(files:HomeFile[],now:number){
 const tasks:HomeTask[]=[];
 for(const f of files.filter(f=>!f.closed))for(const t of f.tasks.filter(t=>!['done','cancelled'].includes(t.status))){
 let due:number|null=null,today=false,priority:HomeTask['priority']='unknown';
 try{const day=new Intl.DateTimeFormat('en-CA',{timeZone:t.zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);today=t.date===day;
 if(t.date&&t.time){due=zonedInstant(t.date,t.time,t.zone);if(due<now)priority='overdue';else if(due-now<=4*3600000)priority='urgent';else if(due-now<=24*3600000)priority='upcoming';else if(!today)continue;else priority='dateOnly';}
 else if(t.date){if(t.date<day)priority='overdue';else if(today)priority='dateOnly';else continue;}
 }catch{priority='unknown';}
 tasks.push({id:t.id,bookingId:f.id,reference:f.reference,label:t.label,assignee:t.assignee||'Sorumlu atanmadı',date:t.date,time:t.time,zone:t.zone,due,today,priority});
 }
 const rank={overdue:0,urgent:1,upcoming:2,dateOnly:3,unknown:4};return tasks.sort((a,b)=>rank[a.priority]-rank[b.priority]||(a.due??Infinity)-(b.due??Infinity)||a.reference.localeCompare(b.reference,'tr'));
}
export function recentFiles(files:HomeFile[]){return [...files].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id)).slice(0,5);}
