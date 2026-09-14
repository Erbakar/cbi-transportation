import {randomBytes,pbkdf2Sync} from 'node:crypto';
import fs from 'node:fs';
const path='.env.local';if(fs.existsSync(path)){console.log('Existing local configuration preserved.');process.exit(0)}
const password=randomBytes(18).toString('base64url'),salt=randomBytes(16).toString('hex');const hash=`100000:${salt}:${pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex')}`;
fs.writeFileSync(path,`APP_USERNAME=cbi\nAPP_PASSWORD_HASH=${hash}\nENCRYPTION_KEY=${randomBytes(32).toString('hex')}\nOPENAI_MODEL=gpt-5.4\nOPENAI_API_KEY=\nPLATFORM_CONTRACTS=[]\n`,{mode:0o600});fs.mkdirSync('.private',{recursive:true});fs.writeFileSync('.private/ilk-giris.txt',`CBI Transportation\nKullanıcı adı: cbi\nŞifre: ${password}\n\nBu dosyayı paylaşmayın. Platform şifrelerinden bağımsızdır.\n`,{mode:0o600});console.log('Local administrator configured. Credentials saved privately.');
