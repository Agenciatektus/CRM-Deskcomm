/**
 * POST /api/v1/admin/tenants/[id]/assinatura/vincular: liga a empresa a um
 * cliente Stripe (`cus_`) que já tem assinatura, criada fora do checkout
 * (venda direta). Os ids gravados vêm da LEITURA na Stripe, nunca do corpo.
 *
 * Exige a linha da empresa (o plano é NOT NULL e não vem do corpo): sem linha,
 * 409 `sem_assinatura_na_empresa`. `cus_` já ligado a OUTRA empresa → 409
 * (conferido antes e garantido pelo índice único da migration 0583).
 * Escrita de platform admin, 404 com a chave desligada, audit; a empresa só vem
 * do PATH.
 */
import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { falhaDaEscritaDePlatformAdmin, requirePlatformAdminEscrita, type PlatformAdminContext } from "@/lib/auth/requirePlatformAdmin";
import { provedorDaInstalacao } from "@/lib/cobranca/configuracao";
import { lerOrgDoTenant } from "@/lib/cobranca/dono";
import { adaptador, modoDoProvedor } from "@/lib/cobranca/provedores";
import type { Situacao } from "@/lib/cobranca/provedores/contrato";
import { sincronizar } from "@/lib/cobranca/sincronizar";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

const corpoSchema = z.strictObject({ cliente_ref: z.string().regex(/^cus_[A-Za-z0-9]+$/).max(255) });

type Rota = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, rota: Rota) {
  const supportDenied = await requireSupportWrite((await rota.params).id);
  if (supportDenied) return supportDenied;
  const { id: tenantId } = await rota.params;
  const requestId = randomUUID();
  let adminCtx: PlatformAdminContext;
  try {
    adminCtx = await requirePlatformAdminEscrita();
  } catch (err) {
    return falhaDaEscritaDePlatformAdmin(err, requestId);
  }
  const admin = createAdminClient();
  if (!(await moduloLigado(admin, "cobranca")) || !z.string().uuid().safeParse(tenantId).success) {
    return fail("not_found", "Not found", 404, { requestId });
  }

  const corpo = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return fail("validation_failed", "Informe o cliente da Stripe (cus_...)", 400, { requestId, details: corpo.error.flatten() });
  }
  const clienteRef = corpo.data.cliente_ref;

  const org = await lerOrgDoTenant(admin, tenantId);
  if (org === "erro") return fail("internal_error", "Não foi possível ler a empresa", 500, { requestId });
  if (!org) return fail("not_found", "Tenant not found", 404, { requestId });

  if ((await provedorDaInstalacao()) !== "stripe") {
    return fail("provedor_nao_configurado", "A Stripe não é o provedor de cobrança desta instalação.", 422, { requestId });
  }
  const modo = await modoDoProvedor("stripe");
  if (modo === null) {
    return fail("provedor_nao_configurado", "A chave da Stripe não está configurada.", 422, { requestId });
  }

  const { data: propria, error: erroPropria } = await admin
    .from("cobranca_assinaturas")
    .select("organization_id, provedor, provedor_cliente_id")
    .eq("organization_id", tenantId)
    .maybeSingle();
  if (erroPropria) return fail("internal_error", "Não foi possível ler a assinatura", 500, { requestId });
  const linha = propria as { provedor: string | null; provedor_cliente_id: string | null } | null;
  if (!linha) {
    return fail("sem_assinatura_na_empresa", "Esta empresa não tem plano atribuído. Atribua um plano antes de vincular.", 409, { requestId });
  }
  if (linha.provedor_cliente_id !== null && linha.provedor_cliente_id !== clienteRef) {
    return fail("state_conflict", "Esta empresa já está ligada a outro cliente de pagamento.", 409, { requestId });
  }

  const { data: dono, error: erroDono } = await admin
    .from("cobranca_assinaturas")
    .select("organization_id")
    .eq("provedor", "stripe")
    .eq("provedor_cliente_id", clienteRef)
    .neq("organization_id", tenantId)
    .maybeSingle();
  if (erroDono) return fail("internal_error", "Não foi possível conferir o cliente", 500, { requestId });
  if (dono) return fail("cliente_ja_vinculado", "Este cliente da Stripe já está ligado a outra empresa.", 409, { requestId });

  const stripe = adaptador("stripe");
  let situacao: Situacao;
  try {
    if (!(await stripe.clienteExiste(clienteRef))) {
      return fail("cliente_inexistente", "Cliente não encontrado na Stripe.", 422, { requestId });
    }
    situacao = await stripe.lerSituacao({ clienteRef });
  } catch (e) {
    logger.warn("cobranca.vincular_sem_leitura", { organization_id: tenantId, erro: e instanceof Error ? e.message : "desconhecido" });
    return fail("provedor_indisponivel", "Não foi possível consultar a Stripe. Nada foi gravado; tente de novo.", 503, { requestId });
  }
  if (situacao.assinaturaRef === null || situacao.assinaturasVivas < 1) {
    return fail("sem_assinatura_no_provedor", "Este cliente da Stripe não tem assinatura ativa.", 422, { requestId });
  }

  const { data: gravada, error } = await admin
    .from("cobranca_assinaturas")
    .update({
      provedor: "stripe",
      modo,
      provedor_cliente_id: clienteRef,
      provedor_assinatura_id: situacao.assinaturaRef,
    })
    .eq("organization_id", tenantId)
    .select("organization_id")
    .maybeSingle();
  if (error?.code === "23505") {
    return fail("cliente_ja_vinculado", "Este cliente da Stripe já está ligado a outra empresa.", 409, { requestId });
  }
  if (error || !gravada) return fail("internal_error", "Não foi possível vincular a empresa", 500, { requestId });

  void audit({
    action: "cobranca.provedor_conectado",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    organizationId: tenantId,
    resourceType: "cobranca_assinatura",
    resourceId: tenantId,
    requestId,
    metadata: { provedor: "stripe", modo, quando: "vinculo_manual" },
  });
  const estado = await sincronizar(admin, tenantId);
  return ok({ vinculada: true, estado }, { requestId });
}
