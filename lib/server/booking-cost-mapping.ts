import {AppError} from './runtime';
import {contracts,fetchJson,platformSession} from './platforms';
import {costMappings} from '../operations/tmaxx-cost-mapping';
export async function tmaxxCostMappings(owner:string){
 // Fixed read-only definition endpoint observed in the existing T-MAXX client.
 const contract=contracts().find(c=>c.id==='tmaxx');
 if(!contract?.authVerified&&!contract?.verified)throw new AppError('T-MAXX giriş bağlantısı doğrulanmalı.',503);
 const session=await platformSession(contract!,owner);
 const response=await fetchJson('http://95.216.243.19:8090/api//finance/def/invoiceItemType/searchByOrderAndLimit?query=%7B%7D&orderBy=%22%20order%20by%20name%20asc%22&limit=10000',{method:'GET',headers:{Authorization:'Bearer '+session.token,Cookie:session.cookie}});
 if(Array.isArray(response.data)&&response.data.length>=10000)throw new AppError('Masraf tanım listesi sınırına ulaşıldı; liste eksik olabilir.',502);
 try{return {options:costMappings(response.data),checkedAt:new Date().toISOString(),targetField:'invoiceItemType'};}
 catch(e){throw new AppError((e as Error).message,502);}
}
