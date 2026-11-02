import {AppError} from './runtime';
import {contracts,platformSession,fetchJson} from './platforms';
import {tmaxxRequest} from './tmaxx-transport';
type Report={id:number;name:string;reportParameters?:{name:string;value:unknown}[]};
// Read-only report flow observed in T-MAXX's document viewer. Never calls newSeaGoodWaybill.
export async function tmaxxDocument(owner:string,goodId:number,reportId?:number){
 const c=contracts().find(c=>c.id==='tmaxx');if(!c)throw new AppError('T-MAXX bağlantısı bulunamadı.',503);
 let session=await platformSession(c,owner);if(!Number.isSafeInteger(session.userId))session=await platformSession(c,owner,true);const headers={Authorization:'Bearer '+session.token,Cookie:session.cookie};
 const get=async(path:string)=>(await fetchJson('http://95.216.243.19:8090/api/'+path,{method:'GET',headers})).data;
 const waybill=await get('/sea/def/seaGoodWaybill/getBySeaGoodId?goodId='+goodId) as {id:number;seaGood?:{id:number};transportDirection?:string};
 if(!Number.isSafeInteger(waybill?.id)||waybill.id<=0||waybill.seaGood?.id!==goodId)throw new AppError('Bu yükün mevcut HBL belgesi doğrulanamadı.',404);
 const pages=await get('/manage/xinerji/page/searchSimple?query='+encodeURIComponent(JSON.stringify({'path/EW':'/seaGoodWaybill'}))) as {id:number}[];
 if(!Array.isArray(pages)||pages.length!==1||!Number.isSafeInteger(pages[0].id))throw new AppError('HBL rapor sayfası doğrulanamadı.',502);
 const reports=await get('/document/def/report/getReportList?'+new URLSearchParams({pageId:String(pages[0].id),transportDirection:waybill.transportDirection||'',reportType:''})) as Report[];
 if(!Array.isArray(reports)||reports.some(r=>!Number.isSafeInteger(r.id)||typeof r.name!=='string'))throw new AppError('HBL belge şablonları doğrulanamadı.',502);
 if(reportId===undefined)return {reports:reports.map(r=>({id:r.id,name:r.name})),bytes:null};
 const matches=reports.filter(r=>r.id===reportId);if(matches.length!==1)throw new AppError('HBL için platformdaki belge şablonlarından birini seçin.',422);
 const firm=await get('/manage/firmstructure/firm/getDefaultFirm') as {company?:{id:number}};
 const userId=session.userId;
 if(!Number.isSafeInteger(Number(userId))||Number(userId)<=0||!Number.isSafeInteger(firm?.company?.id))throw new AppError('T-MAXX rapor kullanıcı/firma bilgisi doğrulanamadı.',502);
 const parties=await get('/marketing/def/company/getFromAndToWhom/'+firm.company!.id+'/'+firm.company!.id) as {name:string;value:unknown}[];
 if(!Array.isArray(parties))throw new AppError('HBL rapor firma bilgisi doğrulanamadı.',502);
 const parameters=Object.fromEntries([...parties,...(matches[0].reportParameters||[])].map(p=>[p.name,p.value]));
 Object.assign(parameters,{showHtml:false,companyTypeCode:'show',entityid:waybill.id});
 const response=await tmaxxRequest('http://95.216.243.19:8090/api//document/def/report/getReport/',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({reportId,viewType:'.pdf',userId:Number(userId),parameters})});
 if(!response.ok)throw new AppError('T-MAXX HBL PDF alınamadı (HTTP '+response.status+').',502);
 const bytes=await response.arrayBuffer();if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new AppError('T-MAXX geçerli bir PDF döndürmedi.',502);
 return {reports:[],bytes};
}
