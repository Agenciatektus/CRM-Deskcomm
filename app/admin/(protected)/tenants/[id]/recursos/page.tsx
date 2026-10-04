import { notFound } from "next/navigation";

import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { modulosLigados } from "@/lib/instalacao/modulos";
import { lerLiberacoes } from "@/lib/organizacao/modulos-liberados";
import { createAdminClient } from "@/lib/supabase/admin";
import { FormularioDeLiberacao } from "./_form";

export const dynamic = "force-dynamic";

/**
 * Os módulos que o dono do servidor libera para ESTA empresa (migration 9026).
 * O layout de `/admin/(protected)` já exige platform admin; repetir aqui custa
 * uma leitura em cache e não deixa a página depender de onde foi montada.
 */
export default async function RecursosDoTenantPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const db = createAdminClient();

  const { data: org } = await db.from("organizations").select("id").eq("id", id).maybeSingle();
  if (!org) notFound();

  const [daInstalacao, liberados] = await Promise.all([modulosLigados(db), lerLiberacoes(db, id)]);

  return (
    <FormularioDeLiberacao
      organizationId={id}
      liberados={liberados ?? []}
      leituraFalhou={liberados === null}
      daInstalacao={daInstalacao}
    />
  );
}
