"use server";

/**
 * Liga e desliga a LEITURA DE MÍDIA PELA IA para a empresa inteira
 * (transcrição de áudio, descrição de imagem, texto de documento, vídeo).
 *
 * O que a chave decide e o padrão (LIGADA) estão em
 * `lib/messaging/media/leitura-da-org.ts`; aqui só a gravação. Mesmo desenho de
 * `definirAiDecideDaEmpresa`: service role com o `organization_id` da SESSÃO
 * (`resolveActiveOrg`, nunca argumento), e merge do jsonb nos dois níveis para
 * não apagar `branding`, `automacoes` e o resto de `settings`.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { CHAVE_DA_MIDIA } from "@/lib/messaging/media/leitura-da-org";
import { createAdminClient } from "@/lib/supabase/admin";

export type ResultadoInterruptorLeituraDeMidia =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_failed"
        | "unauthenticated"
        | "forbidden_tenant"
        | "forbidden_role"
        | "mfa_required"
        | "erro_ao_gravar";
    };

export async function definirLeituraDeMidiaDaEmpresa(
  ligar: boolean,
): Promise<ResultadoInterruptorLeituraDeMidia> {
  // Server Action é endpoint público: o tipo do parâmetro não chega ao servidor.
  const entrada = z.boolean().safeParse(ligar);
  if (!entrada.success) return { ok: false, error: "validation_failed" };

  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden_role" };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "forbidden_tenant" };
  // O mesmo gate da tela de Provedores, onde a chave mora.
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) return { ok: false, error: "forbidden_role" };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  if (erroLeitura) return { ok: false, error: "erro_ao_gravar" };

  const settings = (atual?.settings ?? {}) as Record<string, unknown>;
  const midia = (settings[CHAVE_DA_MIDIA] ?? {}) as Record<string, unknown>;
  const novo = { ...settings, [CHAVE_DA_MIDIA]: { ...midia, leitura_pela_ia: entrada.data } };

  const { error } = await admin.from("organizations").update({ settings: novo }).eq("id", org.orgId);
  if (error) return { ok: false, error: "erro_ao_gravar" };

  await audit({
    action: "settings.media_reading_updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "organization",
    resourceId: org.orgId,
    metadata: { ligado: entrada.data },
  });

  revalidatePath("/app/ai/providers");
  return { ok: true };
}
