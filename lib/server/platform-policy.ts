import {AppError,runtime} from './runtime';
export function pausedPlatforms(){return (runtime().PAUSED_PLATFORMS||'').split(',').map(s=>s.trim()).filter(Boolean);}
export function platformEnabled(id:string){return !pausedPlatforms().includes(id);}
export function assertPlatformEnabled(id:string){if(!platformEnabled(id))throw new AppError('T-MAXX bağlantısı yeni hesap beklenirken duraklatıldı. INTTRA işlemlerine devam edebilirsiniz.',409);}
