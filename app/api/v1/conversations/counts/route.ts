/**
 * GET /api/v1/conversations/counts — contagens por visão do inbox (G4-02).
 *
 * Usa o client user-scoped (cookie session) → toda contagem HERDA a RLS de
 * SELECT de `conversations` (a de conjunto da migration 9027). Um agent em modo
 * own* recebe a contagem do SEU escopo, NUNCA o total da org: a mesma garantia
 * do listing.
 *
 * Desde a migration 9029 as seis contagens saem de UMA chamada,
 * `fn_contagens_da_caixa` (SECURITY INVOKER, então a RLS continua valendo), em
 * vez de seis `count(*)`: uma varredura de `conversations`, com o comando da
 * conversa calculado uma vez por linha. As REGRAS seguem aqui e vão por
 * parâmetro: a fila (`comandosDaFila`), os terminais de "Minhas"
 * (`CONVERSATION_TERMINAL_STATUSES`), os filtros auxiliares e as etiquetas
 * limpas pela mesma régua da lista (`marcadoresEscolhidos`/`modoDeEtiqueta`).
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { CONVERSATION_TERMINAL_STATUSES } from "@/lib/schemas";
import { orgTemAutomatico } from "@/lib/ai/agents/org-tem-automatico";
import { comandosDaFila } from "@/lib/inbox/comando-da-conversa";
import { marcadoresEscolhidos, modoDeEtiqueta } from "@/lib/inbox/marcador-da-conversa";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Um par pronto para virar predicado: coluna e valor. */
export type FiltroDeContagem = readonly [coluna: string, valor: string | boolean];

/**
 * Os filtros AUXILIARES que a lista aplicou e que a contagem tem de aplicar junto.
 *
 * ─── O defeito ─────────────────────────────────────────────────────────────
 * Medido na tela: com "Não lidos" ligado, a lista mostrava ZERO linhas e a aba
 * continuava estampando "Todas 2". Este próprio arquivo já declarava a regra —
 * "um badge que conta o que a aba não mostra manda o atendente procurar trabalho
 * que não existe" — e a regra estava certa: a COBERTURA parou no predicado da
 * aba e nunca alcançou os filtros ao lado dela.
 *
 * ─── Por que uma lista só, e não um `if` por contagem ──────────────────────
 * Uma lista aplicada a TODAS as contagens torna a divergência impossível por
 * construção: não existe o caminho "esqueci de pôr o filtro na contagem X".
 * `tests/unit/badge-espelha-o-filtro.test.ts` vigia que nenhuma contagem seja
 * montada por fora.
 *
 * A busca (`search`) NÃO entra: ela casa contato por uma consulta auxiliar em
 * `contacts`, e repetir aquela lógica aqui criaria uma SEGUNDA régua de busca —
 * e a segunda régua sempre diverge. Enquanto isso, o badge sob busca fica maior
 * que a lista, e isso está declarado, não esquecido.
 */
export function filtrosAuxiliaresDaContagem(
  sp: URLSearchParams,
): FiltroDeContagem[] {
  const filtros: FiltroDeContagem[] = [];
  const canal = sp.get("channel_session_id");
  if (canal) filtros.push(["channel_session_id", canal]);
  // A ENTRADA do Instagram entra aqui porque é IGUALDADE numa coluna de
  // `conversations`, que é exatamente o que esta lista sabe aplicar. Sem ela, o
  // atendente filtraria "só comentários" e leria nas abas o número de TODAS as
  // conversas — badge maior que a lista, sem nada dizendo por quê.
  const entrada = sp.get("entrada");
  if (entrada === "direct" || entrada === "comentario") {
    filtros.push(["instagram_entrada", entrada]);
  }
  // O MARCADOR não entra nesta lista, e não é esquecimento: ele não é
  // IGUALDADE numa coluna, é um `or=` sobre DUAS caixas — `conversations.tags`
  // e o campo calculado do contato. `conversations` não tem coluna `tag` (`tag`
  // é o nome do parâmetro da URL): com ele aqui, o laço lá embaixo pedia
  // `.eq("tag", …)`, o PostgREST devolvia 42703 (`undefined_column`) e a rota
  // INTEIRA respondia 500 — com um marcador filtrado, toda aba do Inbox ficava
  // sem número, a "Fechadas" inclusive (#1223). Quem aplica o marcador é
  // a função do banco, com as etiquetas limpas pela mesma régua da lista.
  return filtros;
}

/** Verdadeiro quando a contagem deve pedir só as não lidas. */
export function contagemSoNaoLidas(sp: URLSearchParams): boolean {
  return sp.get("unread") === "true";
}

/**
 * Verdadeiro quando a lista filtra "Sem próximo passo" (migration 9047). Vai à
 * função como `p_sem_passo`, que aplica o MESMO campo calculado da lista
 * (`passo_da_conversa`): não é igualdade numa coluna, por isso fica fora de
 * `filtrosAuxiliaresDaContagem`, como as não lidas.
 */
export function contagemSemPasso(sp: URLSearchParams): boolean {
  return sp.get("sem_passo") === "true";
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }

  const authUser = await loadAuthUser();
  const activeOrg = authUser ? await resolveActiveOrg(authUser) : null;
  if (!activeOrg) {
    return fail(
      "no_active_org",
      traduzir("No active organization.", authUser?.idioma ?? "pt-BR"),
      403,
      { requestId },
    );
  }

  const org = activeOrg.orgId;
  const sp = req.nextUrl.searchParams;
  const auxiliares = new Map(filtrosAuxiliaresDaContagem(sp));
  const soNaoLidas = contagemSoNaoLidas(sp);
  const marcadores = marcadoresEscolhidos(sp.getAll("tag"));
  const modo = modoDeEtiqueta(sp.get("modo")) ?? "e";

  const automaticoDaOrg = await orgTemAutomatico(supabase, org);

  const { data, error } = await supabase.rpc("fn_contagens_da_caixa" as never, {
    p_organizacao: org,
    p_comandos_da_fila: comandosDaFila(automaticoDaOrg),
    p_terminais: [...CONVERSATION_TERMINAL_STATUSES],
    p_canal: auxiliares.get("channel_session_id") ?? null,
    p_entrada: auxiliares.get("instagram_entrada") ?? null,
    p_so_nao_lidas: soNaoLidas,
    p_marcadores: marcadores,
    p_modo: modo,
    p_sem_passo: contagemSemPasso(sp),
  } as never);
  if (error) {
    return fail("internal_error", error.message, 500, { requestId });
  }
  const contagem = (data ?? {}) as Partial<Record<"fila" | "automatico" | "mine" | "all" | "closed" | "archived", number>>;

  return ok(
    {
      fila: contagem.fila ?? 0,
      automatico: contagem.automatico ?? 0,
      unassigned: contagem.fila ?? 0,
      mine: contagem.mine ?? 0,
      all: contagem.all ?? 0,
      closed: contagem.closed ?? 0,
      archived: contagem.archived ?? 0,
    },
    { requestId },
  );
}
