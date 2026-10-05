/**
 * GET /api/v1/webhook-sources/[id]/events — feed de recebimentos da fonte
 * (últimos 20), pra UI mostrar "chegou / não chegou" em tempo quase real
 * depois do botão "Enviar lead de teste".
 *
 * Devolve os NOMES dos campos recebidos, nunca os valores (9035): o payload é
 * dado pessoal de quem preencheu o formulário, e nenhuma sessão lê mais
 * `payload_parsed`/`raw_body`/`headers` direto da tabela. A leitura é do service
 * role, depois de `requireRole("manager")` e da fonte conferida na organização
 * ativa, e filtra `organization_id` — o grant por coluna não alcança o service
 * role, então o filtro é o isolamento.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { chavesDo } from "@/lib/operacao/entradas-automaticas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "webhook_sources" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org: activeOrg } = authz;

  const supabase = await createClient();
  const { data: source, error: sourceErr } = await supabase
    .from("webhook_sources")
    .select("path_token")
    .eq("id", id)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (sourceErr) return fail("internal_error", sourceErr.message, 500, { requestId });
  if (!source) return fail("not_found", t("Fonte não encontrada."), 404, { requestId });

  const { data, error } = await createAdminClient()
    .from("webhook_events_log")
    .select("id, received_at, valid_signature, payload_parsed, status")
    .eq("organization_id", activeOrg.orgId)
    .eq("webhook_path_token", source.path_token)
    .order("received_at", { ascending: false })
    .limit(20);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const eventos = ((data ?? []) as Array<Record<string, unknown>>).map((e) => ({
    id: e.id as string,
    created_at: e.received_at as string,
    valid_signature: (e.valid_signature as boolean | null) ?? null,
    status: e.status as string,
    campos_recebidos: chavesDo(e.payload_parsed),
  }));
  return ok(eventos, { requestId });
}
