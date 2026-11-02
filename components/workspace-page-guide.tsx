'use client';
/* Full navigation preserves existing unsaved-work guards. */
import {usePathname} from 'next/navigation';
const steps=[['','Dosya'],['vgm','VGM'],['documents','Belgeler'],['control','Veri kontrolü'],['prealert','Pre-alert'],['field','Saha'],['finance','Finans']] as const;
const guidance:Record<string,[string,string]>={
 '/':['Operasyon merkezi','Son 30 günlük platform belgelerini inceleyin; bağlantı durumlarını ve belge kaynaklarını kontrol edin.'],
 '/booking':['Booking devri','Gerçek platform belgelerine ulaşın veya yeni devir oluşturun. Test dosyaları isteğe bağlı gösterilir.'],
 '/booking/new':['Yeni booking devri','Devir bilgilerini ve kaynak belgeleri hazırlayın. Platforma aktarım durumunu ayrıca kontrol edin.'],
 '/booking/inbox':['Gelen belgeler','Belgeyi yükleyin, eşleşen booking kaydını kontrol edin ve T-MAXX arşiv aktarımını takip edin.'],
 '/bills':['Konşimentolar','Mevcut talimatları ve HBL / MBL sonuçlarını takip edin. Yeni işlem için konşimento oluşturma ekranını açın.'],
 '/bills/new':['Yeni konşimento','Talimatı yükleyin; okunan alanları kontrol ederek ilgili platforma gönderim adımına ilerleyin.'],
 '/operations':['Operasyon takvimi','Son 30 günlük platform hareketlerini, T-MAXX teslim tarihlerini ve görev planını ayrı görünümlerden takip edin.'],
};
const descriptions:Record<string,string>={
 '':'Devir bilgileri, platform eşleşmesi ve dosyanın işlem durumunu tek yerde takip edin.',
 vgm:'Ağırlık, konteyner ve kaynak belgeyi kontrol edin. Yerel hazırlık, armatörün VGM kabulü değildir.',
 documents:'Belge sürümlerini ve onay durumlarını yönetin; HBL onay belgesinin arşiv aktarımını takip edin.',
 control:'Kaynak belgeler ve platform verileri arasındaki farkları inceleyin; gönderimden önce alanları doğrulayın.',
 prealert:'Final belgeleri hazırlayın ve pre-alert PDF dosyasını T-MAXX dijital arşivine aktarın. Aktarım sonucunu kontrol edin.',
 field:'Konteyner ve saha kayıtlarını inceleyin. T-MAXX verileri ile yerel operasyon kayıtlarının kaynağı ayrı belirtilir.',
 finance:'Mevcut finans kayıtlarını inceleyin. Yerel kayıtlar ve T-MAXX tutarları ayrı gösterilir.',
};
export function WorkspacePageGuide(){const path=usePathname()||'/';const match=path.match(/^\/booking\/([0-9a-f-]{36})(?:\/(vgm|documents|control|prealert|field|finance))?$/i);const info=guidance[path];if(!match&&!info)return null;return <aside className="workspace-page-guide" aria-label="Sayfa rehberi"><div><span className="guide-mark" aria-hidden="true"/ ><div><strong>{match?'Booking çalışma alanı':info[0]}</strong><p>{match?descriptions[match[2]||'']:info[1]}</p></div></div>{match&&<nav aria-label="Booking dosyası bölümleri">{steps.map(([suffix,label])=><a key={suffix} href={'/booking/'+match[1]+(suffix?'/'+suffix:'')} aria-current={(match[2]||'')===suffix?'page':undefined}>{label}</a>)}</nav>}</aside>;}
