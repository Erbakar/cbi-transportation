'use client';
/* Full-page links intentionally preserve native unsaved-form navigation guards. */
/* eslint-disable @next/next/no-html-link-for-pages */
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Home, FolderInput, Files, Menu, X, Ship, CalendarDays, Scale, Send } from 'lucide-react';
import { workspaceModules } from '@/lib/workspace-modules';
export function WorkspaceNavigation() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const links = [{ href: '/', title: 'Ana sayfa' }, ...workspaceModules];
  return <aside className="workspace-navigation">
    <a className="workspace-brand" href="/" aria-label="CBI Transportation ana sayfa"><Ship size={24}/><span>CBI<small>TRANSPORTATION</small></span></a>
    <button className="workspace-menu-toggle" type="button" aria-expanded={expanded} aria-controls="workspace-menu" aria-label={expanded ? 'Menüyü kapat' : 'Menüyü aç'} onClick={() => setExpanded(!expanded)}>{expanded ? <X size={20}/> : <Menu size={20}/>}</button>
    <nav id="workspace-menu" aria-label="Ana menü" className={expanded ? 'expanded' : ''}>
      <p>ÇALIŞMA ALANI</p>
      {links.map(({ href, title }, index) => {
        const Icon = index === 0 ? Home : index === 1 ? FolderInput : href === '/vgm' ? Scale : href === '/prealert' ? Send : href === '/operations' ? CalendarDays : Files;
        const operation = pathname.match(/^\/booking\/[^/]+\/(vgm|prealert)$/)?.[1];
        const active = operation ? href === '/' + operation : href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
        // Full navigation retains native beforeunload protection for unsaved form edits.
        return <a key={href} href={href} aria-current={active ? 'page' : undefined}><Icon size={18}/>{title}</a>;
      })}
    </nav>
    <small className="workspace-navigation-note">Operasyon yönetimi</small>
  </aside>;
}
