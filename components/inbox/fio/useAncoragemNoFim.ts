"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Rola ao fim na primeira carga e quando chega mensagem/nota nova — mas NÃO
 * quando o crescimento veio do "Carregar mais antigas".
 *
 * A thread pagina para o PASSADO: cada `fetchNextPage` traz mensagens mais
 * antigas, que entram ACIMA das que já estão na tela. Rolar ao fim aqui
 * devolveria o usuário ao rodapé no instante em que ele pediu para subir —
 * o clique parece não ter efeito, embora tenha carregado (medido: thread vai
 * de msg#15..#64 para msg#1..#64 e a viewport volta a 7px do fim).
 *
 * A segunda guarda cobre o outro caso: se o usuário rolou para ler o
 * histórico, mensagem nova não deve arrancá-lo de onde estava.
 *
 * Saiu de `ChatThread.tsx` na divisão da fase 3.5 sem mudar uma linha de regra.
 */
export function useAncoragemNoFim(p: {
  conversationId: string | null;
  totalDeItens: number;
  paginas: number;
  scrollerRef: RefObject<HTMLDivElement | null>;
  bottomRef: RefObject<HTMLDivElement | null>;
}) {
  const { conversationId, totalDeItens, paginas, scrollerRef, bottomRef } = p;
  const paginasVistas = useRef(0);
  /**
   * Esta conversa já ancorou no fim ALGUMA vez, com conteúdo na tela?
   *
   * Enquanto for `false`, a abertura ainda não terminou — e a guarda de
   * distância (que existe para não arrancar quem está lendo o histórico) não
   * pode valer, porque ninguém rolou nada ainda.
   */
  const jaAncorou = useRef(false);

  // Conversa nova: a contagem de páginas recomeça, senão a primeira carga da
  // próxima conversa seria confundida com um "carregar mais antigas".
  useEffect(() => {
    paginasVistas.current = 0;
    jaAncorou.current = false;
  }, [conversationId]);

  useEffect(() => {
    const carregouAntigas = paginasVistas.current !== 0 && paginas > paginasVistas.current;
    paginasVistas.current = paginas;
    if (carregouAntigas) return;

    /**
     * A guarda de distância NÃO vale ENQUANTO A ABERTURA NÃO TERMINOU.
     *
     * A versão anterior chamava isso de "primeira carga" e media pelo contador
     * de PÁGINAS da consulta de mensagens — e isso é um proxy, não a coisa. O
     * fio não é só mensagens: ele intercala notas e **cartões de passagem**, que
     * chegam de consultas próprias e podem resolver DEPOIS da primeira pintura.
     *
     * Medido em 2026-09-18, na prova em tela do cartão "Por que a IA passou para
     * você", numa conversa SEM mensagens: a primeira pintura vem vazia e já
     * consome a "primeira carga"; quando o cartão chega, a guarda passava a
     * valer com o scroller no topo e o conteúdo recém-nascido embaixo, e o
     * convite "Assumir e responder" ficava abaixo da dobra (botão em y=1008
     * numa janela de 720px).
     *
     * `jaAncorou` pergunta o que a guarda precisa saber de verdade — "esta
     * conversa já chegou ao fim alguma vez, com conteúdo na tela?" —, em vez de
     * inferir isso da paginação de UMA das três fontes do fio.
     */
    const primeiraAncoragem = !jaAncorou.current;
    if (jaAncorou.current) {
      const sc = scrollerRef.current;
      if (sc && sc.scrollHeight - sc.scrollTop - sc.clientHeight > 120) return;
    }
    // Fio ainda vazio não ancora nada: marcar aqui faria a guarda valer a partir
    // da pintura em branco, que é exatamente o defeito acima.
    if (totalDeItens > 0) jaAncorou.current = true;

    bottomRef.current?.scrollIntoView({
      behavior: primeiraAncoragem ? "auto" : "smooth",
      block: "end",
    });
    // Os refs são estáveis: entram na lista só para o lint, sem disparar nada.
  }, [totalDeItens, conversationId, paginas, scrollerRef, bottomRef]);
}
