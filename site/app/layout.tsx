import type { Metadata } from "next";

import "./globals.css";

/**
 * `noindex` enquanto a LP não vai ao ar: o esqueleto não pode ser indexado nem
 * por engano. A Fase 8 do plano troca isto por metadata de produção (canonical,
 * Open Graph, robots e sitemap) no mesmo PR que liga o roteamento.
 */
export const metadata: Metadata = {
  title: "CRM Tektus",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
