/**
 * POST   /api/v1/conversations/[id]/mark-unread — marca a conversa como não lida
 *        PARA QUEM PEDE (o "ponto" do WhatsApp).
 * DELETE /api/v1/conversations/[id]/mark-unread — desfaz a marca.
 *
 * Por atendente (migration 9042). Abrir a conversa também desfaz: o
 * `POST /mark-read` limpa a marca de quem leu, e para quem não pode zerar o
 * contador (viewer) a tela chama este DELETE.
 */
import { type NextRequest } from "next/server";

import { requireSupportWrite } from "@/lib/impersonate/support";
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
  return concluirRotaDoEstado(p, "conversation.marked_unread", {
    mudanca: { marked_unread_at: new Date().toISOString() },
  });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const p = await prepararRotaDoEstado(params, { desfazer: true });
  if (!p.ok) return p.response;
  return concluirRotaDoEstado(p, "conversation.unmarked_unread", { limpar: "marked_unread_at" });
}
