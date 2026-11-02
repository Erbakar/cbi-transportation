'use client';
import { useEffect } from 'react';

export function useUnsavedWork(pending: boolean) {
    useEffect(() => {
        if (!pending) return;
        const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        const beforeSignout = (event: Event) => {
            if (!window.confirm('Kaydedilmemiş değişiklikler veya devam eden işlemler var. Çıkış yapılsın mı?')) event.preventDefault();
        };
        window.addEventListener('beforeunload', beforeUnload);
        window.addEventListener('workspace:before-signout', beforeSignout);
        return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('workspace:before-signout', beforeSignout); };
    }, [pending]);
}
