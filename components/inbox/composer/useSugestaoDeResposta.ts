"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/types";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { sugestaoParaMostrar } from "@/lib/agent-engine/agent/sugestao-de-resposta";

/**
 * Quando perguntar de novo pela sugestão.
 *
 * Antes: a cada 4 s, sempre, com a conversa aberta (15 pedidos por minuto
 * parada). A sugestão nasce por causa de uma MENSAGEM (o turno de entrada a
 * gera em segundo plano) e vira `stale` quando chega mensagem nova; então:
 * - mensagem nova nesta conversa (o realtime de mensagens refaz
 *   `["messages", id]`) pergunta na hora e liga a pergunta rápida por
 *   `JANELA_ACORDADA_MS`, o tempo de a sugestão terminar de ser gerada;
 * - sugestão em `generating` mantém a pergunta rápida até ela sair;
 * - fora disso, uma pergunta por minuto, de rede de segurança. Com a aba
 *   escondida o react-query não pergunta (`refetchIntervalInBackground` é
 *   `false` por padrão).
 */
const RAPIDO_MS = 4_000;
const SEGURANCA_MS = 60_000;
const JANELA_ACORDADA_MS = 90_000;

export type Draft = {
  id: string;
  revision: string;
  status: string;
  original_body: string | null;
  edited_body: string | null;
  error_code: string | null;
  proposals: Array<{ tool: string; arguments: unknown }>;
};

export interface Aviso {
  draftId: string;
  message: string;
  kind: "success" | "error";
}

/**
 * O ESTADO da assistência do agente (sugerir, revisar, aprovar ou rejeitar).
 *
 * Saiu de dentro de `ReplyReviewPanel` na fase 3.5 do visual v2: o gatilho
 * "Sugerir resposta" passou a morar na barra do composer (o chip do accent), e
 * o painel aparece só quando há sugestão para revisar. Dois lugares mostrando
 * o mesmo estado pedem UMA fonte, senão o chip diria "Preparando…" enquanto o
 * painel achava que nada foi pedido.
 */
/** 503 da PRÓPRIA rota ("unavailable": ambiente sem o banco do motor de IA). Um
 * 503 passageiro do proxy num deploy não tem esse código e não para a sugestão. */
function indisponivel(erro: unknown): boolean {
  return erro instanceof ApiError && erro.status === 503 && erro.code === "unavailable";
}

export function useSugestaoDeResposta(
  conversationId: string,
  // `false` no modo Nota: a sugestão é mensagem para o cliente, e o painel
  // não aparece ali. Antes da fase 3.5 o painel desmontava na nota e a
  // pergunta parava junto; o hook no composer precisa parar do mesmo jeito.
  ativo = true,
) {
  const t = useT();
  const qc = useQueryClient();
  const key = ["reply-drafts", conversationId];
  const [acordada, setAcordada] = useState(false);
  useEffect(() => {
    if (!ativo) return;
    let dormir: ReturnType<typeof setTimeout> | undefined;
    const parar = qc.getQueryCache().subscribe((ev) => {
      if (ev.type !== "updated" || ev.action.type !== "success") return;
      const [raiz, id] = ev.query.queryKey;
      if (raiz !== "messages" || id !== conversationId) return;
      // Indisponível (503) não acorda: cada mensagem nova voltaria a perguntar.
      const atual = qc.getQueryState(["reply-drafts", conversationId]);
      if (indisponivel(atual?.error)) return;
      setAcordada(true);
      clearTimeout(dormir);
      dormir = setTimeout(() => setAcordada(false), JANELA_ACORDADA_MS);
      void qc.invalidateQueries({ queryKey: ["reply-drafts", conversationId] });
    });
    return () => {
      parar();
      clearTimeout(dormir);
    };
  }, [qc, conversationId, ativo]);
  const query = useQuery({
    queryKey: key,
    enabled: ativo,
    queryFn: () =>
      apiClient.get<{ data: { drafts: Draft[] } }>(`/api/v1/conversations/${conversationId}/draft-reply`),
    refetchInterval: (q) => {
      // Rascunho indisponível (503: o ambiente não tem o banco do motor de IA)
      // não volta sozinho a cada poucos segundos: para de perguntar.
      if (indisponivel(q.state.error)) return false;
      // Qualquer outro erro (ex.: pool que caiu de fato, 500) cai para o ritmo lento.
      if (q.state.error) return SEGURANCA_MS;
      const gerando = q.state.data?.data.drafts.some((d) => d.status === "generating");
      return gerando || acordada ? RAPIDO_MS : SEGURANCA_MS;
    },
    // Nunca repete sozinha. O padrão do `makeQueryClient` repete 429/503 duas
    // vezes, e o 503 "unavailable" daqui é o ambiente sem o banco do motor de
    // IA: não muda entre uma tentativa e outra.
    retry: false,
    // Nem ao REMONTAR. Sem dado e com erro, o react-query refaz o GET em toda
    // montagem (`retryOnMount`): trocar de conversa e voltar, ou alternar
    // Responder/Nota (o `enabled` liga de novo), repetia o pedido que já
    // respondeu "indisponível". Outros erros continuam tentando ao montar.
    retryOnMount: !indisponivel(qc.getQueryState(key)?.error),
  });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Aviso | null>(null);
  // Antes: `drafts[0]`, o mais recente, QUALQUER que fosse o estado dele — então
  // uma sugestão rejeitada ficava na tela para sempre, sem botão de fechar.
  const draft = sugestaoParaMostrar(query.data?.data.drafts);
  const body = draft ? (edits[draft.id] ?? draft.edited_body ?? draft.original_body ?? "") : "";

  async function generate() {
    setNotice(null);
    setBusy(true);
    try {
      await apiClient.post(`/api/v1/conversations/${conversationId}/draft-reply`, {});
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      showApiError(e);
    } finally {
      setBusy(false);
    }
  }

  async function decide(action: "approve" | "reject") {
    if (!draft) return;
    setBusy(true);
    setNotice(null);
    try {
      await apiClient.post(`/api/v1/ai/replies/${draft.id}`, { action, revision: draft.revision, body, feedback });
      setNotice({
        draftId: draft.id,
        kind: "success",
        message:
          action === "approve"
            ? t("Resposta aprovada. Acompanhe o envio aqui.")
            : t("Sugestão rejeitada. O feedback será usado na próxima sugestão."),
      });
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      showApiError(e);
      setNotice({
        draftId: draft.id,
        kind: "error",
        message: t("Sua edição foi preservada. Confira se a conversa mudou antes de aprovar novamente."),
      });
      await qc.invalidateQueries({ queryKey: key });
    } finally {
      setBusy(false);
    }
  }

  /**
   * A confirmação da rejeição ("o feedback será usado na próxima sugestão")
   * estava amarrada a `draft` existir. A rejeitada some da tela — que é o
   * conserto —, e sem esta regra a confirmação sumiria junto: a pessoa
   * clicaria em Rejeitar e a tela apenas esvaziaria, sem dizer nada.
   */
  const avisoVisivel =
    notice !== null &&
    (!draft ||
      (notice.draftId === draft.id &&
        (notice.kind === "error" || ["approved", "sending", "sent", "dismissed"].includes(draft.status))));

  return {
    draft: draft ?? null,
    body,
    setBody: (texto: string) => {
      if (draft) setEdits((atual) => ({ ...atual, [draft.id]: texto }));
    },
    feedback,
    setFeedback,
    busy,
    notice: avisoVisivel ? notice : null,
    generate,
    decide,
  };
}

export type SugestaoDeResposta = ReturnType<typeof useSugestaoDeResposta>;
