import {env} from 'cloudflare:workers';
export type Runtime={DB:D1Database;BUCKET:R2Bucket;APP_USERNAME?:string;APP_PASSWORD_HASH?:string;ENCRYPTION_KEY?:string;GEMINI_API_KEY?:string;GEMINI_MODEL?:string;PLATFORM_CONTRACTS?:string;TRUSTED_PARTIES?:string};
export function runtime(){return env as unknown as Runtime;}
export function db(){const d=runtime().DB;if(!d)throw new AppError('Kayıt deposu henüz yapılandırılmadı.',503);return d;}
export class AppError extends Error{constructor(message:string,public status=400){super(message)}}
export function errorResponse(e:unknown){return Response.json({error:e instanceof AppError?e.message:'İşlem tamamlanamadı. Lütfen yeniden deneyin.'},{status:e instanceof AppError?e.status:500,headers:{'Cache-Control':'no-store'}})}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin)throw new AppError('Geçersiz istek kaynağı.',403)}
export async function digest(data:ArrayBuffer|string){const bytes=typeof data==='string'?new TextEncoder().encode(data):data;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('')}
export function randomToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join('')}
