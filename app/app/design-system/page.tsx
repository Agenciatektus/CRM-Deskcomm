/**
 * /app/design-system — a vitrine do design system (Etapa 1, "foundation-first").
 *
 * Mostra os componentes REAIS do CRM (`components/ui` e os compartilhados da
 * Inbox) nos dois temas, com o que difere do protótipo da Inbox v2 marcado a
 * partir de `lib/design-system/mapa.ts`. Não muda nenhuma tela.
 *
 * Sem entrada no menu (ver NAV_ALLOWLIST em tests/unit/navegacao-completude),
 * `noindex`, e só para o dono do servidor: `podeVerDesignSystem` explica por que
 * é esse o corte. `notFound()`, como em `settings/atualizacao`: para quem não é
 * dono, esta página não faz parte do produto.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadAuthUser } from "@/lib/auth/server";
import { podeVerDesignSystem } from "@/lib/design-system/acesso";

import { VitrineDoDesignSystem } from "./_componentes/VitrineDoDesignSystem";

export const metadata: Metadata = {
  title: "Design System",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function DesignSystemPage() {
  const user = await loadAuthUser();
  if (!podeVerDesignSystem(user)) notFound();
  return <VitrineDoDesignSystem />;
}
