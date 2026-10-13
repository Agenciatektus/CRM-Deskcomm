import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const COLUNAS = "id, display_name, phone_number, is_blocked, blocked_reason, blocked_at";

/** Motivo opcional, curto: vai para `blocked_reason`, que a ficha mostra. */
const bloquearSchema = z
  .object({ motivo: z.string().trim().max(280).optional() })
  .strict();

/**
 * BLOQUEIA O CONTATO A PARTIR DA EQUIPE — o simétrico de `/unblock`.
 *
 * Mesma coluna que o `/unblock` desfaz e que a ingestão grava no pedido de
 * descadastro (`lib/channels/pos-entrada.ts`): `is_blocked`, `blocked_reason`,
 * `blocked_at`. E por isso o mesmo efeito em todo o motor: `before-send.ts`
 * recusa envio, o funil não cria lead, follow-up, campanha e IA param (W-03).
 *
 * ## Por que `agent`, e o desbloqueio é `admin`
 *
 * Os dois lados não pesam o mesmo. Bloquear FECHA um canal: o pior caso é a
 * empresa deixar de mandar mensagem a quem não queria receber, e qualquer
 * atendente que recebe um "pare de me mandar" precisa poder agir na hora.
 * Desbloquear REABRE um canal que pode ter sido fechado pelo cliente (direito
 * de oposição do LGPD), e por isso fica com o admin, como a W-02 manda.
 *
 * `blocked_reason` guarda o motivo digitado ou `manual` — distinguível do
 * `stop_keyword` que a ingestão grava. A auditoria registra QUE houve motivo,
 * não o texto: auditoria não é lugar de dado pessoal.
 */
export async function POST(req: NextRequest, ctx: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("agent", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  if (!z.uuid().safeParse(id).success) {
    return fail("validation_failed", t("Contato inválido."), 422, { requestId });
  }
  const parsed = bloquearSchema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const motivo = parsed.data.motivo || null;

  const admin = createAdminClient();
  // Admin client bypassa RLS: o filtro por organização é PROGRAMÁTICO e
  // obrigatório (CLAUDE.md, anti-pattern 10).
  const { data, error } = await admin
    .from("contacts")
    .update({ is_blocked: true, blocked_reason: motivo ?? "manual", blocked_at: new Date().toISOString() })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    // Revisão do Cassio (P2): contato JÁ bloqueado não é regravado. O motivo e a
    // data do bloqueio original (ex.: `stop_keyword`, a prova do opt-out do
    // titular) ficam intactos.
    .eq("is_blocked", false)
    .select(COLUNAS)
    .maybeSingle();

  if (error) {
    return fail("internal_error", t("Não foi possível bloquear o contato."), 500, { requestId });
  }
  if (!data) {
    // Nada mudou: ou o contato não existe nesta organização, ou já estava
    // bloqueado. Já bloqueado é sucesso idempotente, sem gravar nem auditar.
    const { data: atual, error: erroLeitura } = await admin
      .from("contacts")
      .select(COLUNAS)
      .eq("organization_id", authz.org.orgId)
      .eq("id", id)
      .maybeSingle();
    if (erroLeitura) {
      return fail("internal_error", t("Não foi possível bloquear o contato."), 500, { requestId });
    }
    if (atual?.is_blocked) return ok(atual, { requestId });
    return fail("not_found", t("Contato não encontrado."), 404, { requestId });
  }

  // Mesmo `action` e `resourceType` do bloqueio da ingestão; a origem separa.
  await audit({
    action: "contact.blocked",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "contact",
    resourceId: id,
    requestId,
    metadata: { contact_id: id, origem: "equipe", com_motivo: motivo !== null },
  });

  return ok(data, { requestId });
}
