"use client";
import { useRef, useState } from "react";

/**
 * Fonte da mídia com UMA reserva.
 *
 * A lista de mensagens entrega a URL assinada em lote, e ela vence (30–60 min,
 * `lib/messaging/media/url-assinada.ts`). Numa aba aberta há mais tempo que
 * isso, sem a lista recarregar, o `<img>`/`<audio>`/`<video>` que carrega
 * depois falharia com a URL vencida. Em vez de mostrar "indisponível", a mídia
 * tenta UMA vez a rota `/api/v1/messages/{id}/media`, que assina de novo.
 *
 * Uma vez só: se a rota também falhar, o erro é real e a tela diz isso.
 * `tentarReserva()` devolve `true` quando trocou (o erro foi absorvido).
 */
export function useFonteComReserva(principal: string, reserva?: string) {
  const [naReserva, setNaReserva] = useState(false);
  const jaTentou = useRef(false);
  const fonte = naReserva && reserva ? reserva : principal;
  const tentarReserva = (): boolean => {
    if (!reserva || reserva === principal || jaTentou.current) return false;
    jaTentou.current = true;
    setNaReserva(true);
    return true;
  };
  return { fonte, tentarReserva };
}
