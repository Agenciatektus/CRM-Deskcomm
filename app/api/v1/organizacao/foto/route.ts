/**
 * POST/DELETE /api/v1/organizacao/foto — a FOTO da organização ativa.
 *
 * É a imagem que aparece no lugar da sigla (trilho, seletor de organização,
 * celular). NÃO é a marca white-label (`/api/v1/marca/logo`, escopo
 * `organizacao`): essa é do admin da PLATAFORMA (decisão do Peterson, 19/10).
 * Esta é do admin da EMPRESA, e só da própria empresa.
 *
 * ── Gate ─────────────────────────────────────────────────────────────────────
 * `requireRole("admin")`: papel admin na organização ATIVA (cookie validado
 * contra as memberships, nunca o corpo), MFA da sessão em dia, organização
 * operante; platform admin com scope `full` também passa. A organização vem de
 * `authz.org.orgId` e de lugar nenhum mais — não existe parâmetro que aponte
 * para outra empresa.
 *
 * ── Defesa no banco ──────────────────────────────────────────────────────────
 * `organizations_foto_path_da_propria_org` (migration 9061) recusa um caminho
 * que não seja `organizacoes/<o próprio id>/<uuid>.<ext>` — vale também para
 * quem escrevesse direto pelo PostgREST.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import {
  caminhoNovoDaFoto,
  extensaoDaFoto,
  fotoDaOrganizacao,
  urlDaFotoDaOrganizacao,
} from "@/lib/fotos/foto";
import { apagarFoto, lerFotoDoFormulario, subirFoto } from "@/lib/fotos/servidor";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TETO = 10;
const JANELA_SEGUNDOS = 300;

async function caminhoAtual(orgId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("organizations")
    .select("foto_path")
    .eq("id", orgId)
    .maybeSingle();
  return (data as { foto_path?: string | null } | null)?.foto_path ?? null;
}

/** Grava o ponteiro e confere que UMA linha mudou (0 linhas não é "salvo"). */
async function gravar(orgId: string, caminho: string | null, requestId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("organizations")
    .update({ foto_path: caminho })
    .eq("id", orgId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    logger.error("[organizacao/foto] gravação do ponteiro falhou", {
      codigo: error?.code ?? null,
      detalhe: error?.message ?? "nenhuma linha",
      requestId,
    });
    return false;
  }
  return true;
}

async function abrir(req: NextRequest, requestId: string) {
  const authz = await requireRole("admin", { requestId, resource: "organizations", allowPlatformAdmin: true });
  if (!authz.ok) return { aberto: false, recusa: authz.response } as const;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const limite = await checkRateLimit(`organizacao-foto:${authz.user.id}`, TETO, JANELA_SEGUNDOS);
  if (!limite.allowed) {
    return {
      aberto: false,
      recusa: fail("rate_limited", t("Muitas trocas de foto seguidas. Tente em alguns minutos."), 429, {
        requestId,
        headers: { "Retry-After": String(JANELA_SEGUNDOS) },
      }),
    } as const;
  }
  const orgId = authz.org.orgId;
  const auditar = (definida: boolean) =>
    audit({
      action: "org.photo_updated",
      actorUserId: authz.user.id,
      organizationId: orgId,
      resourceType: "organization",
      resourceId: orgId,
      requestId,
      ip: ipDoCliente(req.headers),
      userAgent: req.headers.get("user-agent") ?? null,
      metadata: { foto_definida: definida },
    });
  return { aberto: true, orgId, t, auditar } as const;
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const aberto = await abrir(req, requestId);
  if (!aberto.aberto) return aberto.recusa;
  const { orgId, t, auditar } = aberto;

  const lido = await lerFotoDoFormulario(req, t, requestId);
  if ("recusa" in lido) return lido.recusa;

  const caminho = caminhoNovoDaFoto("organizacao", orgId, extensaoDaFoto(lido.tipo));
  if (!caminho) return fail("internal_error", t("Erro ao subir a foto."), 500, { requestId });

  const anterior = await caminhoAtual(orgId);
  if (!(await subirFoto(caminho, lido.bytes, lido.tipo, requestId))) {
    return fail("internal_error", t("Erro ao subir a foto."), 500, { requestId });
  }
  const pertence = (c: string) => fotoDaOrganizacao(c, orgId);
  if (!(await gravar(orgId, caminho, requestId))) {
    void apagarFoto(caminho, pertence, requestId);
    return fail("internal_error", t("Erro ao salvar a foto."), 500, { requestId });
  }
  await apagarFoto(anterior, pertence, requestId);
  await auditar(true);

  return ok({ foto_url: urlDaFotoDaOrganizacao(orgId, caminho) }, { requestId });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const aberto = await abrir(req, requestId);
  if (!aberto.aberto) return aberto.recusa;
  const { orgId, t, auditar } = aberto;

  const anterior = await caminhoAtual(orgId);
  if (!(await gravar(orgId, null, requestId))) {
    return fail("internal_error", t("Erro ao remover a foto."), 500, { requestId });
  }
  await apagarFoto(anterior, (c) => fotoDaOrganizacao(c, orgId), requestId);
  await auditar(false);

  return ok({ foto_url: null }, { requestId });
}
