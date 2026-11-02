import {bookingTmaxxLink,documentTarget,syncBookingDocument} from '@/lib/server/booking-tmaxx';
import { requireUser } from '@/lib/server/auth';
import { errorResponse, json, sameOrigin } from '@/lib/server/runtime';
import { addDocument, documentForm, listDocuments, ownBooking } from '@/lib/server/operation-documents';
type Context = {
    params: Promise<{
        id: string;
    }>;
};
export async function GET(req: Request, { params }: Context) { try {
    const owner = await requireUser(req);
    return json({ documents: await listDocuments((await params).id, owner) });
}
catch (e) {
    return errorResponse(e);
} }
export async function POST(req: Request, { params }: Context) { try {
    sameOrigin(req);
    const owner = await requireUser(req), { id } = await params;
    await ownBooking(id, owner);
    const form=await documentForm(req),link=await bookingTmaxxLink(id,owner),typeId=Number(form.get('tmaxxTypeId'));
    if(link)await documentTarget(id,owner,typeId);
    const result = await addDocument(id, owner, form);
    if(link){
        try{return json({...result,tmaxx:await syncBookingDocument(id,owner,result.documentId,typeId)},result.duplicate?200:201);}
        catch(e){return json({...result,tmaxx:{status:'pending',message:e instanceof Error?e.message:'T-MAXX kaydı doğrulanamadı.'}},202);}
    }
    return json({...result,tmaxx:{status:'unlinked'}}, result.duplicate ? 200 : 201);
}
catch (e) {
    return errorResponse(e);
} }
