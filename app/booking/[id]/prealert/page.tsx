import {PrealertWorkspace} from '@/components/prealert-workspace';
export default async function Page({params}:{params:Promise<{id:string}>}){return <PrealertWorkspace bookingId={(await params).id}/>;}
