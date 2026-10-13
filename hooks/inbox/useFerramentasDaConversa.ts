"use client";
import { useCallback, useRef, useState } from "react";

/**
 * O estado das ferramentas de LEITURA da conversa aberta no Inbox: a busca nas
 * mensagens e a coluna do lead. Saiu do `InboxLayout` para ele encolher; o
 * comportamento é o mesmo de antes.
 */
export function useFerramentasDaConversa(selectedId: string | null) {
  /**
   * A coluna do lead a partir do `xl`, que o cabeçalho do chat esconde ou mostra.
   * Estado da tela e não preferência salva: quem a fecha quer mais espaço para
   * ESTA conversa, e reabrir o inbox com o contexto do lead é o padrão seguro.
   */
  const [painelLead, setPainelLead] = useState(true);
  const alternarPainel = useCallback(() => setPainelLead((v) => !v), []);
  const abrirPainel = useCallback(() => setPainelLead(true), []);

  /**
   * A busca dentro da conversa (#1793) pertence à CONVERSA em que foi aberta.
   * Guardar o id junto fecha a busca em qualquer troca (clique, atalho j/k,
   * voltar do navegador) sem que cada caminho precise lembrar de limpá-la.
   */
  const [busca, setBusca] = useState<{ conversaId: string; termo: string } | null>(null);
  const buscaAberta = busca !== null && busca.conversaId === selectedId;
  /** O foco volta aqui quando a busca fecha (hoje, o gatilho do menu "Mais"). */
  const botaoBuscaRef = useRef<HTMLButtonElement | null>(null);
  const fecharBusca = useCallback(() => {
    setBusca(null);
    botaoBuscaRef.current?.focus();
  }, []);
  const alternarBusca = useCallback(
    (conversaId: string) => (buscaAberta ? fecharBusca() : setBusca({ conversaId, termo: "" })),
    [buscaAberta, fecharBusca],
  );
  const mudarTermo = useCallback(
    (termo: string) => setBusca((b) => (b ? { conversaId: b.conversaId, termo } : b)),
    [],
  );

  return {
    painelLead,
    alternarPainel,
    abrirPainel,
    buscaAberta,
    termoDaBusca: buscaAberta && busca ? busca.termo : "",
    botaoBuscaRef,
    fecharBusca,
    alternarBusca,
    mudarTermo,
  };
}
