/** Presentation only: keep original errors in service responses and stored diagnostics. */
export function userMessage(value: unknown): string {
 const text = value instanceof Error ? value.message : typeof value === 'string' ? value : '';
 if (!text) return '';
 const rules: [RegExp,string][] = [
  [/Mongo(?:DB|Socket|Timeout)|127\.0\.0\.1:27017|connection refused/i, 'T-MAXX’in dosya arşivine bağlanılamadı. Belgeyi yeniden yüklemeden önce kayıt durumunu kontrol edin. Sorun sürerse destek ekibine başvurun.'],
  [/HTTP\s*429|too many requests|rate.?limit/i, 'Kısa sürede çok sayıda işlem yapıldı. Biraz bekleyin ve kayıt durumunu kontrol edin.'],
  [/maximum.*(?:size|bytes)|payload too large|HTTP\s*413/i, 'Dosya boyutu izin verilen sınırı aşıyor. Yükleme alanında belirtilen boyuta uygun bir dosya seçin.'],
  [/wrong_page|submit_unavailable/, 'CMA’nın VGM giriş ekranına ulaşılamadı. Gönderim tamamlanmadı. Destek ekibinin bağlantıyı kontrol etmesi gerekiyor.'],
  [/account_mismatch/, 'CMA’da açık olan hesap şirket hesabıyla eşleşmiyor. Bağlantı ayarındaki şirket hesabını kontrol edin.'],
  [/verification_required/, 'CMA ek güvenlik doğrulaması istiyor. Chrome’da CMA hesabınızı açıp doğrulamayı tamamlayın.'],
  [/login_timeout|login_required|credentials_missing|account_unavailable/, 'CMA hesabına giriş tamamlanamadı. Hesap bilgilerini ve Chrome bağlantısını kontrol edin.'],
  [/history_incomplete/, 'Kayıt listesinin tamamı alınamadı. Bir süre sonra listeyi yenileyin.'],
  [/agent_unavailable/, 'Tarayıcı bağlantısına ulaşılamadı. Chrome’un açık ve CBI bağlantı eklentisinin etkin olduğundan emin olun.'],
  [/form_changed|login_form_changed|field_disabled|wrong_origin|unexpected_login_origin/, 'CMA ekranı beklenen şekilde açılmadı. İşlem tamamlanamadı; destek ekibinin bağlantıyı güncellemesi gerekiyor.'],
  [/carrier_required_fields|carrier_validation|invalid_payload|field_mismatch|unit_mismatch|unit_missing|unexpected_container_count|shipper_owned_unsupported/, 'VGM bilgileri armatörün formuyla doğrulanamadı. Booking, konteyner, kilogram ağırlığı ve yetkili bilgilerini kontrol edin. Sorun sürerse destek ekibine başvurun.'],
  [/stale_success_page|not_prepared|invalid_mode|not_permitted|unsupported/, 'İşlem güvenli biçimde tamamlanamadı. Yeni bir gönderim başlatmadan önce mevcut kaydın durumunu kontrol edin.'],
  [/Failed to fetch|fetch failed|NetworkError|Load failed|connection_error|ECONN|ENOTFOUND|network request failed/i, 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin. Kaydetme veya gönderme yaptıysanız tekrar denemeden önce kayıt durumunu kontrol edin.'],
  [/timeout|timed out|zaman aşımı/i, 'Sistem zamanında yanıt vermedi. Kaydetme veya gönderme yaptıysanız tekrar denemeden önce kayıt durumunu kontrol edin.'],
  [/Unauthorized|oturum gerekli|session expired/i, 'Oturumunuz sona ermiş olabilir. Yeniden giriş yapın.'],
  [/Forbidden|permission denied/i, 'Bu işlem için yetkiniz bulunmuyor. Şirket yöneticinizle iletişime geçin.'],
  [/Service Unavailable|Bad Gateway|Cannot read propert|Request failed|Something went wrong|Unexpected error|Invalid response|upstream error|\[object Object\]|^\s*[45]\d\d\b|^\s*\{[\s\S]*\}\s*$/i, 'İşlem tamamlanamadı. Kayıt durumunu kontrol edin; sorun devam ederse destek ekibine başvurun.'],
  [/Unexpected token|JSON|SyntaxError|TypeError|ReferenceError|SQLITE|D1_ERROR|Internal Server Error|\bHTTP\s*[45]\d\d\b|\b[a-z]+_[a-z_]+\b|\b(?:Error|Exception):|stack trace|<\/?(?:html|body|script)|https?:\/\/|\b(?:Bearer|Authorization|password|api.?key|access.?token)\s*[:=]/i, 'İşlem tamamlanamadı. Kayıt durumunu kontrol edin; sorun devam ederse destek ekibine başvurun.'],
 ];
 for (const [pattern,message] of rules) if(pattern.test(text)) return message;
 return text;
}
