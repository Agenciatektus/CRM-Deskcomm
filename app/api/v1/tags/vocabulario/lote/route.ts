/**
 * POST /api/v1/tags/vocabulario/lote — excluir, juntar ou dar cor a VÁRIAS
 * etiquetas de uma vez (barra em lote da tela de Tags).
 *
 * ── Por que esta rota chama a MESMA função de uma etiqueta ──────────────────
 *
 * `fn_vocabulario_de_tags_operar` já faz tudo o que excluir/juntar/cor precisam
 * — reescreve contatos, leads, conversas, regras `add_tag` e as listas de
 * sugestão na mesma transação, com o portão de papel, a guarda de suporte/MFA e
 * a reserva de `cliente`. Uma função de lote nova no banco seria uma segunda
 * cópia dessas regras para manter em paridade. Aqui a rota só repete a chamada,
 * etiqueta por etiqueta, com os MESMOS portões da rota de uma etiqueta.
 *
 * ── O que acontece se uma etiqueta do meio falhar ───────────────────────────
 *
 * Cada chamada é a sua transação. A rota PARA na primeira recusa e responde o
 * erro daquela etiqueta com `details.concluidas` (quantas já foram) e
 * `details.tag` (qual recusou): a tela diz "3 de 10 aplicadas" e recarrega a
 * lista, em vez de fingir que nada aconteceu. Continuar depois de uma recusa de
 * papel ou de MFA só repetiria a mesma recusa para cada etiqueta restante.
 *
 * ── Tamanho do pedido ───────────────────────────────────────────────────────
 *
 * No máximo `LOTE_MAXIMO_DE_ETIQUETAS` (50) por chamada — ver o schema. Nada
 * aqui lê linhas para o Node: a reescrita acontece no banco, então o
 * `max_rows` do PostgREST e o tamanho de URL não entram na conta.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { loteDeVocabularioSchema } from "@/lib/schemas/tags";
import { createClient } from "@/lib/supabase/server";
import { respostaDoErroDoVocabulario } from "@/lib/tags/erro-do-vocabulario";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  // O MESMO portão da rota de uma etiqueta, sem `allowPlatformAdmin`: quem
  // grava é a função, que só conhece o papel na organização.
  const auth = await requireRole("manager", { requestId, resource: "settings_tags" });
  if (!auth.ok) return auth.response;
  if (await mfaEmDivida())
    return fail("mfa_required", "Confirme a verificação em duas etapas.", 403, { requestId });

  const parsed = loteDeVocabularioSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Confira as etiquetas, o destino e a cor.", 422, {
      requestId,
      details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const { acao, tags, destino, cor } = parsed.data;

  const db = await createClient();
  const total = { contatos: 0, leads: 0, conversas: 0, regras: 0 };
  let concluidas = 0;
  for (const tag of tags) {
    const { data, error } = await db.rpc("fn_vocabulario_de_tags_operar", {
      p_org: auth.org.orgId,
      p_acao: acao,
      p_tag: tag,
      p_destino: acao === "juntar" ? (destino ?? null) : null,
      p_cor: acao === "definir_cor" ? (cor ?? null) : null,
    });
    if (error) return respostaDoErroDoVocabulario(error, requestId, { concluidas, tag });

    const resultado = (data ?? {}) as Record<string, unknown>;
    // Uma linha de auditoria POR ETIQUETA, com a mesma ação da rota de uma: quem
    // procura "quem apagou `vip`" acha a linha dela, com os contadores dela.
    void audit({
      action: "tag_vocabulary.changed",
      actorUserId: auth.user.id,
      organizationId: auth.org.orgId,
      resourceType: "organization",
      resourceId: auth.org.orgId,
      requestId,
      metadata: { acao, tag, destino: destino ?? null, cor: cor ?? null, lote: true, ...resultado },
    });
    total.contatos += Number(resultado.contatos ?? 0);
    total.leads += Number(resultado.leads ?? 0);
    total.conversas += Number(resultado.conversas ?? 0);
    total.regras += Number(resultado.regras ?? 0);
    concluidas += 1;
  }

  return ok({ acao, concluidas, ...total }, { requestId });
}
