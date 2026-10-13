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
 *
 * A marca em vigor (a da organização, ou a da instalação por baixo) é emitida
 * de novo no escopo de cada PAINEL (`ESCOPO_DO_PAINEL`): no lado a lado, o
 * painel que não tem o tema da página precisa da marca do tema DELE.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import type { AuthUser } from "@/lib/auth/types";
import { cssDaMarca, ESCOPO_DO_PAINEL } from "@/lib/branding/css";
import { marcaDaInstalacao } from "@/lib/branding/instalacao";
import { resolverMarcaDaOrganizacao } from "@/lib/branding/organizacao";
import { podeVerDesignSystem } from "@/lib/design-system/acesso";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { VitrineDoDesignSystem } from "./_componentes/VitrineDoDesignSystem";

export const metadata: Metadata = {
  title: "Design System",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/** A marca em vigor, em CSS escopado nos painéis; `null` = cor do produto. */
async function cssDaMarcaNosPaineis(user: AuthUser): Promise<string | null> {
  const org = await resolveActiveOrg(user);
  let settings: unknown = null;
  if (org) {
    // Client de SESSÃO, como settings/marca: a RLS deixa o membro ler o settings.
    const supabase = await createClient();
    const { data } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", org.orgId)
      .maybeSingle();
    settings = data?.settings ?? null;
  }
  const marca = resolverMarcaDaOrganizacao(settings, await marcaDaInstalacao(), env);
  return cssDaMarca(marca.cor, ESCOPO_DO_PAINEL).css;
}

export default async function DesignSystemPage() {
  const user = await loadAuthUser();
  if (!podeVerDesignSystem(user)) notFound();
  const css = await cssDaMarcaNosPaineis(user);
  return (
    <>
      {/* Mesmo caminho do <style> da marca no layout: `cssDaMarca` só emite
          nome e valor que passaram pela allowlist dele. */}
      {css ? <style id="marca-dos-paineis" dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <VitrineDoDesignSystem />
    </>
  );
}
