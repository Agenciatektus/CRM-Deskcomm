"use client";
import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { assinarCanal, chaveDoCanal, type RealtimeStatus } from "./canaisCompartilhados";

export type { RealtimeStatus };

/** O pedaço do tópico que este hook quer — ver `passaNoFiltroLocal`. */
export interface FiltroLocal {
  eventos?: ReadonlyArray<"INSERT" | "UPDATE" | "DELETE">;
  /** Campo → valor exigido na linha (`new`, ou `old` no DELETE). */
  campos?: Readonly<Record<string, string>>;
}

export interface UseRealtimeChannelOpts {
  name: string;
  postgresChanges?: {
    event: "INSERT" | "UPDATE" | "DELETE" | "*";
    schema?: string;
    table: string;
    filter?: string;
  };
  broadcast?: { event: string };
  onChange: (payload: unknown) => void;
  enabled?: boolean;
  /**
   * Recorte local sobre um tópico mais largo, para COMPARTILHAR o canal que
   * outro hook já mantém (ver `passaNoFiltroLocal`). Não muda o que o servidor
   * manda — muda o que chega a este `onChange`.
   */
  filtroLocal?: FiltroLocal;
}

/**
 * ONDE MORA A AUTENTICAÇÃO DESTE CANAL — não é aqui, e isso é o conserto.
 *
 * Este hook já teve um bloco que buscava o token e chamava
 * `supabase.realtime.setAuth(token)` antes de cada `subscribe`, com memo,
 * corrida contra um teto de 4s e remontagem quando o token chegava atrasado.
 * Tudo isso existia para compensar o cookie httpOnly, que deixa o supabase-js
 * do browser sem enxergar a sessão.
 *
 * ⚠️ AQUELE BLOCO PAROU DE FUNCIONAR NUM BUMP DE DEPENDÊNCIA, e ficou verde.
 * A partir do realtime-js 2.112.x a callback `accessToken` do client vence o
 * token manual — a própria biblioteca documenta isso — e a callback PADRÃO,
 * sem sessão visível, devolve a anon key. Medido no socket: o token do usuário
 * durava ~2ms, e todo canal criado depois joinava anônimo. Anônimo assina,
 * responde SUBSCRIBED e não recebe nada, porque a RLS filtra do outro lado.
 *
 * Os testes não pegaram porque exercitavam `authenticateRealtime` contra um
 * cliente FAKE: provavam que `setAuth` era CHAMADO, e o que quebrou foi o
 * EFEITO de chamá-lo. Guardar a chamada em vez do comportamento é o que os
 * deixou verdes enquanto o inbox não atualizava.
 *
 * A fonte do token agora é única e mora em `lib/supabase/browser.ts`, na
 * callback que o socket chama sozinho — no join, em cada reconexão e a cada
 * heartbeat. Duas fontes de token eram o defeito; não se conserta somando uma
 * terceira.
 */
export function useRealtimeChannel(opts: UseRealtimeChannelOpts): {
  status: RealtimeStatus;
  /**
   * Instante da última entrega deste canal (`.current` é null se nunca entregou).
   *
   * ⚠️ DEVOLVE A REF, NÃO O VALOR, e isso é correção e não estilo: ler
   * `.current` aqui no render entregaria um número CONGELADO naquele render —
   * a ref muda depois e nada redesenha, então quem recebeu ficaria com carimbo
   * velho até algo mais causar um render. Funcionava por acidente (a query
   * redesenha ao invalidar), e falharia justamente na janela entre a entrega e
   * esse redesenho, que é onde o detector de perda dispara.
   *
   * Virar `useState` resolveria a propagação e criaria pior: o valor entra nas
   * dependências do efeito e o canal RE-ASSINA a cada evento, perdendo eventos
   * na reassinatura. Quem lê isto é um timer — roda fora do render e enxerga
   * `.current` sempre fresco.
   */
  ultimaEntrega: RefObject<number | null>;
} {
  const { name, postgresChanges, broadcast, onChange, enabled = true, filtroLocal } = opts;

  // ref makes onChange identity-stable so changing handler doesn't re-subscribe
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  /**
   * QUANDO este canal entregou algo pela última vez.
   *
   * Existe para o refetch de segurança poder responder "houve entrega
   * recente?" — sem esse sinal, uma diferença entre o que o servidor tem e o
   * que a tela mostra é indistinguível de "nada aconteceu no intervalo", e a
   * checagem só consegue REPROVAR, nunca aprovar.
   *
   * `useRef` e não `useState` porque virar dependência de efeito faria o canal
   * re-assinar a cada evento, perdendo eventos na janela da reassinatura. A
   * ref ATRAVESSA a fronteira do hook em vez de ser lida aqui — ver o tipo de
   * retorno, onde está por que ler `.current` no render seria defeito.
   */
  const ultimaEntrega = useRef<number | null>(null);

  const [status, setStatus] = useState<RealtimeStatus>(enabled ? "connecting" : "closed");

  // O sufixo por instância só vale para canal NÃO compartilhável (broadcast):
  // ali o nome é o tópico e cada hook continua com o seu. Canal de
  // `postgres_changes` é compartilhado por topologia (ver canaisCompartilhados).
  const instanceId = useId();

  const filtroLocalRef = useRef(filtroLocal);
  useEffect(() => {
    filtroLocalRef.current = filtroLocal;
  }, [filtroLocal]);

  useEffect(() => {
    if (!enabled) {
      setStatus("closed");
      return;
    }
    setStatus("connecting");
    const topologia = { postgresChanges, broadcast };
    const { chave, nomeBase, compartilhado } = chaveDoCanal(name, topologia, instanceId);
    return assinarCanal(chave, nomeBase, compartilhado, topologia, {
      entregar: (payload) => {
        if (!passaNoFiltroLocal(filtroLocalRef.current, payload)) return;
        // Carimba ANTES de entregar: se o consumidor lançar, a entrega ainda
        // aconteceu — e o refetch de segurança precisa saber disso para não
        // acusar o canal de ter perdido o que ele trouxe.
        ultimaEntrega.current = Date.now();
        onChangeRef.current(payload);
      },
      aoMudarStatus: setStatus,
    });
    // intentionally omit onChange/filtroLocal (refs); only re-subscribe when channel topology changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, enabled, instanceId, postgresChanges?.event, postgresChanges?.table, postgresChanges?.filter, postgresChanges?.schema, broadcast?.event]);

  return { status, ultimaEntrega };
}

/**
 * O recorte do assinante sobre um canal mais largo que ele.
 *
 * Existe para que hooks que olham um PEDAÇO de um tópico (a nota de UMA
 * conversa, o UPDATE de UMA conversa) usem o canal da organização que outro
 * hook já mantém aberto, em vez de abrir mais um.
 *
 * Na dúvida, ENTREGA: campo ausente no registro (o DELETE sob RLS só traz a
 * chave primária) não é motivo para descartar. O pior caso é um refetch a
 * mais; descartar seria perder evento. A entrega sintética ("reassinado") não
 * tem `eventType` e passa sempre — ela é o aviso de que algo pode ter faltado.
 */
export function passaNoFiltroLocal(filtro: FiltroLocal | undefined, payload: unknown): boolean {
  if (!filtro) return true;
  const p = payload as { eventType?: string; new?: Record<string, unknown>; old?: Record<string, unknown> } | null;
  const evento = p?.eventType;
  if (!evento) return true;
  if (filtro.eventos && !filtro.eventos.includes(evento as never)) return false;
  if (filtro.campos) {
    const linha = evento === "DELETE" ? p?.old : p?.new;
    for (const [campo, valor] of Object.entries(filtro.campos)) {
      if (linha && campo in linha && String(linha[campo]) !== valor) return false;
    }
  }
  return true;
}
