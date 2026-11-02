import {DocumentLifecycleWorkspace} from '@/components/document-lifecycle-workspace';
export default async function Page({params}:{params:Promise<{id:string}>}){return <DocumentLifecycleWorkspace bookingId={(await params).id}/>;}
