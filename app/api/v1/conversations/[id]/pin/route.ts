/**
 * POST   /api/v1/conversations/[id]/pin — fixa a conversa no topo da lista DE QUEM PEDE.
 * DELETE /api/v1/conversations/[id]/pin — desafixa.
 *
 * Por atendente (migration 9042): cada pessoa fixa só para si. Viewer pode;
 * suporte somente leitura não. Teto de `TETO_DE_FIXADAS` por organização: a
 * lista traz as fixadas fora da paginação, e o teto é o que a mantém curta.
 */
import { type NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { TETO_DE_FIXADAS } from "@/lib/inbox/estado-por-atendente";
import { contarFixadas } from "@/lib/inbox/estado-por-atendente.servidor";
import { concluirRotaDoEstado, prepararRotaDoEstado } from "@/lib/inbox/rota-do-estado";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const p = await prepararRotaDoEstado(params);
  if (!p.ok) return p.response;

  const jaFixadas = await contarFixadas(p.supabase, p.alvo.orgId, p.alvo.userId, p.alvo.conversationId);
  if (jaFixadas >= TETO_DE_FIXADAS) {
    return fail(
      "conflict",
      `${p.t("Você já fixou o máximo de conversas:")} ${TETO_DE_FIXADAS}.`,
      409,
      { requestId: p.requestId },
    );
  }
  return concluirRotaDoEstado(p, "conversation.pinned", { mudanca: { pinned_at: new Date().toISOString() } });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const p = await prepararRotaDoEstado(params, { desfazer: true });
  if (!p.ok) return p.response;
  return concluirRotaDoEstado(p, "conversation.unpinned", { limpar: "pinned_at" });
}
