import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CBI Transportation | Konşimentolar",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
