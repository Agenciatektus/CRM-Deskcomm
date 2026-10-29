/**
 * POST /api/v1/admin/tenants/[id]/assinatura/cancelar — o dono da instalação
 * encerra NA HORA a assinatura que a empresa tem no provedor.
 *
 * É o passo que faltava para excluir uma empresa: a exclusão recusa enquanto
 * houver assinatura viva, e o cancelamento da própria empresa (`cobranca/assinatura/cancelar`)
 * só marca "cancela no fim do período", que ainda conta como viva. Não há reembolso
 * aqui: devolver o valor é no painel do provedor.
 */
import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import {
  falhaDaEscritaDePlatformAdmin,
  requirePlatformAdminEscrita,
  type PlatformAdminContext,
} from "@/lib/auth/requirePlatformAdmin";
import { lerOrgDoTenant } from "@/lib/cobranca/dono";
import { limiteDoProvedorPorOrg, recusaDoProvedor } from "@/lib/cobranca/falhas";
import { adaptador } from "@/lib/cobranca/provedores";
import { sincronizar } from "@/lib/cobranca/sincronizar";
import type { ProvedorDeCobranca } from "@/lib/cobranca/vocabulario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: tenantId } = await params;
  const supportDenied = await requireSupportWrite(tenantId);
  if (supportDenied) return supportDenied;
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
  const org = await lerOrgDoTenant(admin, tenantId);
  if (org === "erro") return fail("internal_error", "Não foi possível ler a empresa", 500, { requestId });
  if (!org) return fail("not_found", "Tenant not found", 404, { requestId });

  const { data, error } = await admin
    .from("cobranca_assinaturas")
    .select("provedor, provedor_cliente_id, provedor_assinatura_id")
    .eq("organization_id", tenantId)
    .maybeSingle();
  if (error) return fail("internal_error", "Não foi possível ler a assinatura", 500, { requestId });
  const linha = data as { provedor: ProvedorDeCobranca | null; provedor_cliente_id: string | null; provedor_assinatura_id: string | null } | null;
  if (!linha?.provedor || !linha.provedor_cliente_id) {
    return fail("state_conflict", "Não há assinatura paga para cancelar.", 409, { requestId });
  }
  if (!(await limiteDoProvedorPorOrg(tenantId))) {
    return fail("rate_limited", "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.", 429, { requestId, headers: { "Retry-After": "60" } });
  }

  const provedor = adaptador(linha.provedor);
  try {
    // A linha pode ainda não ter o id da assinatura (venda por link): o provedor sabe qual é a viva.
    const ref = linha.provedor_assinatura_id ?? (await provedor.lerSituacao({ clienteRef: linha.provedor_cliente_id })).assinaturaRef;
    if (!ref) return fail("state_conflict", "O provedor não tem assinatura para cancelar.", 409, { requestId });
    await provedor.cancelarAgora(ref);
  } catch (e) {
    const r = recusaDoProvedor(e);
    return fail(r.code, r.message, r.status, { requestId });
  }

  void audit({
    action: "cobranca.assinatura_cancelada",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    organizationId: tenantId,
    resourceType: "cobranca_assinatura",
    resourceId: tenantId,
    requestId,
    metadata: { motivo: "cancelada_pelo_dono" },
  });
  // Melhor esforço: o provedor já encerrou; o webhook e o cron reconciliam o estado gravado.
  await sincronizar(admin, tenantId).catch((e: unknown) =>
    logger.error("cobranca: releitura depois do cancelamento do dono falhou", { requestId, organizationId: tenantId, erro: e instanceof Error ? e.name : "desconhecido" }),
  );
  return ok({ changed: true }, { requestId });
}
