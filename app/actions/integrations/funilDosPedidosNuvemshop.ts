"use server";

/** Server Action: escolher um funil existente (ou criar o padrão) para os pedidos da Nuvemshop. */

import { supportWriteError } from "@/lib/impersonate/support";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { podeAdministrarEmpresa } from "@/lib/auth/pode-administrar-empresa";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarFunilPadrao, gravarEscolha } from "@/lib/nuvemshop/funil-de-pedidos";

export type FunilDosPedidosResult =
  | { ok: true }
  | { ok: false; error: "auth_required" | "no_active_org" | "forbidden" | "invalid_pipeline" | "db_error" };

async function executar(escolher: (admin: ReturnType<typeof createAdminClient>, orgId: string) => Promise<string>): Promise<FunilDosPedidosResult> {
  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "auth_required" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden" };
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return { ok: false, error: "no_active_org" };
  if (!podeAdministrarEmpresa(user, activeOrg)) return { ok: false, error: "forbidden" };

  const admin = createAdminClient();
  let pipelineId: string;
  try {
    pipelineId = await escolher(admin, activeOrg.orgId);
  } catch {
    return { ok: false, error: "db_error" };
  }
  if (!(await gravarEscolha(admin, activeOrg.orgId, pipelineId))) return { ok: false, error: "invalid_pipeline" };

  await audit({
    action: "nuvemshop.pedidos_pipeline_set",
    organizationId: activeOrg.orgId,
    actorUserId: user.id,
    resourceType: "crm_pipeline",
    resourceId: pipelineId,
  });
  revalidatePath("/app/integrations/nuvemshop");
  return { ok: true };
}

export const escolherFunilDosPedidos = (pipelineId: string) => executar(async () => pipelineId);

export const criarFunilDosPedidos = () => executar((admin, orgId) => criarFunilPadrao(admin, orgId));
