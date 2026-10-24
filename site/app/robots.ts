import type { MetadataRoute } from "next";

import { SITE } from "@/lib/conteudo";

/**
 * Este `robots.txt` vale para o host inteiro (`crm.verdash.com.br`), que também
 * serve o sistema. O que é do sistema fica fora; a LP fica aberta, inclusive aos
 * rastreadores de IA, que é por onde a página é citada em respostas.
 */
const DO_SISTEMA = [
  "/app",
  "/api/",
  "/admin",
  "/auth/",
  "/login",
  "/onboarding",
  "/cobranca",
  "/vitrine-agenda",
];

const ROBOS_DE_IA = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DO_SISTEMA },
      { userAgent: ROBOS_DE_IA, allow: "/", disallow: DO_SISTEMA },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
