/**
 * POST /api/v1/campaigns/:id/incluir — põe os contatos de negócios do Funil
 * no público de uma campanha em RASCUNHO ("Adicionar à campanha", barra em
 * lote). Regra e motivos em `lib/campanhas/incluir-do-funil.ts`.
 *
 * Duas fases na MESMA rota, para a tela e a escrita contarem igual:
 *   - `confirmar: false` (padrão): só confere — quantos entram e, de quem fica
 *     de fora, quantos e por quê. Não grava nada;
 *   - `confirmar: true`: confere de novo (o mundo pode ter mudado desde a tela)
 *     e grava quem entra em `audience_filter.incluir_contatos`.
 *
 * Mesma autorização das rotas de campanha: suporte só leitura
 * (`requireSupportWrite`), papel `manager` com a organização do cookie
 * (`requireRole`, que também cobra o 2º fator onde ele é exigido). A
 * organização NUNCA vem do corpo, e cada leitura e a escrita levam o filtro
 * de organização explícito (client admin, como o PATCH).
 *
 * Como o PATCH do rascunho, não audita: nada sai de um rascunho, e quem audita
 * são as mudanças de estado (preparar, iniciar).
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { carregarCampanha } from "@/lib/campanhas/acoes";
import { ehEntradaContinua } from "@/lib/campanhas/entrada-continua";
import {
  conferirInclusao,
  filtroParaIncluir,
  TEXTO_DO_LOTE,
  type MotivoDeFora,
} from "@/lib/campanhas/incluir-do-funil";
import { ehEditavel } from "@/lib/campanhas/maquina-de-estados";
import { TEXTO_DA_EXCLUSAO } from "@/lib/campanhas/tipos";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const corpoSchema = z.strictObject({
  lead_ids: z.array(z.string().uuid()).min(1).max(5000),
  confirmar: z.boolean().default(false),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Selecione de 1 a 5.000 negócios."), 422, { requestId });
  }
  const { lead_ids: leadIds, confirmar } = parsed.data;

  const admin = createAdminClient();
  const carregada = await carregarCampanha(admin, authz.org.orgId, id);
  if (!carregada.ok) return fail(carregada.codigo, t(carregada.mensagem), carregada.status, { requestId });
  const campanha = carregada.campanha;

  if (ehEntradaContinua(campanha)) {
    return fail(
      "campanha_nao_editavel",
      t("Esta campanha aborda quem chega na etapa do funil; ela não recebe lista."),
      409,
      { requestId },
    );
  }
  if (!ehEditavel(campanha.status)) {
    return fail(
      "campanha_nao_editavel",
      t("Só uma campanha em rascunho recebe contatos. Volte-a ao rascunho ou escolha outra."),
      409,
      { requestId },
    );
  }
  const filtro = filtroParaIncluir(campanha.audience_filter);
  if (!filtro) {
    return fail(
      "campanha_publico_ilegivel",
      t("O público desta campanha está num formato que não reconheço. Abra a campanha e salve o público de novo."),
      409,
      { requestId },
    );
  }

  let resumo;
  try {
    resumo = await conferirInclusao(admin, {
      organizationId: authz.org.orgId,
      campanhaId: id,
      filtro,
      leadIds,
      agora: new Date(),
    });
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : String(err), 500, { requestId });
  }

  const fora = Object.entries(resumo.fora).map(([motivo, quantos]) => ({
    motivo,
    quantos,
    texto: t(
      (TEXTO_DO_LOTE as Record<string, string>)[motivo] ??
        (TEXTO_DA_EXCLUSAO as Record<string, string>)[motivo] ??
        motivo,
    ),
  })) as Array<{ motivo: MotivoDeFora; quantos: number; texto: string }>;
  const resposta = { entram: resumo.entram.length, fora, gravado: false };

  if (!confirmar || resumo.entram.length === 0) return ok(resposta, { requestId });

  // Compare-and-set no estado conferido: se a campanha saiu do rascunho entre a
  // conferência e a escrita, nada é gravado.
  const { data, error } = await admin
    .from("campaigns")
    .update({
      audience_filter: { ...filtro, incluir_contatos: [...filtro.incluir_contatos, ...resumo.entram] },
      updated_by: authz.user.id,
    })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .eq("status", campanha.status)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) {
    return fail(
      "campanha_nao_editavel",
      t("O estado da campanha mudou enquanto os contatos eram adicionados. Recarregue a tela."),
      409,
      { requestId },
    );
  }
  return ok({ ...resposta, gravado: true }, { requestId });
}
