import {cmaAgentOwner,runCmaAgent} from '@/lib/server/cma-vgm-jobs';
import {boundedJSON} from '@/lib/server/bounded-json';
import {errorResponse,json} from '@/lib/server/runtime';
export async function POST(req:Request){try{const owner=await cmaAgentOwner(req);return json(await runCmaAgent(owner,await boundedJSON(req,2000000)));}catch(e){return errorResponse(e);}}
