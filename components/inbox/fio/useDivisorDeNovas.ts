"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

import type { ThreadItem } from "@/components/inbox/ChatThread";

import { primeiraNaoLida, type LinhaDoFio } from "./linhas";

/**
 * QUAL mensagem abre as não lidas, decidido UMA vez por conversa.
 *
 * A contagem (`unread_count_for_assignee`) é lida na abertura, e o id também:
 * recalcular a cada mudança do fio fazia o divisor descer uma bolha a cada
 * mensagem recebida com a conversa aberta (P2 do Cassio na 3.5), porque "as N
 * últimas recebidas" passavam a ser outras. O que chegou depois de abrir já foi
 * visto, e fica abaixo do divisor, onde estava.
 *
 * A contagem é do DONO da conversa: para o gestor que só está lendo, ou para
 * uma conversa sem dono, ela não diz nada sobre quem lê, e o divisor não sai.
 */
export function useIdDaPrimeiraNaoLida(p: {
  conversationId: string | null;
  naoLidas: number;
  leitorEhDono: boolean;
  items: ThreadItem[];
  carregado: boolean;
}): string | null {
  const contagem = p.leitorEhDono ? p.naoLidas : 0;
  const [abertura, setAbertura] = useState<{ conversa: string | null; naoLidas: number; id?: string | null }>({
    conversa: p.conversationId,
    naoLidas: contagem,
  });
  // Padrão "estado derivado do render anterior" do React: troca de conversa
  // relê a contagem; a primeira carga do fio congela o id.
  if (abertura.conversa !== p.conversationId) {
    setAbertura({ conversa: p.conversationId, naoLidas: contagem });
  } else if (abertura.id === undefined && p.carregado) {
    setAbertura({ ...abertura, id: primeiraNaoLida(p.items, abertura.naoLidas) });
  }
  return abertura.id ?? null;
}

/**
 * Com muitas não lidas, a âncora no fim deixaria o divisor acima da dobra e a
 * pessoa começaria a ler pelo meio. Uma vez por conversa, depois da ancoragem
 * da abertura, a leitura vai ao divisor (`align: "start"`) — mas SÓ se ele
 * ficou fora da janela. Com poucas não lidas o divisor já está à vista no fim,
 * e rolar até ele tiraria a leitura do fim exato por alguns pixels, o que
 * mudaria a decisão de seguir a próxima mensagem. A pergunta "está à vista?"
 * lê o rolador do DOM, e não `virtualizer.scrollOffset`, que só se atualiza
 * no evento de rolagem seguinte à ancoragem. Depois disso, quem decide seguir
 * mensagem nova continua sendo `useAncoragemNoFim`, com a guarda de sempre.
 */
export function useRolarAteNovas(p: {
  conversationId: string | null;
  linhas: LinhaDoFio[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  scrollerRef: RefObject<HTMLDivElement | null>;
}) {
  const { conversationId, linhas, virtualizer, scrollerRef } = p;
  const rolouEm = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || rolouEm.current === conversationId) return;
    const indice = linhas.findIndex((l) => l.tipo === "novas");
    if (indice < 0 || virtualizer.getVirtualItems().length === 0) return;
    rolouEm.current = conversationId;
    const sc = scrollerRef.current;
    const linha = virtualizer.getVirtualItems().find((v) => v.index === indice);
    const aVista = sc != null && linha != null && linha.start >= sc.scrollTop && linha.start < sc.scrollTop + sc.clientHeight;
    if (!aVista) virtualizer.scrollToIndex(indice, { align: "start" });
  });
}
