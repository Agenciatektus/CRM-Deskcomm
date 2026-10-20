import { CabecalhoDaPagina, Pagina, SecaoDaPagina } from "@/components/pagina";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { WebhooksClient, type AbaDosWebhooks } from "./_components/WebhooksClient";

const ABAS: ReadonlyArray<AbaDosWebhooks> = ["receber", "leads", "automacoes", "atividade"];

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Webhooks" };

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const canManage = !!activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  if (!canManage) redirect("/app/inbox");
  const idioma = user.idioma;
  const pedida = (await searchParams).aba;
  const abaInicial = ABAS.find((a) => a === pedida);

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Webhooks"
        descricao={traduzir(
            "Receba contatos de fora (landing pages, formulários) e crie automações que agem sozinhas.",
            idioma,
          )}
      />
      <SecaoDaPagina>
        <WebhooksClient abaInicial={abaInicial} />
      </SecaoDaPagina>
    </Pagina>
  );
}
