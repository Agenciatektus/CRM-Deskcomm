import { CabecalhoDaPagina, Pagina, SecaoDaPagina } from "@/components/pagina";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { ApiTokensClient } from "./_components/ApiTokensClient";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export default async function ApiTokensPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const idioma = user.idioma;

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="API Tokens"
        descricao={<>{traduzir("Tokens server-to-server. Plaintext exibido", idioma)}{" "}
          <strong>{traduzir("uma única vez", idioma)}</strong>{" "}
          {traduzir("na criação.", idioma)}</>}
      />
      <SecaoDaPagina>
        <ApiTokensClient />
      </SecaoDaPagina>
    </Pagina>
  );
}
