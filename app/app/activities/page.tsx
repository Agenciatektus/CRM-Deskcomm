import type { Metadata } from "next";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { requireAuth } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";

import { ActivityReportClient } from "./_components/ActivityReportClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Atividades" };

export default async function ActivitiesReportPage() {
  const user = await requireAuth();
  // `t` local e não o hook: componente de SERVIDOR — o idioma já vem resolvido
  // pela cadeia pessoa → organização → padrão em `lib/auth/server.ts`.
  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo={t("Atividades")}
        descricao={t("O que aconteceu na operação no período — e quanto disso foi a equipe.")}
      />

      <ActivityReportClient />
    </Pagina>
  );
}
