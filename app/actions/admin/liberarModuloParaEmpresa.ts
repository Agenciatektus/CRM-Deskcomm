"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import {
  MODULOS_LIBERADOS_POR_EMPRESA,
  gravarLiberacao,
  liberacoesDaEmpresa,
} from "@/lib/organizacao/modulos-liberados";
import { createAdminClient } from "@/lib/supabase/admin";

export type LiberarModuloResult = { ok: true } | { ok: false; error: string };

const entradaSchema = z.object({
  organizationId: z.string().uuid(),
  modulo: z.enum(MODULOS_LIBERADOS_POR_EMPRESA),
  liberado: z.boolean(),
});

/**
 * Libera ou revoga um módulo para UMA empresa (migration 9026).
 *
 * `is_platform_admin` e nada abaixo disso: a liberação existe justamente para
 * o admin da empresa não ligar sozinho. A organização vem do corpo porque esta
 * tela é cross-tenant por natureza; o gate é o papel de plataforma, e o Zod
 * garante que só chega um uuid e um módulo da lista.
 *
 * Auditado com a empresa afetada: "desde quando esta conta tem prospecção, e
 * quem liberou?" só tem resposta no audit, porque revogar apaga a linha.
 */
export async function liberarModuloParaEmpresa(
  input: z.infer<typeof entradaSchema>,
): Promise<LiberarModuloResult> {
  const { user } = await requirePlatformAdmin();

  const parsed = entradaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { organizationId, modulo, liberado } = parsed.data;

  const db = createAdminClient();
  const { data: org } = await db.from("organizations").select("id").eq("id", organizationId).maybeSingle();
  if (!org) return { ok: false, error: "tenant_not_found" };

  const antes = (await liberacoesDaEmpresa(db, organizationId)).includes(modulo);
  if (!(await gravarLiberacao(db, organizationId, modulo, liberado, user.id))) {
    return { ok: false, error: "write_failed" };
  }

  const hdrs = await headers();
  await audit({
    action: "platform.modulo_liberado",
    actorUserId: user.id,
    organizationId,
    actingAsPlatformAdmin: true,
    resourceType: "modulos_liberados_por_empresa",
    metadata: { modulo, de: antes, para: liberado },
    requestId: hdrs.get("x-request-id"),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent"),
  });

  revalidatePath(`/admin/tenants/${organizationId}/recursos`);
  return { ok: true };
}
