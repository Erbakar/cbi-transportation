import fs from 'node:fs';import path from 'node:path';import {randomBytes,generateKeyPairSync,createHash} from 'node:crypto';import {parseEnv} from 'node:util';
const root=path.resolve('.'),dir=path.join(root,'.private/cma-browser');fs.mkdirSync(dir,{recursive:true,mode:0o700});
const file=path.join(dir,'config.json');
let config;
if(fs.existsSync(file))config=JSON.parse(fs.readFileSync(file,'utf8'));
else{const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const key=publicKey.export({type:'spki',format:'der'});const extensionId=[...createHash('sha256').update(key).digest('hex').slice(0,32)].map(c=>String.fromCharCode(97+parseInt(c,16))).join('');config={key:randomBytes(32).toString('hex'),publicKey:key.toString('base64'),extensionId};fs.writeFileSync(file,JSON.stringify(config),{mode:0o600});}
const extension=path.join(dir,'extension');fs.mkdirSync(extension,{recursive:true,mode:0o700});
for(const name of ['worker.js','reader.js','automation.js','cloud.js'])fs.copyFileSync(path.join(root,'browser/cma-bridge',name),path.join(extension,name));
const manifest=JSON.parse(fs.readFileSync('browser/cma-bridge/manifest.json','utf8'));manifest.key=config.publicKey;fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(extension,'config.js'),'export const KEY='+JSON.stringify(config.key)+';\n',{mode:0o600});
const envFile=path.join(root,'.env.local'),env=fs.readFileSync(envFile,'utf8'),parsed=parseEnv(env);
if(!parsed.APP_USERNAME)throw Error('Local owner is missing');
if(!fs.existsSync(path.join(dir,'env-before-bridge')))fs.writeFileSync(path.join(dir,'env-before-bridge'),env,{mode:0o600,flag:'wx'});
let updated=env;for(const [key,value] of Object.entries({CMA_BROWSER_KEY:config.key,CMA_BROWSER_OWNER:parsed.APP_USERNAME})){const line=key+'='+JSON.stringify(value);updated=new RegExp('^'+key+'=.*$','m').test(updated)?updated.replace(new RegExp('^'+key+'=.*$','m'),line):updated+'\n'+line+'\n';}fs.writeFileSync(envFile,updated,{mode:0o600});
console.log('Local extension prepared: '+extension);console.log('Extension ID: '+config.extensionId);
