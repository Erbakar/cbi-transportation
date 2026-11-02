import { FieldWorkspace } from '@/components/field-workspace';
export default async function Page({params}:{params:Promise<{id:string}>}){return <FieldWorkspace bookingId={(await params).id}/>;}
