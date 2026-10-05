"use client";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import type { Message } from "@/lib/types/messaging";

/**
 * A MENSAGEM DO REALTIME ENTRA DIRETO NA THREAD ABERTA (auditoria, item 9).
 *
 * Antes, todo evento do canal da conversa — mensagem nova, tique de
 * entregue/lido, e até DELETE de mensagem de OUTRA conversa — fazia
 * `invalidateQueries(["messages", id])`. Numa query infinita isso refaz TODAS
 * as páginas carregadas, uma ida e volta cada (~200 ms do Brasil à França), e
 * assina a mídia de novo. Receber três mensagens custava três recargas.
 *
 * Aqui o evento é aplicado no cache (`setQueryData`) e o refetch vira RESERVA,
 * para os casos em que o evento não basta:
 *
 *   - entrega sintética "reassinado" (o canal caiu: pode ter faltado algo);
 *   - payload incompleto (falta campo que a bolha usa) ou formato desconhecido;
 *   - thread ainda não carregada;
 *   - INSERT fora de ordem, mais velho que tudo o que está carregado quando há
 *     histórico além dele (não há onde pô-lo com certeza);
 *   - UPDATE de mensagem que deveria estar na janela carregada e não está (o
 *     INSERT dela se perdeu: buraco);
 *   - UPDATE que troca o caminho da mídia (a URL assinada só vem do servidor).
 *
 * ═══ O que NUNCA entra no cache a partir do payload ═══
 *
 * `postgres_changes` de INSERT/UPDATE passa pela RLS de SELECT antes de chegar;
 * DELETE não passa (e não é filtrável: chega DELETE de qualquer conversa). Por
 * isso:
 *   - INSERT/UPDATE só entram se `conversation_id` é a conversa aberta E
 *     `organization_id` é a organização ativa — sem organização conhecida, nada
 *     entra (vira refetch, e quem decide é o servidor);
 *   - DELETE só REMOVE, e só um id que já está no cache. DELETE desconhecido é
 *     ignorado sem refetch (antes, cada DELETE de qualquer lugar recarregava a
 *     thread);
 *   - da linha, só as colunas que a rota de mensagens devolve (`MSG_COLS`).
 */

type Pagina = { data: Message[]; meta?: { cursor?: string | null; has_more?: boolean } };
type Thread = InfiniteData<Pagina>;
type Linha = Record<string, unknown>;

export type DesfechoDoEvento = "aplicado" | "ignorado" | "refazer";

/** As colunas de `MSG_COLS` (app/api/v1/messages/_handler.ts): o formato da bolha. */
const COLUNAS_DA_MENSAGEM = [
  "id", "organization_id", "conversation_id", "channel_session_id", "contact_id", "external_id",
  "type", "direction", "status", "ack", "error_code", "error_message", "body", "media_url",
  "media_mime", "media_size_bytes", "media_storage_path", "media_thumb_path", "sent_via",
  "sent_by_user_id", "sent_on_behalf_of_user_id", "sent_at", "delivered_at", "read_at",
  "metadata", "edited_at", "revoked_at", "reply_to_message_id", "created_at",
] as const;

/** Sem estes, a bolha não se desenha nem se ordena: o payload está incompleto. */
const OBRIGATORIAS = ["id", "conversation_id", "organization_id", "sent_at", "direction", "type"] as const;

/** Mudou um destes, a URL assinada que está no cache deixou de valer. */
const CAMINHOS_DE_MIDIA = ["media_storage_path", "media_thumb_path"] as const;

function recortar(linha: Linha): Linha {
  const out: Linha = {};
  for (const c of COLUNAS_DA_MENSAGEM) if (c in linha) out[c] = linha[c];
  return out;
}

/** A ordem da rota: `sent_at` desc, depois `id` desc. Positivo = `a` é mais nova. */
function comparar(a: { sent_at: unknown; id: unknown }, b: { sent_at: unknown; id: unknown }): number {
  const ta = Date.parse(String(a.sent_at));
  const tb = Date.parse(String(b.sent_at));
  if (ta !== tb) return ta - tb;
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

function todas(thread: Thread): Message[] {
  return thread.pages.flatMap((p) => p.data);
}

/** A linha cabe na janela carregada? (mais nova que a mais antiga, ou não há histórico além). */
function cabeNaJanela(thread: Thread, linha: Linha): boolean {
  const ultima = thread.pages[thread.pages.length - 1];
  const temMais = !!ultima?.meta?.has_more;
  if (!temMais) return true;
  const msgs = todas(thread);
  const maisAntiga = msgs.reduce<Message | null>((m, x) => (m === null || comparar(x, m) < 0 ? x : m), null);
  return maisAntiga === null || comparar(linha as { sent_at: unknown; id: unknown }, maisAntiga) >= 0;
}

function trocarMensagem(thread: Thread, id: string, nova: (m: Message) => Message | null): Thread {
  return {
    ...thread,
    pages: thread.pages.map((p) => ({
      ...p,
      data: p.data.flatMap((m) => {
        if (m.id !== id) return [m];
        const r = nova(m);
        return r ? [r] : [];
      }),
    })),
  };
}

function inserir(thread: Thread, msg: Message): Thread {
  const pages = thread.pages.map((p) => ({ ...p, data: [...p.data] }));
  // A página dela: a primeira cuja mensagem mais antiga não é mais nova que ela.
  let alvo = pages.findIndex((p) => {
    const maisAntiga = p.data.reduce<Message | null>((m, x) => (m === null || comparar(x, m) < 0 ? x : m), null);
    return maisAntiga === null || comparar(msg, maisAntiga) >= 0;
  });
  if (alvo < 0) alvo = pages.length - 1;
  const data = pages[alvo]!.data;
  // Ordem decrescente: entra antes da primeira que for mais velha que ela.
  const pos = data.findIndex((m) => comparar(msg, m) > 0);
  data.splice(pos < 0 ? data.length : pos, 0, msg);
  return { ...thread, pages };
}

type MetaDoEnvio = { _optimistic?: boolean; client_id?: unknown } | null;

/**
 * Qual bolha otimista esta mensagem real substitui.
 *
 * Pelo id de correlação, quando a linha o traz: o `metadata.client_id` que o
 * `useSendMessage` mandou no POST é o id da própria bolha otimista. Com ele,
 * duas mensagens iguais enviadas em sequência não se confundem — e uma linha
 * com `client_id` que não é de nenhuma bolha desta aba (o mesmo texto enviado
 * de outra aba) não leva a bolha de ninguém.
 *
 * Sem `client_id` (envio que não passou pelo otimista, ou servidor antigo):
 * mesmo texto e tipo, e a MAIS ANTIGA primeiro — a ordem de envio, que é a
 * ordem em que as linhas reais nascem.
 */
function otimistaDaLinha(msgs: Message[], linha: Linha): Message | undefined {
  const otimistas = msgs.filter((m) => (m.metadata as MetaDoEnvio)?._optimistic === true);
  const clientId = (linha.metadata as MetaDoEnvio)?.client_id;
  if (typeof clientId === "string" && clientId !== "") {
    return otimistas.find((m) => (m.metadata as MetaDoEnvio)?.client_id === clientId);
  }
  return otimistas
    .filter((m) => m.body === linha.body && m.type === linha.type)
    .reduce<Message | undefined>(
      (velha, m) => (velha === undefined || Date.parse(m.created_at) < Date.parse(velha.created_at) ? m : velha),
      undefined,
    );
}

/**
 * Aplica no cache da thread `["messages", conversationId]` um evento do canal.
 * Não refaz nada sozinha: devolve `refazer` e quem chama decide.
 */
export function aplicarEventoNaThread(
  qc: QueryClient,
  conversationId: string,
  orgId: string | null,
  payload: unknown,
): DesfechoDoEvento {
  const p = payload as { eventType?: unknown; new?: Linha; old?: Linha } | null;
  const evento = p?.eventType;
  const chave = ["messages", conversationId] as const;
  const thread = qc.getQueryData<Thread>(chave);

  if (evento === "DELETE") {
    const id = p?.old?.id;
    if (typeof id !== "string" || !thread?.pages) return "ignorado";
    if (!todas(thread).some((m) => m.id === id)) return "ignorado";
    qc.setQueryData<Thread>(chave, (velha) => velha && trocarMensagem(velha, id, () => null));
    return "aplicado";
  }

  if (evento !== "INSERT" && evento !== "UPDATE") return "refazer";
  const bruta = p?.new;
  if (!bruta || typeof bruta !== "object") return "refazer";
  // Outra conversa (ou outra organização) não entra e não custa refetch: não é desta tela.
  if (bruta.conversation_id !== undefined && bruta.conversation_id !== conversationId) return "ignorado";
  if (orgId && bruta.organization_id !== undefined && bruta.organization_id !== orgId) return "ignorado";
  if (!orgId) return "refazer";
  if (OBRIGATORIAS.some((c) => bruta[c] === undefined || bruta[c] === null)) return "refazer";
  if (!thread?.pages || thread.pages.length === 0) return "refazer";

  const linha = recortar(bruta);
  const id = linha.id as string;
  const msgs = todas(thread);
  const atual = msgs.find((m) => m.id === id);

  if (atual) {
    if (CAMINHOS_DE_MIDIA.some((c) => c in linha && (linha[c] ?? null) !== (atual[c] ?? null))) return "refazer";
    qc.setQueryData<Thread>(chave, (velha) => velha && trocarMensagem(velha, id, (m) => ({ ...m, ...linha }) as Message));
    return "aplicado";
  }

  if (evento === "UPDATE") {
    // Deveria estar na janela e não está: o INSERT dela se perdeu.
    return cabeNaJanela(thread, linha) ? "refazer" : "ignorado";
  }

  // INSERT. A mesma mensagem do provedor já na tela (eco do próprio envio): não duplica.
  const externo = linha.external_id;
  if (typeof externo === "string" && externo !== "" && msgs.some((m) => m.external_id === externo)) return "ignorado";
  if (!cabeNaJanela(thread, linha)) return "refazer";

  qc.setQueryData<Thread>(chave, (velha) => {
    if (!velha) return velha;
    let base = velha;
    // A bolha otimista do envio (`useSendMessage`) é substituída pela real,
    // senão a mesma frase aparece duas vezes até o POST responder.
    if (linha.direction === "outbound") {
      const otimista = otimistaDaLinha(todas(base), linha);
      if (otimista) base = trocarMensagem(base, otimista.id, () => null);
    }
    return inserir(base, linha as unknown as Message);
  });
  return "aplicado";
}
