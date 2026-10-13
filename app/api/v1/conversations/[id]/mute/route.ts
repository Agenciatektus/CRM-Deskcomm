/**
 * POST   /api/v1/conversations/[id]/mute — silencia os avisos de mensagem nova
 *        desta conversa PARA QUEM PEDE. Corpo: `{ "duracao": "8h" | "1w" | "sempre" }`.
 * DELETE /api/v1/conversations/[id]/mute — reativa o som.
 *
 * Por atendente (migration 9042). O instante sai do relógio do SERVIDOR; o
 * corpo só escolhe a duração. "sempre" grava `'infinity'`.
 */
import { type NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { silenciarSchema, silencioAte } from "@/lib/inbox/estado-por-atendente";
import { concluirRotaDoEstado, prepararRotaDoEstado } from "@/lib/inbox/rota-do-estado";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const p = await prepararRotaDoEstado(params);
  if (!p.ok) return p.response;

  const parsed = silenciarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", p.t("Dados inválidos."), 422, {
      requestId: p.requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  return concluirRotaDoEstado(p, "conversation.muted", {
    mudanca: { muted_until: silencioAte(parsed.data.duracao, Date.now()) },
  });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const p = await prepararRotaDoEstado(params, { desfazer: true });
  if (!p.ok) return p.response;
  return concluirRotaDoEstado(p, "conversation.unmuted", { limpar: "muted_until" });
}
