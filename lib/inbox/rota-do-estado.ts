import { randomUUID } from "node:crypto";
import { z } from "zod";

import { audit } from "@/lib/audit";
import type { AuditAction } from "@/lib/audit/actions";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

import {
  conversaVisivel,
  gravarEstado,
  limparEstado,
  type MudancaDoEstado,
} from "./estado-por-atendente.servidor";

/**
 * O MIOLO COMUM das rotas de estado por atendente (migration 9042):
 * `pin`, `mute` e `mark-unread`, cada uma com POST (aplica) e DELETE (desfaz).
 *
 * Cada `route.ts` chama `requireSupportWrite()` ANTES de entrar aqui (o gate
 * `suporte-cobertura-de-efeitos` lê o arquivo da rota), e a RLS da tabela
 * repete a recusa ao suporte somente leitura no banco.
 *
 * Papel mínimo `viewer`: fixar, silenciar e marcar são preferências PESSOAIS
 * (decisão do Peterson), não mexem no atendimento de ninguém. A organização vem
 * da sessão (`requireRole`), nunca do corpo; a conversa tem de existir nela e
 * ser visível a quem pede (RLS de conversations), senão 404.
 */

export type Preparo =
  | { ok: false; response: Response }
  | {
      ok: true;
      requestId: string;
      t: (texto: string) => string;
      supabase: Awaited<ReturnType<typeof createClient>>;
      /** A pessoa enxerga a conversa agora? Falso só no `desfazer`. */
      visivel: boolean;
      alvo: { orgId: string; userId: string; conversationId: string };
    };

/**
 * `desfazer`: as rotas DELETE desfazem a própria preferência mesmo quando a
 * conversa saiu da visão da pessoa (transferida a um colega, modo "só as
 * minhas"). Sem isso a fixada ficava presa ocupando vaga do teto, sem botão
 * para soltar (revisão do Cassio, P2). Continua só a linha DELA, na org DELA:
 * `user_id` e `organization_id` vêm da sessão e a RLS repete o recorte.
 */
export async function prepararRotaDoEstado(
  params: Promise<{ id: string }>,
  opcoes: { desfazer?: boolean } = {},
): Promise<Preparo> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "conversations" });
  if (!authz.ok) return { ok: false, response: authz.response };
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return { ok: false, response: fail("validation_failed", t("Conversa inválida."), 422, { requestId }) };
  }
  const supabase = await createClient();
  const visivel = await conversaVisivel(supabase, authz.org.orgId, id);
  if (!visivel && !opcoes.desfazer) {
    return { ok: false, response: fail("not_found", t("Conversa não encontrada."), 404, { requestId }) };
  }
  return {
    ok: true,
    requestId,
    t,
    supabase,
    visivel,
    alvo: { orgId: authz.org.orgId, userId: authz.user.id, conversationId: id },
  };
}

/**
 * Grava (ou limpa) e audita. A auditoria leva só o que mudou: preferência
 * pessoal não carrega dado do cliente.
 */
export async function concluirRotaDoEstado(
  p: Extract<Preparo, { ok: true }>,
  acao: AuditAction,
  efeito: { mudanca: MudancaDoEstado } | { limpar: keyof MudancaDoEstado },
): Promise<Response> {
  const r =
    "mudanca" in efeito
      ? await gravarEstado(p.supabase, p.alvo, efeito.mudanca)
      : await limparEstado(p.supabase, p.alvo, efeito.limpar, { apagarLinha: !p.visivel });
  if (!r.ok) {
    return fail("internal_error", p.t("Não foi possível salvar a preferência."), 500, { requestId: p.requestId });
  }
  void audit({
    action: acao,
    actorUserId: p.alvo.userId,
    organizationId: p.alvo.orgId,
    resourceType: "conversation",
    resourceId: p.alvo.conversationId,
    requestId: p.requestId,
    metadata: "mudanca" in efeito ? { ...efeito.mudanca } : { limpou: efeito.limpar },
  });
  return ok(
    { conversation_id: p.alvo.conversationId, ...("mudanca" in efeito ? efeito.mudanca : { [efeito.limpar]: null }) },
    { requestId: p.requestId },
  );
}
