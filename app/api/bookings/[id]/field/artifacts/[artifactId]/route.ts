import { requireUser } from '@/lib/server/auth';
import { errorResponse } from '@/lib/server/runtime';
import { fieldArtifact } from '@/lib/server/field-operation';
export async function GET(req:Request,ctx:{params:Promise<{id:string;artifactId:string}>}){try{
 const {id,artifactId}=await ctx.params,a=await fieldArtifact(id,await requireUser(req),artifactId);
 return new Response(a.output.subject+'\n\n'+a.output.body+'\n\nArşiv zamanı: '+a.createdAt,{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="CBI-'+a.output.kind+'-'+artifactId+'.txt"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return errorResponse(e);}}
