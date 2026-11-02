import {FinanceWorkspace} from '@/components/finance-workspace';
export default async function Page({params}:{params:Promise<{id:string}>}){return <FinanceWorkspace bookingId={(await params).id}/>;}
