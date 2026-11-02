import {requireUser} from '@/lib/server/auth';
import {owned} from '@/lib/server/records';
import {AppError,db,digest,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {contracts,platformSession,fetchJson} from '@/lib/server/platforms';
import {runStep} from '@/lib/server/platform-journal';
import {tmaxxRequest} from '@/lib/server/tmaxx-transport';
type Entity={id:number;[key:string]:unknown};
type Load={goodId:number;reference:string;updates:{path:string;body:Record<string,unknown>}[]};
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 let owner='',id='',lease=0,locked=false;
 try{
 sameOrigin(req);owner=await requireUser(req);id=(await params).id;const record=await owned(id,owner);
 if(Number(req.headers.get('content-length'))>11*1024*1024)throw new AppError('Belge en fazla 10 MB olabilir.',413);
 const form=await req.formData(),file=form.get('file'),goodId=Number(form.get('goodId'));
 if(!(file instanceof File)||!file.size||file.size>10*1024*1024||!file.name.toLowerCase().endsWith('.pdf'))throw new AppError('En fazla 10 MB olan Booking Confirmation PDF belgesini seçin.',422);
 const bytes=await file.arrayBuffer();if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new AppError('Geçerli bir PDF seçin.',422);
 lease=Date.now()+15*60000;const claim=await db().prepare('UPDATE records SET lock_until=? WHERE id=? AND owner=? AND lock_until<=?').bind(lease,id,owner,Date.now()).run();if(!claim.meta.changes)throw new AppError('Kayıt işleniyor.',409);locked=true;
 const delivery=await db().prepare("SELECT payload FROM deliveries WHERE record_id=? AND platform='tmaxx'").bind(id).first<{payload:string}>();if(!delivery?.payload)throw new AppError('Önce T-MAXX yükünü eşleştirin.',409);
 const stored=JSON.parse(delivery.payload),loads:Load[]=stored.loads||[stored];const load=loads.find(l=>l.goodId===goodId);if(!load||!Number.isSafeInteger(goodId))throw new AppError('Yük eşleşmesi doğrulanamadı.',422);
 const session=await platformSession(contracts().find(c=>c.id==='tmaxx')!,owner);const headers={Authorization:'Bearer '+session.token,Cookie:session.cookie};
 const get=async(path:string)=>(await fetchJson('http://95.216.243.19:8090/api/'+path,{method:'GET',headers})).data;
 const good=await get('/sea/seaGood/'+goodId) as Entity;if(good.id!==goodId||good.isLocked)throw new AppError('T-MAXX yükü doğrulanamadı veya kilitli.',409);
 const docs=await get('/document/doc/findByEntityId?entityid='+goodId) as Entity[];
 const types=await get('/document/def/docType/searchByOrder?query=%7B%7D&orderBy=%22order%20by%20id%22') as Entity[];const matches=types.filter(t=>t.code==='BCM'&&t.isActive!==false);if(matches.length!==1)throw new AppError('BCM belge türü tekil olarak bulunamadı.',409);
 const existing=docs.filter(d=>(d.type as Entity)?.id===matches[0].id&&d.reference);if(existing.length)return json({message:'Bu yükte BCM belgesi zaten mevcut; tekrar yüklenmedi.',goodId});
 const page=await get('/manage/xinerji/page/getByContext?context=seaGood') as Entity;
 const template=await get('/document/doc/new') as Entity;
 if(!page.id||template.id||!session.userId)throw new AppError('Belge arşiv bilgileri doğrulanamadı.',502);
 const entity={...template,entityid:goodId,sourceType:'SeaGood',page:{id:page.id},type:{id:matches[0].id},user:{id:session.userId},fileName:file.name,contentType:'application/pdf',fileSize:file.size,description:'Booking Confirmation · '+load.reference};
 const hash=await digest(Array.from(new Uint8Array(bytes)).join(','));const run={id,owner,revision:record.revision};
 const upload=await runStep(run,'tmaxx','bcm-upload:'+goodId+':'+hash,{goodId,hash},async()=>{
 const multipart=new FormData();multipart.append('file',new Blob([bytes],{type:'application/pdf'}),file.name);multipart.append('entity',JSON.stringify(entity));
 const encoded=new Request('http://localhost',{method:'POST',body:multipart});
 const response=await tmaxxRequest('http://95.216.243.19:8090/api/uploader/upload',{method:'POST',headers:{...headers,'Content-Type':encoded.headers.get('content-type')!},body:await encoded.arrayBuffer()});
 if(!response.ok)throw new AppError('T-MAXX belge yüklemesi doğrulanamadı. Tekrar yüklemeden arşivi kontrol edin.',502);
 const data=await response.json() as {res?:{uid?:string}};if(!data.res?.uid)throw new AppError('T-MAXX belge dosya kimliği doğrulanamadı.',502);return {reference:String(data.res.uid)};
 });
 const saved=await runStep(run,'tmaxx','bcm-link:'+goodId+':'+hash,{...entity,reference:upload.reference},async()=>{
 const response=await fetchJson('http://95.216.243.19:8090/api//document/doc',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({...entity,reference:upload.reference})});const result=response.data as Entity;if(!result.id||result.entityid!==goodId||result.reference!==upload.reference)throw new AppError('BCM arşiv bağlantısı doğrulanamadı.',502);return {id:result.id};
 });
 const verified=await get('/document/doc/'+saved.id) as Entity;if(verified.entityid!==goodId||(verified.type as Entity)?.id!==matches[0].id||verified.reference!==upload.reference)throw new AppError('Belgenin doğru yüke bağlandığı doğrulanamadı.',409);
 return json({message:'Booking Confirmation T-MAXX yükünün dijital arşivine bağlandı. Mevcut değerleri yenileyip kaydı tamamlayabilirsiniz.',goodId,documentId:saved.id});
 }catch(e){return errorResponse(e instanceof AppError?e:new AppError('T-MAXX belge servisine ulaşılamadı veya yanıtı doğrulanamadı. Aynı belgeyi tekrar yüklemeyin; önce T-MAXX dijital arşivindeki mevcut dosyayı kontrol edin.',503));}finally{if(locked)await db().prepare('UPDATE records SET lock_until=0 WHERE id=? AND owner=? AND lock_until=?').bind(id,owner,lease).run();}
}
