import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/cadencias/:id/inscrever — inscreve negócios do funil na cadência (manager+).
 *
 * Duas chamadas, e a primeira é OBRIGATÓRIA:
 *   1. `{ lead_ids, dry_run: true }` → quantos entram hoje, quantos não e por quê;
 *   2. `{ lead_ids, confirm_count: N }` → inscreve, mas SÓ se a avaliação refeita
 *      agora ainda der N. Se mudou (alguém saiu, o teto do dia andou), 409: o
 *      gestor confirma o que viu, não o que o servidor decidiu depois.
 *
 * Cada `lead_id` é relido com a organização da SESSÃO (`avaliarNegocio`): id de
 * outro tenant vira "fora do funil", o mesmo motivo de um id que não existe.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  avaliarNegocio,
  carregarCadenciaParaInscricao,
  inscreverNegocio,
  reservarInscricoes,
  vagasDeHoje,
  type MotivoDeRecusa,
} from "@/lib/cadencia/inscrever";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const corpoSchema = z
  .strictObject({
    lead_ids: z.array(z.string().uuid()).min(1).max(500),
    dry_run: z.boolean().optional(),
    confirm_count: z.number().int().min(0).optional(),
  })
  .refine((c) => c.dry_run === true || c.confirm_count !== undefined, {
    message: "Faça a prévia (dry_run) e confirme com confirm_count.",
    path: ["confirm_count"],
  });

/** Avalia em lotes pequenos: 500 negócios em série seriam lentos; todos juntos, uma rajada no banco. */
async function avaliarTodos<T, R>(itens: T[], tamanho: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
  }
  return saida;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("manager", { requestId, resource: "cadencias" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = corpoSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const leadIds = [...new Set(parsed.data.lead_ids)];

  const admin = createAdminClient();
  const carregada = await carregarCadenciaParaInscricao(admin, orgId, id);
  if ("motivo" in carregada) {
    return fail(
      carregada.motivo,
      carregada.motivo === "numero_desconectado"
        ? t("O número da cadência está desconectado. Reconecte antes de inscrever.")
        : t("A cadência precisa estar publicada para receber inscrições."),
      422,
      { requestId },
    );
  }
  const { cadencia } = carregada;

  const cabemHoje = await vagasDeHoje(admin, orgId, cadencia.id);

  const avaliacoes = await avaliarTodos(leadIds, 10, (leadId) => avaliarNegocio(admin, orgId, cadencia, leadId));
  const recusados: Array<{ lead_id: string; motivo: MotivoDeRecusa }> = [];
  const aptos: Array<{ leadId: string; contactId: string }> = [];
  avaliacoes.forEach((a, i) => {
    if (!a.ok) recusados.push({ lead_id: leadIds[i]!, motivo: a.motivo });
    else if (aptos.length < cabemHoje) aptos.push(a.negocio);
    else recusados.push({ lead_id: leadIds[i]!, motivo: "teto_do_dia" });
  });

  if (parsed.data.dry_run === true) {
    return ok(
      { entram_hoje: aptos.length, recusados, cabem_hoje: cabemHoje, total: leadIds.length },
      { requestId },
    );
  }

  if (parsed.data.confirm_count !== aptos.length) {
    return fail(
      "previa_desatualizada",
      t("A lista mudou desde a prévia. Refaça a prévia e confirme de novo."),
      409,
      { requestId, details: { entram_hoje: aptos.length, recusados, cabem_hoje: cabemHoje } },
    );
  }

  // A reserva é a AUTORIDADE do teto: se outro lote (ou o gatilho) levou vagas
  // entre a prévia e agora, entra só o que foi concedido — o resto é recusado
  // com o motivo, não enviado por cima do teto.
  const concedidas = await reservarInscricoes(admin, orgId, cadencia.id, aptos.length);
  for (const negocio of aptos.slice(concedidas)) recusados.push({ lead_id: negocio.leadId, motivo: "teto_do_dia" });

  const inscritos: string[] = [];
  for (const negocio of aptos.slice(0, concedidas)) {
    const r = await inscreverNegocio(admin, orgId, cadencia, negocio, {
      tipo: "manual",
      actorUserId: authz.user.id,
      requestId,
    });
    if (r.ok) inscritos.push(negocio.leadId);
    else recusados.push({ lead_id: negocio.leadId, motivo: r.motivo });
  }
  return ok({ inscritos: inscritos.length, recusados, cabem_hoje: cabemHoje }, { requestId });
}
