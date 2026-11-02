"use client";
import {OperationToast} from '@/components/operation-toast';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Loader2, LockKeyhole, LogOut, Ship } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { SessionContext, type WorkspaceUser as User } from '@/components/workspace-session';
import {clearDisplayCache} from '@/lib/workspace-cache';
import {notify} from '@/lib/notify';
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<User | null>(null), [loaded, setLoaded] = useState(false), [configured, setConfigured] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false), [loginError, setLoginError] = useState(''), [logoutError, setLogoutError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/session', { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error('Oturum kontrol edilemedi.');
      const data = await r.json() as { user: User | null; configured: boolean }; if (!data.user) clearDisplayCache(); setSession(data.user); setConfigured(data.configured);
    }).catch(e => { if (!controller.signal.aborted) setLoginError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => controller.abort();
  }, []);
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoginBusy(true); setLoginError('');
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
      const data = await response.json() as { user: User; error?: string }; if (!response.ok) throw new Error(data.error || 'Giriş yapılamadı.');
      clearDisplayCache(); notify.dismiss(); setSession(data.user); setLogoutError('');
    } catch(e) { setLoginError((e as Error).message); } finally { setLoginBusy(false); }
  }
  async function logout() {
    if (!window.dispatchEvent(new Event('workspace:before-signout', { cancelable: true }))) return;
    setLoginBusy(true); setLogoutError('');
    try {
      const response = await fetch('/api/session', { method: 'DELETE' });
      if (!response.ok) throw new Error('Çıkış yapılamadı. Yeniden deneyin.');
      clearDisplayCache(); notify.dismiss(); setSession(null);
    } catch(e) { setLogoutError((e as Error).message); } finally { setLoginBusy(false); }
  }
  if (!loaded) return <div className="boot" role="status"><Loader2 className="spin"/> Çalışma alanı açılıyor</div>;
  if (!session) return (
        <main className="login">
          <section className="login-brand">
            <div>
              <div className="login-wordmark"><Ship size={27}/><span>CBI<small>TRANSPORTATION</small></span></div>
              <span className="eyebrow">OPERASYON YÖNETİMİ</span>
              <h1>
                Operasyonlarınız,
                <br />
                tek çalışma alanında.
              </h1>
              <p>
                Booking devirlerinizi ve konşimentolarınızı
                <br />
                tek çalışma alanından takip edin.
              </p>
              <div className="route-labels">
                <span>HBL / T-MAXX</span>
                <span>MBL / INTTRA</span>
              </div>
            </div>
            <small>CBI Transportation</small>
          </section>
          <section className="login-form">
            <div className="lock">
              <LockKeyhole />
            </div>
            <h2>Çalışma alanına giriş</h2>
            <p>Devam etmek için hesabınızla oturum açın.</p>
            {!configured && <div className="notice">İlk kurulum bekleniyor. Yönetici giriş bilgileri henüz tanımlanmadı.</div>}
            <form onSubmit={login}>
              <label htmlFor="username">Kullanıcı adı</label>
              <Input id="username" name="username" autoComplete="username" required placeholder="Kullanıcı adınız" />
              <label htmlFor="password">Şifre</label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required placeholder="Şifreniz" />
              {loginError && (
                <OperationToast tone="error" message={loginError}/>
              )}
              <Button className="primary login-submit" type="submit" disabled={loginBusy || !configured}>
                {loginBusy ? <Loader2 className="spin" /> : null}Giriş yap <ArrowUpRight size={18} />
              </Button>
            </form>
            <p className="login-note">
              <LockKeyhole size={14} /> Belgeleriniz yalnızca yetkili hesabınızdan erişilebilir.
            </p>
          </section>
        </main>
  );
  return <SessionContext.Provider value={session}><WorkspaceNavigation/><div className="workspace-content">
    <header className="workspace-accountbar" aria-label="Hesap işlemleri"><span className="workspace-context">CBI Transportation <span>/</span> Çalışma alanı</span><div className="account"><span className="account-avatar" aria-hidden="true">{session.username.slice(0,1).toUpperCase()}</span><span>{session.username}</span><Button variant="ghost" aria-label="Çıkış yap" disabled={loginBusy} onClick={logout}><LogOut size={17}/></Button></div></header>
    {logoutError && <OperationToast tone="error" message={logoutError}/>}{children}
  </div></SessionContext.Provider>;
}
