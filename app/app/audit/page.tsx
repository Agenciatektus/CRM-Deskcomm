import { CabecalhoDaPagina, Pagina, SecaoDaPagina } from "@/components/pagina";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { ROLE_RANK } from "@/lib/auth/types";
import { AuditClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit Log" };

export default async function AuditPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const idioma = user.idioma;
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }
  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo={t("Audit Log")}
        descricao={traduzir("Histórico append-only de mutações na organização. Manager+.", idioma)}
      />
      <SecaoDaPagina>
        <AuditClient />
      </SecaoDaPagina>
    </Pagina>
  );
}
