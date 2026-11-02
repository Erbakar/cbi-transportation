import {BillControlWorkspace} from '@/components/bill-control-workspace';
export default async function Page({params}:{params:Promise<{id:string}>}){return <BillControlWorkspace bookingId={(await params).id}/>;}
