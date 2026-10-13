/**
 * GET /api/v1/pipelines/opcoes — os funis vivos da organização com as etapas vivas,
 * só id e nome: as opções dos filtros Funil e Etapa da Inbox (migration 9051).
 *
 * Existe porque `GET /api/v1/pipelines` exige `manager`, e quem filtra a Inbox é
 * quase sempre `agent`. Client do usuário: a RLS de crm_pipelines/crm_stages vale.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Linha {
  id: string;
  name: string;
  etapas: { id: string; name: string; position: number; is_archived: boolean }[] | null;
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "pipelines" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_pipelines")
    .select("id, name, etapas:crm_stages!crm_stages_pipeline_id_fkey(id, name, position, is_archived)")
    .eq("organization_id", authz.org.orgId)
    .eq("is_archived", false)
    .order("position", { ascending: true });
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const funis = ((data ?? []) as unknown as Linha[]).map((f) => ({
    id: f.id,
    name: f.name,
    etapas: (f.etapas ?? [])
      .filter((e) => !e.is_archived)
      .sort((a, b) => a.position - b.position)
      .map((e) => ({ id: e.id, name: e.name })),
  }));
  return ok({ funis }, { requestId });
}
