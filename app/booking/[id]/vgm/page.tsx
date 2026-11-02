import { VgmWorkspace } from '@/components/vgm-workspace';
export default async function Page({params}:{params:Promise<{id:string}>}){return <VgmWorkspace bookingId={(await params).id}/>;}
