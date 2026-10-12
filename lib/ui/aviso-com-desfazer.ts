import { createElement, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { ContagemDoAviso } from "./ContagemDoAviso";

/**
 * O "Aviso com Desfazer" do quadro DS ("Retorno e redimensionamento"): embaixo,
 * some em 5 segundos, e o botão Desfazer devolve o estado anterior pela rota
 * inversa que já existe (reabrir, desarquivar, desbloquear, mover de volta).
 */
export const DURACAO_DO_DESFAZER = 5_000;

export function avisarComDesfazer(
  mensagem: string,
  rotuloDoDesfazer: string,
  desfazer: () => void | Promise<unknown>,
): void {
  toast(mensagem, {
    duration: DURACAO_DO_DESFAZER,
    action: {
      label: rotuloDoDesfazer,
      onClick: () => {
        void Promise.resolve()
          .then(desfazer)
          .catch((erroAoDesfazer: unknown) => {
            toast.error(erroAoDesfazer instanceof Error ? erroAoDesfazer.message : String(erroAoDesfazer));
          });
      },
    },
  });
}

/**
 * Enquanto houver ação segurada, o navegador pergunta "Sair da página?" antes de
 * fechar ou recarregar a aba (follow-up do Cassio na #169): sair dentro dos 5 s
 * cancela a ação, e a pessoa precisa saber disso ANTES de sair.
 */
let pendentes = 0;
function perguntarAntesDeSair(evento: BeforeUnloadEvent) {
  evento.preventDefault();
  // Navegadores antigos só perguntam com `returnValue` preenchido.
  evento.returnValue = "";
}
function segurarSaida() {
  if (typeof window === "undefined") return;
  pendentes += 1;
  if (pendentes === 1) window.addEventListener("beforeunload", perguntarAntesDeSair);
}
function soltarSaida() {
  if (typeof window === "undefined" || pendentes === 0) return;
  pendentes -= 1;
  if (pendentes === 0) window.removeEventListener("beforeunload", perguntarAntesDeSair);
}

/**
 * Ações seguradas POR CHAVE (ex.: `ganho:<lead>`), para a tela desabilitar o
 * botão enquanto a ação daquele item está nos 5 s: um segundo "Marcar como
 * ganho" agendaria outro `/win`, que volta com erro de já ganho (P2 do Cassio
 * na #170).
 */
const chavesPendentes = new Set<string>();
const ouvintes = new Set<() => void>();
function avisarOuvintes() {
  for (const ouvir of ouvintes) ouvir();
}
function assinar(ouvir: () => void) {
  ouvintes.add(ouvir);
  return () => {
    ouvintes.delete(ouvir);
  };
}

/** `true` enquanto houver ação segurada com esta chave. */
export function useAcaoPendente(chave: string): boolean {
  return useSyncExternalStore(
    assinar,
    () => chavesPendentes.has(chave),
    () => false,
  );
}

/** Quantas ações estão seguradas agora (para teste e diagnóstico). */
export function acoesPendentes(): number {
  return pendentes;
}

/**
 * AÇÃO ADIADA: para o que não tem volta de verdade no servidor, o aviso SEGURA
 * a ação por 5 segundos e só então chama a rota. Desfazer dentro desse tempo
 * cancela sem chamar nada; fechar o aviso ou o tempo acabar executa.
 *
 * Usada em:
 *  - excluir lead (DELETE definitivo);
 *  - GANHAR, PERDER e TROCAR DE FUNIL (no painel e no quadro): `/win`,
 *    `/lose` e `/clone` disparam `lead.won`/`lead.lost`/`lead.created` na
 *    hora, com efeito FORA do CRM (conversão de anúncio para a Meta/Google,
 *    saídas da cadência, push, automações do funil de destino). Mover de volta
 *    não desfaz nada disso; só não chamar a rota desfaz (P1 do Cassio na #169).
 *
 * O aviso mostra o tempo que falta: `mensagem` pode ser uma função dos
 * segundos ("Ganho em 5 s"); em texto fixo, o tempo vai entre parênteses.
 *
 * ⚠️ Se a página fechar ou recarregar dentro dos 5 s, a ação NÃO acontece (o
 * aviso morre com a página). Por isso o navegador pergunta antes de sair
 * enquanto houver ação segurada. A tela mostra o estado otimista enquanto isso.
 */
export function adiarAcao(
  mensagem: string | ((segundosRestantes: number) => string),
  rotuloDoDesfazer: string,
  executar: () => Promise<unknown>,
  aoDesfazer?: () => void,
  opcoes: { chave?: string } = {},
): void {
  let decidido = false;
  const { chave } = opcoes;
  segurarSaida();
  if (chave) {
    chavesPendentes.add(chave);
    avisarOuvintes();
  }
  const soltar = () => {
    soltarSaida();
    if (chave) {
      chavesPendentes.delete(chave);
      avisarOuvintes();
    }
  };
  const rodar = () => {
    if (decidido) return;
    decidido = true;
    soltar();
    void executar().catch((erroDaAcao: unknown) => {
      toast.error(erroDaAcao instanceof Error ? erroDaAcao.message : String(erroDaAcao));
    });
  };
  const texto = typeof mensagem === "function" ? mensagem : (s: number) => `${mensagem} (${s} s)`;
  toast(createElement(ContagemDoAviso, { texto, segundos: DURACAO_DO_DESFAZER / 1_000 }), {
    duration: DURACAO_DO_DESFAZER,
    action: {
      label: rotuloDoDesfazer,
      onClick: () => {
        if (decidido) return;
        decidido = true;
        soltar();
        aoDesfazer?.();
      },
    },
    onAutoClose: rodar,
    onDismiss: rodar,
  });
}

/** A exclusão adiada é a ação adiada aplicada a um DELETE. */
export const adiarExclusao = adiarAcao;
