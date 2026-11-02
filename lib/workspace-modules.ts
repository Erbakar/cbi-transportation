/** Shared by the home screen and navigation; only implemented modules belong here. */
export const workspaceModules = [
  { href: '/booking', title: 'Booking devri', description: 'Satıştan operasyona devirleri hazırlayın. Belgeleri ekleyin, doldurulan bilgileri kontrol edin.' },
  { href: '/bills', title: 'Konşimentolar', description: 'Mevcut konşimentolarınıza ulaşın. Talimat, HBL ve MBL işlemlerini ve platform aktarımlarını takip edin.' },
  { href: '/vgm', title: 'VGM', description: 'Booking numarası, konteyner, ağırlık ve yetkili bilgileriyle VGM oluşturun.' },
  { href: '/prealert', title: 'Pre-alert', description: 'Pozisyonu seçin, Pre-alert PDF belgesini T-MAXX dijital arşivine kaydedin.' },
  { href: '/operations', title: 'Operasyon takvimi', description: 'Son teslim tarihlerini, görev sorumlularını ve yaklaşan işleri takip edin.' },
] as const;
