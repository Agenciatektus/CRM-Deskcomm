import { CabecalhoDaPagina, Pagina, SecaoDaPagina } from "@/components/pagina";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InstagramRetornoClient } from "@/components/connections/InstagramRetornoClient";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
// A URL desta página carrega a `conclusao` no fragmento por alguns instantes: nenhum Referer
// pode sair dela, e o cliente limpa o fragmento antes de qualquer outra coisa.
export const metadata: Metadata = { title: "Conectar o Instagram", referrer: "no-referrer" };

export default async function InstagramRetornoPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  return (
    <Pagina>
      <CabecalhoDaPagina titulo={traduzir("Conectar o Instagram", user.idioma)} />
      <SecaoDaPagina>
        <InstagramRetornoClient />
      </SecaoDaPagina>
    </Pagina>
  );
}
