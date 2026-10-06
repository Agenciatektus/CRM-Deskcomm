"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

import type { Message } from "@/lib/types/messaging";

import type { LinhaDoFio } from "./linhas";

/**
 * BUSCA NO QUE JÁ ESTÁ NA TELA (#1793). Não vai ao servidor: filtra as
 * páginas carregadas, e o rótulo diz isso para ninguém ler "zero" como "não
 * existe na conversa". Apagada e oculta ficam de fora — o texto delas não
 * aparece na bolha, e marcar uma bolha sem o termo visível seria mentir.
 */
export function useResultadosDaBusca(messages: Message[], searchTerm: string) {
  const termo = searchTerm.trim().toLocaleLowerCase();
  const resultados = useMemo(
    () =>
      new Set(
        messages
          .filter(
            (m) =>
              termo &&
              !m.revoked_at &&
              !m.metadata?.crm_hidden_at &&
              m.body?.toLocaleLowerCase().includes(termo),
          )
          .map((m) => m.id),
      ),
    [messages, termo],
  );
  return { termo, resultados };
}

/**
 * Leva a leitura até a primeira ocorrência do termo.
 *
 * Só o TERMO leva à ocorrência. Depender do conjunto de resultados faria cada
 * mensagem nova do tempo real arrancar quem lê de volta à primeira ocorrência.
 *
 * Com o fio virtualizado a primeira ocorrência pode não estar montada: aí o
 * virtualizador rola até a LINHA dela (que então monta), em vez de procurar no
 * DOM uma bolha que não existe. O pedido fica PENDENTE até a bolha montar
 * (inclusive na primeira pintura, quando o virtualizador ainda não mediu a
 * tela), e só então leva a bolha ao campo de visão, como antes.
 *
 * O `scrollToIndex` sai UMA vez por ocorrência (`rolouAte` guarda a chave da
 * linha já pedida). O efeito roda a cada render enquanto a bolha não monta, e
 * a rolagem da própria pessoa também re-renderiza: pedir de novo a cada
 * passada prendia a tela na ocorrência, e quem tentasse rolar era puxado de
 * volta (P2 do Cassio na #95). Ocorrência nova (outro termo, ou a primeira
 * passou a ser outra linha) pede de novo.
 */
export function useLevarAOcorrencia(p: {
  termo: string;
  resultados: Set<string>;
  linhas: LinhaDoFio[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  scrollerRef: RefObject<HTMLDivElement | null>;
}) {
  const { termo, resultados, linhas, virtualizer, scrollerRef } = p;
  const buscaPendente = useRef(false);
  const rolouAte = useRef<string | null>(null);
  useEffect(() => {
    buscaPendente.current = Boolean(termo);
    rolouAte.current = null;
  }, [termo]);
  useEffect(() => {
    if (!buscaPendente.current) return;
    const alvo = linhas.findIndex(
      (l) => l.tipo === "item" && l.item.kind === "message" && resultados.has(l.item.data.id),
    );
    if (alvo < 0) {
      buscaPendente.current = false;
      return;
    }
    const el = scrollerRef.current?.querySelector(
      `[data-index="${alvo}"] [data-search-match="true"]`,
    );
    if (el) {
      el.scrollIntoView({ block: "nearest" });
      buscaPendente.current = false;
    } else if (virtualizer.getVirtualItems().length > 0 && rolouAte.current !== linhas[alvo]!.key) {
      rolouAte.current = linhas[alvo]!.key;
      virtualizer.scrollToIndex(alvo, { align: "center" });
    }
  });
}
