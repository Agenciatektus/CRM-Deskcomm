import { CabecalhoDaPagina, Pagina, SecaoDaPagina } from "@/components/pagina";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
// A mesma lista da aba Webhooks › Automações: um componente, duas portas.
import { RulesTab } from "@/app/app/webhooks/_components/RulesTab";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Automações" };

export default async function AutomacoesPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  // A mesma régua da tela Webhooks: só gerente ou administrador monta automação.
  const canManage = !!activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  if (!canManage) redirect("/app/inbox");

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Automações"
        descricao={traduzir(
          "Regras que agem sozinhas quando algo acontece no CRM: lead que muda de etapa, tag, mensagem, tempo parado.",
          user.idioma,
        )}
      />
      <SecaoDaPagina>
        <RulesTab />
      </SecaoDaPagina>
    </Pagina>
  );
}
