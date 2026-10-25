import type { Metadata, Viewport } from "next";

import { META_DESCRICAO, SITE } from "@/lib/conteudo";

import { Cabecalho } from "./_components/Cabecalho";
import { SimboloDefs } from "./_components/Marca";
import { Rodape } from "./_components/secoes-fim";
import "./globals.css";

const TITULO = "Verdash CRM: ninguém fica no vácuo no WhatsApp";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: TITULO, template: "%s | Verdash CRM" },
  description: META_DESCRICAO,
  alternates: { canonical: "/" },
  applicationName: SITE.nome,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: SITE.url,
    siteName: SITE.nome,
    title: TITULO,
    description:
      META_DESCRICAO,
    images: [{ url: "/_lp/og.png", width: 1200, height: 630, alt: TITULO }],
  },
  twitter: { card: "summary_large_image", title: TITULO, images: ["/_lp/og.png"] },
  robots: { index: true, follow: true },
  icons: { icon: [{ url: "/_lp/icon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  themeColor: "#0d0e11",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-bg text-text">
        <SimboloDefs />
        <a
          href="#conteudo"
          className="focus:rounded-grande sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-surface focus:px-4 focus:py-2"
        >
          Ir para o conteúdo
        </a>
        <Cabecalho />
        <main id="conteudo">{children}</main>
        <Rodape />
      </body>
    </html>
  );
}
