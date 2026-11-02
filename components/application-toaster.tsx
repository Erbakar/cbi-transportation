'use client';
import type {CSSProperties} from 'react';
import {Toaster} from 'sonner';
import {CircleCheck,Info,TriangleAlert,CircleX} from 'lucide-react';
import './application-toaster.css';
export function ApplicationToaster(){
 return <Toaster style={{'--width':'420px'} as CSSProperties} theme="light" position="top-right" richColors closeButton expand visibleToasts={3} offset={{top:76,right:24}} mobileOffset={{top:16,right:16,left:16}} containerAriaLabel="İşlem bildirimleri" toastOptions={{closeButtonAriaLabel:'Bildirimi kapat',className:'operation-toast'}} icons={{success:<CircleCheck size={21}/>,error:<CircleX size={21}/>,warning:<TriangleAlert size={21}/>,info:<Info size={21}/>}}/>;
}
