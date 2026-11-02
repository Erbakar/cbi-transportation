import type { Metadata } from "next";
import "./globals.css";
import "./workspace-polish.css";
import {WorkspacePageGuide} from "@/components/workspace-page-guide";
import { WorkspaceShell } from "@/components/workspace-shell";
import {ApplicationToaster} from '@/components/application-toaster';

export const metadata: Metadata = {
  title: "CBI Transportation | Operasyon merkezi",
  description: "Talimat yükleme, HBL ve MBL kayıt takibi.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="antialiased"><ApplicationToaster/><WorkspaceShell><WorkspacePageGuide/>{children}</WorkspaceShell>
      </body>
    </html>
  );
}
