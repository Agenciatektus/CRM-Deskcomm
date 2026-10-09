/**
 * GET /api/v1/attendants/availability/me — a chave de plantão de QUEM PERGUNTA.
 *
 * Existe para o botão "Disponível / Indisponível" do topo, que aparece em toda
 * tela. Ele lia o roster (`GET /availability`), que resolve nome e e-mail de
 * cada membro pelo admin client (`getUserById` por pessoa): custo multiplicado
 * pela equipe a cada tela aberta, e PII da equipe inteira entregue a quem só
 * queria saber o próprio estado (revisão do @Cassio_SecRev, P1).
 *
 * Aqui não há admin client nem roster: client do PRÓPRIO usuário (a RLS de
 * `attendant_availability` já é own OR manager), filtro pelo `user.id` da
 * sessão e pela org ativa resolvida por `requireRole`, nunca por parâmetro.
 * Devolve só o estado da pessoa. Sem linha (nunca configurou) = `null`, e a
 * tela trata como "não sei", sem inventar estado.
 *
 * Papel mínimo `agent`, o mesmo do roster e do PATCH: abaixo disso a pessoa
 * não entra no roteamento e a chave não significa nada.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface MinhaDisponibilidade {
  user_id: string;
  is_available: boolean;
}

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "attendant_availability" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendant_availability")
    .select("user_id, is_available")
    .eq("organization_id", org.orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const linha = data as MinhaDisponibilidade | null;
  return ok(linha ? { user_id: linha.user_id, is_available: !!linha.is_available } : null, {
    requestId,
  });
}
